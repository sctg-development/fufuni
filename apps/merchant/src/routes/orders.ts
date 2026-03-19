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
import Stripe from 'stripe';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, generateOrderNumber, type HonoEnv } from '../types';
import { validateDiscount, calculateDiscount, type Discount } from './discounts';
import { dispatchWebhooks, type WebhookEventType } from '../lib/webhooks';
import { resolveVariantPrice, getCurrencyIdForRegion } from '../lib/pricing';
import { sendOrderConfirmationEmail } from '../lib/order-email';
import { verifyOrderViewToken, hashOrderToken } from '../lib/order-token';
import {
  OrderIdParam,
  OrderResponse,
  OrderListResponse,
  OrderQuery,
  UpdateOrderBody,
  RefundOrderBody,
  RefundResponse,
  CreateTestOrderBody,
  ErrorResponse,
} from '../schemas';

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

const listOrders = createRoute({
  method: 'get',
  path: '/',
  tags: ['Orders'],
  summary: 'List orders',
  description: 'List orders with pagination and optional filters by status and email',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { query: OrderQuery },
  responses: {
    200: { content: { 'application/json': { schema: OrderListResponse } }, description: 'List of orders' },
  },
});

app.openapi(listOrders, async (c) => {
  const db = getDb(c.var.db);
  const { limit: limitStr, cursor, status, email } = c.req.valid('query');
  const limit = Math.min(parseInt(limitStr || '20'), 100);

  let query = `SELECT * FROM orders WHERE 1=1`;
  const params: unknown[] = [];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  if (email) {
    query += ` AND customer_email = ?`;
    params.push(email);
  }

  if (cursor) {
    query += ` AND created_at < ?`;
    params.push(cursor);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit + 1);

  const orderList = await db.query<any>(query, params);

  const hasMore = orderList.length > limit;
  if (hasMore) orderList.pop();

  const orderIds = orderList.map((o) => o.id);
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

  const items = orderList.map((order) => formatOrder(order, itemsByOrder[order.id] || []));
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

  return c.json({ items, pagination: { has_more: hasMore, next_cursor: nextCursor } }, 200);
});

const getOrder = createRoute({
  method: 'get',
  path: '/{orderId}',
  tags: ['Orders'],
  summary: 'Get order by ID',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: OrderIdParam },
  responses: {
    200: { content: { 'application/json': { schema: OrderResponse } }, description: 'Order details' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Order not found' },
  },
});

app.openapi(getOrder, async (c) => {
  const { orderId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [order] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) throw ApiError.notFound('Order not found');

  const orderItems = await db.query<any>(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);

  return c.json(formatOrder(order, orderItems), 200);
});

const updateOrder = createRoute({
  method: 'patch',
  path: '/{orderId}',
  tags: ['Orders'],
  summary: 'Update order status/tracking',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: OrderIdParam,
    body: { content: { 'application/json': { schema: UpdateOrderBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: OrderResponse } }, description: 'Updated order' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Order not found' },
  },
});

app.openapi(updateOrder, async (c) => {
  const { orderId } = c.req.valid('param');
  const { status, tracking_number, tracking_url } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [order] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) throw ApiError.notFound('Order not found');

  const updates: string[] = [];
  const params: unknown[] = [];

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);

    if (status === 'shipped' && !order.shipped_at) {
      updates.push('shipped_at = ?');
      params.push(now());
    }
  }

  if (tracking_number !== undefined) {
    updates.push('tracking_number = ?');
    params.push(tracking_number || null);
  }

  if (tracking_url !== undefined) {
    updates.push('tracking_url = ?');
    params.push(tracking_url || null);
  }

  if (updates.length === 0) {
    throw ApiError.invalidRequest('No fields to update');
  }

  params.push(orderId);
  await db.run(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params);

  const [updated] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  const orderItems = await db.query<any>(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);
  const formattedOrder = formatOrder(updated, orderItems);

  if (status !== undefined && status !== order.status) {
    let eventType: WebhookEventType = 'order.updated';
    if (status === 'shipped') eventType = 'order.shipped';

    await dispatchWebhooks(c.var.db, c.executionCtx, eventType, {
      order: formattedOrder,
      previous_status: order.status,
    });
  }

  return c.json(formattedOrder, 200);
});

