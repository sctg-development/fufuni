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
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import {
  IdParam,
  ProductResponse,
  ProductListResponse,
  CreateProductBody,
  UpdateProductBody,
  ProductQuery,
  SearchQuery,
  VariantResponse,
  CreateVariantBody,
  UpdateVariantBody,
  VariantPriceCurrencyParam,
  ErrorResponse,
  DeletedResponse,
} from '../schemas';

const VariantIdParam = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
  variantId: z.string().uuid().openapi({ param: { name: 'variantId', in: 'path' } }),
});

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

const listProducts = createRoute({
  method: 'get',
  path: '/',
  tags: ['Products'],
  summary: 'List products',
  security: [{ bearerAuth: [] }],
  request: { query: ProductQuery },
  responses: {
    200: { content: { 'application/json': { schema: ProductListResponse } }, description: 'List of products' },
  },
});

const searchProducts = createRoute({
  method: 'get',
  path: '/search',
  tags: ['Products'],
  summary: 'Search products by term (fuzzy)',
  security: [{ bearerAuth: [] }],
  request: { query: SearchQuery },
  responses: {
    200: { content: { 'application/json': { schema: ProductListResponse } }, description: 'Search results' },
  },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parses a dims_cm JSON string from SQLite into a typed object.
 * Returns null if the value is missing or invalid.
 */
function parseDimscm(raw: unknown): { l: number; w: number; h: number } | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.l === 'number' && typeof parsed.w === 'number' && typeof parsed.h === 'number') {
      return { l: parsed.l, w: parsed.w, h: parsed.h }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Parses a tags JSON string from SQLite into a string array.
 * Returns null if the value is missing or invalid.
 */
function parseTags(raw: unknown): string[] | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    // Support both array format (legacy) and object format (multilingual)
    if (Array.isArray(parsed)) return parsed
    if (typeof parsed === 'object') {
      // Extract tags from first non-empty locale
      for (const locale in parsed) {
        const val = parsed[locale]
        if (typeof val === 'string' && val.trim()) {
          return val.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
        }
      }
      return null
    }
    return null
  } catch {
    return null
  }
}

/**
 * Parses a localized value (JSON object with locale keys) from frontend.
 * Handles both JSON object and plain strings.
 * Returns the JSON string to store in database.
 */
function parseLocalizedInput(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  
  // Try to parse as JSON
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        // Validate it's a proper LocalizedDesc (all values are strings)
        for (const key in parsed) {
          if (typeof parsed[key] !== 'string') {
            return null
          }
        }
        return JSON.stringify(parsed)
      }
    } catch {
      return null
    }
  }
  
  // Plain string — wrap in JSON for default locale
  return JSON.stringify({ 'en-US': trimmed })
}

/**
 * Processes and validates handle from localized input.
 * Ensures all handle values match regex /^[a-z0-9-]+$/ and auto-generates if empty.
 * Returns the handle JSON string to store.
 */
function processHandleInput(handleInput: unknown, title: string): string | null {
  const handleStr = parseLocalizedInput(handleInput)

  // When generating a handle from title, make sure we use a real title string
  // (e.g. the 'en-US' value) rather than the raw JSON payload.
  const normalizeTitle = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          // Prefer en-US, otherwise first available locale
          return (
            (parsed as Record<string, string>)['en-US'] ||
            Object.values(parsed as Record<string, string>)[0] ||
            ''
          ).toString();
        }
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  if (!handleStr) {
    // No handle provided — auto-generate from title for all locales
    return JSON.stringify({ 'en-US': generateHandle(normalizeTitle(title)) })
  }
  
  let handleObj: Record<string, string>
  try {
    handleObj = JSON.parse(handleStr)
  } catch {
    return null
  }
  
  // Auto-generate for empty locales and validate all values
  const result: Record<string, string> = {}
  let hasValidHandle = false
  
  for (const locale in handleObj) {
    let val = handleObj[locale] || ''
    
    if (!val || !val.trim()) {
      // Empty — auto-generate from title
      val = generateHandle(title)
    }
    
    // Validate regex
    if (!/^[a-z0-9-]+$/.test(val)) {
      throw ApiError.invalidRequest(`Handle "${val}" must be lowercase letters, numbers and hyphens`)
    }
    
    result[locale] = val
    hasValidHandle = true
  }
  
  if (!hasValidHandle) {
    // No valid handles in any locale — auto-generate
    return JSON.stringify({ 'en-US': generateHandle(title) })
  }
  
  return JSON.stringify(result)
}

