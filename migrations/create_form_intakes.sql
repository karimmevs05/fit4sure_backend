-- Backing store for the flyer/QR outreach campaign's Google Form intake
-- (see fit4sure_flyer_outreach_campaign in project memory). Every
-- submission lands here as a dated record, verbatim, before any of it
-- gets mapped onto a customer -- so a later answer never silently erases
-- an earlier one, and the Responses sheet stays the raw-submission record
-- while this table is what sales actually works from.
--
-- google_response_id is the idempotency key: Apps Script's own
-- FormResponse#getId(), unique per submission, so a retried/duplicated
-- POST from the trigger can never create a second lead.
CREATE TABLE IF NOT EXISTS form_intakes (
  id SERIAL PRIMARY KEY,
  google_response_id TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

  -- "What brings you here?" -- drives which sales treatment this
  -- submission gets (see formIntakeService.js).
  submission_type VARCHAR(30) NOT NULL
    CHECK (submission_type IN ('weekly_meal_prep', 'help_me_choose', 'grab_and_go')),

  -- "Which partner location?" -- the QR's entry.614448549 value
  -- (BP / Rosemart storefront, Southern Boom CrossFit, Certified Motors).
  -- Kept separate from the customer's actual pickup/delivery choice below:
  -- someone can discover Fit4Sure at one partner and still choose a
  -- different fulfillment method.
  source_location TEXT,

  lead_source TEXT,               -- "Where did you hear about us?"
  referral_code TEXT,             -- "Referral or promo code"
  requested_meals_per_week TEXT,  -- "How many Fit4Sure meals per week?"
  requested_portion TEXT,         -- "Portion size"
  start_timing TEXT,              -- "When would you like to start?"
  fulfillment_method TEXT,        -- "How would you like to get your meals?"
  delivery_zip TEXT,              -- "Delivery ZIP code"

  -- Kept verbatim, never auto-mapped into customers.allergens -- a human
  -- has to read and structure this before it's trusted for meal matching.
  allergies_raw TEXT,

  -- Two distinct consents, never collapsed into one: general marketing
  -- texts (mirrors customers.sms_consent_at/sms_opt_out, the same A2P
  -- consent field the public order page already writes to) vs. consent to
  -- receive this one requested recommendation.
  marketing_sms_consent BOOLEAN,
  plan_sms_consent BOOLEAN,

  -- True when allergies were submitted, or an existing customer's answers
  -- on this submission disagree with what's already on file -- surfaces
  -- for a human look rather than silently overwriting or silently trusting.
  needs_review BOOLEAN NOT NULL DEFAULT false,

  customer_action VARCHAR(20) NOT NULL
    CHECK (customer_action IN ('created', 'matched_existing', 'no_contact')),

  -- The full e.namedValues payload, verbatim -- every question not broken
  -- out into its own column above (profiling questions, Score/Tier/etc.
  -- if the sheet-side script still writes those) stays available without
  -- a schema change every time the form gets a new question.
  raw_answers JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_intakes_customer ON form_intakes(customer_id);
CREATE INDEX IF NOT EXISTS idx_form_intakes_source_location ON form_intakes(source_location);
CREATE INDEX IF NOT EXISTS idx_form_intakes_created_at ON form_intakes(created_at DESC);

-- A form-intake-created task is system-generated but isn't any of the
-- three existing reasons (see create_pipeline_intelligence.sql) --
-- extending the controlled vocabulary the same way 'customer' was added
-- as a new tasks.source_type value rather than a new column.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_system_source_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_system_source_check
  CHECK (system_source IN ('stale_flag', 'win_probability_drop', 'automation', 'form_intake'));
