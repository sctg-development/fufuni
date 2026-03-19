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

import { Hono } from 'hono';
import Stripe from 'stripe';
import { getDb } from '../db';
import { ApiError, uuid, now, generateOrderNumber, type HonoEnv } from '../types';
import { dispatchWebhooks } from '../lib/webhooks';
import { handleUCPStripeWebhook } from './ucp';
import { sendOrderConfirmationEmail } from '../lib/order-email';

// ============================================================
// WEBHOOK ROUTES
// ============================================================

export const webhooks = new Hono<HonoEnv>();

// POST /v1/webhooks/stripe
webhooks.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();

  if (!signature) throw ApiError.invalidRequest('Missing stripe-signature header');

  const db = getDb(c.var.db);

  // For simplicity and to avoid an extra DB query, we read the webhook secret directly from env vars
  let stripeConfig = {
    secret_key: c.env.STRIPE_SECRET_KEY,
    webhook_secret: c.env.STRIPE_WEBHOOK_SECRET,
  };

  if (!stripeConfig.secret_key || !stripeConfig.webhook_secret) {
    // Get stripe keys from config table if not set in env vars (legacy support)
    const [config] = await db.query<any>(`SELECT * FROM config WHERE key = 'stripe'`);
    if (!config?.value) {
      throw ApiError.invalidRequest('Stripe not configured');
    }

    stripeConfig = JSON.parse(config.value);
  }

  if (!stripeConfig.secret_key || !stripeConfig.webhook_secret) {
    throw ApiError.invalidRequest('Stripe not configured. Missing secret key or webhook secret.');
  }
  // Verify signature
  const stripe = new Stripe(stripeConfig.secret_key);
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeConfig.webhook_secret);
  } catch (e: any) {
    throw new ApiError('webhook_signature_invalid', 400, e.message);
  }

  // Dedupe
  const [existing] = await db.query<any>(`SELECT id FROM events WHERE stripe_event_id = ?`, [
    event.id,
  ]);
  if (existing) return c.json({ ok: true });

  if (event.type === 'checkout.session.completed') {
    const webhookSession = event.data.object as Stripe.Checkout.Session;
    
    if (webhookSession.metadata?.ucp_checkout_session_id) {
      await handleUCPStripeWebhook(db, webhookSession.id, webhookSession);
    }
    
    const cartId = webhookSession.metadata?.cart_id;

    if (cartId) {
      const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
      if (cart) {
        const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);

        // Retrieve full session from Stripe to get shipping_details
        // (webhook payload sometimes doesn't include all fields)
        const session = await stripe.checkout.sessions.retrieve(webhookSession.id);

        // Handle discount
        let discountCode = null;
        let discountId = null;
        let discountAmountCents = 0;
        let discount: any = null;

        if (session.metadata?.discount_id) {
          const [discountRow] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [
            session.metadata.discount_id,
          ]);

          if (discountRow) {
            discount = discountRow;
            discountCode = discount.code;
            discountId = discount.id;
            discountAmountCents = cart.discount_amount_cents || 0;

            // We don't increment again here to avoid double-counting
            // The usage_count was reserved at checkout and is now being committed with the order
          }
        }

        // Calculate subtotal from cart items (before discounts)
        // session.amount_subtotal includes discounts as negative line items, so we calculate from original items
        const subtotalCents = items.reduce(
          (sum, item) => sum + item.unit_price_cents * item.qty,
          0
        );

        // Generate order number (timestamp-based to avoid race conditions)
        const orderNumber = generateOrderNumber();

        // Extract customer details from full Stripe session
        const customerEmail = cart.customer_email;
        const shippingName =
          session.shipping_details?.name || session.customer_details?.name || null;
        const shippingPhone =
          session.shipping_details?.phone || session.customer_details?.phone || null;
        const shippingAddress = session.shipping_details?.address || null;

        // Upsert customer (create or update on email match)
        let customerId: string | null = null;
        const [existingCustomer] = await db.query<any>(
          `SELECT id, order_count, total_spent_cents FROM customers WHERE email = ?`,
          [customerEmail]
        );

        if (existingCustomer) {
          // Update existing customer
          customerId = existingCustomer.id;
          await db.run(
            `UPDATE customers SET 
              name = COALESCE(?, name),
              phone = COALESCE(?, phone),
              order_count = order_count + 1,
              total_spent_cents = total_spent_cents + ?,
              last_order_at = ?,
              updated_at = ?
            WHERE id = ?`,
            [shippingName, shippingPhone, session.amount_total ?? 0, now(), now(), customerId]
          );
        } else {
          // Create new customer
          customerId = uuid();
          await db.run(
            `INSERT INTO customers (id, email, name, phone, order_count, total_spent_cents, last_order_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`,
            [
              customerId,
              customerEmail,
              shippingName,
              shippingPhone,
              session.amount_total ?? 0,
              now(),
            ]
          );
        }

        // Save shipping address to customer if provided
        if (shippingAddress && customerId) {
          const [existingAddress] = await db.query<any>(
            `SELECT id FROM customer_addresses WHERE customer_id = ? AND line1 = ? AND postal_code = ?`,
            [customerId, shippingAddress.line1, shippingAddress.postal_code]
          );

          if (!existingAddress) {
            // Check if customer has any addresses
            const [addressCount] = await db.query<any>(
              `SELECT COUNT(*) as count FROM customer_addresses WHERE customer_id = ?`,
              [customerId]
            );
            const isDefault = addressCount.count === 0 ? 1 : 0;

            await db.run(
              `INSERT INTO customer_addresses (id, customer_id, is_default, name, line1, line2, city, state, postal_code, country, phone)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuid(),
                customerId,
                isDefault,
                shippingName,
                shippingAddress.line1,
                shippingAddress.line2 || null,
                shippingAddress.city,
                shippingAddress.state,
                shippingAddress.postal_code,
                shippingAddress.country,
                shippingPhone,
              ]
            );
          }
        }

        // Create order (now with customer link, shipping details, and discount)
        const orderId = uuid();
        await db.run(
          `INSERT INTO orders (id, customer_id, number, status, customer_email, 
           shipping_name, shipping_phone, ship_to,
           subtotal_cents, tax_cents, shipping_cents, total_cents, currency,
           discount_code, discount_id, discount_amount_cents,
           stripe_checkout_session_id, stripe_payment_intent_id, taxes_json)
           VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            customerId,
            orderNumber,
            customerEmail,
            shippingName,
            shippingPhone,
            shippingAddress ? JSON.stringify(shippingAddress) : null,
            subtotalCents,
            session.total_details?.amount_tax ?? 0,
            cart.shipping_cents ?? 0,
            session.amount_total ?? 0,
            cart.currency,
            discountCode,
            discountId,
            discountAmountCents,
            session.id,
            session.payment_intent,
            cart.taxes_json,
          ]
        );

        // Send order confirmation email with a signed view token (non-blocking).
        // If Mailgun is not configured, the call will be a no-op.
        if (c.env.ORDER_TOKEN_SECRET) {
          c.executionCtx.waitUntil(
            (async () => {
              try {
                await sendOrderConfirmationEmail(c.env, db, {
                  orderId,
                  regenerateToken: false,
                });
              } catch (err) {
                console.warn('Failed to send order confirmation email', err);
              }
            })(),
          );
        }

        // Track discount usage for per-customer limit tracking
        // Note: usage_count was already incremented at checkout time (atomic reservation)
        // We only record the usage here for per-customer tracking and audit purposes
        if (discountId && discountAmountCents > 0) {
          // Check if already recorded (idempotency)
          const [existing] = await db.query<any>(
            `SELECT id FROM discount_usage WHERE order_id = ? AND discount_id = ?`,
            [orderId, discountId]
          );

          if (!existing) {
            // Enforce per-customer limit atomically using conditional INSERT
            // This prevents race conditions from concurrent checkouts
            // Reuse discount object from earlier in the function
            if (discount?.usage_limit_per_customer !== null) {
              // Use atomic conditional INSERT: only insert if current usage count is below limit
              // This prevents concurrent checkouts from bypassing the per-customer limit
              const usageId = uuid();
              const customerEmailLower = cart.customer_email.toLowerCase();

              // For SQLite/D1: Use INSERT with SELECT and WHERE clause to atomically check limit
              const result = await db.run(
                `INSERT INTO discount_usage (id, discount_id, order_id, customer_email, discount_amount_cents)
                 SELECT ?, ?, ?, ?, ?
                 WHERE (
                   SELECT COUNT(*) FROM discount_usage 
                   WHERE discount_id = ? AND customer_email = ?
                 ) < ?`,
                [
                  usageId,
                  discountId,
                  orderId,
                  customerEmailLower,
                  discountAmountCents,
                  discountId,
                  customerEmailLower,
                  discount.usage_limit_per_customer,
                ]
              );

              // If insert failed (changes === 0), the limit was exceeded
              // This can happen with concurrent checkouts - the order is already created and paid,
              // so we log this but don't fail the webhook
              if (result.changes === 0) {
                // Limit exceeded - this shouldn't happen if checkout validation worked correctly,
                // but can occur with concurrent checkouts. Log for monitoring.
                console.warn(
                  `Discount usage limit exceeded for customer ${customerEmailLower} and discount ${discountId}, ` +
                    `but order ${orderId} already created (payment succeeded). This may indicate a race condition.`
                );
              }
            } else {
              // No per-customer limit, safe to insert directly
              await db.run(
                `INSERT INTO discount_usage (id, discount_id, order_id, customer_email, discount_amount_cents)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  uuid(),
                  discountId,
                  orderId,
                  cart.customer_email.toLowerCase(),
                  discountAmountCents,
                ]
              );
            }
          }
          // If already exists, silently skip
        }

        // Create order items & update inventory
        for (const item of items) {
          await db.run(
            `INSERT INTO order_items (id, order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuid(), orderId, item.sku, item.title, item.qty, item.unit_price_cents]
          );

          await db.run(
            `UPDATE inventory SET reserved = reserved - ?, on_hand = on_hand - ?, updated_at = ? WHERE sku = ?`,
            [item.qty, item.qty, now(), item.sku]
          );

          await db.run(
            `INSERT INTO inventory_logs (id, sku, delta, reason) VALUES (?, ?, ?, 'sale')`,
            [uuid(), item.sku, -item.qty]
          );
        }

        // Update cart status to prevent cron from treating it as abandoned checkout
        // This prevents the abandoned checkout cleanup from incorrectly decrementing discount usage_count
        await db.run(`UPDATE carts SET status = 'expired', updated_at = ? WHERE id = ?`, [
          now(),
          cartId,
        ]);

        // Dispatch order.created webhook
        const orderItems = await db.query<any>(`SELECT * FROM order_items WHERE order_id = ?`, [
          orderId,
        ]);
        await dispatchWebhooks(c.var.db, c.executionCtx, 'order.created', {
          order: {
            id: orderId,
            number: orderNumber,
            status: 'paid',
            customer_email: customerEmail,
            customer_id: customerId,
            shipping: {
              name: shippingName,
              phone: shippingPhone,
              address: shippingAddress,
            },
            amounts: {
              subtotal_cents: session.amount_subtotal ?? 0,
              tax_cents: session.total_details?.amount_tax ?? 0,
              shipping_cents: cart.shipping_cents ?? 0,
              total_cents: session.amount_total ?? 0,
              currency: cart.currency,
            },
            items: orderItems.map((i: any) => ({
              sku: i.sku,
              title: i.title,
              qty: i.qty,
              unit_price_cents: i.unit_price_cents,
            })),
            stripe: {
              checkout_session_id: session.id,
              payment_intent_id: session.payment_intent,
            },
          },
        });
      }
    }
  }

  // Log event
  await db.run(
    `INSERT INTO events (id, stripe_event_id, type, payload) VALUES (?, ?, ?, ?)`,
    [uuid(), event.id, event.type, JSON.stringify(event.data.object)]
  );

  return c.json({ ok: true });
});
