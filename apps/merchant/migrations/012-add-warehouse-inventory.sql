-- Multi-region support: Warehouse Inventory
CREATE TABLE IF NOT EXISTS warehouse_inventory (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  on_hand INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sku, warehouse_id)
);

CREATE TABLE IF NOT EXISTS warehouse_inventory_logs (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('restock', 'correction', 'damaged', 'return', 'sale', 'release')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_sku ON warehouse_inventory(sku);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse ON warehouse_inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_logs_sku ON warehouse_inventory_logs(sku, created_at);