/**
 * Generates a URL-friendly slug from a product title.
 * Example: "Classic Cotton T-Shirt!" → "classic-cotton-t-shirt"
 */
function generateHandle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')                  // decompose accented chars
    .replace(/[\u0300-\u036f]/g, '')   // remove accent marks
    .replace(/[^a-z0-9\s-]/g, '')      // remove special chars
    .trim()
    .replace(/\s+/g, '-')             // spaces → hyphens
    .replace(/-+/g, '-')              // collapse multiple hyphens
}

/**
 * Maps a raw variant row from SQLite to the API response shape.
 * Call this everywhere you return a variant to avoid repeating the mapping.
 */
function mapVariant(v: Record<string, unknown>) {
  return {
    id: v.id as string,
    sku: v.sku as string,
    title: v.title as string,
    price_cents: v.price_cents as number,
    currency: ((v.currency as string) ?? 'USD') as string,
    image_url: (v.image_url ?? null) as string | null,
    shipping_class_id: (v.shipping_class_id ?? null) as string | null | undefined,
    weight_g: ((v.weight_g as number) ?? 0) as number,
    dims_cm: parseDimscm(v.dims_cm),
    requires_shipping: (v.requires_shipping !== 0) as boolean,   // SQLite stores 0/1
    barcode: (v.barcode ?? null) as string | null,
    compare_at_price_cents: (v.compare_at_price_cents ?? null) as number | null,
    tax_code: (v.tax_code ?? null) as string | null,
  }
}

/**
 * Maps a raw product row (with its variants) to the API response shape.
 */
function mapProduct(p: Record<string, unknown>, variants: Record<string, unknown>[]) {
  return {
    id: p.id as string,
    title: p.title as string,
    description: (p.description ?? null) as string | null,
    shipping_class_id: (p.shipping_class_id ?? null) as string | null | undefined,
    status: p.status as 'active' | 'draft',
    created_at: p.created_at as string,
    vendor: (p.vendor ?? null) as string | null,
    tags: (p.tags ?? null) as string | null,
    handle: (p.handle ?? null) as string | null,
    variants: variants.map(mapVariant),
  }
}

app.openapi(listProducts, async (c) => {
  const db = getDb(c.var.db);
  const { limit: limitStr, cursor, status } = c.req.valid('query');
  const limit = Math.min(parseInt(limitStr || '20'), 100);

  let query = `SELECT * FROM products`;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (status) {
    conditions.push(`status = ?`);
    params.push(status);
  }
  if (cursor) {
    conditions.push(`created_at < ?`);
    params.push(cursor);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit + 1);

  const products = await db.query<any>(query, params);
  const hasMore = products.length > limit;
  if (hasMore) products.pop();

  const productIds = products.map((p) => p.id);
  const variantsByProduct: Record<string, any[]> = {};

  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(',');
    const allVariants = await db.query<any>(
      `SELECT * FROM variants WHERE product_id IN (${placeholders}) ORDER BY created_at ASC`,
      productIds
    );

    for (const v of allVariants) {
      if (!variantsByProduct[v.product_id]) {
        variantsByProduct[v.product_id] = [];
      }
      variantsByProduct[v.product_id].push(v);
    }
  }

  const items = products.map((p) => mapProduct(p, variantsByProduct[p.id] || []));

  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

  return c.json({ items, pagination: { has_more: hasMore, next_cursor: nextCursor } }, 200);
});

