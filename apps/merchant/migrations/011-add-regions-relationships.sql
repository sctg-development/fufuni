-- Multi-region support: Regions and region relationships
CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  currency_id TEXT NOT NULL REFERENCES currencies(id),
  is_default INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS region_countries (
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  country_id TEXT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  PRIMARY KEY (region_id, country_id)
);

CREATE TABLE IF NOT EXISTS region_warehouses (
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  PRIMARY KEY (region_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS region_shipping_rates (
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  shipping_rate_id TEXT NOT NULL REFERENCES shipping_rates(id) ON DELETE CASCADE,
  PRIMARY KEY (region_id, shipping_rate_id)
);

CREATE INDEX IF NOT EXISTS idx_regions_status ON regions(status);
CREATE INDEX IF NOT EXISTS idx_regions_default ON regions(is_default);
CREATE INDEX IF NOT EXISTS idx_regions_currency ON regions(currency_id);
CREATE INDEX IF NOT EXISTS idx_region_countries_region ON region_countries(region_id);
CREATE INDEX IF NOT EXISTS idx_region_countries_country ON region_countries(country_id);
CREATE INDEX IF NOT EXISTS idx_region_warehouses_region ON region_warehouses(region_id);
CREATE INDEX IF NOT EXISTS idx_region_warehouses_warehouse ON region_warehouses(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_region_shipping_rates_region ON region_shipping_rates(region_id);
