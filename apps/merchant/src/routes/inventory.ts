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
import { getDb } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import { checkLowInventory } from '../lib/webhooks';
import {
  InventoryQuery,
  InventoryListResponse,
  InventoryItem,
  SkuParam,
  AdjustInventoryBody,
  WarehouseInventoryQuery,
  WarehouseInventoryListResponse,
  AdjustWarehouseInventoryBody,
  DeleteWarehouseInventoryBody,
  WarehouseInventoryItem,
  RegionalInventoryQuery,
  ErrorResponse,
} from '../schemas';

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

const listInventory = createRoute({
  method: 'get',
  path: '/',
  tags: ['Inventory'],
  summary: 'List inventory levels',
  description: 'List all inventory levels with pagination, or get a single SKU by query param',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { query: InventoryQuery },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: InventoryListResponse,
        },
      },
      description: 'List of inventory levels',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'SKU not found (when querying single SKU)',
    },
  },
});

app.openapi(listInventory, async (c) => {
  const { sku, limit: limitStr, cursor, low_stock } = c.req.valid('query');
  const db = getDb(c.var.db);

  if (sku) {
    // Get inventory for a specific SKU across all warehouses
    const levels = await db.query<any>(
      `SELECT wi.*, w.display_name as warehouse_name, v.title as variant_title, p.title as product_title
       FROM warehouse_inventory wi
       LEFT JOIN warehouses w ON wi.warehouse_id = w.id
       LEFT JOIN variants v ON wi.sku = v.sku
       LEFT JOIN products p ON v.product_id = p.id
       WHERE wi.sku = ?
       ORDER BY w.priority ASC`,
      [sku]
    );

    if (levels.length === 0) throw ApiError.notFound('SKU not found');

    const totalOnHand = levels.reduce((sum, l) => sum + (l.on_hand || 0), 0);
    const totalReserved = levels.reduce((sum, l) => sum + (l.reserved || 0), 0);

    return c.json({
      items: [{
        sku: sku,
        on_hand: totalOnHand,
        reserved: totalReserved,
        available: totalOnHand - totalReserved,
        variant_title: levels[0]?.variant_title,
        product_title: levels[0]?.product_title,
        warehouses: levels.map(l => ({
          warehouse_id: l.warehouse_id,
          warehouse_name: l.warehouse_name,
          quantity: l.on_hand,
        })),
      }],
      pagination: { has_more: false, next_cursor: null },
    }, 200);
  }

  const limit = Math.min(parseInt(limitStr || '100'), 500);
  const lowStock = low_stock === 'true';

  // Get all unique SKUs with their aggregated inventory
  let query = `SELECT 
    wi.sku,
    SUM(wi.on_hand) as total_on_hand,
    SUM(wi.reserved) as total_reserved,
    v.title as variant_title,
    p.title as product_title
  FROM warehouse_inventory wi
  LEFT JOIN variants v ON wi.sku = v.sku
  LEFT JOIN products p ON v.product_id = p.id
  GROUP BY wi.sku`;
  
  const params: unknown[] = [];

  const conditions: string[] = [];
  if (lowStock) {
    conditions.push(`(SUM(wi.on_hand) - SUM(wi.reserved)) <= 10`);
  }
  if (cursor) {
    conditions.push(`wi.sku > ?`);
    params.push(cursor);
  }

  if (conditions.length > 0) {
    query += ` HAVING ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY wi.sku LIMIT ?`;
  params.push(limit + 1);

  const items = await db.query<any>(query, params);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].sku : null;

  // For each item, get warehouse breakdown
  const itemsWithWarehouses = await Promise.all(
    items.map(async (item) => {
      const warehouses = await db.query<any>(
        `SELECT wi.*, w.display_name as warehouse_name
         FROM warehouse_inventory wi
         LEFT JOIN warehouses w ON wi.warehouse_id = w.id
         WHERE wi.sku = ?
         ORDER BY w.priority ASC`,
        [item.sku]
      );

      return {
        sku: item.sku,
        on_hand: item.total_on_hand || 0,
        reserved: item.total_reserved || 0,
        available: (item.total_on_hand || 0) - (item.total_reserved || 0),
        variant_title: item.variant_title,
        product_title: item.product_title,
        warehouses: warehouses.map(w => ({
          warehouse_id: w.warehouse_id,
          warehouse_name: w.warehouse_name,
          quantity: w.on_hand,
        })),
      };
    })
  );

  return c.json({
    items: itemsWithWarehouses,
    pagination: {
      has_more: hasMore,
      next_cursor: nextCursor,
    },
  }, 200);
});

