-- Operations Hub V1 (part 2): business-week scheduling + recurring templates.
-- Extends the tasks/staff tables added by create_operations_hub_tasks.sql.
--
-- Operational week is Saturday..Friday, Sunday-anchored via week_start:
--   saturday = week_start - 1 day, sunday = week_start + 0, monday = +1,
--   tuesday = +2, wednesday = +3, thursday = +4, friday = +5.

CREATE TABLE IF NOT EXISTS task_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  department VARCHAR(50) NOT NULL,
  operational_day VARCHAR(10) NOT NULL, -- saturday..friday
  default_owner_id INTEGER REFERENCES staff(id),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- critical, high, medium, low
  estimated_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_template_items (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS operational_day VARCHAR(10); -- saturday..friday
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS week_start DATE; -- Sunday-anchored, matches existing week convention
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_template_id INTEGER REFERENCES task_templates(id);

CREATE INDEX IF NOT EXISTS idx_task_templates_operational_day ON task_templates(operational_day);
CREATE INDEX IF NOT EXISTS idx_tasks_operational_day ON tasks(operational_day);
CREATE INDEX IF NOT EXISTS idx_tasks_week_start ON tasks(week_start);
CREATE INDEX IF NOT EXISTS idx_tasks_recurring_template ON tasks(recurring_template_id);