app.openapi(searchProducts, async (c) => {
  const db = getDb(c.var.db);
  const { q, limit: limitStr, cursor } = c.req.valid('query');
  const limit = Math.min(parseInt(limitStr || '20'), 100);

  const term = `%${q}%`;

  // join with variants to allow SKU matching
  let query = `SELECT DISTINCT p.* FROM products p
    LEFT JOIN variants v ON v.product_id = p.id
    WHERE (p.title LIKE ? OR v.sku LIKE ?)`;
  const params: unknown[] = [term, term];

  if (cursor) {
    query += ` AND p.created_at < ?`;
    params.push(cursor);
  }

  query += ` ORDER BY p.created_at DESC LIMIT ?`;
  params.push(limit + 1);

  const products = await db.query<any>(query, params);
  const hasMore = products.length > limit;
  if (hasMore) products.pop();

  const productIds = products.map((p) => p.id);
  const variantsByProduct: Record<string, any[]> = {};

  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(',');
    const allVariants = await db.query<any>(
      `SELECT * FROM variants WHERE product_id IN (${placeholders}) ORDER BY created_at ASC`,
      productIds
    );

    for (const v of allVariants) {
      if (!variantsByProduct[v.product_id]) {
        variantsByProduct[v.product_id] = [];
      }
      variantsByProduct[v.product_id].push(v);
    }
  }

  const items = products.map((p) => mapProduct(p, variantsByProduct[p.id] || []));

  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

  return c.json({ items, pagination: { has_more: hasMore, next_cursor: nextCursor } }, 200);
});

const getProduct = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Products'],
  summary: 'Get product by ID',
  security: [{ bearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: ProductResponse } }, description: 'Product details' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
  },
});

app.openapi(getProduct, async (c) => {
  const db = getDb(c.var.db);
  const { id } = c.req.valid('param');

  const [product] = await db.query<any>(`SELECT * FROM products WHERE id = ?`, [id]);
  if (!product) throw ApiError.notFound('Product not found');

  const variants = await db.query<any>(
    `SELECT * FROM variants WHERE product_id = ? ORDER BY created_at ASC`,
    [id]
  );

  return c.json(mapProduct(product, variants), 200);
});

