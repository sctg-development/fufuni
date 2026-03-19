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
import { getDb, type Database } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import {
  IdParam,
  DiscountResponse,
  DiscountListResponse,
  CreateDiscountBody,
  UpdateDiscountBody,
  ErrorResponse,
  OkResponse,
} from '../schemas';

type DiscountType = 'percentage' | 'fixed_amount';

export interface Discount {
  id: string;
  code: string | null;
  type: DiscountType;
  value: number;
  status: string;
  min_purchase_cents: number;
  max_discount_cents: number | null;
  starts_at: string | null;
  expires_at: string | null;
  usage_limit: number | null;
  usage_limit_per_customer: number | null;
  usage_count: number;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
}

export async function validateDiscount(
  db: Database,
  discount: Discount,
  subtotalCents: number,
  customerEmail?: string
): Promise<void> {
  if (discount.status !== 'active') {
    throw ApiError.invalidRequest('Discount is not active');
  }

  const currentTime = now();
  if (discount.starts_at && currentTime < discount.starts_at) {
    throw ApiError.invalidRequest('Discount has not started yet');
  }
  if (discount.expires_at && currentTime > discount.expires_at) {
    throw ApiError.invalidRequest('Discount has expired');
  }

  if (discount.min_purchase_cents > 0 && subtotalCents < discount.min_purchase_cents) {
    throw ApiError.invalidRequest(
      `Minimum purchase of $${(discount.min_purchase_cents / 100).toFixed(2)} required`
    );
  }

  if (discount.usage_limit !== null && discount.usage_count >= discount.usage_limit) {
    throw ApiError.invalidRequest('Discount usage limit reached');
  }

  if (customerEmail && discount.usage_limit_per_customer !== null) {
    const [usage] = await db.query<any>(
      `SELECT COUNT(*) as count FROM discount_usage WHERE discount_id = ? AND customer_email = ?`,
      [discount.id, customerEmail.toLowerCase()]
    );
    if (usage && usage.count >= discount.usage_limit_per_customer) {
      throw ApiError.invalidRequest('You have already used this discount');
    }
  }
}

export function calculateDiscount(discount: Discount, subtotalCents: number): number {
  switch (discount.type) {
    case 'percentage': {
      let amount = Math.floor((subtotalCents * discount.value) / 100);
      if (discount.max_discount_cents !== null && amount > discount.max_discount_cents) {
        amount = discount.max_discount_cents;
      }
      return amount;
    }
    case 'fixed_amount': {
      return Math.min(discount.value, subtotalCents);
    }
    default:
      return 0;
  }
}

async function syncDiscountToStripe(
  stripeSecretKey: string | null,
  discount: {
    id: string;
    code: string | null;
    type: DiscountType;
    value: number;
    max_discount_cents: number | null;
    expires_at: string | null;
    status?: string;
    stripe_coupon_id: string | null;
    stripe_promotion_code_id: string | null;
  }
): Promise<{ couponId: string | null; promotionCodeId: string | null; syncError?: string }> {
  if (!stripeSecretKey) {
    return { couponId: null, promotionCodeId: null };
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    let couponId = discount.stripe_coupon_id;

    const couponParams: Stripe.CouponCreateParams = {
      duration: 'once',
      metadata: { merchant_discount_id: discount.id },
    };

    if (discount.type === 'percentage') {
      if (discount.max_discount_cents) {
        return { couponId: null, promotionCodeId: null };
      }
      couponParams.percent_off = discount.value;
    } else {
      couponParams.amount_off = discount.value;
      couponParams.currency = 'usd';
    }

    if (discount.expires_at) {
      couponParams.redeem_by = Math.floor(new Date(discount.expires_at).getTime() / 1000);
    }

    if (couponId) {
      try {
        await stripe.coupons.del(couponId);
      } catch {
        // Coupon might not exist
      }
      couponId = null;
    }

    const coupon = await stripe.coupons.create(couponParams);
    couponId = coupon.id;

    let promotionCodeId = discount.stripe_promotion_code_id;
    const isActive = discount.status !== 'inactive';

    if (discount.code && isActive) {
      if (promotionCodeId) {
        try {
          await stripe.promotionCodes.update(promotionCodeId, { active: false });
        } catch {
          // Promotion code might not exist
        }
      }

      const promotionCode = await stripe.promotionCodes.create({
        coupon: couponId,
        code: discount.code.toUpperCase(),
        active: true,
        metadata: { merchant_discount_id: discount.id },
      });
      promotionCodeId = promotionCode.id;
    } else if (promotionCodeId) {
      try {
        await stripe.promotionCodes.update(promotionCodeId, { active: false });
      } catch {
        // Promotion code might not exist
      }
    }

    return { couponId, promotionCodeId };
  } catch (err: any) {
    const errorMessage = err.message || 'Unknown error';
    console.error('Failed to sync discount to Stripe:', errorMessage);
    return {
      couponId: discount.stripe_coupon_id,
      promotionCodeId: discount.stripe_promotion_code_id,
      syncError: errorMessage,
    };
  }
}

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

