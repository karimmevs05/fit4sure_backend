-- Meal categories
INSERT INTO meal_categories (name, display_order) VALUES
  ('Regular Meals', 1),
  ('Large Meals', 2),
  ('Breakfast', 3),
  ('Bundles', 4);

-- Bulk discount tiers
INSERT INTO bulk_discount_tiers (min_meals, discount_cents_per_meal, label) VALUES
  (7,  100, 'Bulk savings — 7+ meals'),
  (10, 150, 'Bulk savings — 10+ meals');

-- Delivery zones (Tampa Bay area ZIP codes)
INSERT INTO delivery_zones (postal_code, is_active) VALUES
  ('33601', true), ('33602', true), ('33603', true), ('33604', true),
  ('33605', true), ('33606', true), ('33607', true), ('33608', true),
  ('33609', true), ('33610', true), ('33611', true), ('33612', true),
  ('33613', true), ('33614', true), ('33615', true), ('33616', true),
  ('33617', true), ('33618', true), ('33619', true), ('33620', true),
  ('33621', true), ('33629', true), ('33634', true), ('33635', true),
  ('33637', true), ('33647', true);

-- Seed meals (the 3 from the plate images)
INSERT INTO meals (meal_category_id, name, description, image_url, calories, protein, carbs, fat, tags, price_cents)
VALUES
  (
    1,
    'Steak Taco Bowl',
    'Grilled steak with black beans, corn, white rice, and pickled onions.',
    NULL,
    621, 53.00, 58.00, 14.00,
    ARRAY['best_seller', 'high_protein', 'grass_fed_beef'],
    1290
  ),
  (
    1,
    'Beef Pepper Rice Bowl',
    'Seasoned ground beef with roasted bell peppers, white rice, and lime.',
    NULL,
    561, 50.00, 52.00, 12.00,
    ARRAY['grass_fed_beef', 'high_protein'],
    1290
  ),
  (
    1,
    'Lemon Chicken Pasta',
    'Herb-seasoned chicken with rigatoni, zucchini, and lemon cream sauce.',
    NULL,
    570, 52.00, 48.00, 13.00,
    ARRAY['high_protein', 'pasture_raised'],
    1290
  );

-- Seed current week's menu (week of 2026-06-23)
INSERT INTO weekly_menus (week_start, meal_id, is_available)
SELECT '2026-06-23', meal_id, true FROM meals;
