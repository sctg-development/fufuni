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
import {
  IdParam,
  PaginationQuery,
  ErrorResponse,
  TaxRateResponse,
  CreateTaxRateBody,
  UpdateTaxRateBody,
  TaxRateListResponse,
  DeletedResponse,
} from '../schemas';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import { getDb } from '../db';
import { adminOnly, authMiddleware } from '../middleware/auth';

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

// ============================================================
// TAX RATES ROUTES
// ============================================================

const listTaxRates = createRoute({
  method: 'get',
  path: '/',
  tags: ['Tax Rates'],
  summary: 'List all tax rates',
  description: 'Get a paginated list of tax rates',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { query: PaginationQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: TaxRateListResponse } },
      description: 'List of tax rates',
    },
  },
});

app.openapi(listTaxRates, async (c) => {
  const { limit: limitStr, cursor } = c.req.valid('query');
  const db = getDb(c.var.db);
  const limit = Math.min(parseInt(limitStr || '100'), 500);

  let query = 'SELECT * FROM tax_rates WHERE 1=1';
  const params: unknown[] = [];

  if (cursor) {
    query += ' AND id > ?';
    params.push(cursor);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit + 1);

  const items = await db.query<any>(query, params);
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return c.json({
    items: items.map((item) => ({
      id: item.id,
      display_name: item.display_name,
      country_code: item.country_code,
      tax_code: item.tax_code,
      rate_percentage: item.rate_percentage,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
    pagination: {
      has_more: hasMore,
      next_cursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
    },
  }, 200);
});

const createTaxRate = createRoute({
  method: 'post',
  path: '/',
  tags: ['Tax Rates'],
  summary: 'Create a new tax rate',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { body: { content: { 'application/json': { schema: CreateTaxRateBody } } } },
  responses: {
    201: {
      content: { 'application/json': { schema: TaxRateResponse } },
      description: 'Created tax rate',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Invalid request',
    },
  },
});

app.openapi(createTaxRate, async (c) => {
  const { display_name, country_code, tax_code, rate_percentage } = c.req.valid('json');
  const db = getDb(c.var.db);

  const id = uuid();
  const timestamp = now();

  await db.run(
    `INSERT INTO tax_rates (id, display_name, country_code, tax_code, rate_percentage, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    [id, display_name, country_code?.toUpperCase() || null, tax_code || null, rate_percentage, timestamp, timestamp]
  );

  const [taxRate] = await db.query<any>('SELECT * FROM tax_rates WHERE id = ?', [id]);

  return c.json({
    id: taxRate.id,
    display_name: taxRate.display_name,
    country_code: taxRate.country_code,
    tax_code: taxRate.tax_code,
    rate_percentage: taxRate.rate_percentage,
    status: taxRate.status,
    created_at: taxRate.created_at,
    updated_at: taxRate.updated_at,
  }, 201);
});

const getTaxRate = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Tax Rates'],
  summary: 'Get a tax rate',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: {
      content: { 'application/json': { schema: TaxRateResponse } },
      description: 'Tax rate details',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Tax rate not found',
    },
  },
});

app.openapi(getTaxRate, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [taxRate] = await db.query<any>('SELECT * FROM tax_rates WHERE id = ?', [id]);
  if (!taxRate) throw ApiError.notFound('Tax rate not found');

  return c.json({
    id: taxRate.id,
    display_name: taxRate.display_name,
    country_code: taxRate.country_code,
    tax_code: taxRate.tax_code,
    rate_percentage: taxRate.rate_percentage,
    status: taxRate.status,
    created_at: taxRate.created_at,
    updated_at: taxRate.updated_at,
  }, 200);
});

const updateTaxRate = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Tax Rates'],
  summary: 'Update a tax rate',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: UpdateTaxRateBody } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: TaxRateResponse } },
      description: 'Updated tax rate',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Tax rate not found',
    },
  },
});

app.openapi(updateTaxRate, async (c) => {
  const { id } = c.req.valid('param');
  const { display_name, country_code, tax_code, rate_percentage, status } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>('SELECT * FROM tax_rates WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('Tax rate not found');

  const updates: Record<string, unknown> = { updated_at: now() };
  if (display_name !== undefined) updates.display_name = display_name;
  if (country_code !== undefined) updates.country_code = country_code?.toUpperCase() || null;
  if (tax_code !== undefined) updates.tax_code = tax_code || null;
  if (rate_percentage !== undefined) updates.rate_percentage = rate_percentage;
  if (status !== undefined) updates.status = status;

  const setClauses = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
  const values = Object.values(updates);

  await db.run(`UPDATE tax_rates SET ${setClauses} WHERE id = ?`, [...values, id]);

  const [updated] = await db.query<any>('SELECT * FROM tax_rates WHERE id = ?', [id]);

  return c.json({
    id: updated.id,
    display_name: updated.display_name,
    country_code: updated.country_code,
    tax_code: updated.tax_code,
    rate_percentage: updated.rate_percentage,
    status: updated.status,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
  }, 200);
});

const deleteTaxRate = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Tax Rates'],
  summary: 'Delete a tax rate',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: {
      content: { 'application/json': { schema: DeletedResponse } },
      description: 'Tax rate deleted',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Tax rate not found',
    },
  },
});

app.openapi(deleteTaxRate, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>('SELECT * FROM tax_rates WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('Tax rate not found');

  await db.run('DELETE FROM tax_rates WHERE id = ?', [id]);

  return c.json({ deleted: true } as const, 200);
});

export { app as taxRates };
