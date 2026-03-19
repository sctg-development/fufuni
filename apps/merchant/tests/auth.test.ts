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

import { config as loadEnv } from 'dotenv';
// load environment variables from workspace root, not the subdirectory
// Load root environment variables for AUTH0_TEST_TOKEN
loadEnv({ path: '../../.env' });
import { describe, it, expect, beforeAll } from 'vitest';

// Vitest runs in Node where DurableObject is not defined; stub a
// no-op base class so the worker code can `extends DurableObject`.
;(globalThis as any).DurableObject = class {};

let app: typeof import('../src/index').default;
import type { Env, DOStub } from '../src/types';

beforeAll(async () => {
  const mod = await import('../src/index');
  app = mod.default;
});

// simple stub that satisfies the DOStub interface; always returns empty lists
const fakeDb: DOStub = {
  query: async () => [],
  run: async () => ({ changes: 0 }),
  broadcast: async () => {},
};

// helper to build a minimal environment object for the worker
function makeEnv(): Env & { MERCHANT: any } {
  return {
    MERCHANT: {
      idFromName: () => ({ toString: () => 'stub' }),
      get: () => fakeDb,
    },
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
    AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE,
    ADMIN_STORE_PERMISSION: process.env.ADMIN_STORE_PERMISSION,
  } as any;
}

// convenience function to hit the app with the test token
async function fetchWithToken(path: string, init?: RequestInit) {
  const token = process.env.AUTH0_TEST_TOKEN || '';
  const headers = new Headers(init?.headers as HeadersInit);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const req = new Request(path, { ...init, headers });
  const res = await app.fetch(req, makeEnv(), {} as any);
  return res;
}

describe('Auth0 test token provides admin access', () => {
  it('denies unauthorized requests without token', async () => {
    const req = new Request('http://localhost/v1/products', { method: 'GET' });
    const res = await app.fetch(req, makeEnv(), {} as any);
    expect(res.status).toBe(401);
  });

  it('allows GET /v1/products with test token', async () => {
    const res = await fetchWithToken('http://localhost/v1/products', { method: 'GET' });
    expect(res.status).not.toBe(401);
  });

  it('allows POST /v1/products with test token (validation error or 200)', async () => {
    const res = await fetchWithToken('http://localhost/v1/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(res.status).not.toBe(401);
  });

  it('allows access to another admin path (GET /v1/inventory)', async () => {
    const res = await fetchWithToken('http://localhost/v1/inventory', { method: 'GET' });
    expect(res.status).not.toBe(401);
  });

  // auth0-specific helpers
  it('exposes /api/__auth0/token to admins', async () => {
    const res = await fetchWithToken('http://localhost/api/__auth0/token', { method: 'POST' });
    expect(res.status).not.toBe(401);
  });

  it('exposes /api/__auth0/autopermissions to authenticated users', async () => {
    const res = await fetchWithToken('http://localhost/api/__auth0/autopermissions', { method: 'POST' });
    expect(res.status).not.toBe(401);
  });
});