const resendOrderConfirmation = createRoute({
  method: 'post',
  path: '/{orderId}/resend-confirmation',
  tags: ['Orders'],
  summary: 'Resend order confirmation email',
  description: 'Send the order confirmation email with a tracking link. This will also (re)generate a view token if missing.',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: OrderIdParam },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } }, description: 'Email sent' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Order not found' },
    500: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Failed to send email' },
  },
});

app.openapi(resendOrderConfirmation, async (c) => {
  const { orderId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [order] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) throw ApiError.notFound('Order not found');

  const result = await sendOrderConfirmationEmail(c.env, db, { orderId, regenerateToken: false });

  if (!result.success) {
    throw ApiError.invalidRequest('Failed to send confirmation email');
  }

  return c.json({ ok: true }, 200);
});

const regenerateOrderTrackingLink = createRoute({
  method: 'post',
  path: '/{orderId}/regenerate-tracking-link',
  tags: ['Orders'],
  summary: 'Regenerate the order tracking link and send a new confirmation email',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: OrderIdParam },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } }, description: 'Email sent' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Order not found' },
    500: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Failed to send email' },
  },
});

app.openapi(regenerateOrderTrackingLink, async (c) => {
  const { orderId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [order] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) throw ApiError.notFound('Order not found');

  const result = await sendOrderConfirmationEmail(c.env, db, { orderId, regenerateToken: true });

  if (!result.success) {
    throw ApiError.invalidRequest('Failed to send confirmation email');
  }

  return c.json({ ok: true }, 200);
});

const refundOrder = createRoute({
  method: 'post',
  path: '/{orderId}/refund',
  tags: ['Orders'],
  summary: 'Refund an order',
  description: 'Full or partial refund via Stripe',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: OrderIdParam,
    body: { content: { 'application/json': { schema: RefundOrderBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: RefundResponse } }, description: 'Refund result' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request or Stripe error' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Order not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Already refunded' },
  },
});

app.openapi(refundOrder, async (c) => {
  const { orderId } = c.req.valid('param');
  const { amount_cents } = c.req.valid('json');

  const stripeSecretKey = c.get('auth').stripeSecretKey;
  if (!stripeSecretKey) throw ApiError.invalidRequest('Stripe not connected');

  const db = getDb(c.var.db);

  const [order] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status === 'refunded') throw ApiError.conflict('Order already refunded');
  if (!order.stripe_payment_intent_id) {
    throw ApiError.invalidRequest('Cannot refund test orders (no Stripe payment)');
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount: amount_cents,
    });

    await db.run(
      `INSERT INTO refunds (id, order_id, stripe_refund_id, amount_cents, status) VALUES (?, ?, ?, ?, ?)`,
      [uuid(), order.id, refund.id, refund.amount, refund.status ?? 'succeeded']
    );

    if (!amount_cents || amount_cents >= order.total_cents) {
      await db.run(`UPDATE orders SET status = 'refunded' WHERE id = ?`, [orderId]);

      const [refundedOrder] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
      const orderItems = await db.query<any>(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);

      await dispatchWebhooks(c.var.db, c.executionCtx, 'order.refunded', {
        order: formatOrder(refundedOrder, orderItems),
        refund: { stripe_refund_id: refund.id, amount_cents: refund.amount },
      });
    }

    return c.json({ stripe_refund_id: refund.id, status: refund.status ?? 'succeeded' }, 200);
  } catch (e: any) {
    throw ApiError.stripeError(e.message || 'Refund failed');
  }
});

const createTestOrder = createRoute({
  method: 'post',
  path: '/test',
  tags: ['Orders'],
  summary: 'Create test order',
  description: 'Creates an order without Stripe payment (for testing)',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    body: { content: { 'application/json': { schema: CreateTestOrderBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: OrderResponse } }, description: 'Created order' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'SKU or discount not found' },
  },
});

