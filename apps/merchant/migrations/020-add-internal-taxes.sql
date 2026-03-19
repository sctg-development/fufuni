-- Migration 020: Add internal tax rates table
-- Run locally: npx wrangler d1 execute merchant --local --file migrations/020-add-internal-taxes.sql
-- Run remotely: npx wrangler d1 execute merchant-db --remote --file migrations/020-add-internal-taxes.sql

CREATE TABLE IF NOT EXISTS tax_rates (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    country_code TEXT, -- ISO 3166-1 alpha-2 (e.g., 'FR', 'US'). NULL means fallback for all.
    tax_code TEXT,     -- e.g., 'txcd_99999999'. NULL means default rate.
    rate_percentage REAL NOT NULL, -- e.g., 20.0 for 20%
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL DEFAULT datetime('now'),
    updated_at TEXT NOT NULL DEFAULT datetime('now')
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_country ON tax_rates(country_code);
CREATE INDEX IF NOT EXISTS idx_tax_rates_tax_code ON tax_rates(tax_code);
