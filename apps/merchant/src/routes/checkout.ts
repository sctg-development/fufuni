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
import Stripe from 'stripe';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { ApiError, uuid, now, isValidEmail, type HonoEnv } from '../types';
import { validateDiscount, calculateDiscount, type Discount } from './discounts';
import { resolveVariantPrice, getCurrencyIdForRegion } from '../lib/pricing';
import { getAvailableQty, reserveInventory, releaseReservation } from '../lib/inventory';
import { getCompatibleShippingRates, computeCartWeightG } from '../lib/shipping';
import { calculateCartTaxes } from '../lib/tax';
import {
  CartIdParam,
  CartResponse,
  CreateCartBody,
  AddCartItemsBody,
  CheckoutBody,
  CheckoutResponse,
  ApplyDiscountBody,
  ApplyDiscountResponse,
  ErrorResponse,
  CartTotals,
  ShippingAddressInput,
  AvailableShippingRatesResponse,
  SelectShippingRateBody,
} from '../schemas';

const RemoveDiscountResponse = z.object({
  discount: z.null(),
  totals: CartTotals,
}).openapi('RemoveDiscountResponse');

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

const getCart = createRoute({
  method: 'get',
  path: '/{cartId}',
  tags: ['Checkout'],
  summary: 'Get cart by ID',
  request: { params: CartIdParam },
  responses: {
    200: { content: { 'application/json': { schema: CartResponse } }, description: 'Cart details' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart not found' },
  },
});

app.openapi(getCart, async (c) => {
  const { cartId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  if (!cart) throw ApiError.notFound('Cart not found');

  const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);

  // Get shipping info
  let shippingInfo = { rate_id: null as string | null, rate_name: null as string | null, amount_cents: 0 };
  if (cart.shipping_rate_id) {
    const [rate] = await db.query<any>(`SELECT * FROM shipping_rates WHERE id = ?`, [cart.shipping_rate_id]);
    if (rate) {
      shippingInfo.rate_id = rate.id;
      shippingInfo.rate_name = rate.display_name;
      shippingInfo.amount_cents = cart.shipping_cents || 0;
    }
  }

  return c.json({
    id: cart.id,
    status: cart.status,
    currency: cart.currency,
    region_id: cart.region_id,
    customer_email: cart.customer_email,
    locale: cart.locale,
    items: items.map((i) => ({
      sku: i.sku,
      title: i.title,
      qty: i.qty,
      unit_price_cents: i.unit_price_cents,
    })),
    shipping: shippingInfo,
    shipping_address: cart.shipping_line1
      ? {
          name: cart.shipping_name ?? null,
          line1: cart.shipping_line1,
          line2: cart.shipping_line2 ?? null,
          city: cart.shipping_city ?? null,
          state: cart.shipping_state ?? null,
          postal_code: cart.shipping_postal_code ?? null,
          country: cart.shipping_country ?? null,
          billing_same_as_shipping: cart.billing_same_as_shipping === 1,
        }
      : null,
    expires_at: cart.expires_at,
    stripe_checkout_session_id: cart.stripe_checkout_session_id,
  }, 200);
});

const createCart = createRoute({
  method: 'post',
  path: '/',
  tags: ['Checkout'],
  summary: 'Create a new cart',
  request: { body: { content: { 'application/json': { schema: CreateCartBody } } } },
  responses: {
    200: { content: { 'application/json': { schema: CartResponse } }, description: 'Created cart' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid email' },
  },
});

app.openapi(createCart, async (c) => {
  const { customer_email, region_id, locale } = c.req.valid('json');

  if (!isValidEmail(customer_email)) {
    throw ApiError.invalidRequest('A valid customer_email is required');
  }

  const db = getDb(c.var.db);
  const id = uuid();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  let currency = 'USD';
  let resolvedRegionId = region_id || null;

  // If region_id provided, validate and get currency
  if (region_id) {
    const [region] = await db.query<any>(
      `SELECT r.*, c.code as currency_code FROM regions r
       JOIN currencies c ON r.currency_id = c.id
       WHERE r.id = ? AND r.status = 'active'`,
      [region_id]
    );
    if (!region) throw ApiError.notFound('Region not found or inactive');
    currency = region.currency_code;
  } else {
    // Try to get default region
    const [defaultRegion] = await db.query<any>(
      `SELECT r.*, c.code as currency_code FROM regions r
       JOIN currencies c ON r.currency_id = c.id
       WHERE r.is_default = 1 AND r.status = 'active'`
    );
    if (defaultRegion) {
      resolvedRegionId = defaultRegion.id;
      currency = defaultRegion.currency_code;
    }
  }

  await db.run(
    `INSERT INTO carts (id, customer_email, currency, region_id, locale, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, customer_email, currency, resolvedRegionId, locale || 'en-US', expiresAt]
  );

  return c.json({
    id,
    status: 'open' as const,
    currency,
    region_id: resolvedRegionId,
    customer_email,
    items: [],
    discount: null,
    shipping: {
      rate_id: null,
      rate_name: null,
      amount_cents: 0,
    },
    shipping_address: null,
    totals: {
      subtotal_cents: 0,
      discount_cents: 0,
      shipping_cents: 0,
      tax_cents: 0,
      total_cents: 0,
    },
    expires_at: expiresAt,
    locale: locale || 'en-US',
  }, 200);
});

const addCartItems = createRoute({
  method: 'post',
  path: '/{cartId}/items',
  tags: ['Checkout'],
  summary: 'Add items to cart',
  description: 'Replaces existing cart items with the provided items',
  request: {
    params: CartIdParam,
    body: { content: { 'application/json': { schema: AddCartItemsBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: CartResponse } }, description: 'Updated cart' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart or SKU not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart is not open' },
  },
});

app.openapi(addCartItems, async (c) => {
  const { cartId } = c.req.valid('param');
  const { items } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  if (!cart) throw ApiError.notFound('Cart not found');
  if (cart.status !== 'open') throw ApiError.conflict('Cart is not open');

  // Resolve currency_id from cart's region
  const currencyId = await getCurrencyIdForRegion(db, cart.region_id);
  if (!currencyId) {
    throw ApiError.invalidRequest(
      'Cart region has no currency configured. Unable to resolve prices.'
    );
  }

  const validatedItems = [];
  for (const { sku, qty } of items) {
    const [variant] = await db.query<any>(`SELECT * FROM variants WHERE sku = ?`, [sku]);
    if (!variant) throw ApiError.notFound(`SKU not found: ${sku}`);
    if (variant.status !== 'active') throw ApiError.invalidRequest(`SKU not active: ${sku}`);

    // --- Phase 2b: Use unified helper (warehouse-aware) ---
    const available = await getAvailableQty(db, sku);
    if (available < qty) throw ApiError.insufficientInventory(sku);
    // --- End Phase 2b ---

    // Resolve price using multi-currency helper (Option A: strict fallback)
    const unitPriceCents = await resolveVariantPrice(db, variant.id, currencyId);

    validatedItems.push({
      sku,
      title: variant.title,
      qty,
      unit_price_cents: unitPriceCents,
      currency: cart.currency, // Snapshot cart's currency at item level
    });
  }

  await db.run(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);

  for (const item of validatedItems) {
    await db.run(
      `INSERT INTO cart_items (id, cart_id, sku, title, qty, unit_price_cents, currency) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), cartId, item.sku, item.title, item.qty, item.unit_price_cents, item.currency]
    );
  }

  const allCartItems = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);
  const subtotalCents = allCartItems.reduce(
    (sum, item) => sum + item.unit_price_cents * item.qty,
    0
  );

  let discountInfo = null;
  let discountAmountCents = 0;
  if (cart.discount_id) {
    const [discount] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [
      cart.discount_id,
    ]);
    if (discount) {
      try {
        await validateDiscount(db, discount as Discount, subtotalCents, cart.customer_email);
        discountAmountCents = calculateDiscount(discount as Discount, subtotalCents);
        await db.run(`UPDATE carts SET discount_amount_cents = ? WHERE id = ?`, [
          discountAmountCents,
          cartId,
        ]);
        discountInfo = {
          code: discount.code,
          type: discount.type as 'percentage' | 'fixed_amount',
          amount_cents: discountAmountCents,
        };
      } catch {
        await db.run(
          `UPDATE carts SET discount_code = NULL, discount_id = NULL, discount_amount_cents = 0 WHERE id = ?`,
          [cartId]
        );
      }
    } else {
      await db.run(
        `UPDATE carts SET discount_code = NULL, discount_id = NULL, discount_amount_cents = 0 WHERE id = ?`,
        [cartId]
      );
    }
  }

    const { taxes } = await calculateCartTaxes(db, cartId, cart.shipping_country);
    const taxCents = taxes.reduce((sum, t) => sum + t.amount_cents, 0);
    return c.json({
      id: cart.id,
      status: cart.status,
      currency: cart.currency,
      region_id: cart.region_id,
      customer_email: cart.customer_email,
      locale: cart.locale,
      items: allCartItems.map((item) => ({
        sku: item.sku,
        title: item.title,
        qty: item.qty,
        unit_price_cents: item.unit_price_cents,
      })),
      discount: discountInfo,
      shipping: {
        rate_id: null,
        rate_name: null,
        amount_cents: 0,
      },
      shipping_address: cart.shipping_line1
        ? {
            name: cart.shipping_name ?? null,
            line1: cart.shipping_line1,
            line2: cart.shipping_line2 ?? null,
            city: cart.shipping_city ?? null,
            state: cart.shipping_state ?? null,
            postal_code: cart.shipping_postal_code ?? null,
            country: cart.shipping_country ?? null,
            billing_same_as_shipping: cart.billing_same_as_shipping === 1,
          }
        : null,
      totals: {
        subtotal_cents: subtotalCents,
        discount_cents: discountAmountCents,
        shipping_cents: 0,
        tax_cents: taxCents,
        total_cents: subtotalCents - discountAmountCents + taxCents,
      },
      expires_at: cart.expires_at,
    }, 200);
});

