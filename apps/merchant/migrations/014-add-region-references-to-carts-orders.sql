-- Multi-region support: Alter existing carts and orders tables
ALTER TABLE carts ADD COLUMN region_id TEXT REFERENCES regions(id);
ALTER TABLE carts ADD COLUMN shipping_rate_id TEXT REFERENCES shipping_rates(id);
ALTER TABLE carts ADD COLUMN shipping_cents INTEGER DEFAULT 0;

ALTER TABLE orders ADD COLUMN region_id TEXT REFERENCES regions(id);
ALTER TABLE orders ADD COLUMN warehouse_id TEXT REFERENCES warehouses(id);
ALTER TABLE orders ADD COLUMN shipping_rate_id TEXT REFERENCES shipping_rates(id);

CREATE INDEX IF NOT EXISTS idx_carts_region ON carts(region_id);
CREATE INDEX IF NOT EXISTS idx_orders_region ON orders(region_id);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON orders(warehouse_id);
