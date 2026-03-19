/**
 * MIT License
 *
 * Copyright (c) 2025 ygwyg
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
import { z } from '@hono/zod-openapi';
import { getDb } from '../db';
import { ApiError, now, type HonoEnv } from '../types';
import { authMiddleware, adminOnly } from '../middleware/auth';
import {
  IdParam,
  CustomerResponse,
  CustomerWithAddresses,
  CustomerListResponse,
  CustomerQuery,
  UpdateCustomerBody,
  CreateAddressBody,
  AddressResponse,
  AddressIdParam,
  OrderListResponse,
  PaginationQuery,
  ErrorResponse,
  DeletedResponse,
} from '../schemas';

const CustomerOrdersQuery = PaginationQuery;

const CustomerOrderResponse = z.object({
  id: z.string().uuid(),
  number: z.string(),
  status: z.string(),
  shipping: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.any().nullable(),
  }),
  amounts: z.object({
    subtotal_cents: z.number().int(),
    tax_cents: z.number().int(),
    shipping_cents: z.number().int(),
    total_cents: z.number().int(),
    currency: z.string(),
  }),
  items: z.array(z.object({
    sku: z.string(),
    title: z.string(),
    qty: z.number().int(),
    unit_price_cents: z.number().int(),
  })),
  tracking: z.object({
    number: z.string(),
    url: z.string().nullable(),
    shipped_at: z.string().nullable(),
  }).nullable(),
  created_at: z.string().datetime(),
}).openapi('CustomerOrder');

const CustomerOrdersResponse = z.object({
  items: z.array(CustomerOrderResponse),
  pagination: z.object({
    has_more: z.boolean(),
    next_cursor: z.string().nullable(),
  }),
}).openapi('CustomerOrdersList');

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

const listCustomers = createRoute({
  method: 'get',
  path: '/',
  tags: ['Customers'],
  summary: 'List customers',
  description: 'List customers with pagination and optional search',
  security: [{ bearerAuth: ["legacy sk_", "admin:store"] }],
  middleware: [adminOnly] as const,
  request: { query: CustomerQuery },
  responses: {
    200: { content: { 'application/json': { schema: CustomerListResponse } }, description: 'List of customers' },
  },
});

app.openapi(listCustomers, async (c) => {
  const db = getDb(c.var.db);
  const { limit: limitStr, cursor, search } = c.req.valid('query');
  const limit = Math.min(parseInt(limitStr || '50'), 100);

  let query = `SELECT * FROM customers WHERE 1=1`;
  const params: any[] = [];

  if (search) {
    query += ` AND (email LIKE ? OR name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (cursor) {
    query += ` AND created_at < ?`;
    params.push(cursor);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit + 1);

  const rows = await db.query<any>(query, params);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;

  return c.json({
    items: items.map(formatCustomer),
    pagination: {
      has_more: hasMore,
      next_cursor: hasMore ? items[items.length - 1].created_at : null,
    },
  }, 200);
});

const getCustomer = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Customers'],
  summary: 'Get customer by ID',
  description: 'Returns customer details with addresses',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: CustomerWithAddresses } }, description: 'Customer details' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Customer not found' },
  },
});

app.openapi(getCustomer, async (c) => {
  const db = getDb(c.var.db);
  const { id } = c.req.valid('param');

  const [customer] = await db.query<any>(`SELECT * FROM customers WHERE id = ?`, [id]);
  if (!customer) throw ApiError.notFound('Customer');

  const addresses = await db.query<any>(
    `SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC`,
    [id]
  );

  return c.json({
    ...formatCustomer(customer),
    addresses: addresses.map(formatAddress),
  }, 200);
});

const getCustomerOrders = createRoute({
  method: 'get',
  path: '/{id}/orders',
  tags: ['Customers'],
  summary: 'Get customer order history',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: IdParam,
    query: CustomerOrdersQuery,
  },
  responses: {
    200: { content: { 'application/json': { schema: CustomerOrdersResponse } }, description: 'Customer orders' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Customer not found' },
  },
});

app.openapi(getCustomerOrders, async (c) => {
  const db = getDb(c.var.db);
  const { id } = c.req.valid('param');
  const { limit: limitStr, cursor } = c.req.valid('query');
  const limit = Math.min(parseInt(limitStr || '20'), 100);

  const [customer] = await db.query<any>(`SELECT id FROM customers WHERE id = ?`, [id]);
  if (!customer) throw ApiError.notFound('Customer');

  let query = `SELECT * FROM orders WHERE customer_id = ?`;
  const params: any[] = [id];

  if (cursor) {
    query += ` AND created_at < ?`;
    params.push(cursor);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit + 1);

  const rows = await db.query<any>(query, params);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;

  const orderIds = items.map((o: any) => o.id);
  const itemsByOrder: Record<string, any[]> = {};

  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => '?').join(',');
    const allItems = await db.query<any>(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
      orderIds
    );

    for (const item of allItems) {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = [];
      }
      itemsByOrder[item.order_id].push(item);
    }
  }

  const ordersWithItems = items.map((order: any) => ({
    ...order,
    items: itemsByOrder[order.id] || [],
  }));

  return c.json({
    items: ordersWithItems.map(formatOrder),
    pagination: {
      has_more: hasMore,
      next_cursor: hasMore ? items[items.length - 1].created_at : null,
    },
  }, 200);
});

const updateCustomer = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Customers'],
  summary: 'Update customer',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: UpdateCustomerBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: CustomerResponse } }, description: 'Updated customer' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Customer not found' },
  },
});

app.openapi(updateCustomer, async (c) => {
  const db = getDb(c.var.db);
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  const [customer] = await db.query<any>(`SELECT * FROM customers WHERE id = ?`, [id]);
  if (!customer) throw ApiError.notFound('Customer');

  const updates: string[] = [];
  const params: any[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name);
  }
  if (body.phone !== undefined) {
    updates.push('phone = ?');
    params.push(body.phone);
  }
  if (body.accepts_marketing !== undefined) {
    updates.push('accepts_marketing = ?');
    params.push(body.accepts_marketing ? 1 : 0);
  }
  if (body.metadata !== undefined) {
    updates.push('metadata = ?');
    params.push(JSON.stringify(body.metadata));
  }

  if (updates.length === 0) {
    return c.json(formatCustomer(customer), 200);
  }

  updates.push('updated_at = ?');
  params.push(now());
  params.push(id);

  await db.run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);

  const [updated] = await db.query<any>(`SELECT * FROM customers WHERE id = ?`, [id]);

  return c.json(formatCustomer(updated), 200);
});

const createAddress = createRoute({
  method: 'post',
  path: '/{id}/addresses',
  tags: ['Customers'],
  summary: 'Add address to customer',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: CreateAddressBody } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: AddressResponse } }, description: 'Created address' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Customer not found' },
  },
});

app.openapi(createAddress, async (c) => {
  const db = getDb(c.var.db);
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  const [customer] = await db.query<any>(`SELECT id FROM customers WHERE id = ?`, [id]);
  if (!customer) throw ApiError.notFound('Customer');

  const addressId = crypto.randomUUID();

  if (body.is_default) {
    await db.run(`UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?`, [id]);
  }

  const [addressCount] = await db.query<any>(
    `SELECT COUNT(*) as count FROM customer_addresses WHERE customer_id = ?`,
    [id]
  );
  const isDefault = body.is_default || addressCount.count === 0 ? 1 : 0;

  await db.run(
    `INSERT INTO customer_addresses (id, customer_id, label, is_default, name, company, line1, line2, city, state, postal_code, country, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      addressId,
      id,
      body.label || null,
      isDefault,
      body.name || null,
      body.company || null,
      body.line1,
      body.line2 || null,
      body.city,
      body.state || null,
      body.postal_code,
      body.country || 'US',
      body.phone || null,
    ]
  );

  const [address] = await db.query<any>(`SELECT * FROM customer_addresses WHERE id = ?`, [addressId]);

  return c.json(formatAddress(address), 201);
});

const deleteAddress = createRoute({
  method: 'delete',
  path: '/{id}/addresses/{addressId}',
  tags: ['Customers'],
  summary: 'Delete customer address',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: AddressIdParam },
  responses: {
    200: { content: { 'application/json': { schema: DeletedResponse } }, description: 'Address deleted' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Customer or address not found' },
  },
});

app.openapi(deleteAddress, async (c) => {
  const db = getDb(c.var.db);
  const { id, addressId } = c.req.valid('param');

  const [customer] = await db.query<any>(`SELECT id FROM customers WHERE id = ?`, [id]);
  if (!customer) throw ApiError.notFound('Customer');

  const [address] = await db.query<any>(
    `SELECT * FROM customer_addresses WHERE id = ? AND customer_id = ?`,
    [addressId, id]
  );
  if (!address) throw ApiError.notFound('Address');

  await db.run(`DELETE FROM customer_addresses WHERE id = ?`, [addressId]);

  if (address.is_default) {
    await db.run(
      `UPDATE customer_addresses SET is_default = 1 
       WHERE customer_id = ? AND id = (SELECT id FROM customer_addresses WHERE customer_id = ? LIMIT 1)`,
      [id, id]
    );
  }

  return c.json({ deleted: true as const }, 200);
});

function formatCustomer(c: any) {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    has_account: !!c.password_hash,
    accepts_marketing: !!c.accepts_marketing,
    stats: {
      order_count: c.order_count || 0,
      total_spent_cents: c.total_spent_cents || 0,
      last_order_at: c.last_order_at,
    },
    metadata: c.metadata ? JSON.parse(c.metadata) : null,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

function formatAddress(a: any) {
  return {
    id: a.id,
    label: a.label,
    is_default: !!a.is_default,
    name: a.name,
    company: a.company,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    postal_code: a.postal_code,
    country: a.country,
    phone: a.phone,
  };
}

function formatOrder(o: any) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    shipping: {
      name: o.shipping_name,
      phone: o.shipping_phone,
      address: o.ship_to ? JSON.parse(o.ship_to) : null,
    },
    amounts: {
      subtotal_cents: o.subtotal_cents,
      tax_cents: o.tax_cents,
      shipping_cents: o.shipping_cents,
      total_cents: o.total_cents,
      currency: o.currency,
    },
    items: (o.items || []).map((i: any) => ({
      sku: i.sku,
      title: i.title,
      qty: i.qty,
      unit_price_cents: i.unit_price_cents,
    })),
    tracking: o.tracking_number
      ? { number: o.tracking_number, url: o.tracking_url, shipped_at: o.shipped_at }
      : null,
    created_at: o.created_at,
  };
}

export { app as customers };