const createProduct = createRoute({
  method: 'post',
  path: '/',
  tags: ['Products'],
  summary: 'Create product',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { body: { content: { 'application/json': { schema: CreateProductBody } } } },
  responses: {
    201: { content: { 'application/json': { schema: ProductResponse } }, description: 'Product created' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
  },
});

app.openapi(createProduct, async (c) => {
  const { title, description, vendor, tags, handle } = c.req.valid('json');
  const db = getDb(c.var.db);

  const id = uuid();
  const timestamp = now();

  // Process enrichment fields (convert to localized JSON if needed)
  const processedVendor = vendor ? parseLocalizedInput(vendor) : null
  const processedTags = tags ? parseLocalizedInput(tags) : null
  const processedHandle = processHandleInput(handle, title)

  // Check handle uniqueness (compare first non-empty value from JSON)
  let handleToCheck = ''
  if (processedHandle) {
    try {
      const handleObj = JSON.parse(processedHandle)
      for (const locale in handleObj) {
        const val = handleObj[locale]
        if (val && val.trim()) {
          handleToCheck = val
          break
        }
      }
    } catch {
      handleToCheck = processedHandle
    }
  }
  
  if (handleToCheck) {
    const quotedHandle = `\"${handleToCheck}\"`;
    const existingHandle = await db.query<any>(
      `SELECT id FROM products WHERE instr(handle, ?) > 0`,
      [quotedHandle]
    );
    if (existingHandle.length > 0) throw ApiError.conflict(`Handle "${handleToCheck}" already exists`);
  }

  await db.run(
    `INSERT INTO products (id, title, description, vendor, tags, handle, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    [id, title, description || null, processedVendor, processedTags, processedHandle, timestamp]
  );

  return c.json(
    mapProduct({ 
      id, 
      title, 
      description: description || null, 
      vendor: processedVendor, 
      tags: processedTags, 
      handle: processedHandle, 
      status: 'active', 
      created_at: timestamp 
    }, []),
    201
  );
});

const updateProduct = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Products'],
  summary: 'Update product',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: UpdateProductBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: ProductResponse } }, description: 'Product updated' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
  },
});

app.openapi(updateProduct, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>(`SELECT * FROM products WHERE id = ?`, [id]);
  if (!existing) throw ApiError.notFound('Product not found');

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.title !== undefined) {
    updates.push('title = ?');
    params.push(body.title);
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    params.push(body.description);
  }
  if (body.vendor !== undefined) {
    const processedVendor = body.vendor ? parseLocalizedInput(body.vendor) : null
    updates.push('vendor = ?');
    params.push(processedVendor);
  }
  if (body.tags !== undefined) {
    const processedTags = body.tags ? parseLocalizedInput(body.tags) : null
    updates.push('tags = ?');
    params.push(processedTags);
  }
  if (body.handle !== undefined) {
    const processedHandle = processHandleInput(body.handle, existing.title)
    
    // Check handle uniqueness (against other products)
    let handleToCheck = ''
    if (processedHandle) {
      try {
        const handleObj = JSON.parse(processedHandle)
        for (const locale in handleObj) {
          const val = handleObj[locale]
          if (val && val.trim()) {
            handleToCheck = val
            break
          }
        }
      } catch {
        handleToCheck = processedHandle
      }
    }
    
    if (handleToCheck) {
      // Use instr() to avoid SQLite "LIKE or GLOB pattern too complex" errors when
      // the handle value contains characters like '%' or '_' or is very long.
      // We still search for the quoted value so that we match the JSON-encoded handle.
      const quotedHandle = `\"${handleToCheck}\"`;
      const existingHandle = await db.query<any>(
        `SELECT id FROM products WHERE instr(handle, ?) > 0 AND id != ?`,
        [quotedHandle, id]
      );
      if (existingHandle.length > 0) throw ApiError.conflict(`Handle "${handleToCheck}" already exists`);
    }
    
    updates.push('handle = ?');
    params.push(processedHandle);
  }
  if (body.status !== undefined) {
    updates.push('status = ?');
    params.push(body.status);
  }

  if (updates.length > 0) {
    params.push(id);
    await db.run(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const [product] = await db.query<any>(`SELECT * FROM products WHERE id = ?`, [id]);
  const variants = await db.query<any>(`SELECT * FROM variants WHERE product_id = ?`, [id]);

  return c.json(mapProduct(product, variants), 200);
});

const deleteProduct = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Products'],
  summary: 'Delete product',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: DeletedResponse } }, description: 'Product deleted' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cannot delete' },
  },
});

app.openapi(deleteProduct, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [product] = await db.query<any>(`SELECT * FROM products WHERE id = ?`, [id]);
  if (!product) throw ApiError.notFound('Product not found');

  const variants = await db.query<any>(`SELECT sku FROM variants WHERE product_id = ?`, [id]);

  if (variants.length > 0) {
    const skus = variants.map((v) => v.sku);
    const placeholders = skus.map(() => '?').join(',');
    const [orderItem] = await db.query<any>(
      `SELECT id FROM order_items WHERE sku IN (${placeholders}) LIMIT 1`,
      skus
    );

    if (orderItem) {
      throw ApiError.conflict('Cannot delete product with variants that have been ordered. Set status to draft instead.');
    }
  }

  for (const v of variants) {
    await db.run(`DELETE FROM inventory WHERE sku = ?`, [v.sku]);
  }

  await db.run(`DELETE FROM variants WHERE product_id = ?`, [id]);
  await db.run(`DELETE FROM products WHERE id = ?`, [id]);

  return c.json({ deleted: true as const }, 200);
});

const createVariant = createRoute({
  method: 'post',
  path: '/{id}/variants',
  tags: ['Products'],
  summary: 'Add variant to product',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: CreateVariantBody } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: VariantResponse } }, description: 'Variant created' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Product not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'SKU already exists' },
  },
});