const adjustInventory = createRoute({
  method: 'post',
  path: '/{sku}/adjust',
  tags: ['Inventory'],
  summary: 'Adjust inventory level',
  description: 'Add or subtract inventory for a SKU with a reason',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: SkuParam,
    body: { content: { 'application/json': { schema: AdjustInventoryBody } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: InventoryItem } },
      description: 'Updated inventory level',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Invalid request (e.g., would go below 0)',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'SKU not found',
    },
  },
});

app.openapi(adjustInventory, async (c) => {
  const { sku } = c.req.valid('param');
  const { delta, reason } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>(`SELECT * FROM inventory WHERE sku = ?`, [sku]);
  if (!existing) throw ApiError.notFound('SKU not found');

  if (delta < 0 && existing.on_hand + delta < 0) {
    throw ApiError.invalidRequest(
      `Cannot reduce inventory below 0. Current on_hand: ${existing.on_hand}`
    );
  }

  await db.run(
    `UPDATE inventory SET on_hand = on_hand + ?, updated_at = ? WHERE sku = ?`,
    [delta, now(), sku]
  );

  await db.run(
    `INSERT INTO inventory_logs (id, sku, delta, reason) VALUES (?, ?, ?, ?)`,
    [uuid(), sku, delta, reason]
  );

  const [level] = await db.query<any>(`SELECT * FROM inventory WHERE sku = ?`, [sku]);

  const available = level.on_hand - level.reserved;

  await checkLowInventory(c.var.db, c.executionCtx, sku, available);

  return c.json({
    sku: level.sku,
    on_hand: level.on_hand,
    reserved: level.reserved,
    available,
  }, 200);
});

// ============================================================
// WAREHOUSE INVENTORY ROUTES
// ============================================================

const listWarehouseInventory = createRoute({
  method: 'get',
  path: '/warehouse',
  tags: ['Inventory - Warehouse'],
  summary: 'List warehouse inventory levels',
  description: 'List inventory levels across warehouses with optional filters',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { query: WarehouseInventoryQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: WarehouseInventoryListResponse } },
      description: 'List of warehouse inventory levels',
    },
  },
});

app.openapi(listWarehouseInventory, async (c) => {
  const { sku, warehouse_id, limit: limitStr, cursor, low_stock } = c.req.valid('query');
  const db = getDb(c.var.db);
  const limit = Math.min(parseInt(limitStr || '100'), 500);

  let query = `SELECT wi.*, w.display_name as warehouse_name, v.title as variant_title, p.title as product_title
     FROM warehouse_inventory wi
     LEFT JOIN warehouses w ON wi.warehouse_id = w.id
     LEFT JOIN variants v ON wi.sku = v.sku
     LEFT JOIN products p ON v.product_id = p.id
     WHERE 1=1`;
  const params: unknown[] = [];

  if (sku) {
    query += ` AND wi.sku = ?`;
    params.push(sku);
  }
  if (warehouse_id) {
    query += ` AND wi.warehouse_id = ?`;
    params.push(warehouse_id);
  }
  if (low_stock === 'true') {
    query += ` AND (wi.on_hand - wi.reserved) <= 10`;
  }
  if (cursor) {
    query += ` AND wi.id > ?`;
    params.push(cursor);
  }

  query += ` ORDER BY wi.sku, w.priority LIMIT ?`;
  params.push(limit + 1);

  const items = await db.query<any>(query, params);
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return c.json({
    items: items.map((i) => ({
      sku: i.sku,
      warehouse_id: i.warehouse_id,
      warehouse_name: i.warehouse_name,
      on_hand: i.on_hand,
      reserved: i.reserved,
      available: i.on_hand - i.reserved,
      variant_title: i.variant_title,
      product_title: i.product_title,
    })),
    pagination: {
      has_more: hasMore,
      next_cursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
    },
  }, 200);
});

const adjustWarehouseInventory = createRoute({
  method: 'post',
  path: '/{sku}/warehouse-adjust',
  tags: ['Inventory - Warehouse'],
  summary: 'Adjust warehouse inventory level',
  description: 'Add or subtract inventory for a SKU at a specific warehouse',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: SkuParam,
    body: { content: { 'application/json': { schema: AdjustWarehouseInventoryBody } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: WarehouseInventoryItem } },
      description: 'Updated warehouse inventory level',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Invalid request (e.g., would go below 0)',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'SKU or warehouse not found',
    },
  },
});

