/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { customerAuthMiddleware } from '../middleware/customer-auth';
import { getDb } from '../db';
import { ApiError, uuid, now, type HonoEnv } from '../types';

const app = new OpenAPIHono<HonoEnv>();
app.use('*', customerAuthMiddleware);

/**
 * Resolves the currently authenticated customer from the database.
 * Uses the Auth0 'sub' claim from the JWT to find or create a customer record.
 * 
 * @param db - Database connection
 * @param jwtSub - The Auth0 'sub' claim (e.g., 'auth0|abc123')
 * @param email - Email extracted from the JWT payload (optional)
 * @returns The customer row or throws a 401 error
 */
async function resolveCustomer(db: any, jwtSub: string, email?: string) {
    // Try to find customer by Auth0 sub first (fastest lookup)
    let customer = await db.query(
        `SELECT * FROM customers WHERE auth_provider_id = ? AND auth_provider = 'auth0' LIMIT 1`,
        [jwtSub]
    );

    if (customer.length > 0) {
        return customer[0];
    }

    // Fallback: try to find by email (handles accounts created before Auth0 sub linking)
    if (email) {
        const emailResult = await db.query(
            `SELECT * FROM customers WHERE email = ? LIMIT 1`,
            [email.toLowerCase()]
        );

        if (emailResult.length > 0) {
            const existingCustomer = emailResult[0];
            // Link the existing customer to their Auth0 sub
            await db.run(
                `UPDATE customers SET auth_provider = 'auth0', auth_provider_id = ?, updated_at = ? WHERE id = ?`,
                [jwtSub, now(), existingCustomer.id]
            );
            existingCustomer.auth_provider = 'auth0';
            existingCustomer.auth_provider_id = jwtSub;
            return existingCustomer;
        }
    }

    // Create a new customer record on first login
    const customerId = uuid();
    // Generate a placeholder email from sub if email not available
    const customerEmail = email ? email.toLowerCase() : `${jwtSub.replace(/[^a-z0-9]/g, '').substring(0, 16)}@auth0.local`;

    await db.run(
        `INSERT INTO customers (
      id, email, auth_provider, auth_provider_id, 
      locale, order_count, total_spent_cents, created_at, updated_at
    ) VALUES (?, ?, 'auth0', ?, 'en-US', 0, 0, ?, ?)`,
        [customerId, customerEmail, jwtSub, now(), now()]
    );

    const newCustomer = await db.query(
        `SELECT * FROM customers WHERE id = ?`,
        [customerId]
    );

    return newCustomer[0];
}

// ============================================================
// GET /v1/me/profile
// ============================================================

const getMyProfile = createRoute({
    method: 'get',
    path: '/profile',
    tags: ['Customer Portal'],
    summary: 'Get my profile',
    description: 'Returns the profile of the currently authenticated customer.',
    security: [{ bearerAuth: ["valid jwt"] }],
    responses: {
        200: {
            description: 'Customer profile',
            content: {
                'application/json': {
                    schema: z.object({
                        id: z.string(),
                        email: z.string(),
                        name: z.string().nullable(),
                        phone: z.string().nullable(),
                        locale: z.string().nullable(),
                        accepts_marketing: z.number(),
                        order_count: z.number(),
                        total_spent_cents: z.number(),
                        last_order_at: z.string().nullable(),
                    }),
                },
            },
        },
        401: {
            description: 'Unauthorized',
            content: {
                'application/json': {
                    schema: z.object({ message: z.string() }),
                },
            },
        },
    },
});

