-- The real standing "what this customer is on" record -- didn't exist
-- before this: a customer's actual plan was only ever inferable after the
-- fact from raw order history (orders) or a weekly meal_counts log, never
-- a single row staff could point to and say "this is Jane's plan right
-- now." Built to support the Meal Plans page: a roster of every client's
-- assigned plan, plus turning a form_intakes lead's answers into a draft
-- plan a staffer reviews before it goes live.
--
-- History is kept via is_current, same pattern as
-- recipe_format_overrides.active -- superseding a plan flips the old row's
-- is_current to false (and status to 'superseded') rather than deleting
-- it, so "what was this customer on before" stays answerable.
CREATE TABLE IF NOT EXISTS customer_plans (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  meals_per_week TEXT,
  portion TEXT,              -- plate format label, e.g. "Large"
  dietary_preference TEXT,
  protein_preference TEXT,
  fulfillment_method TEXT,   -- pickup vs. delivery
  delivery_zip TEXT,
  price_cents INTEGER,       -- looked up from plateConfig at draft time, editable before activation

  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'cancelled', 'superseded')),
  is_current BOOLEAN NOT NULL DEFAULT false,

  -- Where this plan came from -- 'form_intake' when built from a lead's
  -- answers via POST /from-intake/:id, 'manual' when a staffer created it
  -- straight from the roster with no underlying submission.
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('form_intake', 'manual')),
  source_form_intake_id INTEGER REFERENCES form_intakes(id) ON DELETE SET NULL,

  created_by_user_id INTEGER REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

-- At most one current plan per customer -- a partial unique index (not a
-- plain UNIQUE column) because every superseded/draft row still has
-- is_current = false and there can be many of those per customer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_plans_one_current
  ON customer_plans(customer_id) WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_customer_plans_customer ON customer_plans(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_plans_source_intake ON customer_plans(source_form_intake_id);
