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
import { getDb } from '../db';
import { ApiError, now, type HonoEnv } from '../types';

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  const db = getDb(c.var.db);
  const stripeSecretKey = c.env.STRIPE_SECRET_KEY || null;
  const stripeWebhookSecret = c.env.STRIPE_WEBHOOK_SECRET || null;

  const isOAuthToken = token.length === 64 && /^[a-f0-9]+$/.test(token);

  // ------------------------------------------------------------------
  // Auth0 JWT support
  // ------------------------------------------------------------------
  // When the Authorization header contains a standard JWT (three dot-joined
  // segments) and the token does **not** start with our API key prefixes, we
  // treat it as an Auth0 access token.  The token must:
  //   1. validate against the Auth0 tenant's JWKS
  //   2. include the expected audience claim (from AUTH0_AUDIENCE)
  //   3. carry the `admin:store` permission in the `permissions` array
  //
  // This allows browser clients obtaining Auth0 tokens to call the same
  // endpoints as the legacy API key system, with a single `admin` role.
  //
  // detect values with the three-part JWT structure (header.payload.signature)
  // while skipping API keys that might accidentally contain dots.
  if (
    token.split('.').length === 3 &&
    !token.startsWith('pk_') &&
    !token.startsWith('sk_')
  ) {
    const { verifyAuth0Jwt } = await import('../lib/auth0');

    const domain = c.env.AUTH0_DOMAIN;
    const audience = c.env.AUTH0_AUDIENCE;

    if (!domain || !audience) {
      throw ApiError.unauthorized('Auth0 not configured on server');
    }

    let payload;
    try {
      payload = await verifyAuth0Jwt(token, domain, audience);
    } catch (err) {
      console.error('JWT verification failed', err);
      throw ApiError.unauthorized('Invalid Auth0 JWT');
    }

    const perms = Array.isArray(payload.permissions)
      ? (payload.permissions as unknown[]).map(String)
      : [];

    // permission required for admin access is driven by an environment
    // variable so it can be changed without a deploy.  fall back to the
    // historical value for backward compatibility.
    const requiredPerm = c.env.ADMIN_STORE_PERMISSION || 'admin:store';

    if (!perms.includes(requiredPerm)) {
      throw ApiError.forbidden(`${requiredPerm} permission required`);
    }

    // Build a list of roles based on permissions in the token.
    // This ensures we include all matching permissions (e.g. admin + authadmin + databaseadmin).
    const roles: string[] = [];

    // `requiredPerm` is used as an access gate; its presence implies at least `admin`.
    if (perms.includes(requiredPerm)) {
      roles.push('admin');
    }

    const authAdminPerm = c.env.ADMIN_AUTH0_PERMISSION || 'auth0:admin:api';
    if (perms.includes(authAdminPerm)) {
      roles.push('authadmin');
    }

    const databasePerm = c.env.DATABASE_PERMISSION || 'admin:database';
    if (perms.includes(databasePerm)) {
      roles.push('databaseadmin');
    }
    
    const aiPerm = c.env.AI_PERMISSION || 'ai:api';
    if (perms.includes(aiPerm)) {
      roles.push('aiadmin');
    }

    const mailPerm = c.env.MAIL_PERMISSION || 'mail:api';
    if (perms.includes(mailPerm)) {
      roles.push('mail');
    }

    if (roles.length === 0) {
      // This should not happen because we already checked requiredPerm above,
      // but keep a guard in case requiredPerm is changed in the future.
      throw ApiError.forbidden(`${requiredPerm} permission required`);
    }

    c.set('auth', {
      role: roles.length === 1 ? roles[0] : roles,
      stripeSecretKey,
      stripeWebhookSecret,
    });

    await next();
    return;
  }

  if (isOAuthToken) {
    const tokenHash = await hashKey(token);
    const oauthResult = await db.query<any>(
      `SELECT t.*, c.email as customer_email
       FROM oauth_tokens t
       JOIN customers c ON t.customer_id = c.id
       WHERE t.access_token_hash = ? AND t.access_expires_at > ?
       LIMIT 1`,
      [tokenHash, now()]
    );

    if (oauthResult.length > 0) {
      const row = oauthResult[0];
      c.set('auth', {
        role: 'oauth',
        stripeSecretKey,
        stripeWebhookSecret,
        oauthScopes: row.scope?.split(' ') || [],
        customerEmail: row.customer_email,
      });

      await next();
      return;
    }
  }

  const keyHash = await hashKey(token);
  const result = await db.query<any>(
    `SELECT role FROM api_keys WHERE key_hash = ? LIMIT 1`,
    [keyHash]
  );

  if (result.length === 0) {
    throw ApiError.unauthorized('Invalid API key');
  }

  c.set('auth', {
    role: result[0].role,
    stripeSecretKey,
    stripeWebhookSecret,
  });

  await next();
});

export const superAdminOnly = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = c.get('auth');

  if (Array.isArray(auth.role)) {
    if (!auth.role.includes('authadmin')) {
      console.warn('Superadmin access required, but user has roles:', auth.role);
      throw ApiError.forbidden('Superadmin access required');
    }
  } else if (auth.role !== 'authadmin') {
    console.warn('Superadmin access required, but user has role:', auth.role);
    throw ApiError.forbidden('Superadmin access required');
  }

  await next();
});

export const databaseAdminOnly = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = c.get('auth');

  if (Array.isArray(auth.role)) {
    if (!auth.role.includes('databaseadmin')) {
      console.warn('Database admin access required, but user has roles:', auth.role);
      throw ApiError.forbidden('Database admin access required');
    }
  } else if (auth.role !== 'databaseadmin') {
    console.warn('Database admin access required, but user has role:', auth.role);
    throw ApiError.forbidden('Database admin access required');
  }

  await next();
});

export const aiAccessOnly = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = c.get('auth');

  if (Array.isArray(auth.role)) {
    if (!auth.role.includes('aiadmin')) {
      console.warn('AI admin access required, but user has roles:', auth.role);
      throw ApiError.forbidden('AI admin access required');
    }
  } else if (auth.role !== 'aiadmin') {
    console.warn('AI admin access required, but user has role:', auth.role);
    throw ApiError.forbidden('AI admin access required');
  }

  await next();
});

export const adminOnly = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = c.get('auth');

  if (Array.isArray(auth.role)) {
    if (!auth.role.includes('admin')) {
      console.warn('Admin access required, but user has roles:', auth.role);
      throw ApiError.forbidden('Admin access required');
    }
  } else if (auth.role !== 'admin') {
    console.warn('Admin access required, but user has role:', auth.role);
    throw ApiError.forbidden('Admin access required');
  }

  await next();
});

export const mailAccessOnly = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = c.get('auth');

  if (Array.isArray(auth.role)) {
    if (!auth.role.includes('mail')) {
      console.warn('Mail API access required, but user has roles:', auth.role);
      throw ApiError.forbidden('Mail API access required');
    }
  } else if (auth.role !== 'mail') {
    console.warn('Mail API access required, but user has role:', auth.role);
    throw ApiError.forbidden('Mail API access required');
  }

  await next();
});

export function requireScope(...requiredScopes: string[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const auth = c.get('auth');

    if (auth.role === 'oauth') {
      const hasAllScopes = requiredScopes.every(
        (scope) => auth.oauthScopes?.includes(scope)
      );
      if (!hasAllScopes) {
        throw ApiError.forbidden(`Required scopes: ${requiredScopes.join(', ')}`);
      }
    }

    await next();
  });
}

export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateApiKey(prefix: 'pk' | 'sk'): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${key}`;
}
