-- Migration 015: Add currency column to cart_items
-- Run with: npx wrangler d1 execute merchant-db --remote --file=migrations/015-add-cart-items-currency.sql

-- Add currency to cart_items so the cart row can track the currency used at time of add-to-cart.
ALTER TABLE cart_items ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
