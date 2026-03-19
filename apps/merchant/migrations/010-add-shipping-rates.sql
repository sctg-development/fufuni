-- Multi-region support: Shipping Rates
CREATE TABLE IF NOT EXISTS shipping_rates (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  max_weight_g INTEGER,
  min_delivery_days INTEGER,
  max_delivery_days INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipping_rate_prices (
  id TEXT PRIMARY KEY,
  shipping_rate_id TEXT NOT NULL REFERENCES shipping_rates(id) ON DELETE CASCADE,
  currency_id TEXT NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(shipping_rate_id, currency_id)
);

CREATE INDEX IF NOT EXISTS idx_shipping_rates_status ON shipping_rates(status);
