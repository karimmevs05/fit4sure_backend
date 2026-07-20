-- Load 2026 orders from meal sheets (Week of 1.18 through Week of 7.12)
-- Only customers with orders in Week of 7.12 should be marked as "active"
-- All others become "prospect_lost" or inactive

-- Week of 1.18: Alejandro(0), Drew(0), Bruce(2), Joe(2), Ann(3), Daniel K(3), Andy(3), Robert(3), Brooke(2), Zoey(3), Airea(3) = 45 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Bruce' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Joe' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Ann' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Daniel K' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Andy' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Robert' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Brooke' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Zoey' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.18' AND c.name = 'Airea'
ON CONFLICT DO NOTHING;

-- Week of 1.25: Drew(2), Bruce(2), Joe(4), Ann(3), Daniel K(3), Andy(3), Robert(3), Brooke(2), Zoey(3), Airea(3) = 43 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Bruce' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Joe' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Ann' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Daniel K' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Andy' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Robert' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Brooke' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Zoey' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 1.25' AND c.name = 'Airea'
ON CONFLICT DO NOTHING;

-- Week of 2.1: Drew(2), Bruce(2), Joe(4), Ann(3), Daniel K(2), Andy(3), Robert(2), Brooke(2), Zoey(3), Airea(2) = 46 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 2.1' AND c.name IN ('Drew','Bruce') UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 2.1' AND c.name = 'Joe' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.1' AND c.name = 'Ann' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 2.1' AND c.name = 'Daniel K' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.1' AND c.name = 'Andy' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 2.1' AND c.name IN ('Robert','Brooke','Airea') UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.1' AND c.name = 'Zoey'
ON CONFLICT DO NOTHING;

-- Week of 2.8: Drew(4), Bruce(2), Joe(4), Ann(3), Daniel K(3), Andy(3), Robert(2), Brooke(2), Zoey(3), Airea(2) = 44 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 2.8' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 2.8' AND c.name = 'Bruce' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 2.8' AND c.name = 'Joe' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.8' AND c.name IN ('Ann','Daniel K','Andy') UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 2.8' AND c.name IN ('Robert','Brooke','Airea') UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.8' AND c.name = 'Zoey'
ON CONFLICT DO NOTHING;

