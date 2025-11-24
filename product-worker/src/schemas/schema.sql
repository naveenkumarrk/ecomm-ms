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