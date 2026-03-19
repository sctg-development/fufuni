-- Migration 018: Add shipping classes for product-specific shipping options
-- This allows certain products (e.g. furniture, hazmat) to require specific carriers.
--
-- Run locally:
--   npx wrangler d1 execute merchant --local --file migrations/018-add-shipping-classes.sql
-- Run remotely:
--   npx wrangler d1 execute merchant-db --remote --file migrations/018-add-shipping-classes.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create the shipping_classes table
-- ─────────────────────────────────────────────────────────────────────────────
-- A shipping class groups products that share the same transport constraints.
-- resolution:
--   'exclusive' → if a cart contains this class, ONLY rates from this class are shown
--   'additive'  → rates from this class are shown IN ADDITION to universal rates
CREATE TABLE IF NOT EXISTS shipping_classes (
  id          TEXT    PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,
  display_name TEXT   NOT NULL,
  description TEXT,
  resolution  TEXT    NOT NULL DEFAULT 'exclusive'
              CHECK (resolution IN ('exclusive', 'additive')),
  status      TEXT    NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shipping_classes_code   ON shipping_classes (code);
CREATE INDEX IF NOT EXISTS idx_shipping_classes_status ON shipping_classes (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Link products and variants to shipping classes
-- ─────────────────────────────────────────────────────────────────────────────
-- The class on the variant overrides the class on the product.
-- NULL on both = standard product, no transport restriction.
ALTER TABLE products  ADD COLUMN shipping_class_id TEXT REFERENCES shipping_classes(id);
ALTER TABLE variants  ADD COLUMN shipping_class_id TEXT REFERENCES shipping_classes(id);

CREATE INDEX IF NOT EXISTS idx_products_shipping_class ON products (shipping_class_id);
CREATE INDEX IF NOT EXISTS idx_variants_shipping_class ON variants (shipping_class_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Link shipping rates to a class
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL = universal rate (works for standard products with no special class)
-- A non-null value = this rate is ONLY available when the cart contains that class.
ALTER TABLE shipping_rates ADD COLUMN shipping_class_id TEXT REFERENCES shipping_classes(id);

CREATE INDEX IF NOT EXISTS idx_shipping_rates_shipping_class ON shipping_rates (shipping_class_id);
