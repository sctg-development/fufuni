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

import { type MerchantDO } from './do';

export type Env = {
  MERCHANT: DurableObjectNamespace<MerchantDO>;
  IMAGES?: R2Bucket;
  IMAGES_URL?: string;

  /**
   * Secret key for Stripe API. Required for processing payments and managing subscriptions.
   * Must be set in production for the application to function properly.
   */
  STRIPE_SECRET_KEY?: string;

  /**
   * Publishable key for Stripe API. Used on the client side to tokenize payment information.
   * Not strictly required on the server, but often included for convenience.
   */
  STRIPE_PUBLISHABLE_KEY?: string;

  /**
   * Webhook secret for verifying incoming Stripe webhook signatures. Required if you want to handle webhooks securely.
   * Must be set in production if webhooks are used.
   */
  STRIPE_WEBHOOK_SECRET?: string;

  /**
   * Domain configured in Auth0 (e.g. `your-tenant.auth0.com`).
   * Required when validating JWTs issued by Auth0.
   */
  AUTH0_DOMAIN?: string;

  /**
   * Expected audience claim for incoming JWTs. Typically the API identifier
   * configured in your Auth0 application settings.
   */
  AUTH0_AUDIENCE?: string;

  /**
   * Permission string required on incoming Auth0 tokens to be treated as an
   * admin user.  Defaults to `admin:store` when not set.
   */
  ADMIN_STORE_PERMISSION?: string;

  /**
   * Permission string used to guard the `/api/__auth0/token` endpoint.  Any
   * caller must be authenticated and have this permission to request a Management
   * API token.  If unset the route is open to admins only.
   */
  ADMIN_AUTH0_PERMISSION?: string;

  /**
   * Comma-separated list of permissions to automatically assign to the current
   * user when hitting `/api/__auth0/autopermissions`.
   */
  AUTH0_AUTOMATIC_PERMISSIONS?: string;

  /**
   * Permission string .  Defaults to
   * `admin:database` when not set.
   */
  DATABASE_PERMISSION?: string;

  /**
   * Permission string required to access mail-related API routes. Defaults to `mail:api` when not set.
   */
  MAIL_PERMISSION?: string; 

  /**
   * Groq / OpenAI-compatible API key for product description AI translation.
   */
  AI_API_KEY?: string;

  /**
   * Model name, e.g. "llama-3.3-70b-versatile" (Groq) or "gpt-4o-mini" (OpenAI).
   */
  AI_MODEL?: string;

  /**
   * Base URL of the AI API — must NOT include a trailing slash.
   * e.g. "https://api.groq.com/openai/v1"
   */
  AI_API_URL?: string;

  /**
   * Permission string required to access the AI parameters route.
   * e.g. "ai:api"
   */
  AI_PERMISSION?: string;

  /**
   * Mailgun user
   */
  MAILGUN_USER?: string;

  /**
   * Mailgun API key
   */
  MAILGUN_API_KEY?: string;

  /**
   * Mailgun domain
   */
  MAILGUN_DOMAIN?: string;

  /**
   * Mailgun base URL
   */
  MAILGUN_BASE_URL?: string;

  /**
   * Secret key used to sign order view tokens (HMAC-HS256 JWT).
   * Must be at least 32 characters. Set as a Cloudflare secret in production.
   * Used to securely grant customers read-only access to their order status without authentication.
   */
  ORDER_TOKEN_SECRET?: string;

  /**
   * Public-facing URL of the storefront, used to build order tracking links in emails.
   * Example: "https://mystore.example.com"
   */
  STORE_URL?: string;

  /**
   * Display name of the store, used in transactional emails.
   * Example: "My Awesome Shop"
   */
  STORE_NAME?: string;

};

export type DOStub = {
  query: <T = unknown>(sql: string, params: unknown[]) => Promise<T[]>;
  run: (sql: string, params: unknown[]) => Promise<{ changes: number }>;
  broadcast: (event: { type: string; data: unknown; timestamp: string }) => void;
};

export type Variables = {
  db: DOStub;
  auth: AuthContext;
};

export type HonoEnv = {
  Bindings: Env;
  Variables: Variables;
};

export type AuthRole = 'public' | 'admin' | 'oauth' | 'authadmin' | 'databaseadmin' | 'aiadmin' | 'mail' | 'customer';

export type AuthContext = {
  role: AuthRole | AuthRole[];
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  oauthScopes?: string[];
  customerEmail?: string;
  email?: string;
  sub?: string;
  permissions?: string[];
};

export class ApiError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError('unauthorized', 401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError('forbidden', 403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError('not_found', 404, message);
  }

  static invalidRequest(message: string, details?: Record<string, unknown>) {
    return new ApiError('invalid_request', 400, message, details);
  }

  static conflict(message: string) {
    return new ApiError('conflict', 409, message);
  }

  static insufficientInventory(sku: string) {
    return new ApiError('insufficient_inventory', 409, `Insufficient inventory for SKU: ${sku}`, {
      sku,
    });
  }

  static stripeError(message: string) {
    return new ApiError('stripe_error', 502, message);
  }
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function generateOrderNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ORD-${datePart}-${suffix}`;
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