app.openapi(createVariant, async (c) => {
  const { id: productId } = c.req.valid('param');
  const {
    sku, title, price_cents, currency, image_url,
    weight_g, dims_cm, requires_shipping,
    barcode, compare_at_price_cents, tax_code
  } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [product] = await db.query<any>(`SELECT * FROM products WHERE id = ?`, [productId]);
  if (!product) throw ApiError.notFound('Product not found');

  const [existingSku] = await db.query<any>(`SELECT * FROM variants WHERE sku = ?`, [sku]);
  if (existingSku) throw ApiError.conflict(`SKU ${sku} already exists`);

  const id = uuid();
  const timestamp = now();

  await db.run(
    `INSERT INTO variants (
      id, product_id, sku, title, price_cents, currency,
      weight_g, dims_cm, requires_shipping,
      barcode, compare_at_price_cents, tax_code,
      image_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, productId, sku, title, price_cents, currency ?? 'USD',
      weight_g ?? 0, dims_cm ? JSON.stringify(dims_cm) : null, requires_shipping === false ? 0 : 1,
      barcode ?? null, compare_at_price_cents ?? null, tax_code ?? null,
      image_url || null, timestamp
    ]
  );

  await db.run(
    `INSERT INTO inventory (id, sku, on_hand, reserved, updated_at) VALUES (?, ?, 0, 0, ?)`,
    [uuid(), sku, timestamp]
  );

  const [variant] = await db.query<any>(`SELECT * FROM variants WHERE id = ?`, [id]);
  return c.json(mapVariant(variant), 201);
});

const updateVariant = createRoute({
  method: 'patch',
  path: '/{id}/variants/{variantId}',
  tags: ['Products'],
  summary: 'Update variant',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: VariantIdParam,
    body: { content: { 'application/json': { schema: UpdateVariantBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: VariantResponse } }, description: 'Variant updated' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'SKU already exists' },
  },
});

app.openapi(updateVariant, async (c) => {
  const { id: productId, variantId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>(
    `SELECT * FROM variants WHERE id = ? AND product_id = ?`,
    [variantId, productId]
  );
  if (!existing) throw ApiError.notFound('Variant not found');

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.sku !== undefined) {
    const [existingSku] = await db.query<any>(
      `SELECT * FROM variants WHERE sku = ? AND id != ?`,
      [body.sku, variantId]
    );
    if (existingSku) throw ApiError.conflict(`SKU ${body.sku} already exists`);

    await db.run(`UPDATE inventory SET sku = ? WHERE sku = ?`, [body.sku, existing.sku]);
    updates.push('sku = ?');
    params.push(body.sku);
  }
  if (body.title !== undefined) {
    updates.push('title = ?');
    params.push(body.title);
  }
  if (body.price_cents !== undefined) {
    updates.push('price_cents = ?');
    params.push(body.price_cents);
  }
  if (body.currency !== undefined) {
    updates.push('currency = ?');
    params.push(body.currency);
  }
  if (body.weight_g !== undefined) {
    updates.push('weight_g = ?');
    params.push(body.weight_g);
  }
  if (body.dims_cm !== undefined) {
    updates.push('dims_cm = ?');
    params.push(body.dims_cm ? JSON.stringify(body.dims_cm) : null);
  }
  if (body.requires_shipping !== undefined) {
    updates.push('requires_shipping = ?');
    params.push(body.requires_shipping ? 1 : 0);
  }
  if (body.barcode !== undefined) {
    updates.push('barcode = ?');
    params.push(body.barcode ?? null);
  }
  if (body.compare_at_price_cents !== undefined) {
    updates.push('compare_at_price_cents = ?');
    params.push(body.compare_at_price_cents ?? null);
  }
  if (body.tax_code !== undefined) {
    updates.push('tax_code = ?');
    params.push(body.tax_code ?? null);
  }
  if (body.image_url !== undefined) {
    updates.push('image_url = ?');
    params.push(body.image_url);
  }

  if (updates.length > 0) {
    params.push(variantId);
    await db.run(`UPDATE variants SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const [variant] = await db.query<any>(`SELECT * FROM variants WHERE id = ?`, [variantId]);

  return c.json(mapVariant(variant), 200);
});

const deleteVariant = createRoute({
  method: 'delete',
  path: '/{id}/variants/{variantId}',
  tags: ['Products'],
  summary: 'Delete variant',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: VariantIdParam },
  responses: {
    200: { content: { 'application/json': { schema: DeletedResponse } }, description: 'Variant deleted' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Cannot delete' },
  },
});

app.openapi(deleteVariant, async (c) => {
  const { id: productId, variantId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [variant] = await db.query<any>(
    `SELECT * FROM variants WHERE id = ? AND product_id = ?`,
    [variantId, productId]
  );
  if (!variant) throw ApiError.notFound('Variant not found');

  const [orderItem] = await db.query<any>(`SELECT id FROM order_items WHERE sku = ? LIMIT 1`, [variant.sku]);
  if (orderItem) {
    throw ApiError.conflict('Cannot delete variant that has been ordered. Set product status to draft instead.');
  }

  await db.run(`DELETE FROM inventory WHERE sku = ?`, [variant.sku]);
  await db.run(`DELETE FROM variants WHERE id = ?`, [variantId]);

  return c.json({ deleted: true as const }, 200);
});

// ============================================================
// VARIANT PRICING (MULTI-CURRENCY)
// ============================================================

const listVariantPrices = createRoute({
  method: 'get',
  path: '/{id}/variants/{variantId}/prices',
  tags: ['Products'],
  summary: 'List prices for a variant by currency',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: VariantIdParam },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ items: z.array(z.object({ id: z.string().uuid(), currency_id: z.string().uuid(), currency_code: z.string(), currency_name: z.string(), symbol: z.string(), price_cents: z.number().int() })) }) } }, description: 'List of variant prices' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Variant not found' },
  },
});

