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

// File: lib/shipping.ts
// Purpose: Centralized shipping calculation helpers.
// These functions are shared between checkout.ts and potentially other routes.

// Type for a resolved shipping rate (returned to the client)
export interface ShippingRateItem {
  id: string;
  display_name: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  min_delivery_days: number | null;
  max_delivery_days: number | null;
  max_weight_g: number | null;
  shipping_class_id: string | null;
}

// Resolved cart class information
export interface CartClassResolution {
  has_special_class: boolean;
  class_ids: Set<string>;
  has_exclusive: boolean;
}

// Type alias for the DB query helper — matches what do.ts provides
type DB = { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> };

// ─────────────────────────────────────────────────────────────────────────────
// resolveCartItemClasses
// ─────────────────────────────────────────────────────────────────────────────
// Determines which shipping classes are present in a given cart.
// The variant's class takes priority over the product's class (variant override).
// Returns the set of class IDs and their resolution modes.
export async function resolveCartItemClasses(
  db: DB,
  cart_id: string,
): Promise<CartClassResolution> {
  // Join cart_items → variants → products → shipping_classes to get effective class per item
  const rows = await db.query<{
    effective_class_id: string | null;
    resolution: string | null;
  }>(
    `SELECT
       COALESCE(v.shipping_class_id, p.shipping_class_id) AS effective_class_id,
       COALESCE(sc_v.resolution, sc_p.resolution)         AS resolution
     FROM cart_items ci
     JOIN variants v       ON v.sku = ci.sku
     JOIN products p       ON p.id  = v.product_id
     LEFT JOIN shipping_classes sc_v ON sc_v.id = v.shipping_class_id
     LEFT JOIN shipping_classes sc_p ON sc_p.id = p.shipping_class_id
     WHERE ci.cart_id = ?`,
    [cart_id],
  );

  const class_ids = new Set<string>();
  let has_exclusive = false;

  for (const row of rows) {
    if (row.effective_class_id) {
      class_ids.add(row.effective_class_id);
      if (row.resolution === 'exclusive') has_exclusive = true;
    }
  }

  return {
    has_special_class: class_ids.size > 0,
    class_ids,
    has_exclusive,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeCartWeightG
// ─────────────────────────────────────────────────────────────────────────────
// Computes the total weight of a cart in grams by summing (variant.weight_g × qty).
// Only includes variants marked as requiring shipping (requires_shipping = 1).
// Virtual/downloadable products are excluded from weight calculations.
// Returns 0 if no cart items or if variants have no weight set.
export async function computeCartWeightG(db: DB, cart_id: string): Promise<number> {
  const result = await db.query<{ total_weight_g: number }>(
    `SELECT COALESCE(SUM(v.weight_g * ci.qty), 0) AS total_weight_g
     FROM cart_items ci
     JOIN variants v ON v.sku = ci.sku
     WHERE ci.cart_id = ? AND v.requires_shipping = 1`,
    [cart_id],
  );
  return result[0]?.total_weight_g ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// getCompatibleShippingRates
// ─────────────────────────────────────────────────────────────────────────────
// Returns the list of shipping rates that are compatible with a given cart.
//
// Filtering logic:
//   1. The rate must belong to the cart's region (via region_shipping_rates).
//   2. The rate's max_weight_g must be >= the cart's total weight (or be null = no limit).
//   3. Class filtering:
//      - Cart has NO special class → only rates with shipping_class_id IS NULL
//      - Cart has EXCLUSIVE class  → only rates that explicitly match one of those class IDs
//      - Cart has ADDITIVE class   → rates matching the class + universal rates (shipping_class_id IS NULL)
//
// This replaces the old inlined getCompatibleShippingRates in checkout.ts.
export async function getCompatibleShippingRates(
  db: DB,
  region_id: string | null,
  cart_id: string,
  currency_id: string | undefined,
): Promise<ShippingRateItem[]> {
  // A cart without a region cannot have shipping rates
  if (!region_id) return [];

  // Step 1: compute cart weight
  const cart_weight_g = await computeCartWeightG(db, cart_id);

  // Step 2: determine shipping classes in the cart
  const { has_special_class, class_ids, has_exclusive } = await resolveCartItemClasses(db, cart_id);

  // Step 3: build the WHERE clause for class filtering
  let class_filter: string;
  const class_params: unknown[] = [];

  if (!has_special_class) {
    // Standard cart: only universal rates (no class restriction)
    class_filter = `AND sr.shipping_class_id IS NULL`;
  } else if (has_exclusive) {
    // At least one exclusive class: only rates that explicitly match a class in the cart
    const placeholders = Array.from(class_ids).map(() => '?').join(', ');
    class_filter = `AND sr.shipping_class_id IN (${placeholders})`;
    class_params.push(...Array.from(class_ids));
  } else {
    // Only additive classes: show rates matching a class + universal rates
    const placeholders = Array.from(class_ids).map(() => '?').join(', ');
    class_filter = `AND (sr.shipping_class_id IS NULL OR sr.shipping_class_id IN (${placeholders}))`;
    class_params.push(...Array.from(class_ids));
  }

  // Step 4: query the database
  // NOTE: parentheses around the max_weight_g condition are critical —
  // without them, the OR in the class filter would break the entire WHERE clause logic.
  const query = `
    SELECT
      sr.id,
      sr.display_name,
      sr.description,
      sr.max_weight_g,
      sr.min_delivery_days,
      sr.max_delivery_days,
      sr.shipping_class_id,
      COALESCE(srp.amount_cents, 0)  AS amount_cents,
      COALESCE(c.code, 'USD')       AS currency
    FROM shipping_rates sr
    JOIN region_shipping_rates rsr
      ON rsr.shipping_rate_id = sr.id
    LEFT JOIN shipping_rate_prices srp
      ON  srp.shipping_rate_id = sr.id
      AND srp.currency_id     = ?
    LEFT JOIN currencies c
      ON c.id = srp.currency_id
    WHERE sr.status = 'active'
      AND rsr.region_id = ?
      AND (sr.max_weight_g IS NULL OR sr.max_weight_g >= ?)
      ${class_filter}
    ORDER BY amount_cents ASC
  `;

  const params: unknown[] = [currency_id ?? null, region_id, cart_weight_g, ...class_params];
  const rows = await db.query<any>(query, params);

  return rows.map((r: any) => ({
    id: r.id,
    display_name: r.display_name,
    description: r.description ?? null,
    amount_cents: r.amount_cents,
    currency: r.currency,
    min_delivery_days: r.min_delivery_days ?? null,
    max_delivery_days: r.max_delivery_days ?? null,
    max_weight_g: r.max_weight_g ?? null,
    shipping_class_id: r.shipping_class_id ?? null,
  }));
}
