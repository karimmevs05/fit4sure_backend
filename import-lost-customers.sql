-- Import Lost Customers as Prospects
-- These customers ordered at some point but are no longer active as of Week of 7.12
-- Status: Lost/Inactive Prospect

INSERT INTO customers (name, notes, active, sales_pipeline_stage, conversion_probability, engagement_score, days_since_last_contact, created_at)
VALUES
  ('Airea', 'Lost prospect - Former high protein customer (Feb-Jun)', FALSE, 'prospect_lost', 10, 0, 0, NOW()),
  ('Alejandro', 'Lost prospect - Chicken only customer (Jan-Feb)', FALSE, 'prospect_lost', 10, 0, 0, NOW()),
  ('Brooke', 'Lost prospect - No beef/pork customer (Jan-Feb)', FALSE, 'prospect_lost', 10, 0, 0, NOW()),
  ('Bruce', 'Lost prospect - Multiple restrictions: no quinoa, broccoli, tomatoes, corn (Jan-Feb)', FALSE, 'prospect_lost', 10, 0, 0, NOW()),
  ('Chris', 'Lost prospect - Inconsistent ordering (Feb-Jun)', FALSE, 'prospect_lost', 10, 0, 0, NOW()),
  ('Jane Doe', 'Lost prospect - Short term customer (Feb-Mar)', FALSE, 'prospect_lost', 10, 0, 0, NOW()),
  ('Joe', 'Lost prospect - High volume customer early on (Jan-Apr)', FALSE, 'prospect_lost', 10, 0, 0, NOW()),
  ('Robert', 'Lost prospect - High protein focus (Jan-Feb)', FALSE, 'prospect_lost', 10, 0, 0, NOW()),
  ('Sydney', 'Lost prospect - No zucchini, broccoli restrictions (Feb-Jun)', FALSE, 'prospect_lost', 10, 0, 0, NOW())
ON CONFLICT (name) DO UPDATE SET
  sales_pipeline_stage = 'prospect_lost',
  active = FALSE,
  engagement_score = 0,
  conversion_probability = 10;

-- Update customers table to add prospect_lost as valid stage
-- ALTER TABLE customers ADD CONSTRAINT check_pipeline_stage
-- CHECK (sales_pipeline_stage IN ('lead', 'prospect', 'prospect_lost', 'active', 'inactive'));
