DROP TABLE IF EXISTS orders;
CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  reservation_id TEXT UNIQUE,
  user_id TEXT NOT NULL,                -- REQUIRED for auth
  email TEXT,
  amount REAL,
  currency TEXT,
  status TEXT,                          -- paid, shipped, delivered, cancelled
  items_json TEXT,
  address_json TEXT,
  shipping_json TEXT,
  payment_json TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);