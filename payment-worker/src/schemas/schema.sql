DROP TABLE IF EXISTS payments;

CREATE TABLE payments (
  payment_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,

  -- PayPal-specific fields
  paypal_order_id TEXT,
  paypal_capture_id TEXT,

  user_id TEXT,
  email TEXT,

  amount REAL,
  currency TEXT,
  status TEXT,

  -- full PayPal JSON data
  metadata_json TEXT,
  raw_paypal TEXT,

  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_reservation_id ON payments(reservation_id);
CREATE INDEX idx_paypal_order_id ON payments(paypal_order_id);
