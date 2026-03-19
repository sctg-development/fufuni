-- Migration: Expand order status CHECK constraint
-- Run with: wrangler d1 execute merchant-db --remote --file=migrations/001-add-order-statuses.sql

-- Disable foreign key checks during migration
PRAGMA foreign_keys = OFF;

-- Create new table matching EXACT column order of existing table
CREATE TABLE orders_new (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'refunded', 'canceled')),
  customer_email TEXT NOT NULL,
  ship_to TEXT,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  tracking_number TEXT,
  tracking_url TEXT,
  shipped_at TEXT
);

-- Copy data
INSERT INTO orders_new SELECT * FROM orders;

-- Swap tables
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;