app.openapi(getMyProfile, async (c) => {
    const auth = c.get('auth') as any;
    const jwtSub = auth?.sub as string;
    const email = auth?.email as string | undefined;

    if (!jwtSub) {
        throw ApiError.unauthorized('Invalid token');
    }

    const db = getDb(c.var.db);
    const customer = await resolveCustomer(db, jwtSub, email);

    return c.json(
        {
            id: customer.id,
            email: customer.email,
            name: customer.name ?? null,
            phone: customer.phone ?? null,
            locale: customer.locale ?? null,
            accepts_marketing: customer.accepts_marketing ?? 0,
            order_count: customer.order_count ?? 0,
            total_spent_cents: customer.total_spent_cents ?? 0,
            last_order_at: customer.last_order_at ?? null,
        },
        200
    );
});

// ============================================================
// PATCH /v1/me/profile
// ============================================================

const updateMyProfile = createRoute({
    method: 'patch',
    path: '/profile',
    tags: ['Customer Portal'],
    summary: 'Update my profile',
    description:
        'Updates name, phone, locale and marketing preferences for the authenticated customer.',
    security: [{ bearerAuth: ["valid jwt"] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        name: z.string().optional(),
                        phone: z.string().optional(),
                        locale: z.string().optional(),
                        accepts_marketing: z.boolean().optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Profile updated',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.boolean() }),
                },
            },
        },
        401: {
            description: 'Unauthorized',
            content: {
                'application/json': {
                    schema: z.object({ message: z.string() }),
                },
            },
        },
    },
});

app.openapi(updateMyProfile, async (c) => {
    const auth = c.get('auth') as any;
    const jwtSub = auth?.sub as string;
    const email = auth?.email as string | undefined;
    const body = await c.req.json();

    if (!jwtSub) {
        throw ApiError.unauthorized('Invalid token');
    }

    const db = getDb(c.var.db);
    const customer = await resolveCustomer(db, jwtSub, email);

    // Build dynamic SET clause from provided fields only
    const updates: Record<string, any> = { updated_at: now() };
    if (body.name !== undefined) updates.name = body.name || null;
    if (body.phone !== undefined) updates.phone = body.phone || null;
    if (body.locale !== undefined) updates.locale = body.locale || null;
    if (body.accepts_marketing !== undefined)
        updates.accepts_marketing = body.accepts_marketing ? 1 : 0;

    const setClauses = Object.keys(updates)
        .map((k) => `${k} = ?`)
        .join(', ');
    await db.run(`UPDATE customers SET ${setClauses} WHERE id = ?`, [
        ...Object.values(updates),
        customer.id,
    ]);

    return c.json({ ok: true }, 200);
});

// ============================================================
// GET /v1/me/orders
// ============================================================

const getMyOrders = createRoute({
    method: 'get',
    path: '/orders',
    tags: ['Customer Portal'],
    summary: 'List my orders',
    description:
        'Returns the order history of the authenticated customer, sorted by most recent.',
    security: [{ bearerAuth: ["valid jwt"] }],
    request: {
        query: z.object({
            limit: z.string().optional().default('20'),
            cursor: z.string().optional(),
        }),
    },
    responses: {
        200: {
            description: 'Order list',
            content: {
                'application/json': {
                    schema: z.object({
                        items: z.array(
                            z.object({
                                id: z.string(),
                                number: z.string(),
                                status: z.string(),
                                currency: z.string(),
                                subtotal_cents: z.number(),
                                tax_cents: z.number(),
                                shipping_cents: z.number(),
                                total_cents: z.number(),
                                created_at: z.string(),
                                tracking_number: z.string().nullable(),
                                tracking_url: z.string().nullable(),
                                shipped_at: z.string().nullable(),
                                items: z.array(
                                    z.object({
                                        sku: z.string(),
                                        title: z.string(),
                                        qty: z.number(),
                                        unit_price_cents: z.number(),
                                    })
                                ),
                            })
                        ),
                        pagination: z.object({
                            hasMore: z.boolean(),
                            nextCursor: z.string().nullable(),
                        }),
                    }),
                },
            },
        },
    },
});

