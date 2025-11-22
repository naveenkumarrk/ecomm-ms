INSERT INTO products (product_id, sku, title, description, category, images, metadata, created_at, updated_at) VALUES
('pro_001', 'SKU001', 'Laptop', 'High performance laptop', 'Electronics', '["https://example.com/laptop.jpg"]', '{"price": 999.99, "weight": 2.5}', strftime('%s','now'), strftime('%s','now')),
('pro_002', 'SKU002', 'Mouse', 'Wireless mouse', 'Electronics', '["https://example.com/mouse.jpg"]', '{"price": 29.99, "weight": 0.2}', strftime('%s','now'), strftime('%s','now')),
('pro_003', 'SKU003', 'Keyboard', 'Mechanical keyboard', 'Electronics', '["https://example.com/keyboard.jpg"]', '{"price": 79.99, "weight": 1.0}', strftime('%s','now'), strftime('%s','now'));
