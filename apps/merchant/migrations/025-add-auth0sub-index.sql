-- Migration 025: Add fast lookup index on customers.auth_provider_id
-- This column already stores the Auth0 'sub' claim (e.g., 'auth0|abc123').
-- The index allows O(log n) resolution of customer from JWT in /v1/me/* routes.
--
-- Run locally:  npx wrangler d1 execute merchant --local --file migrations/025-add-auth0sub-index.sql
-- Run remotely: npx wrangler d1 execute merchant-db --remote --file migrations/025-add-auth0sub-index.sql

CREATE INDEX IF NOT EXISTS idx_customers_auth_provider_id ON customers(auth_provider_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
