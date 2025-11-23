DROP TABLE IF EXISTS products;
CREATE TABLE products (
  product_id TEXT PRIMARY KEY,
  sku TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  images TEXT,                          -- JSON array
  metadata TEXT,                        -- JSON: {price, attributes, etc}
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_sku ON products(sku);

-- Sample products
INSERT INTO products (product_id, sku, title, description, category, images, metadata, created_at, updated_at)
VALUES
  (
    'pro_iphone14', 
    'IP14', 
    'iPhone 14', 
    '128GB, Blue', 
    'electronics', 
    '["https://example.com/iphone.jpg"]', 
    '{"price":79999,"attributes":{"color":"Blue","storage":"128GB"},"weight":0.2}', 
    strftime('%s','now'), 
    strftime('%s','now')
  ),
  (
    'pro_macbookair', 
    'MBA2024', 
    'MacBook Air M3', 
    '13-inch, 16GB RAM', 
    'electronics', 
    '["https://example.com/macair.jpg"]', 
    '{"price":124999,"attributes":{"ram":"16GB","screen":"13inch"},"weight":1.2}', 
    strftime('%s','now'), 
    strftime('%s','now')
  ),
  (
    'pro_watchx', 
    'WATCHX', 
    'Smart Watch X', 
    'Fitness smartwatch', 
    'wearables', 
    '["https://example.com/watch.jpg"]', 
    '{"price":4999,"attributes":{"type":"fitness"},"weight":0.05}', 
    strftime('%s','now'), 
    strftime('%s','now')
  );