app.openapi(adjustWarehouseInventory, async (c) => {
  const { sku } = c.req.valid('param');
  const { warehouse_id, delta, reason } = c.req.valid('json');
  const db = getDb(c.var.db);

  // Verify warehouse exists
  const [warehouse] = await db.query<any>(`SELECT * FROM warehouses WHERE id = ?`, [warehouse_id]);
  if (!warehouse) throw ApiError.notFound('Warehouse not found');

  // Verify SKU exists
  const [variant] = await db.query<any>(`SELECT * FROM variants WHERE sku = ?`, [sku]);
  if (!variant) throw ApiError.notFound('SKU not found');

  // Get or create warehouse inventory record
  let [existing] = await db.query<any>(
    `SELECT * FROM warehouse_inventory WHERE sku = ? AND warehouse_id = ?`,
    [sku, warehouse_id]
  );

  if (!existing) {
    // Create new warehouse inventory record
    const id = uuid();
    await db.run(
      `INSERT INTO warehouse_inventory (id, sku, warehouse_id, on_hand, reserved, updated_at) VALUES (?, ?, ?, 0, 0, ?)`,
      [id, sku, warehouse_id, now()]
    );
    existing = { id, sku, warehouse_id, on_hand: 0, reserved: 0 };
  }

  if (delta < 0 && existing.on_hand + delta < 0) {
    throw ApiError.invalidRequest(
      `Cannot reduce inventory below 0. Current on_hand: ${existing.on_hand}`
    );
  }

  await db.run(
    `UPDATE warehouse_inventory SET on_hand = on_hand + ?, updated_at = ? WHERE sku = ? AND warehouse_id = ?`,
    [delta, now(), sku, warehouse_id]
  );

  await db.run(
    `INSERT INTO warehouse_inventory_logs (id, sku, warehouse_id, delta, reason) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), sku, warehouse_id, delta, reason]
  );

  const [level] = await db.query<any>(
    `SELECT wi.*, w.display_name as warehouse_name FROM warehouse_inventory wi
     LEFT JOIN warehouses w ON wi.warehouse_id = w.id
     WHERE wi.sku = ? AND wi.warehouse_id = ?`,
    [sku, warehouse_id]
  );

  const available = level.on_hand - level.reserved;

  // Check low inventory at warehouse level
  await checkLowInventory(c.var.db, c.executionCtx, sku, available);

  // Get all warehouses for this SKU and product info
  const allWarehouses = await db.query<any>(
    `SELECT wi.*, w.display_name as warehouse_name
     FROM warehouse_inventory wi
     LEFT JOIN warehouses w ON wi.warehouse_id = w.id
     WHERE wi.sku = ?
     ORDER BY w.priority ASC`,
    [sku]
  );

  const [variantInfo] = await db.query<any>(
    `SELECT v.title as variant_title, p.title as product_title
     FROM variants v
     LEFT JOIN products p ON v.product_id = p.id
     WHERE v.sku = ?`,
    [sku]
  );

  const totalOnHand = allWarehouses.reduce((sum, w) => sum + (w.on_hand || 0), 0);
  const totalReserved = allWarehouses.reduce((sum, w) => sum + (w.reserved || 0), 0);

  // --- Phase 1: HOTFIX — Sync warehouse_inventory total → inventory (legacy checkout engine) ---
  // The checkout engine reads from `inventory` for availability checks.
  // We mirror the aggregated on_hand and reserved here so both tables stay consistent.
  await db.run(
    `UPDATE inventory
     SET on_hand = ?, reserved = ?, updated_at = ?
     WHERE sku = ?`,
    [totalOnHand, totalReserved, now(), sku]
  );
  // --- End sync block -------------------------------------------------------

  return c.json({
    sku: sku,
    on_hand: totalOnHand,
    reserved: totalReserved,
    available: totalOnHand - totalReserved,
    variant_title: variantInfo?.variant_title,
    product_title: variantInfo?.product_title,
    warehouses: allWarehouses.map(w => ({
      warehouse_id: w.warehouse_id,
      warehouse_name: w.warehouse_name,
      quantity: w.on_hand,
    })),
  }, 200);
});

/**
 * Delete a warehouse inventory record (only when quantity is 0).
 * Removes the entire warehouse_inventory entry for a SKU at a specific warehouse.
 */
const deleteWarehouseInventory = createRoute({
  method: 'post',
  path: '/{sku}/warehouse-delete',
  tags: ['Inventory - Warehouse'],
  summary: 'Delete warehouse inventory',
  description: 'Remove a SKU from a warehouse (only when on_hand is 0)',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: SkuParam,
    body: { content: { 'application/json': { schema: DeleteWarehouseInventoryBody } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: WarehouseInventoryItem } },
      description: 'Warehouse inventory record deleted successfully',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Cannot delete when inventory level is not 0',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'SKU or warehouse not found',
    },
  },
});

app.openapi(deleteWarehouseInventory, async (c) => {
  const { sku } = c.req.valid('param');
  const { warehouse_id } = c.req.valid('json');
  const db = getDb(c.var.db);

  // Verify warehouse exists
  const [warehouse] = await db.query<any>(`SELECT * FROM warehouses WHERE id = ?`, [warehouse_id]);
  if (!warehouse) throw ApiError.notFound('Warehouse not found');

  // Verify SKU exists
  const [variant] = await db.query<any>(`SELECT * FROM variants WHERE sku = ?`, [sku]);
  if (!variant) throw ApiError.notFound('SKU not found');

  // Get warehouse inventory record
  const [existing] = await db.query<any>(
    `SELECT * FROM warehouse_inventory WHERE sku = ? AND warehouse_id = ?`,
    [sku, warehouse_id]
  );

  if (!existing) throw ApiError.notFound('Warehouse inventory record not found');

  // Only allow deletion if on_hand is 0
  if (existing.on_hand !== 0) {
    throw ApiError.invalidRequest(
      `Cannot delete warehouse inventory when on_hand is not 0. Current on_hand: ${existing.on_hand}`
    );
  }

  // Delete the warehouse inventory record
  await db.run(
    `DELETE FROM warehouse_inventory WHERE sku = ? AND warehouse_id = ?`,
    [sku, warehouse_id]
  );

  // Get updated totals across all warehouses
  const allWarehouses = await db.query<any>(
    `SELECT wi.*, w.display_name as warehouse_name
     FROM warehouse_inventory wi
     LEFT JOIN warehouses w ON wi.warehouse_id = w.id
     WHERE wi.sku = ?
     ORDER BY w.priority ASC`,
    [sku]
  );

  const [variantInfo] = await db.query<any>(
    `SELECT v.title as variant_title, p.title as product_title
     FROM variants v
     LEFT JOIN products p ON v.product_id = p.id
     WHERE v.sku = ?`,
    [sku]
  );

  const totalOnHand = allWarehouses.reduce((sum, w) => sum + (w.on_hand || 0), 0);
  const totalReserved = allWarehouses.reduce((sum, w) => sum + (w.reserved || 0), 0);

  // --- Phase 1: HOTFIX — Re-sync after warehouse record deletion ---
  // After removing a warehouse row, recalculate the total on_hand and reserved across
  // remaining warehouses and update the legacy inventory table.
  await db.run(
    `UPDATE inventory
     SET on_hand = ?, reserved = ?, updated_at = ?
     WHERE sku = ?`,
    [totalOnHand, totalReserved, now(), sku]
  );
  // --- End sync block -------------------------------------------------------

  return c.json({
    sku: sku,
    on_hand: totalOnHand,
    reserved: totalReserved,
    available: totalOnHand - totalReserved,
    variant_title: variantInfo?.variant_title,
    product_title: variantInfo?.product_title,
    warehouses: allWarehouses.map(w => ({
      warehouse_id: w.warehouse_id,
      warehouse_name: w.warehouse_name,
      quantity: w.on_hand,
    })),
  }, 200);
});

const getRegionalInventory = createRoute({
  method: 'get',
  path: '/{sku}/regional',
  tags: ['Inventory - Warehouse'],
  summary: 'Get regional inventory',
  description: 'Get aggregated inventory for a SKU across all warehouses in a region',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: SkuParam,
    query: RegionalInventoryQuery,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: WarehouseInventoryItem } },
      description: 'Regional inventory summary',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'SKU or region not found',
    },
  },
});

app.openapi(getRegionalInventory, async (c) => {
  const { sku } = c.req.valid('param');
  const { region_id } = c.req.valid('query');
  const db = getDb(c.var.db);

  // Verify region exists
  const [region] = await db.query<any>('SELECT * FROM regions WHERE id = ?', [region_id]);
  if (!region) throw ApiError.notFound('Region not found');

  // Verify SKU exists
  const [variant] = await db.query<any>('SELECT * FROM variants WHERE sku = ?', [sku]);
  if (!variant) throw ApiError.notFound('SKU not found');

  // Get warehouse inventory for this region
  const warehouses = await db.query<any>(
    `SELECT wi.*, w.display_name as warehouse_name
     FROM warehouse_inventory wi
     JOIN region_warehouses rw ON wi.warehouse_id = rw.warehouse_id
     WHERE wi.sku = ? AND rw.region_id = ?
     ORDER BY w.priority`,
    [sku, region_id]
  );

  const totalOnHand = warehouses.reduce((sum, w) => sum + w.on_hand, 0);
  const totalReserved = warehouses.reduce((sum, w) => sum + w.reserved, 0);
  const totalAvailable = totalOnHand - totalReserved;

  return c.json({
    sku,
    region_id,
    total_on_hand: totalOnHand,
    total_reserved: totalReserved,
    total_available: totalAvailable,
    warehouses: warehouses.map((w) => ({
      warehouse_id: w.warehouse_id,
      warehouse_name: w.warehouse_name,
      on_hand: w.on_hand,
      reserved: w.reserved,
      available: w.on_hand - w.reserved,
    })),
  }, 200);
});

export { app as inventory };
