-- Migration: Add taxes_json to carts and orders
ALTER TABLE carts ADD COLUMN taxes_json TEXT;
ALTER TABLE orders ADD COLUMN taxes_json TEXT;
