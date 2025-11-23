DROP TABLE IF EXISTS payments;
CREATE TABLE payments (
  payment_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  user_id TEXT NOT NULL,                -- REQUIRED for auth
  email TEXT,
  amount REAL,
  currency TEXT,
  status TEXT,                          -- pending, captured, failed
  metadata_json TEXT,
  raw_paypal TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_reservation ON payments(reservation_id);
CREATE INDEX idx_payments_paypal_order ON payments(paypal_order_id);
CREATE INDEX idx_payments_status ON payments(status);