app.openapi(createTestOrder, async (c) => {
  const {
    customer_email,
    items,
    discount_code,
    region_id,
    shipping_address,
    shipping_rate_id,
    shipping_cents,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
  } = c.req.valid('json');
  const db = getDb(c.var.db);

  // Get region (use specified region or default)
  let regionId = region_id;
  if (!regionId) {
    const [defaultRegion] = await db.query<any>(`SELECT id FROM regions WHERE is_default = 1 AND status = 'active'`);
    if (!defaultRegion) throw ApiError.notFound('No default region configured');
    regionId = defaultRegion.id;
  } else {
    const [region] = await db.query<any>(`SELECT id FROM regions WHERE id = ? AND status = 'active'`, [regionId]);
    if (!region) throw ApiError.notFound('Region not found');
  }

  // Resolve currency_id from region
  const currencyId = await getCurrencyIdForRegion(db, regionId as string);
  if (!currencyId) {
    throw ApiError.invalidRequest(
      'Region has no currency configured. Unable to resolve prices.'
    );
  }

  // Get region's currency code for the order
  const [regionData] = await db.query<any>(
    `SELECT c.code as currency_code FROM regions r
     JOIN currencies c ON r.currency_id = c.id
     WHERE r.id = ?`,
    [regionId]
  );
  const currencyCode = regionData?.currency_code ?? 'USD';

  let subtotal = 0;
  const orderItems = [];

  // Get warehouses for this region
  const regionWarehouses = await db.query<any>(
    `SELECT w.id FROM warehouses w
     JOIN region_warehouses rw ON w.id = rw.warehouse_id
     WHERE rw.region_id = ?`,
    [regionId]
  );
  
  const warehouseIds = regionWarehouses.map(w => w.id);

  for (const { sku, qty } of items) {
    const [variant] = await db.query<any>(`SELECT * FROM variants WHERE sku = ?`, [sku]);
    if (!variant) throw ApiError.notFound(`SKU not found: ${sku}`);

    // Calculate available quantity across all warehouses in this region
    let totalAvailable = 0;
    if (warehouseIds.length > 0) {
      const placeholders = warehouseIds.map(() => '?').join(',');
      const warehouseInv = await db.query<any>(
        `SELECT on_hand, reserved FROM warehouse_inventory WHERE sku = ? AND warehouse_id IN (${placeholders})`,
        [sku, ...warehouseIds]
      );
      
      totalAvailable = warehouseInv.reduce((sum, inv) => sum + ((inv.on_hand ?? 0) - (inv.reserved ?? 0)), 0);
    } else {
      // Fallback to global inventory if no regional warehouses
      const [inv] = await db.query<any>(`SELECT * FROM inventory WHERE sku = ?`, [sku]);
      totalAvailable = (inv?.on_hand ?? 0) - (inv?.reserved ?? 0);
    }
    
    if (totalAvailable < qty) throw ApiError.insufficientInventory(sku);

    // Resolve price using multi-currency helper (Option A: strict fallback)
    const unitPriceCents = await resolveVariantPrice(db, variant.id, currencyId);
    subtotal += unitPriceCents * qty;
    orderItems.push({
      sku,
      title: variant.title,
      qty,
      unit_price_cents: unitPriceCents,
    });
  }

  let discountId = null;
  let discountCode = null;
  let discountAmountCents = 0;
  let discount: Discount | null = null;

  if (discount_code) {
    const normalizedCode = discount_code.toUpperCase().trim();
    const [discountRow] = await db.query<any>(`SELECT * FROM discounts WHERE code = ?`, [normalizedCode]);

    if (discountRow) {
      await validateDiscount(db, discountRow as Discount, subtotal, customer_email);
      discountAmountCents = calculateDiscount(discountRow as Discount, subtotal);
      discountId = discountRow.id;
      discountCode = discountRow.code;
      discount = discountRow as Discount;
    } else {
      throw ApiError.notFound('Discount code not found');
    }
  }

  const totalCents = subtotal - discountAmountCents;
  const timestamp = now();
  let customerId: string | null = null;

  const [existingCustomer] = await db.query<any>(
    `SELECT id, order_count, total_spent_cents FROM customers WHERE email = ?`,
    [customer_email]
  );

  if (existingCustomer) {
    customerId = existingCustomer.id;
    await db.run(
      `UPDATE customers SET 
        order_count = order_count + 1,
        total_spent_cents = total_spent_cents + ?,
        last_order_at = ?,
        updated_at = ?
      WHERE id = ?`,
      [totalCents, timestamp, timestamp, customerId]
    );
  } else {
    customerId = uuid();
    await db.run(
      `INSERT INTO customers (id, email, order_count, total_spent_cents, last_order_at)
       VALUES (?, ?, 1, ?, ?)`,
      [customerId, customer_email, totalCents, timestamp]
    );
  }

  if (discount && discountAmountCents > 0) {
    const currentTime = now();

    if (discount.usage_limit_per_customer !== null) {
      const [usage] = await db.query<any>(
        `SELECT COUNT(*) as count FROM discount_usage WHERE discount_id = ? AND customer_email = ?`,
        [discount.id, customer_email.toLowerCase()]
      );
      if (usage && usage.count >= discount.usage_limit_per_customer) {
        throw ApiError.invalidRequest('You have already used this discount');
      }
    }

    if (discount.usage_limit !== null) {
      const result = await db.run(
        `UPDATE discounts 
         SET usage_count = usage_count + 1, updated_at = ? 
         WHERE id = ? 
           AND status = 'active'
           AND (starts_at IS NULL OR starts_at <= ?)
           AND (expires_at IS NULL OR expires_at >= ?)
           AND usage_count < usage_limit`,
        [currentTime, discountId, currentTime, currentTime]
      );

      if (result.changes === 0) {
        throw ApiError.invalidRequest('Discount usage limit reached');
      }
    } else {
      const result = await db.run(
        `UPDATE discounts 
         SET updated_at = ? 
         WHERE id = ? 
           AND status = 'active'
           AND (starts_at IS NULL OR starts_at <= ?)
           AND (expires_at IS NULL OR expires_at >= ?)`,
        [currentTime, discountId, currentTime, currentTime]
      );

      if (result.changes === 0) {
        throw ApiError.invalidRequest('Discount is no longer valid');
      }
    }
  }

  const orderNumber = generateOrderNumber();
  const orderId = uuid();

  await db.run(
    `INSERT INTO orders (id, customer_id, number, status, customer_email, 
     shipping_name, shipping_phone, ship_to, shipping_rate_id,
     subtotal_cents, tax_cents, shipping_cents, total_cents, currency, 
     discount_code, discount_id, discount_amount_cents, 
     stripe_checkout_session_id, stripe_payment_intent_id,
     created_at)
     VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      customerId,
      orderNumber,
      customer_email,
      shipping_address?.name ?? null,
      shipping_address?.phone ?? null,
      shipping_address ? JSON.stringify(shipping_address) : null,
      shipping_rate_id ?? null,
      subtotal,
      shipping_cents ?? 0,
      totalCents + (shipping_cents ?? 0),
      currencyCode,
      discountCode,
      discountId,
      discountAmountCents,
      stripe_checkout_session_id ?? null,
      stripe_payment_intent_id ?? null,
      timestamp,
    ]
  );

  for (const item of orderItems) {
    await db.run(
      `INSERT INTO order_items (id, order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), orderId, item.sku, item.title, item.qty, item.unit_price_cents]
    );

    // Reduce inventory from region warehouses by priority
    let remainingQty = item.qty;
    
    if (warehouseIds.length > 0) {
      const placeholders = warehouseIds.map(() => '?').join(',');
      const warehouses = await db.query<any>(
        `SELECT w.id, w.priority FROM warehouses w
         JOIN region_warehouses rw ON w.id = rw.warehouse_id
         WHERE rw.region_id = ? AND w.id IN (${placeholders})
         ORDER BY w.priority ASC`,
        [regionId, ...warehouseIds]
      );

      for (const warehouse of warehouses) {
        if (remainingQty <= 0) break;

        const [inv] = await db.query<any>(
          `SELECT on_hand FROM warehouse_inventory WHERE sku = ? AND warehouse_id = ?`,
          [item.sku, warehouse.id]
        );

        const qtyToTake = Math.min(remainingQty, inv?.on_hand ?? 0);
        if (qtyToTake > 0) {
          await db.run(
            `UPDATE warehouse_inventory SET on_hand = on_hand - ?, updated_at = ? WHERE sku = ? AND warehouse_id = ?`,
            [qtyToTake, timestamp, item.sku, warehouse.id]
          );
          remainingQty -= qtyToTake;
        }
      }
    } else {
      // Fallback to global inventory
      await db.run(`UPDATE inventory SET on_hand = on_hand - ?, updated_at = ? WHERE sku = ?`, [
        item.qty,
        timestamp,
        item.sku,
      ]);
    }
  }

  if (discount && discountAmountCents > 0) {
    const [existingUsage] = await db.query<any>(
      `SELECT id FROM discount_usage WHERE order_id = ? AND discount_id = ?`,
      [orderId, discountId]
    );

    if (!existingUsage) {
      await db.run(
        `INSERT INTO discount_usage (id, discount_id, order_id, customer_email, discount_amount_cents)
         VALUES (?, ?, ?, ?, ?)`,
        [uuid(), discountId, orderId, customer_email.toLowerCase(), discountAmountCents]
      );
    }
  }

  const [order] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  return c.json(formatOrder(order, orderItems), 200);
});

