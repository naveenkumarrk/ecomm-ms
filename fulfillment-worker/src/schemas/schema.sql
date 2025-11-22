-- WAREHOUSE DATABASE

DROP TABLE IF EXISTS warehouses;

CREATE TABLE warehouses (
  warehouse_id TEXT PRIMARY KEY,
  name TEXT,
  zone TEXT,
  pincode TEXT,
  handling_hours INTEGER,
  cutoff_hour INTEGER,
  priority INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

INSERT INTO warehouses (warehouse_id, name, zone, pincode, handling_hours, cutoff_hour, priority, created_at, updated_at)
VALUES
  ('wh_mumbai', 'Mumbai Warehouse', 'MUM', '400001', 24, 16, 0, strftime('%s','now'), strftime('%s','now')),
  ('wh_delhi', 'Delhi Warehouse', 'DEL', '110001', 24, 16, 1, strftime('%s','now'), strftime('%s','now'));
