-- ORDERS DATABASE SEED

DROP TABLE IF EXISTS orders;

CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  reservation_id TEXT UNIQUE,
  user_id TEXT,
  email TEXT,
  amount REAL,
  currency TEXT,
  status TEXT,
  items_json TEXT,
  address_json TEXT,
  shipping_json TEXT,
  payment_json TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
