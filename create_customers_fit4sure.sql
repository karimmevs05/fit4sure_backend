-- Create customer profiles in fit4sure database
-- Using correct column names from fit4sure schema

INSERT INTO users (email, display_name, phone_number, role, created_at)
VALUES
  ('drew@fit4sure.com', 'Drew', '555-0001', 'customer', NOW()),
  ('kelly@fit4sure.com', 'Kelly', '555-0002', 'customer', NOW()),
  ('kelly.large@fit4sure.com', 'Kelly Large', '555-0003', 'customer', NOW()),
  ('joe@fit4sure.com', 'Joe', '555-0004', 'customer', NOW()),
  ('ann@fit4sure.com', 'Ann', '555-0005', 'customer', NOW()),
  ('daniel.k@fit4sure.com', 'Daniel K', '555-0006', 'customer', NOW()),
  ('sydney@fit4sure.com', 'Sydney', '555-0007', 'customer', NOW()),
  ('chris@fit4sure.com', 'Chris', '555-0008', 'customer', NOW()),
  ('andy@fit4sure.com', 'Andy', '555-0009', 'customer', NOW()),
  ('henning@fit4sure.com', 'Henning', '555-0010', 'customer', NOW()),
  ('jane.doe@fit4sure.com', 'Jane Doe', '555-0011', 'customer', NOW()),
  ('felicia.normal@fit4sure.com', 'Felicia Normal', '555-0012', 'customer', NOW()),
  ('felicia.nocarbs@fit4sure.com', 'Felicia NoCarbs', '555-0013', 'customer', NOW()),
  ('alejandro@fit4sure.com', 'Alejandro', '555-0014', 'customer', NOW()),
  ('bruce@fit4sure.com', 'Bruce', '555-0015', 'customer', NOW()),
  ('robert@fit4sure.com', 'Robert', '555-0016', 'customer', NOW()),
  ('brooke@fit4sure.com', 'Brooke', '555-0017', 'customer', NOW()),
  ('zoey@fit4sure.com', 'Zoey', '555-0018', 'customer', NOW()),
  ('airea@fit4sure.com', 'Airea', '555-0019', 'customer', NOW());
