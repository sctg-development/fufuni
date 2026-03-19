-- Migration 004: Add updated_at column to carts table
-- Run with: npx wrangler d1 execute merchant-db --remote --file=migrations/004-add-carts-updated-at.sql

-- ============================================================
-- ADD updated_at COLUMN TO CARTS TABLE
-- ============================================================

-- For D1 (SQLite)
ALTER TABLE carts ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- For Postgres (uncomment if using Postgres)
-- ALTER TABLE carts ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ============================================================
-- BACKFILL: Set updated_at to created_at for existing carts
-- ============================================================

-- For D1 (SQLite)
UPDATE carts SET updated_at = created_at WHERE updated_at IS NULL;

-- For Postgres (uncomment if using Postgres)
-- UPDATE carts SET updated_at = created_at WHERE updated_at IS NULL;

