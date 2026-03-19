-- Migration 016: Add viewtoken column to orders for anonymous order tracking
-- This enables Phase 2 of the UX improvement: secure token-based order status links
-- 
-- Run with (local): wrangler d1 execute merchant --local --file migrations/016-add-order-view-token.sql
-- Run with (remote): wrangler d1 execute merchant-db --remote --file migrations/016-add-order-view-token.sql

-- Add the hashed view token column
-- Stores SHA-256 hash of the JWT (never the raw token itself)
ALTER TABLE orders ADD COLUMN viewtoken TEXT;
ALTER TABLE orders ADD COLUMN viewtoken_issued_at TEXT;

-- Audit fields for confirmation email delivery
ALTER TABLE orders ADD COLUMN confirmationemailsentat TEXT;
ALTER TABLE orders ADD COLUMN confirmationemaillasterror TEXT;
ALTER TABLE orders ADD COLUMN confirmationemailupdatedat TEXT;

-- Unique index for fast lookup and preventing token collisions
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_viewtoken ON orders(viewtoken);
