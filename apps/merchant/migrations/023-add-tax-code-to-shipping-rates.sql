-- Migration: Add tax_code to shipping_rates
ALTER TABLE shipping_rates ADD COLUMN tax_code TEXT;
