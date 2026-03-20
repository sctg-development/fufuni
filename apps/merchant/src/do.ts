/**
 * MIT License
 *
 * Copyright (c) 2025 ygwyg
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { DurableObject } from 'cloudflare:workers';

export interface MerchantEnv {
  MERCHANT: DurableObjectNamespace<MerchantDO>;
  IMAGES?: R2Bucket;
  IMAGES_URL?: string;
  STORE_NAME?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export type WSEventType =
  | 'cart.updated'
  | 'cart.checked_out'
  | 'order.created'
  | 'order.updated'
  | 'order.shipped'
  | 'order.refunded'
  | 'inventory.updated'
  | 'inventory.low';

export interface WSEvent {
  type: WSEventType;
  data: unknown;
  timestamp: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('public', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- MULTI-REGION FOUNDATIONAL TABLES (must be before carts/orders)
-- ============================================================

CREATE TABLE IF NOT EXISTS currencies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT '$',
  decimal_places INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS countries (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  country_name TEXT NOT NULL,
  language_code TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tax_rates (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  country_code TEXT, -- ISO 3166-1 alpha-2 (e.g., 'FR', 'US'). NULL means fallback for all.
  tax_code TEXT,     -- e.g., 'txcd_99999999'. NULL means default rate.
  rate_percentage REAL NOT NULL, -- e.g., 20.0 for 20%
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT NOT NULL,
  country_code TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SHIPPING CLASSES (product-specific transport constraints)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipping_classes (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  resolution  TEXT NOT NULL DEFAULT 'exclusive'
              CHECK (resolution IN ('exclusive', 'additive')),
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  max_weight_g INTEGER,
  min_delivery_days INTEGER,
  max_delivery_days INTEGER,
  tax_code TEXT,
  tax_inclusive INTEGER NOT NULL DEFAULT 0,
  shipping_class_id TEXT REFERENCES shipping_classes(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipping_rate_prices (
  id TEXT PRIMARY KEY,
  shipping_rate_id TEXT NOT NULL REFERENCES shipping_rates(id) ON DELETE CASCADE,
  currency_id TEXT NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(shipping_rate_id, currency_id)
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  currency_id TEXT NOT NULL REFERENCES currencies(id),
  tax_inclusive INTEGER NOT NULL DEFAULT 0,
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

-- ============================================================
-- CORE PRODUCT TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT,
  shipping_class_id TEXT REFERENCES shipping_classes(id),
  vendor TEXT,
  tags TEXT,
  handle TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  weight_g INTEGER NOT NULL DEFAULT 0,
  dims_cm TEXT,
  requires_shipping INTEGER NOT NULL DEFAULT 1,
  barcode TEXT,
  compare_at_price_cents INTEGER,
  tax_code TEXT,
  image_url TEXT,
  shipping_class_id TEXT REFERENCES shipping_classes(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS variant_prices (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  currency_id TEXT NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(variant_id, currency_id)
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  on_hand INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('restock', 'correction', 'damaged', 'return', 'sale', 'release')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- CARTS & ORDERS (now safe - regions/warehouses exist)
-- ============================================================

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked_out', 'expired')),
  customer_email TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  region_id TEXT,
  stripe_checkout_session_id TEXT,
  discount_code TEXT,
  discount_id TEXT,
  discount_amount_cents INTEGER DEFAULT 0,
  shipping_rate_id TEXT,
  shipping_cents INTEGER DEFAULT 0,
  locale TEXT NOT NULL DEFAULT 'en-US',
  -- GAP-01: Shipping address fields
  shipping_name TEXT,
  shipping_line1 TEXT,
  shipping_line2 TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_postal_code TEXT,
  shipping_country TEXT,
  billing_same_as_shipping INTEGER DEFAULT 1,
  taxes_json TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id),
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD'
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'refunded', 'canceled')),
  customer_email TEXT NOT NULL,
  region_id TEXT,
  warehouse_id TEXT,
  shipping_name TEXT,
  shipping_phone TEXT,
  ship_to TEXT,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  shipping_rate_id TEXT,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  discount_code TEXT,
  discount_id TEXT,
  discount_amount_cents INTEGER DEFAULT 0,
  tracking_number TEXT,
  tracking_url TEXT,
  shipped_at TEXT,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  taxes_json TEXT,
  viewtoken TEXT,
  viewtoken_issued_at TEXT,
  confirmationemailsentat TEXT,
  confirmationemaillasterror TEXT,
  confirmationemailupdatedat TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discounts (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed_amount')),
  value INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  min_purchase_cents INTEGER DEFAULT 0,
  max_discount_cents INTEGER,
  starts_at TEXT,
  expires_at TEXT,
  usage_limit INTEGER,
  usage_limit_per_customer INTEGER DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  stripe_coupon_id TEXT,
  stripe_promotion_code_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  stripe_refund_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discount_usage (
  id TEXT PRIMARY KEY,
  discount_id TEXT NOT NULL REFERENCES discounts(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  customer_email TEXT NOT NULL,
  discount_amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  password_hash TEXT,
  email_verified_at TEXT,
  auth_provider TEXT,
  auth_provider_id TEXT,
  accepts_marketing INTEGER DEFAULT 0,
  locale TEXT DEFAULT 'en',
  metadata TEXT,
  order_count INTEGER DEFAULT 0,
  total_spent_cents INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_order_at TEXT
);

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

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT UNIQUE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  response_code INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_authorizations (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  state TEXT,
  code_challenge TEXT NOT NULL,
  customer_email TEXT,
  magic_token_hash TEXT,
  magic_expires_at TEXT,
  code_hash TEXT,
  code_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'used', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  access_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  scope TEXT NOT NULL,
  access_expires_at TEXT NOT NULL,
  refresh_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_carts_expires ON carts(expires_at);
CREATE INDEX IF NOT EXISTS idx_carts_status ON carts(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_discounts_code ON discounts(code);
CREATE INDEX IF NOT EXISTS idx_discounts_status ON discounts(status);
CREATE INDEX IF NOT EXISTS idx_discount_usage_order ON discount_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_discount_usage_customer ON discount_usage(discount_id, customer_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_usage_order_discount ON discount_usage(order_id, discount_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id ON oauth_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_authorizations_client ON oauth_authorizations(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_access ON oauth_tokens(access_token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_refresh ON oauth_tokens(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_customer ON oauth_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_email_created ON orders(customer_email, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(number);
CREATE INDEX IF NOT EXISTS idx_variants_status ON variants(status);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_sku_created ON inventory_logs(sku, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_last_order ON customers(last_order_at);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);
CREATE INDEX IF NOT EXISTS idx_events_stripe_event_id ON events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_events_type_processed ON events(type, processed_at);
CREATE INDEX IF NOT EXISTS idx_ucp_checkout_sessions_status ON ucp_checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ucp_checkout_sessions_stripe ON ucp_checkout_sessions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_ucp_checkout_sessions_expires ON ucp_checkout_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_currencies_code ON currencies(code);
CREATE INDEX IF NOT EXISTS idx_currencies_status ON currencies(status);
CREATE INDEX IF NOT EXISTS idx_countries_code ON countries(code);
CREATE INDEX IF NOT EXISTS idx_countries_status ON countries(status);
CREATE INDEX IF NOT EXISTS idx_warehouses_status ON warehouses(status);
CREATE INDEX IF NOT EXISTS idx_warehouses_priority ON warehouses(priority);
CREATE INDEX IF NOT EXISTS idx_shipping_classes_code ON shipping_classes(code);
CREATE INDEX IF NOT EXISTS idx_shipping_classes_status ON shipping_classes(status);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_status ON shipping_rates(status);
CREATE INDEX IF NOT EXISTS idx_regions_status ON regions(status);
CREATE INDEX IF NOT EXISTS idx_regions_default ON regions(is_default);
CREATE INDEX IF NOT EXISTS idx_regions_currency ON regions(currency_id);
CREATE INDEX IF NOT EXISTS idx_region_countries_region ON region_countries(region_id);
CREATE INDEX IF NOT EXISTS idx_region_countries_country ON region_countries(country_id);
CREATE INDEX IF NOT EXISTS idx_region_warehouses_region ON region_warehouses(region_id);
CREATE INDEX IF NOT EXISTS idx_region_warehouses_warehouse ON region_warehouses(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_region_shipping_rates_region ON region_shipping_rates(region_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_sku ON warehouse_inventory(sku);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse ON warehouse_inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_logs_sku ON warehouse_inventory_logs(sku, created_at);
CREATE INDEX IF NOT EXISTS idx_variant_prices_variant ON variant_prices(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_prices_currency ON variant_prices(currency_id);
CREATE INDEX IF NOT EXISTS idx_carts_region ON carts(region_id);
CREATE INDEX IF NOT EXISTS idx_orders_region ON orders(region_id);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_tax_rates_country ON tax_rates(country_code);
CREATE INDEX IF NOT EXISTS idx_tax_rates_tax_code ON tax_rates(tax_code);
`;

export class MerchantDO extends DurableObject<MerchantEnv> {
  private sql: SqlStorage;
  private sessions: Map<WebSocket, { topics: Set<string> }> = new Map();
  private initialized = false;
  private keysInitialized = false;

  constructor(ctx: DurableObjectState, env: MerchantEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }

  private async hashKey(key: string): Promise<string> {
    const data = new TextEncoder().encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private uuid(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    const statements = SCHEMA.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      this.sql.exec(stmt);
    }

    // Migration helper: ensure all pending migrations run.
    // This system uses a migrations table to track which migrations have been applied.
    try {
      const migrationsResult = this.sql.exec('SELECT name FROM migrations');
      const appliedMigrations = new Set(
        (migrationsResult.toArray() as Array<{ name: string }>).map((r) => r.name)
      );

      const migrations: Array<{ name: string; sql: string }> = [
        {
          name: 'viewtoken',
          sql: 'ALTER TABLE orders ADD COLUMN viewtoken TEXT',
        },
        {
          name: 'viewtoken_issued_at',
          sql: 'ALTER TABLE orders ADD COLUMN viewtoken_issued_at TEXT',
        },
        {
          name: 'confirmationemailsentat',
          sql: 'ALTER TABLE orders ADD COLUMN confirmationemailsentat TEXT',
        },
        {
          name: 'confirmationemaillasterror',
          sql: 'ALTER TABLE orders ADD COLUMN confirmationemaillasterror TEXT',
        },
        {
          name: 'confirmationemailupdatedat',
          sql: 'ALTER TABLE orders ADD COLUMN confirmationemailupdatedat TEXT',
        },
        // GAP-01: Shipping address fields on carts (migration 017)
        {
          name: 'cart_shipping_name',
          sql: 'ALTER TABLE carts ADD COLUMN shipping_name TEXT',
        },
        {
          name: 'cart_shipping_line1',
          sql: 'ALTER TABLE carts ADD COLUMN shipping_line1 TEXT',
        },
        {
          name: 'cart_shipping_line2',
          sql: 'ALTER TABLE carts ADD COLUMN shipping_line2 TEXT',
        },
        {
          name: 'cart_shipping_city',
          sql: 'ALTER TABLE carts ADD COLUMN shipping_city TEXT',
        },
        {
          name: 'cart_shipping_state',
          sql: 'ALTER TABLE carts ADD COLUMN shipping_state TEXT',
        },
        {
          name: 'cart_shipping_postal_code',
          sql: 'ALTER TABLE carts ADD COLUMN shipping_postal_code TEXT',
        },
        {
          name: 'cart_shipping_country',
          sql: 'ALTER TABLE carts ADD COLUMN shipping_country TEXT',
        },
        {
          name: 'cart_billing_same_as_shipping',
          sql: 'ALTER TABLE carts ADD COLUMN billing_same_as_shipping INTEGER DEFAULT 1',
        },
        // ─── Migration 018: Shipping classes ───────────────────────────────────
        // Allow products to belong to shipping classes that require specific rates.
        {
          name: 'shipping_classes_table',
          sql: `
            CREATE TABLE IF NOT EXISTS shipping_classes (
              id          TEXT PRIMARY KEY,
              code        TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              description TEXT,
              resolution  TEXT NOT NULL DEFAULT 'exclusive'
                          CHECK (resolution IN ('exclusive', 'additive')),
              status      TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive')),
              created_at  TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `,
        },
        {
          name: 'shipping_classes_idx_code',
          sql: 'CREATE INDEX IF NOT EXISTS idx_shipping_classes_code ON shipping_classes (code)',
        },
        {
          name: 'shipping_classes_idx_status',
          sql: 'CREATE INDEX IF NOT EXISTS idx_shipping_classes_status ON shipping_classes (status)',
        },
        {
          name: 'products_add_shipping_class_id',
          sql: 'ALTER TABLE products ADD COLUMN shipping_class_id TEXT',
        },
        {
          name: 'variants_add_shipping_class_id',
          sql: 'ALTER TABLE variants ADD COLUMN shipping_class_id TEXT',
        },
        {
          name: 'shipping_rates_add_shipping_class_id',
          sql: 'ALTER TABLE shipping_rates ADD COLUMN shipping_class_id TEXT',
        },
        {
          name: 'idx_products_shipping_class',
          sql: 'CREATE INDEX IF NOT EXISTS idx_products_shipping_class ON products (shipping_class_id)',
        },
        {
          name: 'idx_variants_shipping_class',
          sql: 'CREATE INDEX IF NOT EXISTS idx_variants_shipping_class ON variants (shipping_class_id)',
        },
        {
          name: 'idx_shipping_rates_shipping_class',
          sql: 'CREATE INDEX IF NOT EXISTS idx_shipping_rates_shipping_class ON shipping_rates (shipping_class_id)',
        },
        // ── Migration 019 ── Variant enrichment ───────────────────────────────
        // Add requiresshipping (blocking for shipping calculation) and optional
        // enrichment fields: barcode, compare_at_price_cents, tax_code.
        // Also adds vendor, tags, handle to products.
        {
          name: 'variants_add_requires_shipping',
          sql: 'ALTER TABLE variants ADD COLUMN requires_shipping INTEGER NOT NULL DEFAULT 1',
        },
        {
          name: 'variants_add_barcode',
          sql: 'ALTER TABLE variants ADD COLUMN barcode TEXT',
        },
        {
          name: 'variants_add_compare_at_price_cents',
          sql: 'ALTER TABLE variants ADD COLUMN compare_at_price_cents INTEGER',
        },
        {
          name: 'variants_add_tax_code',
          sql: 'ALTER TABLE variants ADD COLUMN tax_code TEXT',
        },
        {
          name: 'products_add_vendor',
          sql: 'ALTER TABLE products ADD COLUMN vendor TEXT',
        },
        {
          name: 'products_add_tags',
          sql: 'ALTER TABLE products ADD COLUMN tags TEXT',
        },
        {
          name: 'products_add_handle',
          // SQLite does not allow adding a UNIQUE column via ALTER TABLE.
          // Create a regular TEXT column and enforce uniqueness with an index.
          sql: 'ALTER TABLE products ADD COLUMN handle TEXT',
        },
        {
          name: 'idx_variants_requires_shipping',
          sql: 'CREATE INDEX IF NOT EXISTS idx_variants_requires_shipping ON variants(requires_shipping)',
        },
        {
          name: 'idx_variants_barcode',
          sql: 'CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode)',
        },
        {
          name: 'idx_products_vendor',
          sql: 'CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor)',
        },
        {
          name: 'idx_products_handle',
          // Enforce uniqueness for non-null handles.
          sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_products_handle ON products(handle) WHERE handle IS NOT NULL',
        },
        {
          name: '020_add_tax_rates',
          sql: `CREATE TABLE IF NOT EXISTS tax_rates (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            country_code TEXT,
            tax_code TEXT,
            rate_percentage REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
            created_at TEXT NOT NULL DEFAULT datetime('now'),
            updated_at TEXT NOT NULL DEFAULT datetime('now')
          );`,
        },
        {
          name: 'idx_tax_rates_country',
          sql: `CREATE INDEX IF NOT EXISTS idx_tax_rates_country ON tax_rates(country_code);`,
        },
        {
          name: 'idx_tax_rates_tax_code',
          sql: `CREATE INDEX IF NOT EXISTS idx_tax_rates_tax_code ON tax_rates(tax_code);`,
        },
        {
          name: 'carts_add_locale',
          sql: "ALTER TABLE carts ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US'",
        },
        {
          name: '021_regions_add_tax_inclusive',
          sql: "ALTER TABLE regions ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 0",
        },
        {
          name: '022_add_taxes_json',
          sql: "ALTER TABLE carts ADD COLUMN taxes_json TEXT; ALTER TABLE orders ADD COLUMN taxes_json TEXT;",
        },
        {
          name: '023_shipping_rates_add_tax_code',
          sql: "ALTER TABLE shipping_rates ADD COLUMN tax_code TEXT",
        },
        {
          name: '024_shipping_rates_add_tax_inclusive',
          sql: "ALTER TABLE shipping_rates ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 0",
        },
        // ── Migration 025 ── Customer Auth0 sub lookup indexes ────────────────
        // Fast lookup for resolving customers from Auth0 JWT 'sub' claim.
        {
          name: '025_idx_customers_auth_provider_id',
          sql: 'CREATE INDEX IF NOT EXISTS idx_customers_auth_provider_id ON customers(auth_provider_id)',
        },
        {
          name: '025_idx_customers_email',
          sql: 'CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)',
        },
      ];

      for (const migration of migrations) {
        if (!appliedMigrations.has(migration.name)) {
          try {
            this.sql.exec(migration.sql);
            this.sql.exec('INSERT INTO migrations (name) VALUES (?)', migration.name);
          } catch (e) {
            // If migration fails (e.g., column already exists or SQLite rejects a unique constraint on ALTER TABLE),
            // mark it as applied anyway so we don't continuously re-run failing SQL.
            try {
              this.sql.exec('INSERT INTO migrations (name) VALUES (?)', migration.name);
            } catch {
              // Already recorded
            }
          }
        }
      }

      // Some migration runs may have been marked applied even if the SQL failed.
      // Ensure key schema changes are present regardless.
      try {
        const hasHandle = (this.sql.exec('PRAGMA table_info(products)').toArray() as Array<{ name: string }>).
          some((c) => c.name === 'handle');
        if (!hasHandle) {
          this.sql.exec('ALTER TABLE products ADD COLUMN handle TEXT');
        }
      } catch {
        // Ignore if products table doesn't exist yet.
      }

      // Ensure we have an index for fast lookup and to prevent token collisions.
      this.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_viewtoken ON orders(viewtoken)');
      
      // Index for filtering carts by destination country (GAP-01)
      this.sql.exec('CREATE INDEX IF NOT EXISTS idx_carts_shipping_country ON carts(shipping_country)');
    } catch {
      // If table doesn't exist yet or sqlite doesn't support the operation, ignore.
    }

    this.initialized = true;
  }

  private async initializeDefaultKeys(): Promise<void> {
    if (this.keysInitialized) return;

    const merchantSk = (this.env as any).MERCHANT_SK;
    const merchantPk = (this.env as any).MERCHANT_PK;

    if (merchantSk) {
      const skHash = await this.hashKey(merchantSk);
      try {
        this.sql.exec(
          `INSERT OR IGNORE INTO api_keys (id, key_hash, key_prefix, role, created_at) 
           VALUES (?, ?, ?, 'admin', datetime('now'))`,
          this.uuid(),
          skHash,
          'sk_' + merchantSk.substring(3, 8)
        );
      } catch (e) {
        // Key already exists, ignore
      }
    }

    if (merchantPk) {
      const pkHash = await this.hashKey(merchantPk);
      try {
        this.sql.exec(
          `INSERT OR IGNORE INTO api_keys (id, key_hash, key_prefix, role, created_at) 
           VALUES (?, ?, ?, 'public', datetime('now'))`,
          this.uuid(),
          pkHash,
          'pk_' + merchantPk.substring(3, 8)
        );
      } catch (e) {
        // Key already exists, ignore
      }
    }

    this.keysInitialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    this.ensureInitialized();
    await this.initializeDefaultKeys();

    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, storage: 'sqlite' });
    }

    return new Response('Not found', { status: 404 });
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    this.ensureInitialized();
    const cursor = this.sql.exec(sql, ...params);
    return cursor.toArray() as T[];
  }

  run(sql: string, params: unknown[] = []): { changes: number } {
    this.ensureInitialized();
    this.sql.exec(sql, ...params);
    const [result] = this.sql.exec('SELECT changes() as changes').toArray() as [{ changes: number }];
    return { changes: result.changes };
  }

  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url);
    const topics = url.searchParams.get('topics')?.split(',') || ['*'];

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    this.sessions.set(server, { topics: new Set(topics) });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data = JSON.parse(message as string);
      const session = this.sessions.get(ws);
      if (!session) return;

      if (data.action === 'subscribe' && data.topic) {
        session.topics.add(data.topic);
      } else if (data.action === 'unsubscribe' && data.topic) {
        session.topics.delete(data.topic);
      }
    } catch {}
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  broadcast(event: WSEvent): void {
    const message = JSON.stringify(event);
    const eventTopic = event.type.split('.')[0];

    for (const [ws, session] of this.sessions) {
      if (session.topics.has('*') || session.topics.has(eventTopic) || session.topics.has(event.type)) {
        try {
          ws.send(message);
        } catch {
          this.sessions.delete(ws);
        }
      }
    }
  }

  async cleanupExpiredCarts(): Promise<number> {
    this.ensureInitialized();

    const now = new Date().toISOString();

    const expiredCarts = this.query<{ id: string }>(
      `SELECT id FROM carts WHERE status = 'open' AND expires_at < ?`,
      [now]
    );

    if (expiredCarts.length === 0) return 0;

    const cartIds = expiredCarts.map((c) => c.id);
    const placeholders = cartIds.map(() => '?').join(',');

    const reservedItems = this.query<{ sku: string; qty: number }>(
      `SELECT sku, SUM(qty) as qty FROM cart_items WHERE cart_id IN (${placeholders}) GROUP BY sku`,
      cartIds
    );

    for (const item of reservedItems) {
      this.run(`UPDATE inventory SET reserved = reserved - ? WHERE sku = ?`, [item.qty, item.sku]);
    }

    this.run(`UPDATE carts SET status = 'expired' WHERE id IN (${placeholders})`, cartIds);
    this.run(`DELETE FROM cart_items WHERE cart_id IN (${placeholders})`, cartIds);

    return expiredCarts.length;
  }
}
