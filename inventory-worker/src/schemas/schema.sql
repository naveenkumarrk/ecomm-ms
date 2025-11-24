
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

-- Initial stock for 30 products
INSERT INTO product_stock (product_id, stock, reserved, updated_at)
VALUES
  ('pro_neural_v2_001', 5, 0, strftime('%s','now')),
  ('pro_neural_mk1_002', 8, 0, strftime('%s','now')),
  ('pro_sony_mdr_003', 3, 0, strftime('%s','now')),
  ('pro_akg_k240_004', 12, 0, strftime('%s','now')),
  ('pro_apple_ii_005', 2, 0, strftime('%s','now')),
  ('pro_commodore_64_006', 6, 0, strftime('%s','now')),
  ('pro_gameboy_007', 4, 0, strftime('%s','now')),
  ('pro_rabbit_r1_008', 10, 0, strftime('%s','now')),
  ('pro_quantum_pad_009', 1, 0, strftime('%s','now')),
  ('pro_holo_display_010', 7, 0, strftime('%s','now')),
  ('pro_polaroid_600_011', 15, 0, strftime('%s','now')),
  ('pro_ibm_model_m_012', 9, 0, strftime('%s','now')),
  ('pro_atari_2600_013', 11, 0, strftime('%s','now')),
  ('pro_ai_pet_014', 8, 0, strftime('%s','now')),
  ('pro_hp_calc_015', 20, 0, strftime('%s','now')),
  ('pro_cyber_glove_016', 6, 0, strftime('%s','now')),
  ('pro_zenith_trans_017', 4, 0, strftime('%s','now')),
  ('pro_quantum_drive_018', 2, 0, strftime('%s','now')),
  ('pro_olivetti_019', 10, 0, strftime('%s','now')),
  ('pro_ai_art_020', 7, 0, strftime('%s','now')),
  ('pro_sony_walkman_021', 3, 0, strftime('%s','now')),
  ('pro_vr_cyber_022', 5, 0, strftime('%s','now')),
  ('pro_palm_pilot_023', 14, 0, strftime('%s','now')),
  ('pro_quantum_watch_024', 1, 0, strftime('%s','now')),
  ('pro_moog_synth_025', 2, 0, strftime('%s','now')),
  ('pro_ai_trans_026', 13, 0, strftime('%s','now')),
  ('pro_crt_monitor_027', 8, 0, strftime('%s','now')),
  ('pro_cyber_implant_028', 1, 0, strftime('%s','now')),
  ('pro_floppy_drive_029', 16, 0, strftime('%s','now')),
  ('pro_ai_home_030', 12, 0, strftime('%s','now'));
