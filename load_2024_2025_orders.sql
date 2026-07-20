-- Load 2024 customer orders from meal sheets
-- Week 1.7 (2024-01-07)
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity) 
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c 
WHERE m.week_label = '2024-01-07' AND c.name = 'Taylor'
ON CONFLICT DO NOTHING;

-- Insert orders for all 2024 weeks with customer meal counts
-- Joe: 102 meals spread across ~26 weeks (avg 4 meals/week)
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Joe'
ON CONFLICT DO NOTHING;

-- Drew: 64 meals (avg 2.5/week)
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Drew'
ON CONFLICT DO NOTHING;

-- Brandon: 58 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Brandon'
ON CONFLICT DO NOTHING;

-- Christine: 56 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Christine'
ON CONFLICT DO NOTHING;

-- Tim: 56 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Tim'
ON CONFLICT DO NOTHING;

-- Mrs Tim: 56 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Mrs Tim'
ON CONFLICT DO NOTHING;

-- Andy: 54 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Andy'
ON CONFLICT DO NOTHING;

-- Bruce: 53 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Bruce'
ON CONFLICT DO NOTHING;

-- Fabian: 51 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Fabian'
ON CONFLICT DO NOTHING;

-- Claudia: 51 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Claudia'
ON CONFLICT DO NOTHING;

-- Caro: 51 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Caro'
ON CONFLICT DO NOTHING;

-- Jenn: 51 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Jenn'
ON CONFLICT DO NOTHING;

-- Taylor: 50 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Taylor'
ON CONFLICT DO NOTHING;

-- M. Mack: 44 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'M. Mack'
ON CONFLICT DO NOTHING;

-- Krishna: 41 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Krishna'
ON CONFLICT DO NOTHING;

-- Aixa: 39 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Aixa'
ON CONFLICT DO NOTHING;

-- CC: 39 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'CC'
ON CONFLICT DO NOTHING;

-- Emily: 35 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Emily'
ON CONFLICT DO NOTHING;

-- Meghan: 35 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Meghan'
ON CONFLICT DO NOTHING;

-- Becky: 34 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Becky'
ON CONFLICT DO NOTHING;

-- Becky Kid: 34 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Becky Kid'
ON CONFLICT DO NOTHING;

-- Billy: 26 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Billy'
ON CONFLICT DO NOTHING;

-- Jacqui: 26 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Jacqui'
ON CONFLICT DO NOTHING;

-- Dr Dane: 24 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2024-%' AND c.name = 'Dr Dane'
ON CONFLICT DO NOTHING;

-- Cecily: 4 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label = '2024-07-07' AND c.name = 'Cecily'
ON CONFLICT DO NOTHING;

-- Jasmine: 4 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label = '2024-06-30' AND c.name = 'Jasmine'
ON CONFLICT DO NOTHING;

-- Lauren: 2 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label = '2024-01-14' AND c.name = 'Lauren'
ON CONFLICT DO NOTHING;

-- Now load 2025 data similarly
-- Joe: 58 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Joe'
ON CONFLICT DO NOTHING;

-- Thomas: 50 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Thomas'
ON CONFLICT DO NOTHING;

-- Drew: 46 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Drew'
ON CONFLICT DO NOTHING;

-- Taylor: 44 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Taylor'
ON CONFLICT DO NOTHING;

-- Andy: 44 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Andy'
ON CONFLICT DO NOTHING;

-- Alejandro: 41 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Alejandro'
ON CONFLICT DO NOTHING;

-- Bruce: 39 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Bruce'
ON CONFLICT DO NOTHING;

-- Krishna: 36 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Krishna'
ON CONFLICT DO NOTHING;

-- Ann: 35 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Ann'
ON CONFLICT DO NOTHING;

-- Zoey: 35 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Zoey'
ON CONFLICT DO NOTHING;

-- Daniel K: 34 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Daniel K'
ON CONFLICT DO NOTHING;

-- Robert: 32 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Robert'
ON CONFLICT DO NOTHING;

-- Sira/Rayan: 31 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Sira/Rayan'
ON CONFLICT DO NOTHING;

-- Meghan: 30 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Meghan'
ON CONFLICT DO NOTHING;

-- Brandon: 24 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Brandon'
ON CONFLICT DO NOTHING;

-- Nick: 22 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Nick'
ON CONFLICT DO NOTHING;

-- Brooke: 20 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Brooke'
ON CONFLICT DO NOTHING;

-- Airea: 20 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c
WHERE m.week_label LIKE '2025-%' AND c.name = 'Airea'
ON CONFLICT DO NOTHING;
