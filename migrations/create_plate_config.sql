-- Makes customer-facing plate pricing and portion sizes a real, staff-editable
-- database config instead of hardcoded constants scattered across
-- src/services/orderingService.js, src/routes/admin/adminMenuPlanner.js
-- (which had its OWN separate duplicate of CATEGORY_PRICES, silently
-- bypassing orderingService.js entirely), and the frontend's
-- src/utils/plateStructure.ts / src/pages/Orders.tsx (which duplicated the
-- add-on pricing constants again, cross-repo). All four are being migrated
-- to read from these tables -- see src/services/plateConfig.js.
--
-- Seeded below with the EXACT values already live in CATEGORY_PRICES,
-- PLATE_STRUCTURE_SERVINGS, BY_THE_LB_PRICES, and the add-on pricing
-- constants as of this migration -- nothing invented, nothing changed for
-- customers until a real edit is made through the new admin UI.

-- One row per customer-facing plate format. protein_oz/carbs_g/veggies_g
-- are the portion sizes that drive a recipe's live "servings" count
-- (formerly PLATE_STRUCTURE_SERVINGS); price_cents is what a customer pays
-- for this format (formerly CATEGORY_PRICES). is_recipe_format marks the
-- formats offered per live Monday/Thursday recipe (formerly the
-- RECIPE_FORMATS array) -- Breakfast is priced/portioned the same way but
-- isn't one of the five per-recipe format choices.
CREATE TABLE IF NOT EXISTS plate_formats (
  id SERIAL PRIMARY KEY,
  key VARCHAR(30) UNIQUE NOT NULL,
  label VARCHAR(50) NOT NULL,
  protein_oz NUMERIC(5,2) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  veggies_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  is_recipe_format BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plate_formats (key, label, protein_oz, carbs_g, veggies_g, price_cents, is_recipe_format, sort_order) VALUES
  ('regular',      'Regular',      5,    150, 100, 1379, true,  1),
  ('large',        'Large',        7,    225, 140, 1679, true,  2),
  ('high_protein', 'High Protein', 7,    150, 0,   1779, true,  3),
  ('low_carb',     'Low Carb',     7,    0,   150, 1379, true,  4),
  ('one_pound',    '1 Pound',      16,   0,   0,   1979, true,  5),
  ('breakfast',    'Breakfast',    2.5,  120, 25,  1130, false, 6)
ON CONFLICT (key) DO NOTHING;

-- "By The LB" is a separate menu category from the five recipe formats
-- above -- a customer buys exactly 1lb of a single raw ingredient-type
-- item (e.g. "1lb plain rice"), priced by what kind of ingredient it is,
-- not by which recipe/format. Formerly BY_THE_LB_PRICES.
CREATE TABLE IF NOT EXISTS by_the_pound_prices (
  id SERIAL PRIMARY KEY,
  category VARCHAR(30) UNIQUE NOT NULL,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO by_the_pound_prices (category, price_cents) VALUES
  ('Protein', 2000),
  ('Vegetable', 1000),
  ('Carbohydrate', 500)
ON CONFLICT (category) DO NOTHING;

-- Sides/sauces added under a selected protein -- a free allowance per plate
-- before every one after costs extra_price_cents. Formerly
-- ADD_ON_FREE_PRICE/ADD_ON_EXTRA_PRICE (backend) and a second hardcoded
-- copy of the same numbers plus ADD_ON_FREE_COUNT in the frontend's
-- Orders.tsx.
CREATE TABLE IF NOT EXISTS addon_rules (
  id SERIAL PRIMARY KEY,
  key VARCHAR(30) UNIQUE NOT NULL,
  label VARCHAR(50) NOT NULL,
  free_count INT NOT NULL DEFAULT 0,
  extra_price_cents INT NOT NULL CHECK (extra_price_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO addon_rules (key, label, free_count, extra_price_cents) VALUES
  ('included_side', 'Included Side', 2, 250),
  ('sauce_addon',   'Sauce Add-On',  1, 250)
ON CONFLICT (key) DO NOTHING;