const checkoutCart = createRoute({
  method: 'post',
  path: '/{cartId}/checkout',
  tags: ['Checkout'],
  summary: 'Initiate Stripe checkout',
  description: 'Creates a Stripe checkout session and returns the URL',
  request: {
    params: CartIdParam,
    body: { content: { 'application/json': { schema: CheckoutBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: CheckoutResponse } }, description: 'Checkout URL' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request or insufficient inventory' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart is not open' },
  },
});

app.openapi(checkoutCart, async (c) => {
  const { cartId } = c.req.valid('param');
  const { success_url, cancel_url, collect_shipping, shipping_countries, shipping_options } = c.req.valid('json');

  const stripeSecretKey = c.get('auth').stripeSecretKey;
  if (!stripeSecretKey) {
    throw ApiError.invalidRequest('Stripe not connected. POST /v1/setup/stripe first.');
  }

  const db = getDb(c.var.db);

  const statusUpdateResult = await db.run(
    `UPDATE carts SET status = 'checked_out', updated_at = ? WHERE id = ? AND status = 'open'`,
    [now(), cartId]
  );

  if (statusUpdateResult.changes === 0) {
    const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
    if (!cart) throw ApiError.notFound('Cart not found');
    if (cart.status !== 'open') throw ApiError.conflict('Cart is not open');
    throw ApiError.invalidRequest('Failed to initiate checkout. Please try again.');
  }

  const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  if (!cart) throw ApiError.notFound('Cart not found');

  const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);
  if (items.length === 0) {
    await db.run(`UPDATE carts SET status = 'open', updated_at = ? WHERE id = ?`, [now(), cartId]);
    throw ApiError.invalidRequest('Cart is empty');
  }

  const subtotalCents = items.reduce((sum, item) => sum + item.unit_price_cents * item.qty, 0);

  const revertCartStatus = async () => {
    await db.run(`UPDATE carts SET status = 'open', updated_at = ? WHERE id = ?`, [now(), cartId]);
  };

  let discountAmountCents = 0;
  let discount: Discount | null = null;
  let discountReserved = false;

  if (cart.discount_id) {
    const [discountRow] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [
      cart.discount_id,
    ]);
    if (discountRow) {
      discount = discountRow as Discount;

      try {
        await validateDiscount(db, discount, subtotalCents, cart.customer_email);
      } catch (err) {
        await db.run(
          `UPDATE carts SET discount_code = NULL, discount_id = NULL, discount_amount_cents = 0 WHERE id = ?`,
          [cartId]
        );
        await revertCartStatus();
        if (err instanceof ApiError) throw err;
        throw ApiError.invalidRequest('Discount is no longer valid');
      }

      const currentTime = now();

      if (discount.usage_limit_per_customer !== null) {
        const [usage] = await db.query<any>(
          `SELECT COUNT(*) as count FROM discount_usage WHERE discount_id = ? AND customer_email = ?`,
          [discount.id, cart.customer_email.toLowerCase()]
        );
        if (usage && usage.count >= discount.usage_limit_per_customer) {
          await db.run(
            `UPDATE carts SET discount_code = NULL, discount_id = NULL, discount_amount_cents = 0 WHERE id = ?`,
            [cartId]
          );
          await revertCartStatus();
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
          [currentTime, discount.id, currentTime, currentTime]
        );

        if (result.changes === 0) {
          await db.run(
            `UPDATE carts SET discount_code = NULL, discount_id = NULL, discount_amount_cents = 0 WHERE id = ?`,
            [cartId]
          );
          await revertCartStatus();
          throw ApiError.invalidRequest('Discount usage limit reached');
        }
        discountReserved = true;
      } else {
        const result = await db.run(
          `UPDATE discounts 
           SET updated_at = ? 
           WHERE id = ? 
             AND status = 'active'
             AND (starts_at IS NULL OR starts_at <= ?)
             AND (expires_at IS NULL OR expires_at >= ?)`,
          [currentTime, discount.id, currentTime, currentTime]
        );

        if (result.changes === 0) {
          await db.run(
            `UPDATE carts SET discount_code = NULL, discount_id = NULL, discount_amount_cents = 0 WHERE id = ?`,
            [cartId]
          );
          await revertCartStatus();
          throw ApiError.invalidRequest('Discount is no longer valid');
        }
      }

      discountAmountCents = calculateDiscount(discount, subtotalCents);
    } else {
      await db.run(
        `UPDATE carts SET discount_code = NULL, discount_id = NULL, discount_amount_cents = 0 WHERE id = ?`,
        [cartId]
      );
    }
  }

  const releaseReservedDiscount = async () => {
    if (discountReserved && discount) {
      await db.run(
        `UPDATE discounts SET usage_count = MAX(usage_count - 1, 0), updated_at = ? WHERE id = ?`,
        [now(), discount.id]
      );
    }
  };

  const reservedItems: { sku: string; qty: number }[] = [];

  // --- Phase 2b: Use unified helper for release ---
  const releaseReservedInventory = async () => {
    for (const item of reservedItems) {
      await releaseReservation(db, item.sku, item.qty);
    }
    reservedItems.length = 0;
  };
  // --- End Phase 2b ---

  try {
    // --- Phase 2b: Use unified helper for reserve ---
    for (const item of items) {
      try {
        await reserveInventory(db, item.sku, item.qty);
        reservedItems.push({ sku: item.sku, qty: item.qty });
      } catch (err) {
        await releaseReservedInventory();
        throw err;
      }
    }
    // --- End Phase 2b ---
  } catch (err) {
    await releaseReservedDiscount();
    await releaseReservedInventory();
    await revertCartStatus();
    throw err;
  }

  const stripe = new Stripe(stripeSecretKey);

  // Enrich items with tax_code from variants for Stripe
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const [variant] = await db.query<any>(`SELECT tax_code FROM variants WHERE sku = ?`, [item.sku]);
      return {
        ...item,
        tax_code: variant?.tax_code ?? null,
      };
    })
  );

  // Retrieve tax rates for all items to handle HT/TTC properly per line
  const { taxes: taxesDetail, itemRates } = await calculateCartTaxes(db, cartId, cart.shipping_country);
  const taxInclusive = taxesDetail.length > 0 ? taxesDetail[0].tax_inclusive : false;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = enrichedItems.map((item) => {
    const productData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.ProductData = {
      name: item.title,
    };
    if (item.tax_code) {
      productData.tax_code = item.tax_code;
    }
    
    let unitAmount = item.unit_price_cents;
    
    if (taxInclusive) {
      const rate = itemRates.get(item.sku) || 0;
      if (rate > 0) {
        // unitAmount HT calculation: ensure total HT + Tax = Total TTC
        const lineTotalTTC = item.unit_price_cents * item.qty;
        const lineTax = Math.round(lineTotalTTC - (lineTotalTTC / (1 + rate / 100)));
        const lineTotalHT = lineTotalTTC - lineTax;
        
        // Use Math.floor to be safe, remaining rounding will be added to tax line
        unitAmount = Math.floor(lineTotalHT / item.qty);
      }
    }

    return {
      price_data: {
        currency: cart.currency.toLowerCase(),
        product_data: productData,
        unit_amount: unitAmount,
      },
      quantity: item.qty,
    };
  });

  const totalLineItemsHT = lineItems.reduce((acc, item) => acc + (item.price_data?.unit_amount as number) * (item.quantity as number), 0);
  const totalTTCProducts = enrichedItems.reduce((acc, item) => acc + item.unit_price_cents * item.qty, 0);

  // Add internal taxes as separate line items
  // If inclusive, we adjust the tax amount to match the difference between TotalTTC and TotalHT reported to Stripe
  let remainingTaxToCollect = totalTTCProducts - totalLineItemsHT;
  const orderTaxes: { name: string; amount_cents: number }[] = [];

  for (const tax of taxesDetail) {
    if (tax.amount_cents > 0) {
      // Resolve localized tax name
      let resolvedName = tax.name;
      if (resolvedName.startsWith('{')) {
        try {
          const parsed = JSON.parse(resolvedName);
          resolvedName = parsed[cart.locale] || parsed['en-US'] || Object.values(parsed)[0] as string || 'Tax';
        } catch {
          // Fallback
        }
      }

      let taxAmount = tax.amount_cents;
      if (taxInclusive) {
        // Balance the tax amount to ensure Stripe total matches TTC sum exactly
        taxAmount = Math.min(remainingTaxToCollect, tax.amount_cents); 
        remainingTaxToCollect -= taxAmount;
      }

      orderTaxes.push({ name: resolvedName, amount_cents: taxAmount });

      lineItems.push({
        price_data: {
          currency: cart.currency.toLowerCase(),
          product_data: {
            name: resolvedName,
          },
          unit_amount: taxAmount,
        },
        quantity: 1,
      });
    }
  }

  // Pick up any remaining rounding error in the last tax line
  if (taxInclusive && remainingTaxToCollect > 0 && lineItems.length > 0) {
      const lastLine = lineItems[lineItems.length - 1];
      if (lastLine.price_data) {
          (lastLine.price_data as any).unit_amount += remainingTaxToCollect;
      }
    // Also update orderTaxes for storage
    if (orderTaxes.length > 0) {
      orderTaxes[orderTaxes.length - 1].amount_cents += remainingTaxToCollect;
    }
  }

  // Build dynamic shipping options from compatible shipping rates (Stripe shipping_options)
  const currencyId = await getCurrencyIdForRegion(db, cart.region_id);
  const compatibleRates = await getCompatibleShippingRates(
    db,
    cart.region_id,
    cartId,
    currencyId ?? undefined,
  );

  const dynamicShippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] =
    compatibleRates.map((rate) => ({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: rate.amount_cents, currency: cart.currency.toLowerCase() },
        display_name: rate.display_name,
        metadata: { merchant_shippingrateid: rate.id },
        ...(rate.min_delivery_days && rate.max_delivery_days
          ? {
              delivery_estimate: {
                minimum: { unit: 'business_day', value: rate.min_delivery_days },
                maximum: { unit: 'business_day', value: rate.max_delivery_days },
              },
            }
          : {}),
      },
    }));

  const defaultShippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 0, currency: cart.currency.toLowerCase() },
        display_name: 'Standard Shipping',
      },
    },
  ];

  const shippingOptions = shipping_options ?? (dynamicShippingOptions.length ? dynamicShippingOptions : defaultShippingOptions);

  let stripeCouponId: string | null = null;
  if (discount && discountAmountCents > 0) {
    const needsOnTheFlyCoupon = discount.type === 'percentage' && discount.max_discount_cents;

    if (discount.stripe_coupon_id && !needsOnTheFlyCoupon) {
      stripeCouponId = discount.stripe_coupon_id;
    } else if (stripeSecretKey) {
      try {
        const couponParams: Stripe.CouponCreateParams = {
          duration: 'once',
          metadata: { merchant_discount_id: discount.id },
        };

        if (discount.type === 'percentage' && discount.max_discount_cents) {
          couponParams.amount_off = discountAmountCents;
          couponParams.currency = cart.currency.toLowerCase();
        } else if (discount.type === 'percentage') {
          couponParams.percent_off = discount.value;
        } else {
          couponParams.amount_off = discount.value;
          couponParams.currency = cart.currency.toLowerCase();
        }

        const coupon = await stripe.coupons.create(couponParams);
        stripeCouponId = coupon.id;
      } catch (err: any) {
        await releaseReservedDiscount();
        await releaseReservedInventory();
        await revertCartStatus();
        console.error(`Failed to create Stripe coupon for discount: ${err.message}`);
        throw ApiError.invalidRequest(
          'Failed to apply discount. Please try again or remove the discount and proceed.'
        );
      }
    }
  }


  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: cart.customer_email,
      automatic_tax: { enabled: false }, // Internal tax used instead
      ...(collect_shipping && {
        shipping_address_collection: {
          allowed_countries:
            shipping_countries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
        },
      }),
      shipping_options: shippingOptions,
      line_items: lineItems,
      ...(stripeCouponId && { discounts: [{ coupon: stripeCouponId }] }),
      success_url,
      cancel_url,
      metadata: {
        cart_id: cartId,
        ...(discount && {
          discount_id: discount.id,
          discount_code: discount.code || '',
          discount_type: discount.type,
        }),
      },
    });
  } catch (err: any) {
    console.error('Stripe session creation failed:', err);
    await releaseReservedDiscount();
    await releaseReservedInventory();
    await revertCartStatus();
    throw ApiError.invalidRequest(`Payment processing error. ${err.message || 'Please try again.'}`);
  }

  // Store metadata, session ID & taxes in cart
  await db.run(
    `UPDATE carts SET stripe_checkout_session_id = ?, taxes_json = ?, updated_at = ? WHERE id = ?`,
    [session.id, JSON.stringify(orderTaxes), now(), cartId]
  );

  return c.json({
    checkout_url: session.url!,
    stripe_checkout_session_id: session.id,
  }, 200);
});

