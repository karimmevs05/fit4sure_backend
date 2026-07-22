-- Adds the full pipeline-tracking fields the frontend already expects but
-- the schema never had. lifetime_value_cents and days_since_last_contact
-- are NOT stored here -- they're computed live from real order history in
-- the backend query, so they never go stale.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS apt_gate_code VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS household_size INT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS occupation VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS primary_goal TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS biggest_hurdle TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS protein_preference VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dietary_preference VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS foods_to_avoid TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS engagement_score INT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS conversion_probability INT;

-- Reconcile historical migration labels with the richer pipeline the app expects
UPDATE customers SET sales_pipeline_stage = 'active' WHERE sales_pipeline_stage = 'active_customer';
UPDATE customers SET sales_pipeline_stage = 'churned' WHERE sales_pipeline_stage = 'lost_prospect';

-- Verify
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customers' ORDER BY ordinal_position;
SELECT sales_pipeline_stage, COUNT(*) FROM customers GROUP BY sales_pipeline_stage;