app.openapi(getMyOrders, async (c) => {
    const auth = c.get('auth') as any;
    const jwtSub = auth?.sub as string;
    const email = auth?.email as string | undefined;
    const { limit: limitStr, cursor } = c.req.query();
    const limit = Math.min(parseInt(limitStr ?? '20'), 100);

    if (!jwtSub) {
        throw ApiError.unauthorized('Invalid token');
    }

    const db = getDb(c.var.db);
    const customer = await resolveCustomer(db, jwtSub, email);

    // Fetch orders linked to this customer (by customer_id or email fallback)
    let query = `SELECT * FROM orders WHERE (customer_id = ? OR customer_email = ?) `;
    const params: any[] = [customer.id, customer.email];
    if (cursor) {
        query += `AND created_at < ? `;
        params.push(cursor);
    }
    query += `ORDER BY created_at DESC LIMIT ?`;
    params.push(limit + 1);

    const orderList = await db.query<any>(query, params);
    const hasMore = orderList.length > limit;
    if (hasMore) orderList.pop();

    // Fetch order items for all returned orders
    let allItems: any[] = [];
    if (orderList.length > 0) {
        const orderIds = orderList.map((o: any) => o.id);
        const placeholders = orderIds.map(() => '?').join(', ');
        allItems = await db.query<any>(
            `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
            orderIds
        );
    }

    const itemsByOrder = allItems.reduce(
        (acc: Record<string, any[]>, item: any) => {
            if (!acc[item.order_id]) acc[item.order_id] = [];
            acc[item.order_id].push(item);
            return acc;
        },
        {}
    );

    const items = orderList.map((order: any) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        currency: order.currency,
        subtotal_cents: order.subtotal_cents,
        tax_cents: order.tax_cents,
        shipping_cents: order.shipping_cents,
        total_cents: order.total_cents,
        created_at: order.created_at,
        tracking_number: order.tracking_number ?? null,
        tracking_url: order.tracking_url ?? null,
        shipped_at: order.shipped_at ?? null,
        items: (itemsByOrder[order.id] ?? []).map((i: any) => ({
            sku: i.sku,
            title: i.title,
            qty: i.qty,
            unit_price_cents: i.unit_price_cents,
        })),
    }));

    return c.json(
        {
            items,
            pagination: {
                hasMore,
                nextCursor:
                    hasMore && items.length > 0
                        ? items[items.length - 1].created_at
                        : null,
            },
        },
        200
    );
});

// ============================================================
// GET /v1/me/orders/:number
// ============================================================

const getOrderByNumber = createRoute({
    method: 'get',
    path: '/orders/:number',
    tags: ['Customer Portal'],
    summary: 'Get order by number',
    description:
        'Returns the details of a specific order by order number.',
    security: [{ bearerAuth: ["valid jwt"] }],
    responses: {
        200: {
            description: 'Order details',
            content: {
                'application/json': {
                    schema: z.object({
                        id: z.string(),
                        number: z.string(),
                        status: z.string(),
                        currency: z.string(),
                        subtotal_cents: z.number(),
                        tax_cents: z.number(),
                        shipping_cents: z.number(),
                        total_cents: z.number(),
                        created_at: z.string(),
                        tracking_number: z.string().nullable(),
                        tracking_url: z.string().nullable(),
                        shipped_at: z.string().nullable(),
                        items: z.array(
                            z.object({
                                sku: z.string(),
                                title: z.string(),
                                qty: z.number(),
                                unit_price_cents: z.number(),
                            })
                        ),
                    }),
                },
            },
        },
        401: { description: 'Unauthorized' },
        404: { description: 'Order not found' },
    },
});

app.openapi(getOrderByNumber, async (c) => {
    const auth = c.get('auth') as any;
    const jwtSub = auth?.sub as string;
    const email = auth?.email as string | undefined;
    const { number } = c.req.param();

    if (!jwtSub) {
        throw ApiError.unauthorized('Invalid token');
    }

    const db = getDb(c.var.db);
    const customer = await resolveCustomer(db, jwtSub, email);

    // Get order by number, ensure it belongs to this customer
    const orderResult = await db.query<any>(
        `SELECT * FROM orders WHERE number = ? AND (customer_id = ? OR customer_email = ?) LIMIT 1`,
        [number, customer.id, customer.email]
    );

    if (orderResult.length === 0) {
        throw ApiError.notFound('Order not found');
    }

    const order = orderResult[0];

    // Fetch order items
    const items = await db.query<any>(
        `SELECT * FROM order_items WHERE order_id = ?`,
        [order.id]
    );

    return c.json(
        {
            id: order.id,
            number: order.number,
            status: order.status,
            currency: order.currency,
            subtotal_cents: order.subtotal_cents,
            tax_cents: order.tax_cents,
            shipping_cents: order.shipping_cents,
            total_cents: order.total_cents,
            created_at: order.created_at,
            tracking_number: order.tracking_number ?? null,
            tracking_url: order.tracking_url ?? null,
            shipped_at: order.shipped_at ?? null,
            items: items.map((i: any) => ({
                sku: i.sku,
                title: i.title,
                qty: i.qty,
                unit_price_cents: i.unit_price_cents,
            })),
        },
        200
    );
});

// ============================================================
// GET /v1/me/addresses
// ============================================================

const getMyAddresses = createRoute({
    method: 'get',
    path: '/addresses',
    tags: ['Customer Portal'],
    summary: 'List my saved addresses',
    description: 'Returns all saved delivery addresses for the authenticated customer.',
    security: [{ bearerAuth: ["valid jwt"] }],
    responses: {
        200: {
            description: 'Addresses',
            content: {
                'application/json': {
                    schema: z.object({
                        items: z.array(
                            z.object({
                                id: z.string(),
                                label: z.string().nullable(),
                                is_default: z.number(),
                                name: z.string().nullable(),
                                company: z.string().nullable(),
                                line1: z.string(),
                                line2: z.string().nullable(),
                                city: z.string(),
                                state: z.string().nullable(),
                                postal_code: z.string(),
                                country: z.string(),
                                phone: z.string().nullable(),
                            })
                        ),
                    }),
                },
            },
        },
    },
});

app.openapi(getMyAddresses, async (c) => {
    const auth = c.get('auth') as any;
    const jwtSub = auth?.sub as string;
    const email = auth?.email as string | undefined;

    if (!jwtSub) {
        throw ApiError.unauthorized('Invalid token');
    }

    const db = getDb(c.var.db);
    const customer = await resolveCustomer(db, jwtSub, email);

    const addresses = await db.query<any>(
        `SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC`,
        [customer.id]
    );

    return c.json(
        {
            items: addresses,
        },
        200
    );
});

// ============================================================
// POST /v1/me/addresses
// ============================================================

const createAddress = createRoute({
    method: 'post',
    path: '/addresses',
    tags: ['Customer Portal'],
    summary: 'Add a new address',
    description: 'Creates a new delivery address for the authenticated customer.',
    security: [{ bearerAuth: ["valid jwt"] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        label: z.string().optional(),
                        is_default: z.boolean().optional(),
                        name: z.string(),
                        company: z.string().optional(),
                        line1: z.string(),
                        line2: z.string().optional(),
                        city: z.string(),
                        state: z.string().optional(),
                        postal_code: z.string(),
                        country: z.string(),
                        phone: z.string().optional(),
                    }),
                },
            },
        },
    },
    responses: {
        201: {
            description: 'Address created',
            content: {
                'application/json': {
                    schema: z.object({ id: z.string() }),
                },
            },
        },
    },
});

app.openapi(createAddress, async (c) => {
    const auth = c.get('auth') as any;
    const jwtSub = auth?.sub as string;
    const email = auth?.email as string | undefined;
    const body = await c.req.json();

    if (!jwtSub) {
        throw ApiError.unauthorized('Invalid token');
    }

    const db = getDb(c.var.db);
    const customer = await resolveCustomer(db, jwtSub, email);

    const addressId = uuid();
    await db.run(
        `INSERT INTO customer_addresses (
      id, customer_id, label, is_default, name, company,
      line1, line2, city, state, postal_code, country, phone,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            addressId,
            customer.id,
            body.label ?? null,
            body.is_default ? 1 : 0,
            body.name,
            body.company ?? null,
            body.line1,
            body.line2 ?? null,
            body.city,
            body.state ?? null,
            body.postal_code,
            body.country,
            body.phone ?? null,
            now(),
            now(),
        ]
    );

    return c.json({ id: addressId }, 201);
});

// ============================================================
// DELETE /v1/me/addresses/:id
// ============================================================

const deleteAddress = createRoute({
    method: 'delete',
    path: '/addresses/:id',
    tags: ['Customer Portal'],
    summary: 'Delete an address',
    description: 'Deletes a saved delivery address.',
    security: [{ bearerAuth: ["valid jwt"] }],
    responses: {
        200: {
            description: 'Address deleted',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.boolean() }),
                },
            },
        },
        401: {
            description: 'Unauthorized',
        },
        404: {
            description: 'Address not found',
        },
    },
});