const applyDiscount = createRoute({
  method: 'post',
  path: '/{cartId}/apply-discount',
  tags: ['Checkout'],
  summary: 'Apply discount code to cart',
  request: {
    params: CartIdParam,
    body: { content: { 'application/json': { schema: ApplyDiscountBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: ApplyDiscountResponse } }, description: 'Discount applied' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid discount' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart or discount not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart is not open' },
  },
});

app.openapi(applyDiscount, async (c) => {
  const { cartId } = c.req.valid('param');
  const { code } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  if (!cart) throw ApiError.notFound('Cart not found');
  if (cart.status !== 'open') throw ApiError.conflict('Cart is not open');

  const normalizedCode = code.toUpperCase().trim();

  const [discount] = await db.query<any>(`SELECT * FROM discounts WHERE code = ?`, [normalizedCode]);
  if (!discount) throw ApiError.notFound('Discount code not found');

  const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);
  if (items.length === 0) throw ApiError.invalidRequest('Cart is empty');

  const subtotalCents = items.reduce((sum: number, item: any) => {
    return sum + item.unit_price_cents * item.qty;
  }, 0);

  await validateDiscount(db, discount as Discount, subtotalCents, cart.customer_email);
  const discountAmountCents = calculateDiscount(discount as Discount, subtotalCents);

  await db.run(
    `UPDATE carts SET discount_code = ?, discount_id = ?, discount_amount_cents = ? WHERE id = ?`,
    [discount.code, discount.id, discountAmountCents, cartId]
  );

  const { taxes } = await calculateCartTaxes(db, cartId, cart.shipping_country);
  const taxCents = taxes.reduce((sum, t) => sum + t.amount_cents, 0);

  return c.json({
    discount: {
      code: discount.code,
      type: discount.type as 'percentage' | 'fixed_amount',
      amount_cents: discountAmountCents,
    },
    totals: {
      subtotal_cents: subtotalCents,
      discount_cents: discountAmountCents,
      shipping_cents: 0,
      tax_cents: taxCents,
      total_cents: subtotalCents - discountAmountCents + taxCents,
    },
  }, 200);
});

