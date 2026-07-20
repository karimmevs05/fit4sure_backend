-- Create users table
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  display_name VARCHAR(255),
  phone_number VARCHAR(20),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  role VARCHAR(50) DEFAULT 'customer',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create user_identities table
CREATE TABLE IF NOT EXISTS user_identities (
  identity_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  provider VARCHAR(50),
  provider_user_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create recipes table
CREATE TABLE IF NOT EXISTS recipes (
  recipe_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  prep_time_minutes INT,
  servings INT DEFAULT 1,
  instructions TEXT,
  tags TEXT[],
  calories INT,
  protein_g DECIMAL(5,2),
  carbs_g DECIMAL(5,2),
  fat_g DECIMAL(5,2),
  cost_per_serving_cents INT,
  image_url VARCHAR(500),
  is_available BOOLEAN DEFAULT TRUE,
  created_by_user_id INT REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create recipe_ingredients table
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  ingredient_id SERIAL PRIMARY KEY,
  recipe_id INT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50),
  cost_cents INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
  inventory_id SERIAL PRIMARY KEY,
  ingredient_name VARCHAR(255) NOT NULL,
  current_quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50),
  location VARCHAR(100),
  low_stock_threshold DECIMAL(10,2),
  cost_per_unit_cents INT,
  last_restocked_at TIMESTAMP,
  last_restocked_by_user_id INT REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create inventory_logs table
CREATE TABLE IF NOT EXISTS inventory_logs (
  log_id SERIAL PRIMARY KEY,
  inventory_id INT REFERENCES inventory(inventory_id),
  quantity_before DECIMAL(10,2),
  quantity_after DECIMAL(10,2),
  change_reason VARCHAR(100),
  changed_by_user_id INT REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  client_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  subscription_type VARCHAR(50),
  participants_count INT,
  dietary_restrictions TEXT[],
  notes TEXT,
  created_by_user_id INT REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
CREATE INDEX IF NOT EXISTS idx_recipes_available ON recipes(is_available);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
