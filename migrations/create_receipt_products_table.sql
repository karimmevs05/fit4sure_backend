-- Create receipt_products table for tracking purchased items
CREATE TABLE IF NOT EXISTS receipt_products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  item_code VARCHAR(50),
  store VARCHAR(100),
  last_purchase_price_cents INTEGER,
  last_purchase_date TIMESTAMP DEFAULT NOW(),
  purchase_count INTEGER DEFAULT 1,
  inventory_item_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create unique constraint on name + store (case-insensitive name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_products_unique_name_store
ON receipt_products(LOWER(name), COALESCE(store, ''));

-- Create other indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_receipt_products_name ON receipt_products(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_receipt_products_item_code ON receipt_products(item_code);
CREATE INDEX IF NOT EXISTS idx_receipt_products_store ON receipt_products(store);
CREATE INDEX IF NOT EXISTS idx_receipt_products_inventory ON receipt_products(inventory_item_id);