app.openapi(deleteAddress, async (c) => {
    const auth = c.get('auth') as any;
    const jwtSub = auth?.sub as string;
    const email = auth?.email as string | undefined;
    const { id } = c.req.param();

    if (!jwtSub) {
        throw ApiError.unauthorized('Invalid token');
    }

    const db = getDb(c.var.db);
    const customer = await resolveCustomer(db, jwtSub, email);

    // Verify ownership before delete
    const address = await db.query<any>(
        `SELECT * FROM customer_addresses WHERE id = ? AND customer_id = ?`,
        [id, customer.id]
    );

    if (address.length === 0) {
        throw ApiError.notFound('Address not found');
    }

    await db.run(
        `DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?`,
        [id, customer.id]
    );

    return c.json({ ok: true }, 200);
});

// ============================================================
// GET /v1/me/preferences
// ============================================================

const getMyPreferences = createRoute({
    method: 'get',
    path: '/preferences',
    tags: ['Customer Portal'],
    summary: 'Get my preferences',
    description:
        'Returns the customer preferences stored in Auth0 user_metadata.',
    security: [{ bearerAuth: ["valid jwt"] }],
    responses: {
        200: {
            description: 'Customer preferences',
            content: {
                'application/json': {
                    schema: z.record(z.any()),
                },
            },
        },
    },
});