const removeDiscount = createRoute({
  method: 'delete',
  path: '/{cartId}/discount',
  tags: ['Checkout'],
  summary: 'Remove discount from cart',
  request: { params: CartIdParam },
  responses: {
    200: { content: { 'application/json': { schema: RemoveDiscountResponse } }, description: 'Discount removed' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart is not open' },
  },
});

app.openapi(removeDiscount, async (c) => {
  const { cartId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  if (!cart) throw ApiError.notFound('Cart not found');
  if (cart.status !== 'open') throw ApiError.conflict('Cart is not open');

  await db.run(
    `UPDATE carts SET discount_code = NULL, discount_id = NULL, discount_amount_cents = 0 WHERE id = ?`,
    [cartId]
  );

  const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);
  const subtotalCents = items.reduce((sum: number, item: any) => {
    return sum + item.unit_price_cents * item.qty;
  }, 0);

  const { taxes } = await calculateCartTaxes(db, cartId, cart.shipping_country);
  const taxCents = taxes.reduce((sum, t) => sum + t.amount_cents, 0);

  return c.json({
    discount: null,
    totals: {
      subtotal_cents: subtotalCents,
      discount_cents: 0,
      shipping_cents: 0,
      tax_cents: taxCents,
      total_cents: subtotalCents + taxCents,
    },
  }, 200);
});

// ============================================================
// GAP-01 + GAP-02: SHIPPING ADDRESS & RATE SELECTION
// ============================================================

/**
 * Helper function: Get shipping rates applicable to a cart's region and destination country.
 * Filters by region, weight limit, and currency for pricing.
 */

const setShippingAddress = createRoute({
  method: 'put',
  path: '/{cartId}/shipping-address',
  tags: ['Checkout'],
  summary: 'Set shipping address on cart',
  description: 'Stores the customer delivery address on the cart. Required before selecting a shipping rate.',
  request: {
    params: CartIdParam,
    body: { content: { 'application/json': { schema: ShippingAddressInput } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: CartResponse } }, description: 'Cart with address' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart is not open' },
  },
});

app.openapi(setShippingAddress, async (c) => {
  const { cartId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb(c.var.db);

  const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  if (!cart) throw ApiError.notFound('Cart not found');
  if (cart.status !== 'open') throw ApiError.conflict('Cart is not open');

  // Persist the address fields
  await db.run(
    `UPDATE carts
     SET shipping_name = ?,
         shipping_line1 = ?,
         shipping_line2 = ?,
         shipping_city = ?,
         shipping_state = ?,
         shipping_postal_code = ?,
         shipping_country = ?,
         billing_same_as_shipping = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      body.name,
      body.line1,
      body.line2 ?? null,
      body.city,
      body.state ?? null,
      body.postal_code,
      body.country,
      body.billing_same_as_shipping ? 1 : 0,
      now(),
      cartId,
    ]
  );

  // If a rate was selected before, verify it's still compatible with the new country
  if (cart.shipping_rate_id) {
    const currencyId = await getCurrencyIdForRegion(db, cart.region_id);
    const compatibleRates = await getCompatibleShippingRates(
      db,
      cart.region_id,
      cartId,
      currencyId ?? undefined,
    );
    const stillValid = compatibleRates.some((r) => r.id === cart.shipping_rate_id);
    if (!stillValid) {
      await db.run(
        `UPDATE carts SET shipping_rate_id = NULL, shipping_cents = 0, updated_at = ? WHERE id = ?`,
        [now(), cartId]
      );
    }
  }

  // Return updated cart
  const [updatedCart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);

  let shippingInfo = { rate_id: null as string | null, rate_name: null as string | null, amount_cents: 0 };
  if (updatedCart.shipping_rate_id) {
    const [rate] = await db.query<any>(`SELECT * FROM shipping_rates WHERE id = ?`, [updatedCart.shipping_rate_id]);
    if (rate) {
      shippingInfo.rate_id = rate.id;
      shippingInfo.rate_name = rate.display_name;
      shippingInfo.amount_cents = updatedCart.shipping_cents || 0;
    }
  }

  const subtotalCents = items.reduce((sum: number, i: any) => sum + i.unit_price_cents * i.qty, 0);

  const { taxes } = await calculateCartTaxes(db, updatedCart.id, updatedCart.shipping_country);
  const taxCents = taxes.reduce((sum, t) => sum + t.amount_cents, 0);

  return c.json({
    id: updatedCart.id,
    status: updatedCart.status,
    currency: updatedCart.currency,
    region_id: updatedCart.region_id,
    customer_email: updatedCart.customer_email,
    locale: updatedCart.locale,
    items: items.map((i: any) => ({
      sku: i.sku,
      title: i.title,
      qty: i.qty,
      unit_price_cents: i.unit_price_cents,
    })),
    shipping: shippingInfo,
    shipping_address: {
      name: updatedCart.shipping_name ?? null,
      line1: updatedCart.shipping_line1,
      line2: updatedCart.shipping_line2 ?? null,
      city: updatedCart.shipping_city,
      state: updatedCart.shipping_state ?? null,
      postal_code: updatedCart.shipping_postal_code,
      country: updatedCart.shipping_country,
      billing_same_as_shipping: updatedCart.billing_same_as_shipping === 1,
    },
    totals: {
      subtotal_cents: subtotalCents,
      discount_cents: updatedCart.discount_amount_cents ?? 0,
      shipping_cents: updatedCart.shipping_cents ?? 0,
      tax_cents: taxCents,
      total_cents: subtotalCents - (updatedCart.discount_amount_cents ?? 0) + (updatedCart.shipping_cents ?? 0) + taxCents,
    },
    expires_at: updatedCart.expires_at,
  }, 200);
});

const getAvailableShippingRates = createRoute({
  method: 'get',
  path: '/{cartId}/available-shipping-rates',
  tags: ['Checkout'],
  summary: 'List applicable shipping rates for this cart',
  description: 'Returns shipping rates compatible with the cart\'s region, destination country and total weight. Requires a shipping address to be set on the cart first.',
  request: { params: CartIdParam },
  responses: {
    200: {
      content: { 'application/json': { schema: AvailableShippingRatesResponse } },
      description: 'List of applicable shipping rates',
    },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'No shipping address set' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart not found' },
  },
});

app.openapi(getAvailableShippingRates, async (c) => {
  const { cartId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  if (!cart) throw ApiError.notFound('Cart not found');

  if (!cart.shipping_country) {
    throw ApiError.invalidRequest(
      'No shipping address set. Call PUT /v1/carts/{cartId}/shipping-address first.'
    );
  }

  // Compute cart total weight
  const weightResult = await db.query<any>(`
    SELECT COALESCE(SUM(v.weight_g * ci.qty), 0) AS total_weight_g
    FROM cart_items ci
    JOIN variants v ON v.sku = ci.sku
    WHERE ci.cart_id = ?
  `, [cartId]);

  const cart_weight_g: number = weightResult[0]?.total_weight_g ?? 0;

  // Resolve currency for price lookup
  const currencyId = await getCurrencyIdForRegion(db, cart.region_id);

  // Get compatible rates (cartId is required for class/weight filtering)
  const rates = await getCompatibleShippingRates(
    db,
    cart.region_id,
    cartId,
    currencyId ?? undefined,
  );

  return c.json(
    {
      items: rates,
      cart_total_weight_g: cart_weight_g,
    },
    200,
  );
});

const selectShippingRate = createRoute({
  method: 'put',
  path: '/{cartId}/shipping-rate',
  tags: ['Checkout'],
  summary: 'Select a shipping rate for the cart',
  description: 'Stores the chosen shipping rate and updates shipping_cents in the cart totals.',
  request: {
    params: CartIdParam,
    body: { content: { 'application/json': { schema: SelectShippingRateBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: CartResponse } }, description: 'Cart with updated shipping' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Rate not available for this cart' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart or rate not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cart is not open' },
  },
});

app.openapi(selectShippingRate, async (c) => {
  const { cartId } = c.req.valid('param');
  const { shipping_rate_id } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  if (!cart) throw ApiError.notFound('Cart not found');
  if (cart.status !== 'open') throw ApiError.conflict('Cart is not open');

  if (!cart.shipping_country) {
    throw ApiError.invalidRequest('Set a shipping address before selecting a shipping rate.');
  }

  // Resolve currency for price lookup
  const currencyId = await getCurrencyIdForRegion(db, cart.region_id);

  // Compute cart weight (used internally by getCompatibleShippingRates)
  const cart_weight_g = await computeCartWeightG(db, cartId);

  // Get compatible rates and find the chosen one
  const compatibleRates = await getCompatibleShippingRates(
    db,
    cart.region_id,
    cartId,
    currencyId ?? undefined,
  );

  const chosenRate = compatibleRates.find((r) => r.id === shipping_rate_id);
  if (!chosenRate) {
    throw ApiError.invalidRequest(
      'This shipping rate is not available for the current cart region, country or weight.'
    );
  }

  // Persist selection
  await db.run(
    `UPDATE carts
     SET shipping_rate_id = ?,
         shipping_cents = ?,
         updated_at = ?
     WHERE id = ?`,
    [shipping_rate_id, chosenRate.amount_cents, now(), cartId]
  );

  // Return updated cart
  const [updatedCart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
  const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);
  const subtotalCents = items.reduce((sum: number, i: any) => sum + i.unit_price_cents * i.qty, 0);

  const { taxes } = await calculateCartTaxes(db, updatedCart.id, updatedCart.shipping_country);
  const taxCents = taxes.reduce((sum, t) => sum + t.amount_cents, 0);

  return c.json({
    id: updatedCart.id,
    status: updatedCart.status,
    currency: updatedCart.currency,
    region_id: updatedCart.region_id,
    customer_email: updatedCart.customer_email,
    locale: updatedCart.locale,
    items: items.map((i: any) => ({
      sku: i.sku,
      title: i.title,
      qty: i.qty,
      unit_price_cents: i.unit_price_cents,
    })),
    shipping: {
      rate_id: chosenRate.id,
      rate_name: chosenRate.display_name,
      amount_cents: chosenRate.amount_cents,
    },
    shipping_address: updatedCart.shipping_line1
      ? {
          name: updatedCart.shipping_name ?? null,
          line1: updatedCart.shipping_line1,
          line2: updatedCart.shipping_line2 ?? null,
          city: updatedCart.shipping_city ?? null,
          state: updatedCart.shipping_state ?? null,
          postal_code: updatedCart.shipping_postal_code ?? null,
          country: updatedCart.shipping_country ?? null,
          billing_same_as_shipping: updatedCart.billing_same_as_shipping === 1,
        }
      : null,
    totals: {
      subtotal_cents: subtotalCents,
      discount_cents: updatedCart.discount_amount_cents ?? 0,
      shipping_cents: chosenRate.amount_cents,
      tax_cents: taxCents,
      total_cents: subtotalCents - (updatedCart.discount_amount_cents ?? 0) + chosenRate.amount_cents + taxCents,
    },
    expires_at: updatedCart.expires_at,
  }, 200);
});

export { app as checkout };
