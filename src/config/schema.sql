-- ─────────────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────────────

CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  display_name VARCHAR(100),
  phone_number VARCHAR(20),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  notification_delivery_reminders BOOLEAN DEFAULT true,
  notification_menu_drops BOOLEAN DEFAULT true,
  notification_cutoff_alerts BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_identities (
  user_identity_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  UNIQUE (provider, provider_user_id)
);

-- ─────────────────────────────────────────
-- GOALS & PREFERENCES
-- ─────────────────────────────────────────

CREATE TABLE diet_profiles (
  diet_profile_id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  primary_goal VARCHAR(50),
  biggest_hurdle VARCHAR(50),
  protein_preference VARCHAR(50),
  dietary_preference VARCHAR(50),
  foods_to_avoid TEXT[],
  daily_calorie_target INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- MEALS & MENU
-- ─────────────────────────────────────────

CREATE TABLE meal_categories (
  meal_category_id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE meals (
  meal_id SERIAL PRIMARY KEY,
  meal_category_id INTEGER REFERENCES meal_categories(meal_category_id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  calories INTEGER,
  protein NUMERIC(5,2),
  carbs NUMERIC(5,2),
  fat NUMERIC(5,2),
  tags TEXT[],
  price_cents INTEGER NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE weekly_menus (
  weekly_menu_id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  meal_id INTEGER REFERENCES meals(meal_id),
  is_available BOOLEAN DEFAULT true,
  UNIQUE (week_start, meal_id)
);

-- ─────────────────────────────────────────
-- BOXES (ORDERS)
-- ─────────────────────────────────────────

CREATE TABLE bulk_discount_tiers (
  bulk_discount_tier_id SERIAL PRIMARY KEY,
  min_meals INTEGER NOT NULL,
  discount_cents_per_meal INTEGER NOT NULL,
  label VARCHAR(100)
);

CREATE TABLE boxes (
  box_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  guest_email VARCHAR(255),
  week_start DATE NOT NULL,
  delivery_day VARCHAR(20),
  delivery_window VARCHAR(50),
  delivery_address_line1 VARCHAR(255),
  delivery_address_line2 VARCHAR(255),
  delivery_city VARCHAR(100),
  delivery_state VARCHAR(100),
  delivery_postal_code VARCHAR(20),
  status VARCHAR(50) DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  bulk_discount_cents INTEGER DEFAULT 0,
  total_cents INTEGER NOT NULL,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE box_items (
  box_item_id SERIAL PRIMARY KEY,
  box_id INTEGER REFERENCES boxes(box_id) ON DELETE CASCADE,
  meal_id INTEGER REFERENCES meals(meal_id),
  quantity INTEGER DEFAULT 1,
  price_cents INTEGER NOT NULL
);

-- ─────────────────────────────────────────
-- DELIVERY ZONES
-- ─────────────────────────────────────────

CREATE TABLE delivery_zones (
  delivery_zone_id SERIAL PRIMARY KEY,
  postal_code VARCHAR(20) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- ─────────────────────────────────────────
-- MEAL LOGGING
-- ─────────────────────────────────────────

CREATE TABLE meal_logs (
  meal_log_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  meal_id INTEGER REFERENCES meals(meal_id),
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  calories INTEGER,
  protein NUMERIC(5,2),
  carbs NUMERIC(5,2),
  fat NUMERIC(5,2)
);

-- ─────────────────────────────────────────
-- XP / REWARDS
-- ─────────────────────────────────────────

CREATE TABLE xp_logs (
  xp_log_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason VARCHAR(100),
  earned_at TIMESTAMPTZ DEFAULT NOW()
);
