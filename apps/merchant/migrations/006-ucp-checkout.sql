-- UCP Checkout Sessions table for Universal Commerce Protocol support
CREATE TABLE IF NOT EXISTS ucp_checkout_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'incomplete',
  currency TEXT NOT NULL,
  line_items TEXT NOT NULL,
  buyer TEXT,
  totals TEXT NOT NULL,
  messages TEXT,
  payment_instruments TEXT,
  stripe_session_id TEXT,
  order_id TEXT,
  order_number TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ucp_checkout_sessions_status ON ucp_checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ucp_checkout_sessions_stripe_session ON ucp_checkout_sessions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_ucp_checkout_sessions_expires ON ucp_checkout_sessions(expires_at);
