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

/**
 * apps/merchant/src/lib/order-email.ts
 *
 * Centralized helpers for generating order tracking links and sending order
 * confirmation emails.
 *
 * This module is designed to be used by both the Stripe webhook handler and
 * by admin endpoints (resend / regenerate link).
 */

import { Env } from '../types';
import { Database } from '../db';
import { buildOrderConfirmationEmail } from './email-templates';
import { generateOrderViewToken, hashOrderToken } from './order-token';
import { sendMailgunEmail } from '../mailgun';

export type SendOrderConfirmationOptions = {
  orderId: string;
  /**
   * When true, always generate a new token (invalidating any previous one).
   * When false, re-use the existing token if present.
   */
  regenerateToken?: boolean;
};

export type SendOrderConfirmationResult = {
  orderId: string;
  customerEmail: string;
  orderUrl: string;
  tokenRotated: boolean;
  success: boolean;
  mailgunStatus?: number;
  errorMessage?: string;
};

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Builds a stable JWT token for an order.
 *
 * The token is a signed JWT with an expiration time that is derived
 * from `issuedAt`. This allows the token to be re-generated (for resend)
 * without changing its value, as long as the same `issuedAt` is used.
 */
async function buildOrderToken(orderId: string, secret: string, issuedAt: Date) {
  return generateOrderViewToken(orderId, secret, { issuedAt, ttlSeconds: TOKEN_TTL_SECONDS });
}

export async function sendOrderConfirmationEmail(
  env: Env,
  db: Database,
  options: SendOrderConfirmationOptions,
): Promise<SendOrderConfirmationResult> {
  const { orderId, regenerateToken = false } = options;

  const secret = env.ORDER_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ORDER_TOKEN_SECRET not configured');
  }

  const STORE_URL = (env.STORE_URL || '').replace(/\/$/, '') || 'https://example.com';
  const STORE_NAME = env.STORE_NAME || 'Fufuni Store';

  const [order] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) {
    throw new Error('Order not found');
  }

  const issuedAt = order.viewtoken_issued_at
    ? new Date(order.viewtoken_issued_at)
    : new Date();

  const shouldGenerateToken = regenerateToken || !order.viewtoken;
  const tokenIssuedAt = shouldGenerateToken ? new Date() : issuedAt;

  const token = await buildOrderToken(orderId, secret, tokenIssuedAt);
  const tokenHash = await hashOrderToken(token);
  const orderUrl = `${STORE_URL}/order/${orderId}?token=${encodeURIComponent(token)}`;

  const email = buildOrderConfirmationEmail({
    orderNumber: order.number,
    orderUrl,
    STORE_NAME,
    totalcents: order.total_cents,
    currency: order.currency,
  });

  const now = new Date().toISOString();

  const baseUpdateSql = `UPDATE orders SET viewtoken = ?, viewtoken_issued_at = ?, confirmationemailupdatedat = ?`;
  const baseParams: unknown[] = [tokenHash, tokenIssuedAt.toISOString(), now];

  const hasMailgun = Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);

  if (!hasMailgun) {
    // No mail service configured; record the token and exit successfully.
    await db.run(
      `${baseUpdateSql}, confirmationemailsentat = ?, confirmationemaillasterror = NULL WHERE id = ?`,
      [...baseParams, now, orderId],
    );

    return {
      orderId,
      customerEmail: order.customer_email,
      orderUrl,
      tokenRotated: shouldGenerateToken,
      success: true,
    };
  }

  try {
    const result = await sendMailgunEmail(env, {
      to: order.customer_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    await db.run(
      `${baseUpdateSql}, confirmationemailsentat = ?, confirmationemaillasterror = NULL WHERE id = ?`,
      [...baseParams, now, orderId],
    );

    return {
      orderId,
      customerEmail: order.customer_email,
      orderUrl,
      tokenRotated: shouldGenerateToken,
      success: result.success,
      mailgunStatus: result.status,
    };
  } catch (err: any) {
    const errorMessage = err?.message ?? String(err);
    await db.run(
      `${baseUpdateSql}, confirmationemaillasterror = ? WHERE id = ?`,
      [...baseParams, errorMessage, orderId],
    );

    return {
      orderId,
      customerEmail: order.customer_email,
      orderUrl,
      tokenRotated: shouldGenerateToken,
      success: false,
      errorMessage,
    };
  }
}
