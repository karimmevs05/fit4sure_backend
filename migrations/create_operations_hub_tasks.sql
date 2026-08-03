-- Operations Hub V1: generic cross-department task manager.
-- Replaces the old taskManagementAuto.js production schedule.

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  department VARCHAR(50),          -- primary/home department, informational only
  status VARCHAR(20) NOT NULL DEFAULT 'available', -- available, busy, off
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  department VARCHAR(50) NOT NULL, -- Kitchen, Sales, Marketing, Customer Success,
                                    -- Procurement, Finance, Operations, Administration, Personal
  owner_id INTEGER REFERENCES staff(id),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',      -- critical, high, medium, low
  status VARCHAR(20) NOT NULL DEFAULT 'not_started',   -- not_started, in_progress, waiting,
                                                        -- blocked, completed, cancelled
  due_date DATE,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  source_type VARCHAR(50),         -- order, customer, recipe, inventory_item, menu_plate, ...
  source_id INTEGER,               -- no FK: source_type determines which table it points at
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  staff_id INTEGER REFERENCES staff(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source_type, source_id);
