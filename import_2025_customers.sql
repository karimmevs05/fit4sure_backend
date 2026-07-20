-- Import 2025 customers not already in database as prospects
-- Using fit4sure database only

-- Insert new customers from 2025 sheet as prospects
INSERT INTO users (email, display_name, phone_number, role, created_at)
VALUES
  ('taylor@fit4sure.com', 'Taylor', '555-0020', 'customer', NOW()),
  ('krishna@fit4sure.com', 'Krishna', '555-0021', 'customer', NOW()),
  ('meghan@fit4sure.com', 'Meghan', '555-0022', 'customer', NOW()),
  ('nick@fit4sure.com', 'Nick', '555-0023', 'customer', NOW()),
  ('alejandro.large@fit4sure.com', 'Alejandro Large', '555-0024', 'customer', NOW()),
  ('brandon@fit4sure.com', 'Brandon', '555-0025', 'customer', NOW()),
  ('daniel.k2@fit4sure.com', 'Daniel K', '555-0026', 'customer', NOW()),
  ('dr.andy@fit4sure.com', 'Dr Andy', '555-0027', 'customer', NOW()),
  ('phillipe@fit4sure.com', 'Phillipe', '555-0028', 'customer', NOW()),
  ('daniel.m@fit4sure.com', 'Daniel M', '555-0029', 'customer', NOW()),
  ('thomas@fit4sure.com', 'Thomas', '555-0030', 'customer', NOW()),
  ('tonya@fit4sure.com', 'Tonya', '555-0031', 'customer', NOW()),
  ('sira.rayan@fit4sure.com', 'Sira/Rayan', '555-0032', 'customer', NOW()),
  ('jason@fit4sure.com', 'Jason', '555-0033', 'customer', NOW())
ON CONFLICT (email) DO NOTHING;
