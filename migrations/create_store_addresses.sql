-- Store addresses for the shopping list export -- staff set an address
-- once per store name, reused on every future export. Keyed by the exact
-- store_name string already used on inventory.store, matching the way
-- that field is already treated as the identity of a store elsewhere in
-- the app (no normalization of existing casing/spacing variants).
CREATE TABLE IF NOT EXISTS store_addresses (
  store_name VARCHAR PRIMARY KEY,
  address TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