// ════════════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no authentication required)
// ════════════════════════════════════════════════════════════════════════════════════

/**
 * GET /v1/orders/lookup?session_id={STRIPE_SESSION_ID}
 * 
 * Public endpoint to look up an order by Stripe checkout session ID.
 * No authentication required — the session ID itself acts as an implicit secret.
 * Stripe session IDs are 64+ random characters and cannot be guessed.
 * 
 * Used by the frontend /success page after Stripe redirects the customer.
 */
const lookupOrderBySession = createRoute({
  method: 'get',
  path: '/lookup',
  tags: ['Orders'],
  summary: 'Look up order by Stripe session ID (public)',
  description: 'Retrieve order details using only the Stripe checkout session ID. No authentication needed.',
  request: {
    query: z.object({
      session_id: z.string().min(1, 'session_id is required'),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            number: z.string(),
            status: z.string(),
            currency: z.string(),
            subtotal_cents: z.number(),
            discount_cents: z.number(),
            tax_cents: z.number(), taxes: z.array(z.object({ name: z.string(), amount_cents: z.number() })).optional(),
            taxes: z.array(z.object({ name: z.string(), amount_cents: z.number() })).optional(),
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
      description: 'Order found',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Order not found for this session',
    },
  },
});

// Create a separate app instance for public routes (without auth middleware)
const publicApp = new OpenAPIHono<HonoEnv>();

publicApp.openapi(lookupOrderBySession, async (c) => {
  const { session_id } = c.req.valid('query');
  const db = getDb(c.var.db);

  // Look up the order using the Stripe checkout session ID
  const [order] = await db.query<any>(
    `SELECT * FROM orders WHERE stripe_checkout_session_id = ? LIMIT 1`,
    [session_id]
  );

  if (!order) throw ApiError.notFound('Order not found for this session');

  // Fetch associated order items
  const orderItems = await db.query<any>(
    `SELECT sku, title, qty, unit_price_cents FROM order_items WHERE order_id = ?`,
    [order.id]
  );

  // Return only the fields the customer needs — never expose internal IDs or email
  return c.json(
    {
      number: order.number,
      status: order.status,
      currency: order.currency,
      subtotal_cents: order.subtotal_cents,
      discount_cents: order.discount_amount_cents ?? 0,
      tax_cents: order.tax_cents, taxes: order.taxes_json ? JSON.parse(order.taxes_json) : [],
      shipping_cents: order.shipping_cents,
      total_cents: order.total_cents,
      created_at: order.created_at,
      tracking_number: order.tracking_number ?? null,
      tracking_url: order.tracking_url ?? null,
      shipped_at: order.shipped_at ?? null,
      items: orderItems.map((i: any) => ({
        sku: i.sku,
        title: i.title,
        qty: i.qty,
        unit_price_cents: i.unit_price_cents,
      })),
    },
    200
  );
});

/**
 * GET /v1/orders/:id/status?token={JWT}
 * 
 * Public endpoint to retrieve order status using a signed token.
 * The token is a JWT issued at order creation time and sent to the customer by email.
 * No authentication required — the signed token acts as proof of identity.
 * 
 * Used by the frontend /order/:id page to display order details.
 */
const getOrderByToken = createRoute({
  method: 'get',
  path: '/{orderId}/status',
  tags: ['Orders'],
  summary: 'Get order status via signed token (public)',
  description: 'Retrieve order details using only the signed JWT token. No authentication needed.',
  request: {
    params: OrderIdParam,
    query: z.object({ token: z.string().min(1, 'token is required') }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            number: z.string(),
            status: z.string(),
            currency: z.string(),
            subtotal_cents: z.number(),
            discount_cents: z.number(),
            tax_cents: z.number(), taxes: z.array(z.object({ name: z.string(), amount_cents: z.number() })).optional(),
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
      description: 'Order status',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Order not found or invalid token',
    },
  },
});

publicApp.openapi(getOrderByToken, async (c) => {
  const { orderId } = c.req.valid('param');
  const { token } = c.req.valid('query');
  const db = getDb(c.var.db);
  const secret = c.env.ORDER_TOKEN_SECRET;

  // If the secret is not configured, this endpoint is disabled
  if (!secret) throw ApiError.notFound('Order tracking is not configured');

  // Public access is intentionally limited; all validation failures return the same
  // error to avoid leaking information about whether an order exists.
  const invalidLinkError = ApiError.notFound('Order not found or invalid token');

  try {
    await verifyOrderViewToken(token, orderId, secret);
  } catch {
    throw invalidLinkError;
  }

  const tokenHash = await hashOrderToken(token);
  const [order] = await db.query<any>(
    `SELECT * FROM orders WHERE id = ? AND viewtoken = ? LIMIT 1`,
    [orderId, tokenHash]
  );

  if (!order) throw invalidLinkError;

  // Step 3: Fetch order items
  const orderItems = await db.query<any>(
    `SELECT sku, title, qty, unit_price_cents FROM order_items WHERE order_id = ?`,
    [orderId]
  );

  return c.json(
    {
      number: order.number,
      status: order.status,
      currency: order.currency,
      subtotal_cents: order.subtotal_cents,
      discount_cents: order.discount_amount_cents ?? 0,
      tax_cents: order.tax_cents, taxes: order.taxes_json ? JSON.parse(order.taxes_json) : [],
      shipping_cents: order.shipping_cents,
      total_cents: order.total_cents,
      created_at: order.created_at,
      tracking_number: order.tracking_number ?? null,
      tracking_url: order.tracking_url ?? null,
      shipped_at: order.shipped_at ?? null,
      items: orderItems.map((i: any) => ({
        sku: i.sku,
        title: i.title,
        qty: i.qty,
        unit_price_cents: i.unit_price_cents,
      })),
    },
    200
  );
});

function formatOrder(order: any, items: any[]) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    customer_email: order.customer_email,
    customer_id: order.customer_id || null,
    shipping: {
      name: order.shipping_name || null,
      phone: order.shipping_phone || null,
      address: order.ship_to ? JSON.parse(order.ship_to) : null,
    },
    amounts: {
      subtotal_cents: order.subtotal_cents,
      discount_cents: order.discount_amount_cents || 0,
      tax_cents: order.tax_cents, taxes: order.taxes_json ? JSON.parse(order.taxes_json) : [],
      shipping_cents: order.shipping_cents,
      total_cents: order.total_cents,
      currency: order.currency,
    },
    discount: order.discount_code
      ? { code: order.discount_code, amount_cents: order.discount_amount_cents || 0 }
      : null,
    tracking: {
      number: order.tracking_number,
      url: order.tracking_url,
      shipped_at: order.shipped_at,
    },
    stripe: {
      checkout_session_id: order.stripe_checkout_session_id,
      payment_intent_id: order.stripe_payment_intent_id,
    },
    items: items.map((i) => ({
      sku: i.sku,
      title: i.title,
      qty: i.qty,
      unit_price_cents: i.unit_price_cents,
    })),
    created_at: order.created_at,
  };
}

export { app as orders, publicApp as publicOrders };