const listDiscounts = createRoute({
  method: 'get',
  path: '/',
  tags: ['Discounts'],
  summary: 'List all discounts',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  responses: {
    200: { content: { 'application/json': { schema: DiscountListResponse } }, description: 'List of discounts' },
  },
});

app.openapi(listDiscounts, async (c) => {
  const db = getDb(c.var.db);

  const discounts = await db.query<any>(`SELECT * FROM discounts ORDER BY created_at DESC`, []);

  return c.json({
    items: discounts.map((d) => ({
      id: d.id,
      code: d.code,
      type: d.type,
      value: d.value,
      status: d.status,
      min_purchase_cents: d.min_purchase_cents,
      max_discount_cents: d.max_discount_cents,
      starts_at: d.starts_at,
      expires_at: d.expires_at,
      usage_limit: d.usage_limit,
      usage_limit_per_customer: d.usage_limit_per_customer,
      usage_count: d.usage_count,
      created_at: d.created_at,
    })),
  }, 200);
});

const getDiscount = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Discounts'],
  summary: 'Get discount by ID',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: DiscountResponse } }, description: 'Discount details' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Discount not found' },
  },
});

app.openapi(getDiscount, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [discount] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [id]);
  if (!discount) throw ApiError.notFound('Discount not found');

  return c.json({
    id: discount.id,
    code: discount.code,
    type: discount.type,
    value: discount.value,
    status: discount.status,
    min_purchase_cents: discount.min_purchase_cents,
    max_discount_cents: discount.max_discount_cents,
    starts_at: discount.starts_at,
    expires_at: discount.expires_at,
    usage_limit: discount.usage_limit,
    usage_limit_per_customer: discount.usage_limit_per_customer,
    usage_count: discount.usage_count,
    created_at: discount.created_at,
    updated_at: discount.updated_at,
  }, 200);
});

const createDiscount = createRoute({
  method: 'post',
  path: '/',
  tags: ['Discounts'],
  summary: 'Create a discount',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    body: { content: { 'application/json': { schema: CreateDiscountBody } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: DiscountResponse } }, description: 'Created discount' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Discount code exists' },
  },
});

