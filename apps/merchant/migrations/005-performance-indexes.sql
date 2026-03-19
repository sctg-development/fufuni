-- ============================================================
-- PERFORMANCE OPTIMIZATIONS FOR MERCHANT DATABASE
-- Run this after schema-d1.sql to add missing indexes
-- ============================================================

-- Additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_email_created ON orders(customer_email, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(number);
CREATE INDEX IF NOT EXISTS idx_variants_status ON variants(status);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_sku_created ON inventory_logs(sku, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_last_order ON customers(last_order_at);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);
CREATE INDEX IF NOT EXISTS idx_events_stripe_event_id ON events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_carts_store_status_expires ON carts(store_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_variants_store_status ON variants(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_store_status_created ON orders(store_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_discount_usage_discount_created ON discount_usage(discount_id, created_at);

-- Partial indexes for better performance on filtered queries
CREATE INDEX IF NOT EXISTS idx_orders_pending ON orders(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_orders_processing ON orders(created_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_carts_open ON carts(expires_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory(store_id, on_hand, reserved) WHERE on_hand - reserved <= 10;
CREATE INDEX IF NOT EXISTS idx_discounts_active ON discounts(store_id) WHERE status = 'active';

-- Covering indexes for frequently accessed data
CREATE INDEX IF NOT EXISTS idx_products_list_covering ON products(store_id, status, id, title, created_at);
CREATE INDEX IF NOT EXISTS idx_variants_list_covering ON variants(store_id, status, sku, price_cents, title);
CREATE INDEX IF NOT EXISTS idx_orders_list_covering ON orders(store_id, created_at, id, number, status, customer_email, total_cents);