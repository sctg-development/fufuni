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

import { createMiddleware } from 'hono/factory';
import { ApiError, type HonoEnv } from '../types';
import type { JWTPayload } from 'jose';

/**
 * Middleware for customer authentication via Auth0 JWT.
 * 
 * This middleware verifies Auth0-issued JWTs without requiring specific permissions.
 * It extracts the 'sub' and 'email' claims for use in customer-scoped routes like /v1/me/*.
 * 
 * On success, sets `c.get('auth')` with:
 * - role: 'customer'
 * - sub: Auth0 user identifier (e.g., 'auth0|abc123')
 * - email: User email from JWT
 * - permissions: Array of permissions (may be empty for customers)
 */
export const customerAuthMiddleware = createMiddleware<HonoEnv>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    // Only accept JWTs (three-part format), not API keys
    if (
      token.split('.').length !== 3 ||
      token.startsWith('pk_') ||
      token.startsWith('sk_')
    ) {
      throw ApiError.unauthorized('Invalid token for customer endpoints');
    }

    const domain = c.env.AUTH0_DOMAIN;
    const audience = c.env.AUTH0_AUDIENCE;

    if (!domain || !audience) {
      throw ApiError.unauthorized('Auth0 not configured');
    }

    let payload: JWTPayload;
    try {
      const { verifyAuth0Jwt } = await import('../lib/auth0');
      payload = await verifyAuth0Jwt(token, domain, audience);
    } catch (err) {
      console.error('JWT verification failed', err);
      throw ApiError.unauthorized('Invalid Auth0 JWT');
    }

    // Extract claims
    const sub = payload.sub as string | undefined;
    // Try to get email from standard claim, or fall back to email_verified user info
    const email = (payload.email || payload['https://yourapp.com/email']) as string | undefined;
    const perms = Array.isArray(payload.permissions)
      ? (payload.permissions as unknown[]).map(String)
      : [];

    if (!sub) {
      throw ApiError.unauthorized('Invalid token: missing sub claim');
    }

    // Email is optional - if not in JWT, middleware will work but routes may need to handle it
    // The resolveCustomer function will attempt to look up by sub, then by email if available

    // Store auth context for downstream handlers
    c.set('auth', {
      role: 'customer',
      sub,
      email: email || undefined,
      permissions: perms,
      stripeSecretKey: null,
      stripeWebhookSecret: null,
    });

    await next();
  }
);
