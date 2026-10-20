-- Strategic goals for the mobile team PM tool's Timeline page: an
-- open-ended list (not locked to launch_phases' fixed 3-phase model), each
-- with a target date, a main focus, and the actionable steps strategized
-- to get there. A goal's progress is always derived live from its steps
-- (see GET /api/admin/goals), never stored, so adding/checking a step is
-- immediately reflected -- no separate "recalculate" step.
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  target_date DATE,
  main_focus TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_steps (
  id SERIAL PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_steps_goal_id ON goal_steps(goal_id);

-- Seed matches the mockup reviewed with Karim, so the real data lines up
-- with what was already previewed. Only runs once (guarded by the
-- WHERE NOT EXISTS below), so re-running this file after goals have been
-- edited for real is a no-op.
WITH new_goals AS (
  INSERT INTO goals (name, target_date, main_focus, sort_order)
  SELECT * FROM (VALUES
    ('Finish Production Build-Out', '2026-10-31'::date, 'Get the kitchen fully operational and staffed before opening ordering to the public.', 0),
    ('Launch Soft Distribution', '2026-11-15'::date, 'Open ordering to a limited delivery radius and prove out the ordering + delivery flow with real customers.', 1),
    ('Scale Distribution', '2027-01-15'::date, 'Expand delivery radius and weekly production volume once the soft launch is stable.', 2)
  ) AS v(name, target_date, main_focus, sort_order)
  WHERE NOT EXISTS (SELECT 1 FROM goals)
  RETURNING id, name
)
INSERT INTO goal_steps (goal_id, text, done, sort_order)
SELECT g.id, s.text, s.done, s.sort_order
FROM new_goals g
JOIN (VALUES
  ('Finish Production Build-Out', 'Sign vendor agreement — produce', false, 0),
  ('Finish Production Build-Out', 'Pass health inspection', false, 1),
  ('Finish Production Build-Out', 'Install walk-in cooler', false, 2),
  ('Finish Production Build-Out', 'Hire and train kitchen staff', true, 3),
  ('Finish Production Build-Out', 'Complete equipment safety check', true, 4),
  ('Launch Soft Distribution', 'Define initial delivery zones', false, 0),
  ('Launch Soft Distribution', 'Publish first live weekly menu', false, 1),
  ('Launch Soft Distribution', 'Onboard first 20 customers', false, 2),
  ('Launch Soft Distribution', 'Track delivery time & quality', false, 3),
  ('Launch Soft Distribution', 'Collect feedback, fix issues', false, 4),
  ('Scale Distribution', 'Expand delivery zones city-wide', false, 0),
  ('Scale Distribution', 'Increase weekly production capacity', false, 1),
  ('Scale Distribution', 'Hire additional delivery drivers', false, 2),
  ('Scale Distribution', 'Launch broader marketing push', false, 3)
) AS s(goal_name, text, done, sort_order) ON s.goal_name = g.name;