app.openapi(createDiscount, async (c) => {
  const body = c.req.valid('json');
  const {
    code,
    type,
    value,
    min_purchase_cents,
    max_discount_cents,
    starts_at,
    expires_at,
    usage_limit,
    usage_limit_per_customer,
  } = body;

  if (type === 'percentage' && (value < 0 || value > 100)) {
    throw ApiError.invalidRequest('percentage value must be between 0 and 100');
  }

  const stripeSecretKey = c.get('auth').stripeSecretKey;
  const db = getDb(c.var.db);

  const normalizedCode = code ? code.toUpperCase().trim() : null;

  if (normalizedCode) {
    const [existing] = await db.query<any>(`SELECT id FROM discounts WHERE code = ?`, [normalizedCode]);
    if (existing) throw ApiError.conflict(`Discount code ${normalizedCode} already exists`);
  }

  const id = uuid();
  const timestamp = now();

  let stripeCouponId = null;
  let stripePromotionCodeId = null;

  if (stripeSecretKey) {
    const stripeSync = await syncDiscountToStripe(stripeSecretKey, {
      id,
      code: normalizedCode,
      type,
      value,
      max_discount_cents: max_discount_cents || null,
      expires_at: expires_at || null,
      status: 'active',
      stripe_coupon_id: null,
      stripe_promotion_code_id: null,
    });
    stripeCouponId = stripeSync.couponId;
    stripePromotionCodeId = stripeSync.promotionCodeId;

    if (stripeSync.syncError) {
      console.warn(`Discount ${id} created but Stripe sync failed:`, stripeSync.syncError);
    }
  }

  await db.run(
    `INSERT INTO discounts (id, code, type, value, min_purchase_cents, max_discount_cents, starts_at, expires_at, usage_limit, usage_limit_per_customer, stripe_coupon_id, stripe_promotion_code_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      normalizedCode,
      type,
      value,
      min_purchase_cents || 0,
      max_discount_cents || null,
      starts_at || null,
      expires_at || null,
      usage_limit ?? null,
      usage_limit_per_customer ?? null,
      stripeCouponId,
      stripePromotionCodeId,
      timestamp,
      timestamp,
    ]
  );

  const [discount] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [id]);

  return c.json({
    id: discount.id,
    code: discount.code,
    type: discount.type,
    value: discount.value,
    status: discount.status,
    min_purchase_cents: discount.min_purchase_cents,
    max_discount_cents: discount.max_discount_cents,
    starts_at: discount.starts_at,
    expires_at: discount.expires_at,
    usage_limit: discount.usage_limit,
    usage_limit_per_customer: discount.usage_limit_per_customer,
    usage_count: discount.usage_count,
    created_at: discount.created_at,
  }, 201);
});

const updateDiscount = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Discounts'],
  summary: 'Update a discount',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: UpdateDiscountBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: DiscountResponse } }, description: 'Updated discount' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Discount not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Discount code exists' },
  },
});

app.openapi(updateDiscount, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const {
    status,
    code,
    value,
    min_purchase_cents,
    max_discount_cents,
    starts_at,
    expires_at,
    usage_limit,
    usage_limit_per_customer,
  } = body;

  const stripeSecretKey = c.get('auth').stripeSecretKey;
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [id]);
  if (!existing) throw ApiError.notFound('Discount not found');

  const updates: string[] = [];
  const params: unknown[] = [];

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (code !== undefined) {
    const normalizedCode = code ? code.toUpperCase().trim() : null;
    if (normalizedCode && normalizedCode !== existing.code) {
      const [duplicate] = await db.query<any>(
        `SELECT id FROM discounts WHERE code = ? AND id != ?`,
        [normalizedCode, id]
      );
      if (duplicate) throw ApiError.conflict(`Discount code ${normalizedCode} already exists`);
    }
    updates.push('code = ?');
    params.push(normalizedCode);
  }
  if (value !== undefined) {
    if (existing.type === 'percentage' && (value < 0 || value > 100)) {
      throw ApiError.invalidRequest('percentage value must be between 0 and 100');
    }
    updates.push('value = ?');
    params.push(value);
  }
  if (min_purchase_cents !== undefined) {
    updates.push('min_purchase_cents = ?');
    params.push(min_purchase_cents);
  }
  if (max_discount_cents !== undefined) {
    updates.push('max_discount_cents = ?');
    params.push(max_discount_cents || null);
  }
  if (starts_at !== undefined) {
    updates.push('starts_at = ?');
    params.push(starts_at || null);
  }
  if (expires_at !== undefined) {
    updates.push('expires_at = ?');
    params.push(expires_at || null);
  }
  if (usage_limit !== undefined) {
    updates.push('usage_limit = ?');
    params.push(usage_limit ?? null);
  }
  if (usage_limit_per_customer !== undefined) {
    updates.push('usage_limit_per_customer = ?');
    params.push(usage_limit_per_customer ?? null);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(now());
    params.push(id);

    await db.run(`UPDATE discounts SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const [discount] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [id]);

  const stripeRelevantFields = ['code', 'value', 'max_discount_cents', 'expires_at', 'status'];
  const shouldSyncStripe = updates.some((update) =>
    stripeRelevantFields.some((field) => update.includes(field))
  );

  if (shouldSyncStripe && stripeSecretKey) {
    const stripeSync = await syncDiscountToStripe(stripeSecretKey, {
      id: discount.id,
      code: discount.code,
      type: discount.type,
      value: discount.value,
      max_discount_cents: discount.max_discount_cents,
      expires_at: discount.expires_at,
      status: discount.status,
      stripe_coupon_id: discount.stripe_coupon_id,
      stripe_promotion_code_id: discount.stripe_promotion_code_id,
    });

    if (stripeSync.syncError) {
      console.warn(`Discount ${discount.id} updated but Stripe sync failed:`, stripeSync.syncError);
    }

    if (
      stripeSync.couponId !== discount.stripe_coupon_id ||
      stripeSync.promotionCodeId !== discount.stripe_promotion_code_id
    ) {
      await db.run(
        `UPDATE discounts SET stripe_coupon_id = ?, stripe_promotion_code_id = ? WHERE id = ?`,
        [stripeSync.couponId, stripeSync.promotionCodeId, discount.id]
      );
      discount.stripe_coupon_id = stripeSync.couponId;
      discount.stripe_promotion_code_id = stripeSync.promotionCodeId;
    }
  }

  return c.json({
    id: discount.id,
    code: discount.code,
    type: discount.type,
    value: discount.value,
    status: discount.status,
    min_purchase_cents: discount.min_purchase_cents,
    max_discount_cents: discount.max_discount_cents,
    starts_at: discount.starts_at,
    expires_at: discount.expires_at,
    usage_limit: discount.usage_limit,
    usage_limit_per_customer: discount.usage_limit_per_customer,
    usage_count: discount.usage_count,
    created_at: discount.created_at,
    updated_at: discount.updated_at,
  }, 200);
});

const deleteDiscount = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Discounts'],
  summary: 'Deactivate a discount',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OkResponse } }, description: 'Discount deactivated' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Discount not found' },
  },
});

app.openapi(deleteDiscount, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [discount] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [id]);
  if (!discount) throw ApiError.notFound('Discount not found');

  await db.run(`UPDATE discounts SET status = 'inactive', updated_at = ? WHERE id = ?`, [now(), id]);

  return c.json({ ok: true as const }, 200);
});

export { app as discounts };