app.openapi(getMyPreferences, async (c) => {
    const auth = c.get('auth') as any;

    // Note: Preferences are stored in Auth0 user_metadata
    // The JWT may contain a custom claim if configured in Auth0 Actions
    // For now, return an empty object or data from the JWT if available
    // In a real implementation, you'd fetch from Auth0 Management API

    return c.json({}, 200);
});

// ============================================================
// PATCH /v1/me/preferences
// ============================================================

const updateMyPreferences = createRoute({
    method: 'patch',
    path: '/preferences',
    tags: ['Customer Portal'],
    summary: 'Update my preferences',
    description: 'Updates customer preferences (stored in Auth0 user_metadata).',
    security: [{ bearerAuth: ["valid jwt"] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        locale: z.string().optional(),
                        accepts_marketing: z.boolean().optional(),
                        theme: z.string().optional(),
                        currency: z.string().optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Preferences saved',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.boolean() }),
                },
            },
        },
    },
});

app.openapi(updateMyPreferences, async (c) => {
    const auth = c.get('auth') as any;

    // Note: In a full implementation, this would call the Auth0 Management API
    // to update user_metadata. For now, just acknowledge the request.
    // The frontend will handle storing preferences locally or via Auth0.

    return c.json({ ok: true }, 200);
});

export { app as me };
