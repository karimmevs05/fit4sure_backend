-- ============================================================================
-- Migration: customer_activities + communication_templates
-- ============================================================================
-- customer_activities is the real backing store for the CRM/comms layer:
-- every email sent, SMS sent, call logged, note added, and pipeline stage
-- change lands here as one row. This is also what "days_since_last_contact"
-- should be computed from going forward (see adminCustomers-CHANGES.md),
-- not just order history.

CREATE TABLE IF NOT EXISTS customer_activities (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- 'email' | 'sms' | 'call' | 'note' | 'stage_change'
  direction TEXT,                -- 'outbound' | 'inbound' | NULL (notes, stage_change)
  subject TEXT,                  -- email only
  body TEXT,
  status TEXT NOT NULL,          -- 'sent' | 'failed' | 'logged'
  metadata JSONB,                -- e.g. {"from_stage": "prospect", "to_stage": "engaged"}
  created_by_user_id INTEGER REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_activities_customer_id ON customer_activities(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_activities_created_at ON customer_activities(created_at DESC);

CREATE TABLE IF NOT EXISTS communication_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,         -- 'email' | 'sms'
  subject TEXT,                  -- email only
  body TEXT NOT NULL,            -- supports {{first_name}} merge tag
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (name, channel)
);

-- Seed the 4 templates already referenced (as non-functional buttons) in the
-- current Customers.tsx Activities tab, one email + one SMS variant each.
INSERT INTO communication_templates (name, channel, subject, body) VALUES
('Check-in', 'email', 'Just checking in, {{first_name}}!', 'Hi {{first_name}},\n\nJust checking in to see how your meals have been this week. Anything you''d like to see more or less of on the menu? Always happy to adjust.\n\n-- Fit4Sure'),
('Check-in', 'sms', NULL, 'Hi {{first_name}}, it''s Fit4Sure -- just checking in on how your meals have been this week! Let us know if you''d like any changes.'),
('Trial Offer', 'email', 'A trial week on us, {{first_name}}', 'Hi {{first_name}},\n\nWe''d love to have you try Fit4Sure -- high-protein, seed-oil-free meals prepped and delivered. Want to start with a trial week?\n\n-- Fit4Sure'),
('Trial Offer', 'sms', NULL, 'Hi {{first_name}}, it''s Fit4Sure! Want to try a trial week of high-protein meal prep, seed-oil-free? Reply YES and we''ll get you set up.'),
('Win-Back', 'email', 'We miss you, {{first_name}}', 'Hi {{first_name}},\n\nWe noticed you haven''t ordered in a bit -- we''d love to have you back. Let us know if anything changed or if we can help with your order.\n\n-- Fit4Sure'),
('Win-Back', 'sms', NULL, 'Hi {{first_name}}, it''s Fit4Sure -- we miss you! Anything we can do to get your meal prep going again?'),
('Testimonial Request', 'email', 'Would you share your experience, {{first_name}}?', 'Hi {{first_name}},\n\nWe''d love a quick word on how Fit4Sure has been working for you -- would you be up for sharing a short testimonial?\n\n-- Fit4Sure'),
('Testimonial Request', 'sms', NULL, 'Hi {{first_name}}, it''s Fit4Sure! Loving your meals so far? We''d really appreciate a quick testimonial if you have a minute.')
ON CONFLICT (name, channel) DO NOTHING;

-- Run once against Railway Postgres. Existing customers/orders rows are
-- untouched; days_since_last_contact will simply fall back to order-based
-- computation for any customer with no logged activities yet.
