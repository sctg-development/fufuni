-- Multi-region support: Variant Prices (regional pricing)
CREATE TABLE IF NOT EXISTS variant_prices (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  currency_id TEXT NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(variant_id, currency_id)
);

CREATE INDEX IF NOT EXISTS idx_variant_prices_variant ON variant_prices(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_prices_currency ON variant_prices(currency_id);
