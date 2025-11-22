-- PRODUCTS DATABASE SEED

DROP TABLE IF EXISTS products;

CREATE TABLE products (
  product_id TEXT PRIMARY KEY,
  sku TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  images TEXT,
  metadata TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- Example products (no stock here)
INSERT INTO products (product_id, sku, title, description, category, images, metadata, created_at, updated_at)
VALUES
  ('pro_iphone14', 'IP14', 'iPhone 14', '128GB, Blue', 'electronics', '["https://example.com/iphone.jpg"]', '{"price":79999}', strftime('%s','now'), strftime('%s','now')),
  ('pro_macbookair', 'MBA2024', 'MacBook Air M3', '13-inch, 16GB RAM', 'electronics', '["https://example.com/macair.jpg"]', '{"price":124999}', strftime('%s','now'), strftime('%s','now')),
  ('pro_watchx', 'WATCHX', 'Smart Watch X', 'Fitness smartwatch', 'wearables', '["https://example.com/watch.jpg"]', '{"price":4999}', strftime('%s','now'), strftime('%s','now'));
