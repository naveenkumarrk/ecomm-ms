
DROP TABLE IF EXISTS product_stock;
CREATE TABLE product_stock (
  product_id TEXT PRIMARY KEY,
  stock INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE INDEX idx_stock_updated ON product_stock(updated_at);

DROP TABLE IF EXISTS reservations;
CREATE TABLE reservations (
  reservation_id TEXT PRIMARY KEY,
  user_id TEXT,                         -- Optional for guest checkout
  cart_id TEXT,
  items TEXT,                           -- JSON array
  status TEXT,                          -- active, committed, released, expired
  expires_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_reservations_user ON reservations(user_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_expires ON reservations(expires_at);

-- Initial stock
INSERT INTO product_stock (product_id, stock, reserved, updated_at)
VALUES
  ('pro_iphone14', 20, 0, strftime('%s','now')),
  ('pro_macbookair', 10, 0, strftime('%s','now')),
  ('pro_watchx', 50, 0, strftime('%s','now'));