-- Week of 2.15: Drew(4), Jane Doe(3), Joe(4), Ann(3), Daniel K(3), Sydney(5), Andy(0), Henning(8) = 52 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 2.15' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.15' AND c.name = 'Jane Doe' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 2.15' AND c.name = 'Joe' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.15' AND c.name IN ('Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 5 FROM menus m, customers c WHERE m.week_label = 'Week of 2.15' AND c.name = 'Sydney' UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 2.15' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 2.22: Drew(4), Jane Doe(3), Joe(4), Ann(3), Daniel K(3), Sydney(5), Andy(0), Henning(8) = 52 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 2.22' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.22' AND c.name = 'Jane Doe' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 2.22' AND c.name = 'Joe' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 2.22' AND c.name IN ('Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 5 FROM menus m, customers c WHERE m.week_label = 'Week of 2.22' AND c.name = 'Sydney' UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 2.22' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 03.01: Drew(4), Kelly(3), Mr. Kelly LARGE(3), Joe(0), Ann(3), Daniel K(3), Sydney(5), Chris(6), Andy(3), Henning(8) = 63 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 03.01' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 03.01' AND c.name = 'Kelly' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 03.01' AND c.name = 'Mr. Kelly LARGE' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 03.01' AND c.name IN ('Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 5 FROM menus m, customers c WHERE m.week_label = 'Week of 03.01' AND c.name = 'Sydney' UNION ALL
SELECT m.id, c.id, 'Monday', 6 FROM menus m, customers c WHERE m.week_label = 'Week of 03.01' AND c.name = 'Chris' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 03.01' AND c.name = 'Andy' UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 03.01' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 03.08: Drew(4), Kelly(3), Mr. Kelly LARGE(3), Joe(0), Ann(3), Daniel K(3), Sydney(6), Chris(6), Andy(0), Henning(8) = 58 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 03.08.' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 03.08.' AND c.name IN ('Kelly','Mr. Kelly LARGE','Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 6 FROM menus m, customers c WHERE m.week_label = 'Week of 03.08.' AND c.name IN ('Sydney','Chris') UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 03.08.' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 3.22: Drew(4), Kelly(3), Mr. Kelly LARGE(3), Joe(0), Ann(0), Daniel K(3), Sydney(5), Chris(4), Andy(3), Henning(8) = 53 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = '3.22' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = '3.22' AND c.name IN ('Kelly','Mr. Kelly LARGE','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 5 FROM menus m, customers c WHERE m.week_label = '3.22' AND c.name = 'Sydney' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = '3.22' AND c.name = 'Chris' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = '3.22' AND c.name = 'Andy' UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = '3.22' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 3.29: Drew(4), Kelly(3), Mr. Kelly LARGE(3), Joe(0), Ann(3), Daniel K(3), Sydney(4), Chris(6), Andy(0), Henning(8) = 56 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 3.29' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 3.29' AND c.name IN ('Kelly','Mr. Kelly LARGE','Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 3.29' AND c.name = 'Sydney' UNION ALL
SELECT m.id, c.id, 'Monday', 6 FROM menus m, customers c WHERE m.week_label = 'Week of 3.29' AND c.name = 'Chris' UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 3.29' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 4.5: Drew(3), Kelly(3), Mr. Kelly LARGE(3), Joe(0), Ann(3), Daniel K(3), Sydney(4), Chris(6), Andy(0), Henning(8) = 55 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 4.5' AND c.name IN ('Drew','Kelly','Mr. Kelly LARGE','Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 4.5' AND c.name = 'Sydney' UNION ALL
SELECT m.id, c.id, 'Monday', 6 FROM menus m, customers c WHERE m.week_label = 'Week of 4.5' AND c.name = 'Chris' UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 4.5' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 4.12: Drew(3), Kelly(3), Mr. Kelly LARGE(3), Ann(3), Daniel K(3), Sydney(1), Chris(2), Andy(0), Henning(9) = 51 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 4.12' AND c.name IN ('Drew','Kelly','Mr. Kelly LARGE','Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c WHERE m.week_label = 'Week of 4.12' AND c.name = 'Sydney' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 4.12' AND c.name = 'Chris' UNION ALL
SELECT m.id, c.id, 'Monday', 9 FROM menus m, customers c WHERE m.week_label = 'Week of 4.12' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 4.19: Kelly(4), Mr. Kelly LARGE(4), Ann(4), Daniel K(3), Sydney(6), Chris(6), Andy(0), Henning(15) = 43 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 4.19' AND c.name IN ('Kelly','Mr. Kelly LARGE','Ann') UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 4.19' AND c.name = 'Daniel K' UNION ALL
SELECT m.id, c.id, 'Monday', 6 FROM menus m, customers c WHERE m.week_label = 'Week of 4.19' AND c.name IN ('Sydney','Chris') UNION ALL
SELECT m.id, c.id, 'Monday', 15 FROM menus m, customers c WHERE m.week_label = 'Week of 4.19' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 4.26: Drew(3), Kelly(3), Mr. Kelly LARGE(3), Ann(3), Daniel K(3), Sydney(3), Chris(4), Andy(3), Henning(8) = 53 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 4.26' AND c.name IN ('Drew','Kelly','Mr. Kelly LARGE','Ann','Daniel K','Sydney') UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 4.26' AND c.name = 'Chris' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 4.26' AND c.name = 'Andy' UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 4.26' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 5.03: Drew(3), Kelly(3), Mr. Kelly LARGE(3), Ann(3), Daniel K(3), Sydney(0), Chris(2), Andy(3), Felicia - Normal(4), Felicia - No Carbs(4), Henning(8) = 57 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 5.03' AND c.name IN ('Drew','Kelly','Mr. Kelly LARGE','Ann','Daniel K','Andy') UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 5.03' AND c.name = 'Chris' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 5.03' AND c.name IN ('Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 5.03' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 5.10: Drew(3), Kelly(2), Mr. Kelly LARGE(2), Ann(3), Daniel K(0), Chris(2), Felicia - Normal(4), Felicia - No Carbs(4), Henning(8) = 47 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 5.10' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 5.10' AND c.name IN ('Kelly','Mr. Kelly LARGE','Chris') UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 5.10' AND c.name = 'Ann' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 5.10' AND c.name IN ('Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 5.10' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 5.17: Drew(3), Kelly(3), Mr. Kelly LARGE(3), Ann(3), Daniel K(3), Chris(4), Felicia - Normal(4), Felicia - No Carbs(4), Henning(8) = 50 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 5.17' AND c.name IN ('Drew','Kelly','Mr. Kelly LARGE','Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 5.17' AND c.name IN ('Chris','Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 5.17' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 5.24: Drew(3), Kelly(4), Mr. Kelly LARGE(4), Ann(3), Daniel K(3), Chris(0), Felicia - Normal(5), Felicia - No Carbs(5), Henning(9) = 36 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 5.24' AND c.name IN ('Drew','Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 5.24' AND c.name IN ('Kelly','Mr. Kelly LARGE') UNION ALL
SELECT m.id, c.id, 'Monday', 5 FROM menus m, customers c WHERE m.week_label = 'Week of 5.24' AND c.name IN ('Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 9 FROM menus m, customers c WHERE m.week_label = 'Week of 5.24' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 5.31: Drew(2), Kelly(4), Mr. Kelly LARGE(4), Ann(3), Andy(3), Daniel K(0), Chris(2), Felicia - Normal(4), Felicia - No Carbs(4), Henning(8) = 58 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 5.31' AND c.name IN ('Drew','Chris') UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 5.31' AND c.name IN ('Kelly','Mr. Kelly LARGE','Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 5.31' AND c.name IN ('Ann','Andy') UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 5.31' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 6.7: Drew(2), Kelly(1), Mr. Kelly LARGE(1), Ann(3), Andy(0), Daniel K(4), Felicia - Normal(4), Felicia - No Carbs(4), Henning(10), Zoey(2) = 55 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 6.7' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c WHERE m.week_label = 'Week of 6.7' AND c.name IN ('Kelly','Mr. Kelly LARGE') UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 6.7' AND c.name = 'Ann' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 6.7' AND c.name IN ('Daniel K','Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 10 FROM menus m, customers c WHERE m.week_label = 'Week of 6.7' AND c.name = 'Henning' UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 6.7' AND c.name = 'Zoey'
ON CONFLICT DO NOTHING;

-- Week of 6.14: Kelly(2), Mr. Kelly LARGE(2), Ann(3), Andy(0), Daniel K(3), Felicia - Normal(2), Felicia - No Carbs(2), Henning(8), Zoey(0) = 48 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 6.14' AND c.name IN ('Kelly','Mr. Kelly LARGE','Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 6.14' AND c.name IN ('Ann','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 8 FROM menus m, customers c WHERE m.week_label = 'Week of 6.14' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 6.21: Drew(3), Kelly(6), Mr. Kelly LARGE(6), Ann(3), Andy(0), Daniel K(6), Felicia - Normal(0), Felicia - No Carbs(0), Henning(15) = 41 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 6.21' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 6 FROM menus m, customers c WHERE m.week_label = 'Week of 6.21' AND c.name IN ('Kelly','Mr. Kelly LARGE','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 6.21' AND c.name = 'Ann' UNION ALL
SELECT m.id, c.id, 'Monday', 15 FROM menus m, customers c WHERE m.week_label = 'Week of 6.21' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 7.5: Drew(2), Kelly(3), Mr. Kelly LARGE(3), Ann(2), Andy(0), Daniel K(3), Felicia - Normal(4), Felicia - No Carbs(4), Henning(6), Zoey(0) = 50 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 7.5' AND c.name = 'Drew' UNION ALL
SELECT m.id, c.id, 'Monday', 3 FROM menus m, customers c WHERE m.week_label = 'Week of 7.5' AND c.name IN ('Kelly','Mr. Kelly LARGE','Daniel K') UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 7.5' AND c.name = 'Ann' UNION ALL
SELECT m.id, c.id, 'Monday', 4 FROM menus m, customers c WHERE m.week_label = 'Week of 7.5' AND c.name IN ('Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 6 FROM menus m, customers c WHERE m.week_label = 'Week of 7.5' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;

-- Week of 7.12 (ONLY ACTIVE WEEK): Drew(1), Kelly(1), Mr. Kelly LARGE(1), Ann(2), Andy(0), Daniel K(2), Felicia - Normal(2), Felicia - No Carbs(2), Henning(6) = 49 meals
INSERT INTO orders (menu_id, customer_id, day_of_week, quantity)
SELECT m.id, c.id, 'Monday', 1 FROM menus m, customers c WHERE m.week_label = 'Week of 7.12' AND c.name IN ('Drew','Kelly','Mr. Kelly LARGE') UNION ALL
SELECT m.id, c.id, 'Monday', 2 FROM menus m, customers c WHERE m.week_label = 'Week of 7.12' AND c.name IN ('Ann','Daniel K','Felicia - Normal','Felicia - No Carbs') UNION ALL
SELECT m.id, c.id, 'Monday', 6 FROM menus m, customers c WHERE m.week_label = 'Week of 7.12' AND c.name = 'Henning'
ON CONFLICT DO NOTHING;
