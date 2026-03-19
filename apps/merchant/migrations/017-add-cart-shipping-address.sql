-- Migration 017: Add shipping address fields to carts table
-- This allows collecting the delivery address before the Stripe checkout session.
-- It also adds a flag to indicate if billing address is the same as shipping.
-- 
-- Run locally:
--   npx wrangler d1 execute merchant --local --file migrations/017-add-cart-shipping-address.sql
-- Run remotely:
--   npx wrangler d1 execute merchant-db --remote --file migrations/017-add-cart-shipping-address.sql

-- Customer's full name for shipping label
ALTER TABLE carts ADD COLUMN shipping_name TEXT;

-- Street address line 1 (required)
ALTER TABLE carts ADD COLUMN shipping_line1 TEXT;

-- Street address line 2 (apartment, floor, etc.)
ALTER TABLE carts ADD COLUMN shipping_line2 TEXT;

-- City
ALTER TABLE carts ADD COLUMN shipping_city TEXT;

-- State / province / region (optional depending on country)
ALTER TABLE carts ADD COLUMN shipping_state TEXT;

-- Postal / ZIP code
ALTER TABLE carts ADD COLUMN shipping_postal_code TEXT;

-- ISO 3166-1 alpha-2 country code, e.g. "FR", "US", "DE"
ALTER TABLE carts ADD COLUMN shipping_country TEXT;

-- 1 = billing address is the same as shipping (default)
-- 0 = billing address is different (future use)
ALTER TABLE carts ADD COLUMN billing_same_as_shipping INTEGER DEFAULT 1;

-- Index for filtering carts by destination country (useful for shipping rate queries)
CREATE INDEX IF NOT EXISTS idx_carts_shipping_country ON carts(shipping_country);
