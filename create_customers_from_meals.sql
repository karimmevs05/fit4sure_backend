-- Create customer profiles from meal count sheet
-- All data goes to fit4sure database

INSERT INTO users (first_name, last_name, email, phone, role, diet_profile_id, created_at)
VALUES
  ('Drew', 'Customer', 'drew@fit4sure.com', '555-0001', 'customer', NULL, NOW()),
  ('Kelly', 'Customer', 'kelly@fit4sure.com', '555-0002', 'customer', NULL, NOW()),
  ('Kelly', 'Large', 'kelly.large@fit4sure.com', '555-0003', 'customer', NULL, NOW()),
  ('Joe', 'Customer', 'joe@fit4sure.com', '555-0004', 'customer', NULL, NOW()),
  ('Ann', 'Customer', 'ann@fit4sure.com', '555-0005', 'customer', NULL, NOW()),
  ('Daniel', 'K', 'daniel.k@fit4sure.com', '555-0006', 'customer', NULL, NOW()),
  ('Sydney', 'Customer', 'sydney@fit4sure.com', '555-0007', 'customer', NULL, NOW()),
  ('Chris', 'Customer', 'chris@fit4sure.com', '555-0008', 'customer', NULL, NOW()),
  ('Andy', 'Customer', 'andy@fit4sure.com', '555-0009', 'customer', NULL, NOW()),
  ('Henning', 'Customer', 'henning@fit4sure.com', '555-0010', 'customer', NULL, NOW()),
  ('Jane', 'Doe', 'jane.doe@fit4sure.com', '555-0011', 'customer', NULL, NOW()),
  ('Felicia', 'Normal', 'felicia.normal@fit4sure.com', '555-0012', 'customer', NULL, NOW()),
  ('Felicia', 'NoCarbs', 'felicia.nocarbs@fit4sure.com', '555-0013', 'customer', NULL, NOW()),
  ('Alejandro', 'Customer', 'alejandro@fit4sure.com', '555-0014', 'customer', NULL, NOW()),
  ('Bruce', 'Customer', 'bruce@fit4sure.com', '555-0015', 'customer', NULL, NOW()),
  ('Robert', 'Customer', 'robert@fit4sure.com', '555-0016', 'customer', NULL, NOW()),
  ('Brooke', 'Customer', 'brooke@fit4sure.com', '555-0017', 'customer', NULL, NOW()),
  ('Zoey', 'Customer', 'zoey@fit4sure.com', '555-0018', 'customer', NULL, NOW()),
  ('Airea', 'Customer', 'airea@fit4sure.com', '555-0019', 'customer', NULL, NOW());