app.openapi(listVariantPrices, async (c) => {
  const { id: productId, variantId } = c.req.valid('param');
  const db = getDb(c.var.db);

  // Verify variant exists and belongs to product
  const [variant] = await db.query<any>(
    `SELECT id FROM variants WHERE id = ? AND product_id = ?`,
    [variantId, productId]
  );
  if (!variant) throw ApiError.notFound('Variant not found');

  // List prices with currency details
  const prices = await db.query<any>(
    `SELECT vp.id, vp.variant_id, vp.currency_id, c.code as currency_code, c.display_name as currency_name, c.symbol,
            vp.price_cents
     FROM variant_prices vp
     JOIN currencies c ON vp.currency_id = c.id
     WHERE vp.variant_id = ?
     ORDER BY c.code ASC`,
    [variantId]
  );

  return c.json({ items: prices || [] }, 200);
});

const upsertVariantPrice = createRoute({
  method: 'post',
  path: '/{id}/variants/{variantId}/prices',
  tags: ['Products'],
  summary: 'Set price for a variant in a specific currency',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: VariantIdParam, body: { content: { 'application/json': { schema: z.object({ currency_id: z.string().uuid(), price_cents: z.number().int().min(0) }) } } } },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ id: z.string().uuid(), price_cents: z.number().int() }) } }, description: 'Price upserted' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Variant not found' },
  },
});

