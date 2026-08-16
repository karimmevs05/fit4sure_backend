-- Unify identity: the users table (auth) becomes the single source of truth
-- for "who is this person", replacing the separate (and currently empty)
-- staff table and the Task Dashboard's free-text owner field.
-- Decided with Karim (2026-08-07): individual logins, single-tier admin
-- permissions, unify staff/users/launch_tasks.owner into one table.

ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'available'; -- available, busy, off

-- Repoint Operations Hub's staff FKs at users before dropping staff (staff
-- has 0 rows, so this is a pure schema change, no data to migrate).
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_owner_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(user_id);

ALTER TABLE task_templates DROP CONSTRAINT IF EXISTS task_templates_default_owner_id_fkey;
ALTER TABLE task_templates ADD CONSTRAINT task_templates_default_owner_id_fkey FOREIGN KEY (default_owner_id) REFERENCES users(user_id);

ALTER TABLE task_comments DROP CONSTRAINT IF EXISTS task_comments_staff_id_fkey;
ALTER TABLE task_comments ADD CONSTRAINT task_comments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES users(user_id);

DROP TABLE IF EXISTS staff;

-- launch_tasks.owner (free text 'Karim'/'Xavier') -> owner_id FK. launch_tasks
-- has 0 rows currently, so no data migration needed.
ALTER TABLE launch_tasks DROP COLUMN IF EXISTS owner;
ALTER TABLE launch_tasks ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(user_id);

CREATE INDEX IF NOT EXISTS idx_launch_tasks_owner_id ON launch_tasks(owner_id);
