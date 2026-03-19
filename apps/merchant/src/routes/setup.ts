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
import { getDb } from '../db';
import { authMiddleware, adminOnly, databaseAdminOnly } from '../middleware/auth';
import { ApiError, now, type HonoEnv } from '../types';
import { SetupStripeBody, OkResponse, ErrorResponse, ConfigListResponse } from '../schemas';

const app = new OpenAPIHono<HonoEnv>();

const InitKeysBody = z.object({
  keys: z.array(z.object({
    id: z.string().uuid(),
    key_hash: z.string(),
    key_prefix: z.string(),
    role: z.enum(['public', 'admin']),
  })),
}).openapi('InitKeysBody');

const MigrationListItem = z.object({
  name: z.string(),
  applied_at: z.string().openapi({ example: '2026-03-18 16:06:44' }),
}).openapi('MigrationListItem');

const MigrationListResponse = z.object({
  items: z.array(MigrationListItem),
}).openapi('MigrationListResponse');

const initKeys = createRoute({
  method: 'post',
  path: '/init',
  tags: ['Setup'],
  summary: 'Initialize API keys',
  description: 'Create initial API keys (only works if no keys exist)',
  request: {
    body: { content: { 'application/json': { schema: InitKeysBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: OkResponse } }, description: 'Keys created' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Keys already exist' },
  },
});

app.openapi(initKeys, async (c) => {
  const { keys } = c.req.valid('json');
  const db = getDb(c.var.db);

  const existing = await db.query<{ id: string }>(`SELECT id FROM api_keys LIMIT 1`);
  if (existing.length > 0) {
    throw ApiError.conflict('API keys already exist. Use admin key to manage keys.');
  }

  for (const key of keys) {
    await db.run(
      `INSERT INTO api_keys (id, key_hash, key_prefix, role, created_at) VALUES (?, ?, ?, ?, ?)`,
      [key.id, key.key_hash, key.key_prefix, key.role, now()]
    );
  }

  return c.json({ ok: true as const }, 200);
});

const setupStripe = createRoute({
  method: 'post',
  path: '/stripe',
  tags: ['Setup'],
  summary: 'Connect Stripe',
  description: 'Configure Stripe API keys for payment processing',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [authMiddleware, adminOnly] as const,
  request: {
    body: { content: { 'application/json': { schema: SetupStripeBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: OkResponse } }, description: 'Stripe connected' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid Stripe key' },
  },
});

app.openapi(setupStripe, async (c) => {
  const { stripe_secret_key, stripe_webhook_secret } = c.req.valid('json');

  const res = await fetch('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Bearer ${stripe_secret_key}` },
  });

  if (!res.ok) {
    throw ApiError.invalidRequest('Invalid Stripe secret key');
  }

  const db = getDb(c.var.db);

  const configValue = JSON.stringify({
    secret_key: stripe_secret_key,
    webhook_secret: stripe_webhook_secret || null,
  });

  await db.run(
    `INSERT INTO config (key, value, updated_at) VALUES ('stripe', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
    [configValue, now(), configValue, now()]
  );

  return c.json({ ok: true as const }, 200);
});

const getConfig = createRoute({
  method: 'get',
  path: '/config',
  tags: ['Setup'],
  summary: 'Get config values',
  description: 'Return all key/value pairs stored in the config table.',
  security: [{ bearerAuth: ["admin:database"] }],
  middleware: [authMiddleware, databaseAdminOnly] as const,
  responses: {
    200: { content: { 'application/json': { schema: ConfigListResponse } }, description: 'Config values' },
  },
});

app.openapi(getConfig, async (c) => {
  const db = getDb(c.var.db);
  const items = await db.query<{ key: string; value: string | null }>(
    `SELECT key, value FROM config`
  );

  return c.json({ items }, 200);
});

const resetDatabase = createRoute({
  method: 'post',
  path: '/reset',
  tags: ['Setup'],
  summary: 'Wipe and reset the database',
  description: 'Clears all data so init/seed can be rerun. Requires database admin role (JWT only).',
  security: [{ bearerAuth: ["admin:database"] }],
  middleware: [authMiddleware, databaseAdminOnly] as const,
  responses: {
    200: { content: { 'application/json': { schema: OkResponse } }, description: 'Database reset' },
  },
});

app.openapi(resetDatabase, async (c) => {
  const db = getDb(c.var.db);

  // Disable foreign key checks to allow deletion in any order
  await db.run('PRAGMA foreign_keys = OFF');

  const tables = [
    'order_items',
    'orders',
    'cart_items',
    'carts',
    'inventory_logs',
    'inventory',
    'variant_prices',
    'variants',
    'products',
    'warehouse_inventory_logs',
    'warehouse_inventory',
    'region_shipping_rates',
    'region_warehouses',
    'region_countries',
    'regions',
    'shipping_rate_prices',
    'shipping_rates',
    'warehouses',
    'countries',
    'currencies',
    'discount_usage',
    'discounts',
    'refunds',
    'customer_addresses',
    'customers',
    'events',
    'webhook_deliveries',
    'webhooks',
    'oauth_tokens',
    'oauth_authorizations',
    'oauth_clients',
    'config',
    'api_keys',
  ];

  for (const table of tables) {
    await db.run(`DELETE FROM ${table}`);
  }

  await db.run('PRAGMA foreign_keys = ON');

  return c.json({ ok: true as const }, 200);
});

const listMigrations = createRoute({
  method: 'get',
  path: '/migrations/list',
  tags: ['Setup'],
  summary: 'List applied migrations',
  description: 'Returns rows from the migrations table.',
  security: [{ bearerAuth: ["admin:database"] }],
  middleware: [authMiddleware, databaseAdminOnly] as const,
  responses: {
    200: { content: { 'application/json': { schema: MigrationListResponse } }, description: 'Applied migrations' },
  },
});

app.openapi(listMigrations, async (c) => {
  const db = getDb(c.var.db);
  const items = await db.query<{ name: string; applied_at: string }>(
    `SELECT name, applied_at FROM migrations ORDER BY applied_at ASC`
  );
  return c.json({ items }, 200);
});

const cleanMigrations = createRoute({
  method: 'post',
  path: '/migrations/clean',
  tags: ['Setup'],
  summary: 'Clean migrations table',
  description: 'Deletes all rows from the migrations table.',
  security: [{ bearerAuth: ["admin:database"] }],
  middleware: [authMiddleware, databaseAdminOnly] as const,
  responses: {
    200: { content: { 'application/json': { schema: OkResponse } }, description: 'Migrations cleared' },
  },
});

app.openapi(cleanMigrations, async (c) => {
  const db = getDb(c.var.db);
  await db.run('DELETE FROM migrations');
  return c.json({ ok: true as const }, 200);
});

const runMigrations = createRoute({
  method: 'post',
  path: '/migrations/run',
  tags: ['Setup'],
  summary: 'Run pending migrations',
  description: 'Ensures schema migrations are applied by triggering the migration helper.',
  security: [{ bearerAuth: ["admin:database"] }],
  middleware: [authMiddleware, databaseAdminOnly] as const,
  responses: {
    200: { content: { 'application/json': { schema: OkResponse } }, description: 'Migrations executed' },
  },
});

app.openapi(runMigrations, async (c) => {
  const db = getDb(c.var.db);
  // Trigger database initialization/migrations by running a no-op query.
  await db.query('SELECT 1');
  return c.json({ ok: true as const }, 200);
});

export { app as setup };
