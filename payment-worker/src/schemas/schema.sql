-- PAYMENTS DATABASE SEED

DROP TABLE IF EXISTS payments;

CREATE TABLE payments (
  payment_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  provider TEXT,
  provider_order_id TEXT,
  provider_capture_id TEXT,
  user_id TEXT,
  email TEXT,
  amount REAL,
  currency TEXT,
  status TEXT,
  raw_provider TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_reservation_id ON payments(reservation_id);
