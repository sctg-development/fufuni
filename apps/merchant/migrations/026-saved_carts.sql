-- Migration 026: Add saved_carts table for Auth0-linked cart snapshots
-- 
-- Stores Auth0-linked cart snapshots for authenticated users.
-- Each row links an Auth0 user (via 'sub' claim) to a saved cart.
-- The cart data itself lives in the 'carts' table; this table just provides
-- the association and allows users to have multiple saved carts.
--
-- Run locally:  npx wrangler d1 execute merchant --local --file migrations/026-saved_carts.sql
-- Run remotely: npx wrangler d1 execute merchant-db --remote --file migrations/026-saved_carts.sql

CREATE TABLE IF NOT EXISTS saved_carts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  auth0_user_id TEXT NOT NULL,
  cart_id     INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(auth0_user_id, cart_id),
  FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_carts_user ON saved_carts(auth0_user_id);

-- Auto-update the updated_at column on row changes
CREATE TRIGGER IF NOT EXISTS trg_saved_carts_updated_at
AFTER UPDATE ON saved_carts
FOR EACH ROW
BEGIN
  UPDATE saved_carts SET updated_at = datetime('now') WHERE id = NEW.id;
END;