app.openapi(upsertVariantPrice, async (c) => {
  const { id: productId, variantId } = c.req.valid('param');
  const { currency_id: currencyId, price_cents: priceCents } = c.req.valid('json');
  const db = getDb(c.var.db);

  // Verify variant exists and belongs to product
  const [variant] = await db.query<any>(
    `SELECT id FROM variants WHERE id = ? AND product_id = ?`,
    [variantId, productId]
  );
  if (!variant) throw ApiError.notFound('Variant not found');

  // Verify currency exists
  const [currency] = await db.query<any>(
    `SELECT id FROM currencies WHERE id = ? AND status = 'active'`,
    [currencyId]
  );
  if (!currency) throw ApiError.notFound('Currency not found or inactive');

  // Check if price already exists
  const [existing] = await db.query<any>(
    `SELECT id FROM variant_prices WHERE variant_id = ? AND currency_id = ?`,
    [variantId, currencyId]
  );

  if (existing) {
    // Update
    await db.run(
      `UPDATE variant_prices SET price_cents = ?, updated_at = ? WHERE id = ?`,
      [priceCents, now(), existing.id]
    );
    return c.json({ id: existing.id, price_cents: priceCents }, 200);
  } else {
    // Insert
    const priceId = uuid();
    await db.run(
      `INSERT INTO variant_prices (id, variant_id, currency_id, price_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [priceId, variantId, currencyId, priceCents, now(), now()]
    );
    return c.json({ id: priceId, price_cents: priceCents }, 200);
  }
});

const deleteVariantPrice = createRoute({
  method: 'delete',
  path: '/{id}/variants/{variantId}/prices/{currencyId}',
  tags: ['Products'],
  summary: 'Remove price for a specific currency',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: VariantPriceCurrencyParam },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ deleted: z.boolean() }) } }, description: 'Price deleted' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Variant not found' },
  },
});

app.openapi(deleteVariantPrice, async (c) => {
  const { id: productId, variantId, currencyId } = c.req.valid('param');
  const db = getDb(c.var.db);

  // Verify variant exists and belongs to product
  const [variant] = await db.query<any>(
    `SELECT id FROM variants WHERE id = ? AND product_id = ?`,
    [variantId, productId]
  );
  if (!variant) throw ApiError.notFound('Variant not found');

  // Delete the price
  await db.run(
    `DELETE FROM variant_prices WHERE variant_id = ? AND currency_id = ?`,
    [variantId, currencyId]
  );

  return c.json({ deleted: true }, 200);
});

// ============================================================
// PRICING AUDIT - Find variants missing prices for a currency
// ============================================================

const PricingAuditQuery = z.object({
  currencyId: z.string().uuid().openapi({
    param: { name: 'currencyId', in: 'query' },
    description: 'UUID of the currency to check (from currencies table)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  }),
});

const PricingAuditResponse = z.object({
  currencyId: z.string().uuid(),
  currencyCode: z.string(),
  missing: z.array(z.object({
    variantId: z.string().uuid(),
    variantSku: z.string(),
    variantTitle: z.string(),
    productId: z.string().uuid(),
    productTitle: z.string(),
  })),
  total: z.number().int(),
}).openapi('PricingAudit');

const pricingAudit = createRoute({
  method: 'get',
  path: '/pricing-audit',
  tags: ['Products'],
  summary: 'List active variants missing a price for a given currency',
  description:
    'Returns all active variants in active products that have no entry in variant_prices ' +
    'for the specified currency. Useful when using strict pricing (Option A).',
  security: [{ bearerAuth: ["legacy sk_", "admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    query: PricingAuditQuery,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PricingAuditResponse } },
      description: 'List of variants missing a price',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Currency not found',
    },
  },
});

app.openapi(pricingAudit, async (c) => {
  const { currencyId } = c.req.valid('query');
  const db = getDb(c.var.db);

  const [currency] = await db.query<{ id: string; code: string }>(
    `SELECT id, code FROM currencies WHERE id = ?`,
    [currencyId]
  );
  if (!currency) throw ApiError.notFound('Currency not found');

  const missing = await db.query<{
    variantId: string;
    variantSku: string;
    variantTitle: string;
    productId: string;
    productTitle: string;
  }>(
    `SELECT
       v.id        AS variantId,
       v.sku       AS variantSku,
       v.title     AS variantTitle,
       p.id        AS productId,
       p.title     AS productTitle
     FROM variants v
     JOIN products p ON v.product_id = p.id
     LEFT JOIN variant_prices vp
       ON vp.variant_id = v.id AND vp.currency_id = ?
     WHERE v.status = 'active'
       AND p.status = 'active'
       AND vp.id IS NULL
     ORDER BY p.title ASC, v.title ASC`,
    [currencyId]
  );

  return c.json({
    currencyId,
    currencyCode: currency.code,
    missing: missing ?? [],
    total: missing?.length ?? 0,
  }, 200);
});

export { app as catalog };
