-- Unifies the 3 parallel task systems (Ops Hub `tasks`, Task Management's
-- `launch_tasks`, and the Pipeline's `crm_tasks`) into one canonical table:
-- `tasks`. Decided with Karim (2026-09-15) -- AI agents need one task list
-- to read/write, not three with a lossy bidirectional mirror between two of
-- them and a third that's fully isolated.
--
-- Old tables (launch_tasks, launch_task_expenses, launch_task_todos,
-- crm_tasks) are left in place, untouched, as a historical/rollback copy --
-- application code stops writing to them after this migration, so they'll
-- go stale on purpose. launch_activity_log and launch_milestones are NOT
-- being folded in: activity log gets repointed at the unified tasks.id
-- (still a useful audit trail), milestones are a separate concept (global
-- launch-readiness gates, not per-task) and untouched entirely.
--
-- Every existing API endpoint's request/response shape stays identical
-- (see adminTasks.js, launchTasks.js, adminAutomations.js rewrites) -- this
-- is a storage change, not a product change. Nothing on any page should
-- look or behave differently after this ships.

BEGIN;

-- 1. Extend tasks with the fields only launch_tasks/crm_tasks had.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS budget_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS committed_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS needs_decision BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS note_updated_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS note_updated_by TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_ref TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS system_source VARCHAR(30)
  CHECK (system_source IN ('stale_flag', 'win_probability_drop', 'automation'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_automation_rule_id INTEGER REFERENCES automation_rules(id);

-- task_expenses replaces launch_task_expenses, FK'd to the unified table.
CREATE TABLE IF NOT EXISTS task_expenses (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_expenses_task ON task_expenses(task_id);

-- launch_task_todos folds into the existing task_checklist_items -- same
-- shape (label/is_completed/sort_order) plus the one field it's missing.
ALTER TABLE task_checklist_items ADD COLUMN IF NOT EXISTS urgency TEXT;

-- 2. The 7 launch_tasks rows already mirrored into tasks (ops_task_id set)
-- just need their launch-only fields backfilled onto the row that already
-- exists -- no new row.
UPDATE tasks t
SET budget_cents = lt.budget_cents,
    committed_cents = lt.committed_cents,
    needs_decision = lt.needs_decision,
    note = lt.note,
    note_updated_at = lt.note_updated_at,
    note_updated_by = lt.note_updated_by,
    source_ref = COALESCE(t.source_ref, lt.source_ref)
FROM launch_tasks lt
WHERE lt.ops_task_id = t.id;

-- 3. The remaining launch-native rows (no ops mirror) become real new
-- tasks rows. _migrate_launch_id is a temporary scratch column, dropped at
-- the end, just to correlate old launch_tasks.id -> new tasks.id for
-- migrating child rows (expenses/todos/activity log) in the next step.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS _migrate_launch_id INTEGER;

INSERT INTO tasks (
  title, department, owner_id, priority, due_date, status, completed_at,
  budget_cents, committed_cents, needs_decision, note, note_updated_at, note_updated_by,
  source_ref, created_at, updated_at, _migrate_launch_id
)
SELECT
  lt.name,
  CASE lt.tag
    WHEN 'operations' THEN 'Operations'
    WHEN 'admin' THEN 'Administration'
    WHEN 'marketing' THEN 'Marketing'
    WHEN 'sales' THEN 'Sales'
    ELSE 'Operations'
  END,
  lt.owner_id,
  CASE lt.urgency
    WHEN 'critical' THEN 'critical'
    WHEN 'workon' THEN 'medium'
    WHEN 'eventually' THEN 'low'
    ELSE 'medium'
  END,
  lt.due_date,
  CASE lt.status WHEN 'done' THEN 'completed' ELSE 'not_started' END,
  CASE WHEN lt.status = 'done' THEN lt.updated_at ELSE NULL END,
  lt.budget_cents, lt.committed_cents, lt.needs_decision, lt.note, lt.note_updated_at, lt.note_updated_by,
  lt.source_ref, lt.created_at, lt.updated_at, lt.id
FROM launch_tasks lt
WHERE lt.ops_task_id IS NULL;

-- 4. Point every migrated launch_tasks row at its new unified row -- from
-- here on, ops_task_id is the universal link for every launch_tasks row,
-- not just the ones that started life in Ops Hub.
UPDATE launch_tasks lt
SET ops_task_id = t.id
FROM tasks t
WHERE t._migrate_launch_id = lt.id;

-- 5. Migrate child rows via that linkage.
INSERT INTO task_expenses (task_id, date, description, amount_cents, created_by, created_at)
SELECT lt.ops_task_id, e.date, e.description, e.amount_cents, e.created_by, e.created_at
FROM launch_task_expenses e
JOIN launch_tasks lt ON lt.id = e.task_id;

INSERT INTO task_checklist_items (task_id, label, is_completed, sort_order, urgency)
SELECT lt.ops_task_id, td.text, td.done, td.sort_order, td.urgency
FROM launch_task_todos td
JOIN launch_tasks lt ON lt.id = td.task_id;

-- Drop the old launch_tasks-pointing constraint before repointing the data,
-- not after -- the new task_id values are tasks.id values, which the old
-- constraint (still referencing launch_tasks) would reject.
ALTER TABLE launch_activity_log DROP CONSTRAINT IF EXISTS launch_activity_log_task_id_fkey;

UPDATE launch_activity_log al
SET task_id = lt.ops_task_id
FROM launch_tasks lt
WHERE al.task_id = lt.id;

ALTER TABLE launch_activity_log
  ADD CONSTRAINT launch_activity_log_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- 6. Migrate crm_tasks (customer follow-ups) into tasks, using the same
-- source_type/source_id pattern already used for order/recipe/inventory
-- links -- 'customer' is a new source_type value, not a new column.
INSERT INTO tasks (
  title, description, department, due_date, status, completed_at,
  source_type, source_id, system_source, source_automation_rule_id, created_at, updated_at
)
SELECT
  ct.title, ct.description, 'Customer Success', ct.due_at::date,
  CASE WHEN ct.completed_at IS NOT NULL THEN 'completed' ELSE 'not_started' END,
  ct.completed_at, 'customer', ct.customer_id, ct.system_source, ct.source_automation_rule_id,
  ct.created_at, COALESCE(ct.completed_at, ct.created_at)
FROM crm_tasks ct;

ALTER TABLE tasks DROP COLUMN _migrate_launch_id;

COMMIT;
