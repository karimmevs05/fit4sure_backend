-- Multiple delivery addresses per customer (e.g. home + office). customers.
-- address/apt_gate_code stay as-is -- every other write path (orders,
-- public ordering's auto-fill-on-first-order) already reads those two
-- columns directly, so instead of touching all of that, they're kept as a
-- denormalized mirror of whichever address here is_primary. The app always
-- writes through customer_addresses; customers.address/apt_gate_code get
-- synced by the route handlers, never edited on their own once this exists.
CREATE TABLE IF NOT EXISTS customer_addresses (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label VARCHAR(50),
  address TEXT NOT NULL,
  apt_gate_code VARCHAR(100),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

-- At most one primary address per customer -- a partial unique index
-- instead of application-level checking, so it can't drift even if two
-- requests race.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_primary
  ON customer_addresses(customer_id) WHERE is_primary;

-- Backfill: every customer with an existing address becomes that address's
-- first (primary) row here, so nothing already on file is lost.
INSERT INTO customer_addresses (customer_id, address, apt_gate_code, is_primary)
SELECT id, address, apt_gate_code, true
FROM customers
WHERE address IS NOT NULL AND address <> ''
ON CONFLICT DO NOTHING;
