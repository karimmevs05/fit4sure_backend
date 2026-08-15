-- The Gemini receipt scanner already extracts gram_weight per line item
-- (needed to update inventory stock), but it was never persisted onto
-- receipt_products -- only the total dollar amount was kept, which made it
-- impossible to derive a real $/lb price for the "last price on file"
-- fallback used in recipe costing. Additive, nullable, non-breaking.
ALTER TABLE receipt_products ADD COLUMN IF NOT EXISTS last_purchase_weight_g NUMERIC;
