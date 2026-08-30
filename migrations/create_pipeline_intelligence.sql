-- Pipeline Intelligence: real Win Probability scoring, stale/WP-drop
-- auto-flagging, and the Sales Assets library.

-- Win Probability history, so a "dropped 22pts" comparison has something
-- to compare against on the next tick.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS conversion_probability_prev INTEGER,
  ADD COLUMN IF NOT EXISTS conversion_probability_updated_at TIMESTAMPTZ;

-- Needed for the "momentum" component of the score (how fast a customer is
-- moving through a stage vs. the typical pace) -- stamped whenever
-- sales_pipeline_stage changes, piggybacking on the same code path in
-- PUT /api/admin/customers/:id that already detects stage changes.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;

-- crm_tasks: distinguish system-generated tasks by reason, not just by
-- whether they came from a full automation rule.
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS system_source VARCHAR(30)
    CHECK (system_source IN ('stale_flag', 'win_probability_drop', 'automation'));
-- NULL system_source + NULL source_automation_rule_id = manually added by a person.

-- Sales Assets library
CREATE TABLE IF NOT EXISTS sales_assets (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('pricing_offers', 'menus_samples', 'social_proof', 'partnerships')),
  asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('pdf', 'image', 'video', 'link')),
  source_url TEXT NOT NULL,       -- e.g. a Google Drive share link
  credit VARCHAR(120),            -- optional, e.g. "shot by Daniela" / "feat. Baby Cee"
  created_by_user_id INTEGER REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Every share generates a token so the link is trackable. channel
-- distinguishes a real sent link from a QR code that gets scanned in person
-- (which can't be tied to a specific customer or opened/closed the same way).
CREATE TABLE IF NOT EXISTS asset_shares (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER REFERENCES sales_assets(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id), -- nullable: QR/general shares aren't tied to one lead
  shared_by_user_id INTEGER REFERENCES users(user_id),
  channel VARCHAR(10) NOT NULL DEFAULT 'link' CHECK (channel IN ('link', 'qr')),
  share_token VARCHAR(32) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_open_events (
  id SERIAL PRIMARY KEY,
  share_id INTEGER REFERENCES asset_shares(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_shares_asset_id ON asset_shares(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_open_events_share_id ON asset_open_events(share_id);
