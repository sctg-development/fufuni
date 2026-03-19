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
 * apps/merchant/src/lib/order-token.ts
 * 
 * Utilities for generating and verifying signed order view tokens.
 * Uses HMAC-HS256 JWT from the `jose` library (already a Cloudflare Workers dependency).
 * 
 * Tokens grant read-only access to view an order's status without authentication.
 * They are signed with ORDER_TOKEN_SECRET and valid for 30 days.
 */

import { SignJWT, jwtVerify } from 'jose';

// Token validity: 30 days. Long enough so customer can check back later.
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Converts a plain string secret into a CryptoKey usable by jose.
 * We use SHA-256 hash of the secret so the secret can be any length.
 */
async function getSecretKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/**
 * Options for generating an order view token.
 */
export type OrderViewTokenOptions = {
  /**
   * When provided, the token is issued at this exact time (useful to make token
   * generation deterministic for resending the same link).
   */
  issuedAt?: Date;
  /**
   * Token lifetime in seconds.
   */
  ttlSeconds?: number;
};

/**
 * Generates a signed JWT that grants read access to a specific order.
 *
 * @param orderId - The UUID of the order in the database
 * @param secret  - The ORDER_TOKEN_SECRET environment variable
 * @param opts    - Optional token generation options
 * @returns       - A signed JWT string (to be included in the email link)
 */
export async function generateOrderViewToken(
  orderId: string,
  secret: string,
  opts: OrderViewTokenOptions = {}
): Promise<string> {
  const key = await getSecretKey(secret);
  const issuedAt = opts.issuedAt ? opts.issuedAt : new Date();
  const ttlSeconds = opts.ttlSeconds ?? TOKEN_TTL_SECONDS;

  const jwt = new SignJWT({ oid: orderId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(`${ttlSeconds}s`);

  return jwt.sign(key);
}

/**
 * Verifies a signed order view token.
 * Throws an error if the token is invalid, expired, or tampered with.
 *
 * @param token   - The raw JWT string from the URL query parameter
 * @param orderId - The order ID from the URL path parameter (for cross-check)
 * @param secret  - The ORDER_TOKEN_SECRET environment variable
 * @returns       - The decoded payload if valid
 */
export async function verifyOrderViewToken(
  token: string,
  orderId: string,
  secret: string
): Promise<{ oid: string }> {
  const key = await getSecretKey(secret);
  const { payload } = await jwtVerify(token, key);

  // Make sure the token was issued for THIS specific order
  if (payload.oid !== orderId) {
    throw new Error('Token does not match order ID');
  }

  return payload as { oid: string };
}

/**
 * Produces a SHA-256 hex hash of a token string.
 * We store the HASH in the database, never the raw token.
 * This way, even if the database is compromised, tokens cannot be reused.
 *
 * @param token - The raw JWT string
 * @returns     - Hex-encoded SHA-256 hash
 */
export async function hashOrderToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
