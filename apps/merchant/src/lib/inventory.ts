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
 * apps/merchant/src/lib/inventory.ts
 *
 * Centralized inventory management utility functions.
 * Handles both multi-warehouse and legacy inventory tables for unified availability checking,
 * reservation, release, and sale commitment.
 *
 * Resolution order:
 *   1. If SKU exists in warehouse_inventory → use aggregated total
 *   2. Otherwise fall back to legacy inventory table
 */

import type { Database } from '../db';
import { ApiError, now } from '../types';

/**
 * Returns the total available quantity for a SKU.
 *
 * "available" = on_hand - reserved
 *
 * Checks warehouse_inventory first, falls back to legacy inventory table.
 */
export async function getAvailableQty(
  db: Database,
  sku: string
): Promise<number> {
  // Try multi-warehouse first
  const wh = await db.query<{ total_on_hand: number; total_reserved: number }>(
    `SELECT
       COALESCE(SUM(on_hand), 0)    AS total_on_hand,
       COALESCE(SUM(reserved), 0)   AS total_reserved
     FROM warehouse_inventory
     WHERE sku = ?`,
    [sku]
  );

  if (wh && wh.length > 0 && wh[0].total_on_hand > 0) {
    // SKU is managed by warehouses
    return wh[0].total_on_hand - wh[0].total_reserved;
  }

  // Fallback: legacy inventory table
  const legacy = await db.query<{ on_hand: number; reserved: number }>(
    `SELECT on_hand, reserved FROM inventory WHERE sku = ?`,
    [sku]
  );

  if (legacy && legacy.length > 0) {
    return legacy[0].on_hand - legacy[0].reserved;
  }

  return 0;
}

/**
 * Reserves `qty` units for a SKU (called when adding to cart / at checkout).
 *
 * Priority: warehouse_inventory if the SKU has warehouse rows,
 *           otherwise legacy inventory.
 *
 * Throws ApiError if insufficient stock.
 */
export async function reserveInventory(
  db: Database,
  sku: string,
  qty: number
): Promise<void> {
  const timestamp = now();

  // Check if SKU is managed by warehouses
  const whCount = await db.query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM warehouse_inventory WHERE sku = ?`,
    [sku]
  );

  if (whCount && whCount.length > 0 && whCount[0].cnt > 0) {
    // --- Multi-warehouse reservation ---
    // We add reserved units to the warehouse with the highest available qty
    // (simplest strategy; can be replaced with priority-based allocation later).
    const result = await db.run(
      `UPDATE warehouse_inventory
       SET reserved = reserved + ?, updated_at = ?
       WHERE sku = ?
         AND warehouse_id = (
           SELECT warehouse_id
           FROM warehouse_inventory
           WHERE sku = ?
           ORDER BY (on_hand - reserved) DESC
           LIMIT 1
         )
         AND (on_hand - reserved) >= ?`,
      [qty, timestamp, sku, sku, qty]
    );

    if (result.changes === 0) {
      throw ApiError.insufficientInventory(sku);
    }

    // Keep legacy inventory.reserved in sync for dashboard display
    await db.run(
      `UPDATE inventory
       SET reserved = (
         SELECT COALESCE(SUM(reserved), 0) FROM warehouse_inventory WHERE sku = ?
       ), updated_at = ?
       WHERE sku = ?`,
      [sku, timestamp, sku]
    );
  } else {
    // --- Legacy inventory reservation ---
    const result = await db.run(
      `UPDATE inventory
       SET reserved = reserved + ?, updated_at = ?
       WHERE sku = ? AND (on_hand - reserved) >= ?`,
      [qty, timestamp, sku, qty]
    );

    if (result.changes === 0) {
      throw ApiError.insufficientInventory(sku);
    }
  }
}

/**
 * Releases a previously held reservation (called on checkout failure or cart expiry).
 */
export async function releaseReservation(
  db: Database,
  sku: string,
  qty: number
): Promise<void> {
  const timestamp = now();

  // Release from warehouse_inventory (whichever warehouse holds the reservation)
  await db.run(
    `UPDATE warehouse_inventory
     SET reserved = MAX(reserved - ?, 0), updated_at = ?
     WHERE sku = ?`,
    [qty, timestamp, sku]
  );

  // Always update legacy table (it mirrors the total)
  await db.run(
    `UPDATE inventory
     SET reserved = MAX(reserved - ?, 0), updated_at = ?
     WHERE sku = ?`,
    [qty, timestamp, sku]
  );
}

/**
 * Commits a sale: decrements on_hand AND reserved after successful payment.
 * Called by the Stripe webhook handler.
 */
export async function commitSale(
  db: Database,
  sku: string,
  qty: number
): Promise<void> {
  const timestamp = now();

  // Check if SKU is managed by warehouses
  const whCount = await db.query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM warehouse_inventory WHERE sku = ?`,
    [sku]
  );

  if (whCount && whCount.length > 0 && whCount[0].cnt > 0) {
    // Decrement the warehouse that holds the reservation
    await db.run(
      `UPDATE warehouse_inventory
       SET on_hand   = MAX(on_hand   - ?, 0),
           reserved  = MAX(reserved - ?, 0),
           updated_at = ?
       WHERE sku = ?
         AND reserved >= ?`,
      [qty, qty, timestamp, sku, qty]
    );

    // Keep legacy inventory in sync
    await db.run(
      `UPDATE inventory
       SET on_hand = (
         SELECT COALESCE(SUM(on_hand), 0) FROM warehouse_inventory WHERE sku = ?
       ),
       reserved = (
         SELECT COALESCE(SUM(reserved), 0) FROM warehouse_inventory WHERE sku = ?
       ),
       updated_at = ?
       WHERE sku = ?`,
      [sku, sku, timestamp, sku]
    );
  } else {
    // Legacy inventory only
    await db.run(
      `UPDATE inventory
       SET on_hand   = MAX(on_hand   - ?, 0),
           reserved  = MAX(reserved - ?, 0),
           updated_at = ?
       WHERE sku = ?`,
      [qty, qty, timestamp, sku]
    );
  }
}
