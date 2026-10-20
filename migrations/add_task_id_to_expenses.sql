-- Mobile team PM tool, Step 2 (f4s-team-pm-tool-spec.md) -- lets a cost
-- logged from a task's quick-add actually be queried back per-task (the
-- "cost + paid pill" on the Tasks screen), without inventing a second
-- cost log. Nullable: an expense doesn't have to come from a task (most
-- of the existing 169 rows won't).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_task_id ON expenses(task_id) WHERE task_id IS NOT NULL;
