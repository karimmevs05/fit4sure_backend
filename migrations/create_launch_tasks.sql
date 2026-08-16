-- Launch Task Management Dashboard.
-- Prefixed launch_ to avoid colliding with the existing Operations Hub
-- tasks/staff schema (create_operations_hub_tasks.sql) -- separate tool,
-- separate tables. This dashboard replaces the Operations Hub nav entry
-- but does not touch its backend.

CREATE TABLE IF NOT EXISTS launch_tasks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,                        -- Karim, Xavier
  tag TEXT NOT NULL,                          -- operations, admin, marketing, sales
  urgency TEXT NOT NULL DEFAULT 'workon',     -- critical, workon, eventually
  due_date DATE NOT NULL,
  budget_cents INTEGER NOT NULL DEFAULT 0,    -- 0 = no budget set
  committed_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',        -- open, done
  needs_decision BOOLEAN NOT NULL DEFAULT false,
  source_ref TEXT,
  note TEXT,
  note_updated_at TIMESTAMP,
  note_updated_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- paid_cents is NEVER stored here -- it's SUM(launch_task_expenses.amount_cents)
-- computed at query time, same pattern as the mockup's recomputeTaskPaid().

CREATE TABLE IF NOT EXISTS launch_task_expenses (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES launch_tasks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS launch_task_todos (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES launch_tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  urgency TEXT NOT NULL DEFAULT 'workon',     -- critical, workon, eventually -- independent of parent task
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS launch_day_notes (
  date DATE PRIMARY KEY,
  note TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS launch_activity_log (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES launch_tasks(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,                         -- note, expense, attachment, complete, decision_flag, status_change
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Milestone gates (Lease secured -> Permits cleared -> Kitchen ready ->
-- Systems ready -> Soft launch -> Open). Manually set per milestone for v1,
-- not derived from task completion -- decided with Karim (2026-08-07).
CREATE TABLE IF NOT EXISTS launch_milestones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, complete
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO launch_milestones (name, sort_order)
SELECT name, sort_order FROM (VALUES
  ('Lease secured', 0),
  ('Permits cleared', 1),
  ('Kitchen ready', 2),
  ('Systems ready', 3),
  ('Soft launch', 4),
  ('Open', 5)
) AS seed(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM launch_milestones);

CREATE INDEX IF NOT EXISTS idx_launch_tasks_due_date ON launch_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_launch_tasks_owner ON launch_tasks(owner);
CREATE INDEX IF NOT EXISTS idx_launch_tasks_status ON launch_tasks(status);
CREATE INDEX IF NOT EXISTS idx_launch_task_expenses_task ON launch_task_expenses(task_id);
CREATE INDEX IF NOT EXISTS idx_launch_task_todos_task ON launch_task_todos(task_id);
CREATE INDEX IF NOT EXISTS idx_launch_activity_log_task ON launch_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_launch_activity_log_created ON launch_activity_log(created_at DESC);
