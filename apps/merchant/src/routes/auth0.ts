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

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { authMiddleware, adminOnly, superAdminOnly } from '../middleware/auth';
import { getManagementToken, addPermissionsToUser } from '../lib/auth0';
import { ApiError, type HonoEnv } from '../types';

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

const auth0TokenRoute = createRoute({
  method: 'post',
  path: '/token',
  tags: ['Auth0'],
  summary: 'Retrieve an Auth0 Management API token',
  description: 'Calls Auth0 using the client_credentials grant, caches the '
    + 'result and returns the raw access token (for use by admin UIs).',
  security: [{ bearerAuth: ["auth0:admin:api"] }],
  middleware: [superAdminOnly] as const,
  responses: {
    200: { description: 'Token acquired' },
    401: { description: 'Unauthorized' },
    500: { description: 'Internal error' },
  },
});

app.openapi(auth0TokenRoute, async (c) => {
  try {
    const token = await getManagementToken(c.env);

    // decode expiration if available
    let exp: number | undefined;
    try {
      const { decodeJwt } = await import('jose');
      const decoded = decodeJwt(token);
      exp = (decoded.exp as number | undefined) || undefined;
    } catch (_e) {
      // ignore
    }

    const now = Math.floor(Date.now() / 1000);

    return c.json(
      {
        access_token: token,
        token_type: 'Bearer',
        expires_in: exp ? exp - now : 3600,
        from_cache: true,
      },
      200,
    );
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

const autoPermsRoute = createRoute({
  method: 'post',
  path: '/autopermissions',
  tags: ['Auth0'],
  summary: 'Auto-assign configured permissions to caller',
  description: 'Reads `AUTH0_AUTOMATIC_PERMISSIONS` and adds any missing '
    + 'values to the current Auth0 user via the Management API.',
  security: [{ bearerAuth: ["admin:store"] }],
  middleware: [authMiddleware] as const,
  responses: {
    200: { description: 'Success' },
    401: { description: 'Unauthorized' },
    500: { description: 'Error' },
  },
});

app.openapi(autoPermsRoute, async (c) => {
  try {
    const perms = (c.env.AUTH0_AUTOMATIC_PERMISSIONS || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p);

    if (perms.length === 0) {
      return c.json({ success: true, message: 'No automatic permissions configured' }, 200);
    }

    const currentPerms = (c.get('auth') as any)?.oauthScopes || [];
    const missing = perms.filter((p) => !currentPerms.includes(p));
    if (missing.length === 0) {
      return c.json({ success: true, message: 'User already has all automatic permissions' }, 200);
    }

    const sub = (c.get('auth') as any)?.customerEmail || ''; // we don't actually store sub earlier
    // In our auth middleware payload not stored; simpler: grab JWT payload
    // from header by re-verifying.
    const authHeader = c.req.header('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      throw new Error('no token present');
    }

    // extract user id from JWT payload
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    const jwksUrl = `https://${c.env.AUTH0_DOMAIN}/.well-known/jwks.json`;
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));
    const result = await jwtVerify(token, JWKS, {
      issuer: `https://${c.env.AUTH0_DOMAIN}/`,
      audience: c.env.AUTH0_AUDIENCE,
    });
    const userId = result.payload.sub as string;

    if (!userId) {
      throw new Error('User ID not found in token');
    }

    await addPermissionsToUser(userId, missing, c.env);

    return c.json({ success: true, added: missing }, 200);
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});


// debug info route providing request details (moved out of worker index)
const debugUserRoute = createRoute({
  method: 'get',
  path: '/get/:user',
  tags: ['Auth0'],
  summary: 'Debug request info (admin:store)',
  description: 'Returns detailed session and request info. Required permission: admin:store',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [authMiddleware] as const,
  parameters: [
    {
      in: 'path',
      name: 'user',
      required: true,
      schema: {
        type: 'string',
      },
      description: 'Dynamic user parameter.',
    },
  ] as const,
  responses: {
    200: { description: 'Success' },
    401: { description: 'Unauthorized' },
  },
});

app.openapi(debugUserRoute, async (c) => {
  try {
    const user = c.req.param('user') || '';
    const sub = (c.get('auth') as any)?.sub || '';
    const permissions = (c.get('auth') as any)?.oauthScopes || [];
    const token = (c.req.header('Authorization') || '').replace('Bearer ', '');

    return c.json({ success: true, user, sub, permissions, token }, 200);
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

export { app as auth0Routes };
