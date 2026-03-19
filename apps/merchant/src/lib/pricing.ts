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
 * Pricing resolution helpers for multi-currency support
 * Implements Option A: Strict fallback (no default fallback to USD)
 *
 * - Each region must have explicit prices in variant_prices for its currency
 * - Prices are resolved at cart creation time and frozen
 * - No price conversion — only explicit multi-currency pricing from admin
 */

import type { Database } from "../db";
import { ApiError } from "../types";

/**
 * Resolves the price of a variant in a specific currency.
 * Searches variant_prices table for the exact currency match.
 *
 * Option A behavior: If no price found in variant_prices, returns error.
 * This ensures consistency — prices must be explicitly configured per currency.
 *
 * @param db          - Database instance
 * @param variantId   - UUID of the variant
 * @param currencyId  - UUID of the target currency (from currencies table)
 * @returns price in cents for the given currency
 * @throws ApiError.notFound if no price configured for this variant+currency combo
 *
 * @example
 * const usdPrice = await resolveVariantPrice(db, variantId, currencyUsd.id);
 * // Returns: 2999 (represents $29.99)
 *
 * const eurPrice = await resolveVariantPrice(db, variantId, currencyEur.id);
 * // Returns: 2799 (represents €27.99)
 *
 * const unknownPrice = await resolveVariantPrice(db, variantId, unknownCurrencyId);
 * // Throws: ApiError.notFound("Price not configured for this currency")
 */
export async function resolveVariantPrice(
  db: Database,
  variantId: string,
  currencyId: string | null
): Promise<number> {
  if (!currencyId) {
    throw ApiError.notFound(
      "Cannot resolve variant price: no currency specified"
    );
  }

  // Strict: Look for exact match in variant_prices
  const [row] = await db.query<{ price_cents: number }>(
    `SELECT price_cents FROM variant_prices
     WHERE variant_id = ? AND currency_id = ?`,
    [variantId, currencyId]
  );

  if (!row) {
    throw ApiError.notFound(
      `Price not configured for this variant in the requested currency. ` +
      `Admin must set variant pricing in variant_prices table.`
    );
  }

  return row.price_cents;
}

/**
 * Resolves the price of a shipping rate in a specific currency.
 * Searches shipping_rate_prices table.
 *
 * Option A behavior: If no price found, returns error (strict).
 *
 * @param db              - Database instance
 * @param shippingRateId  - UUID of the shipping rate
 * @param currencyId      - UUID of the target currency
 * @returns amount in cents for the given currency
 * @throws ApiError.notFound if no shipping price configured
 *
 * @example
 * const shippingCost = await resolveShippingPrice(db, rateId, currencyId);
 * // Returns: 1000 (represents €10.00 shipping)
 */
export async function resolveShippingPrice(
  db: Database,
  shippingRateId: string,
  currencyId: string | null
): Promise<number> {
  if (!currencyId) {
    throw ApiError.notFound(
      "Cannot resolve shipping price: no currency specified"
    );
  }

  const [row] = await db.query<{ amount_cents: number }>(
    `SELECT amount_cents FROM shipping_rate_prices
     WHERE shipping_rate_id = ? AND currency_id = ?`,
    [shippingRateId, currencyId]
  );

  if (!row) {
    throw ApiError.notFound(
      `Shipping rate price not configured for the requested currency`
    );
  }

  return row.amount_cents;
}

/**
 * Retrieves the currency_id (UUID) associated with a region.
 * Uses the region's currency_id foreign key.
 *
 * @param db       - Database instance
 * @param regionId - UUID of the region
 * @returns currency_id (UUID) or null if region not found / inactive
 *
 * @example
 * const currencyId = await getCurrencyIdForRegion(db, regionId);
 * // Returns: "550e8400-e29b-41d4-a716-446655440000" (UUID of EUR)
 */
export async function getCurrencyIdForRegion(
  db: Database,
  regionId: string | null
): Promise<string | null> {
  if (!regionId) return null;

  const [region] = await db.query<{ currency_id: string }>(
    `SELECT currency_id FROM regions WHERE id = ? AND status = 'active'`,
    [regionId]
  );

  return region?.currency_id ?? null;
}

/**
 * Retrieves the currency code (ISO 4217) for a region.
 * Follows the region → currency relationship.
 *
 * @param db       - Database instance
 * @param regionId - UUID of the region
 * @returns ISO 4217 code (ex: "EUR", "USD") or null if not found
 *
 * @example
 * const code = await getCurrencyCodeForRegion(db, regionId);
 * // Returns: "EUR"
 */
export async function getCurrencyCodeForRegion(
  db: Database,
  regionId: string | null
): Promise<string | null> {
  if (!regionId) return null;

  const [row] = await db.query<{ code: string }>(
    `SELECT c.code FROM regions r
     JOIN currencies c ON r.currency_id = c.id
     WHERE r.id = ? AND r.status = 'active'`,
    [regionId]
  );

  return row?.code ?? null;
}

/**
 * Resolves the currency_id (UUID) from an ISO 4217 currency code.
 *
 * @param db   - Database instance
 * @param code - ISO 4217 code (ex: "USD", "EUR")
 * @returns currency_id (UUID) or null if not found
 *
 * @example
 * const currencyId = await getCurrencyIdFromCode(db, "EUR");
 * // Returns: "550e8400-e29b-41d4-a716-446655440000"
 */
export async function getCurrencyIdFromCode(
  db: Database,
  code: string
): Promise<string | null> {
  const [row] = await db.query<{ id: string }>(
    `SELECT id FROM currencies WHERE code = ? AND status = 'active'`,
    [code.toUpperCase()]
  );
  return row?.id ?? null;
}

/**
 * Validates that a price exists for a variant before adding to cart.
 * Used as a pre-check before calling resolveVariantPrice.
 *
 * @param db        - Database instance
 * @param variantId - UUID of the variant
 * @param currencyId - UUID of the currency
 * @returns true if price is available, false otherwise
 */
export async function hasPriceForCurrency(
  db: Database,
  variantId: string,
  currencyId: string
): Promise<boolean> {
  const [row] = await db.query<{ id: string }>(
    `SELECT id FROM variant_prices
     WHERE variant_id = ? AND currency_id = ?`,
    [variantId, currencyId]
  );
  return !!row;
}
