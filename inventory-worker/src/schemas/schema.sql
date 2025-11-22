-- INVENTORY DATABASE SEED

DROP TABLE IF EXISTS product_stock;
DROP TABLE IF EXISTS reservations;

CREATE TABLE product_stock (
  product_id TEXT PRIMARY KEY,
  stock INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE TABLE reservations (
  reservation_id TEXT PRIMARY KEY,
  user_id TEXT,
  cart_id TEXT,
  items TEXT,
  status TEXT,
  expires_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_res_status ON reservations(status);
CREATE INDEX idx_res_expires ON reservations(expires_at);


-- Initial stock (you can adjust)
INSERT INTO product_stock (product_id, stock, reserved, updated_at)
VALUES
  ('pro_iphone14', 20, 0, strftime('%s','now')),
  ('pro_macbookair', 10, 0, strftime('%s','now')),
  ('pro_watchx', 50, 0, strftime('%s','now'));

