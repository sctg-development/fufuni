-- =============================================================================
-- Migration 019: Variant and product enrichment
-- Adds shipping-critical fields (requires_shipping) and common e-commerce fields
-- (barcode, compare_at_price_cents, tax_code, vendor, tags, SEO handle).
--
-- NOTE: weight_g and dims_cm already exist in the variants table.
--       This migration only adds the missing columns.
--
-- Run locally:
--   npx wrangler d1 execute merchant --local --file migrations/019-variant-enrichment.sql
-- Run remotely:
--   npx wrangler d1 execute merchant --remote --file migrations/019-variant-enrichment.sql
-- =============================================================================

-- -------------------------------------------------------------------------
-- VARIANTS TABLE — new columns
-- -------------------------------------------------------------------------

-- requires_shipping: set to 0 for digital/downloadable/virtual products.
-- When false, the variant is excluded from cart weight calculation.
-- Default 1 (true) = physical product that needs shipping.
ALTER TABLE variants ADD COLUMN requires_shipping INTEGER NOT NULL DEFAULT 1;

-- barcode: EAN-13, UPC-A, ISBN-13 or any GTIN format.
-- Used for warehouse scanning and marketplace exports.
ALTER TABLE variants ADD COLUMN barcode TEXT;

-- compare_at_price_cents: the "before sale" price displayed crossed-out in the storefront.
-- Must be greater than price_cents to make sense, but this is NOT enforced at DB level —
-- validation is done in the API layer (schemas.ts).
ALTER TABLE variants ADD COLUMN compare_at_price_cents INTEGER;

-- tax_code: Stripe Tax product tax code (e.g. 'txcd_99999999' for general physical goods,
-- 'txcd_10000000' for digital services).
-- See https://stripe.com/docs/tax/tax-categories
ALTER TABLE variants ADD COLUMN tax_code TEXT;

-- -------------------------------------------------------------------------
-- PRODUCTS TABLE — new columns
-- -------------------------------------------------------------------------

-- vendor: brand or manufacturer name (e.g. "Nike", "Apple", "Acme Corp").
-- Used for catalog filtering and display.
ALTER TABLE products ADD COLUMN vendor TEXT;

-- tags: JSON array of keyword strings for catalog search and filtering.
-- Example: '["cotton","summer","new-arrival"]'
ALTER TABLE products ADD COLUMN tags TEXT;

-- handle: URL-friendly slug for SEO-friendly product pages.
-- Example: "classic-cotton-t-shirt"
-- Must be unique — two products cannot share the same handle.
ALTER TABLE products ADD COLUMN handle TEXT UNIQUE;

-- -------------------------------------------------------------------------
-- INDEXES — improve query performance on new columns
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_variants_requires_shipping
  ON variants(requires_shipping);

CREATE INDEX IF NOT EXISTS idx_variants_barcode
  ON variants(barcode);

CREATE INDEX IF NOT EXISTS idx_products_vendor
  ON products(vendor);

-- Partial index: only index products that have a handle set (saves space)
CREATE INDEX IF NOT EXISTS idx_products_handle
  ON products(handle)
  WHERE handle IS NOT NULL;
