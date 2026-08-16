-- ============================================================================
-- Migration: customer_lists, automation_rules/steps/enrollments, crm_tasks
-- ============================================================================
--
-- NOTE: the source package (f4s-automations-lists-tasks-FULL) named the
-- human-task table `tasks`, which collides with the real, already-live
-- Operations Hub `tasks` table (owner_id, priority, status, due_date, ...).
-- Renamed to `crm_tasks` throughout -- table, routes (/crm-tasks), and every
-- query referencing it -- so this never silently no-ops the CREATE TABLE or
-- shadows the real /api/admin/tasks routes.

-- Lists: a named, curated set of customers -- the safe way to mass-trigger
-- a sequence (pick a list, not "everyone").
CREATE TABLE IF NOT EXISTS customer_lists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_list_members (
  list_id INTEGER NOT NULL REFERENCES customer_lists(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (list_id, customer_id)
);

-- A rule = a trigger + an ordered sequence of steps.
CREATE TABLE IF NOT EXISTS automation_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,     -- 'time_since_last_order' | 'stage_enter' | 'manual'
  trigger_config JSONB,           -- {"days": 14} for time_since_last_order, {"stage": "trial"} for stage_enter, null for manual
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_steps (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,  -- days after the previous step (or after enrollment, for step 1)
  action_type TEXT NOT NULL,              -- 'send_email' | 'send_sms' | 'create_task'
  template_id INTEGER REFERENCES communication_templates(id),  -- for send_email/send_sms
  task_title TEXT,                        -- for create_task
  task_description TEXT                   -- for create_task
);

CREATE INDEX IF NOT EXISTS idx_automation_steps_rule_id ON automation_steps(rule_id, step_order);

-- One row per customer currently moving through a rule's steps. This is
-- what the scheduler actually scans -- "what's due to fire right now".
CREATE TABLE IF NOT EXISTS automation_enrollments (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,  -- 0 = not yet run step 1
  status TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'completed' | 'cancelled'
  source TEXT NOT NULL,                     -- 'trigger' | 'manual'
  next_run_at TIMESTAMP NOT NULL,
  enrolled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (rule_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_enrollments_due ON automation_enrollments(status, next_run_at);

-- Human-facing side of automations, plus anything logged manually later.
-- Renamed from the package's `tasks` -- see note at top of file.
CREATE TABLE IF NOT EXISTS crm_tasks (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMP,
  completed_at TIMESTAMP,
  source_automation_rule_id INTEGER REFERENCES automation_rules(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_open ON crm_tasks(completed_at, due_at);

-- Run once against Railway Postgres. Nothing here touches existing tables
-- except adding foreign keys out to customers/communication_templates.
