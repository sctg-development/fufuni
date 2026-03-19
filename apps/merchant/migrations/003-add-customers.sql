-- Migration 003: Add customers table and link to orders
-- Run with: npx wrangler d1 execute merchant-db --remote --file=migrations/003-add-customers.sql

-- ============================================================
-- CUSTOMERS TABLE (future-proofed for accounts)
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  email TEXT NOT NULL,
  
  -- Profile
  name TEXT,
  phone TEXT,
  
  -- Account fields (NULL = guest customer, filled = has account)
  password_hash TEXT,
  email_verified_at TEXT,
  auth_provider TEXT,           -- 'email', 'google', 'github', etc.
  auth_provider_id TEXT,        -- External provider user ID
  
  -- Preferences
  accepts_marketing INTEGER DEFAULT 0,
  locale TEXT DEFAULT 'en',
  
  -- Extensibility
  metadata TEXT,                -- JSON for custom data
  
  -- Stats (denormalized)
  order_count INTEGER DEFAULT 0,
  total_spent_cents INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_order_at TEXT,
  
  UNIQUE(store_id, email)
);

-- ============================================================
-- CUSTOMER ADDRESSES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  label TEXT,
  is_default INTEGER DEFAULT 0,
  
  name TEXT,
  company TEXT,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  phone TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ADD COLUMNS TO ORDERS TABLE
-- ============================================================

-- Add customer_id column
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES customers(id);

-- Add shipping_name column
ALTER TABLE orders ADD COLUMN shipping_name TEXT;

-- Add shipping_phone column  
ALTER TABLE orders ADD COLUMN shipping_phone TEXT;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_store_email ON customers(store_id, email);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);




