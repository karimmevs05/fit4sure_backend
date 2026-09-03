-- Consolidates family/roommate customers into one household: shared
-- delivery address(es), combined order history/LTV in reporting, and a
-- single primary contact who's actually billed/contacted. Individual
-- customer records are untouched otherwise -- a household is a grouping on
-- top of real customers, not a replacement for them (each member keeps
-- their own orders, dietary profile, pipeline stage, etc; only address and
-- rollup stats are shared).
CREATE TABLE IF NOT EXISTS households (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  primary_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nullable: most customers aren't part of a household. ON DELETE SET NULL
-- (not CASCADE) -- deleting a household should never delete its member
-- customers, just release them back to being independent.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_household ON customers(household_id);
