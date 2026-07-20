-- Import 2024 customers not already in database as prospects
-- Using fit4sure database only

-- Insert new customers from 2024 sheet as prospects
INSERT INTO users (email, display_name, phone_number, role, created_at)
VALUES
  ('christine@fit4sure.com', 'Christine', '555-0034', 'customer', NOW()),
  ('billy@fit4sure.com', 'Billy', '555-0035', 'customer', NOW()),
  ('jacqui@fit4sure.com', 'Jacqui', '555-0036', 'customer', NOW()),
  ('becky@fit4sure.com', 'Becky', '555-0037', 'customer', NOW()),
  ('becky.kid@fit4sure.com', 'Becky Kid', '555-0038', 'customer', NOW()),
  ('dr.dane@fit4sure.com', 'Dr Dane', '555-0039', 'customer', NOW()),
  ('fabian@fit4sure.com', 'Fabian', '555-0040', 'customer', NOW()),
  ('aixa@fit4sure.com', 'Aixa', '555-0041', 'customer', NOW()),
  ('lauren@fit4sure.com', 'Lauren', '555-0042', 'customer', NOW()),
  ('claudia@fit4sure.com', 'Claudia', '555-0043', 'customer', NOW()),
  ('caro@fit4sure.com', 'Caro', '555-0044', 'customer', NOW()),
  ('jenn@fit4sure.com', 'Jenn', '555-0045', 'customer', NOW()),
  ('denisa@fit4sure.com', 'Denisa', '555-0046', 'customer', NOW()),
  ('m.mack@fit4sure.com', 'M. Mack', '555-0047', 'customer', NOW()),
  ('cecily@fit4sure.com', 'Cecily', '555-0048', 'customer', NOW()),
  ('tim@fit4sure.com', 'Tim', '555-0049', 'customer', NOW()),
  ('mrs.tim@fit4sure.com', 'Mrs Tim', '555-0050', 'customer', NOW()),
  ('emily@fit4sure.com', 'Emily', '555-0051', 'customer', NOW()),
  ('jasmine@fit4sure.com', 'Jasmine', '555-0052', 'customer', NOW()),
  ('martin@fit4sure.com', 'Martin', '555-0053', 'customer', NOW()),
  ('cc@fit4sure.com', 'CC', '555-0054', 'customer', NOW()),
  ('sira@fit4sure.com', 'Sira/Rayan', '555-0055', 'customer', NOW()),
  ('meghan@fit4sure.com', 'Meghan', '555-0056', 'customer', NOW()),
  ('karim@fit4sure.com', 'Karim', '555-0057', 'customer', NOW()),
  ('papa@fit4sure.com', 'Papa', '555-0058', 'customer', NOW()),
  ('thomas@fit4sure.com', 'Thomas', '555-0059', 'customer', NOW())
ON CONFLICT (email) DO NOTHING;
