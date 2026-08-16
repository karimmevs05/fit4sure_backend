-- Operations Hub tasks now mirror into the Task Management dashboard
-- (launch_tasks) automatically, kept in sync both ways. One launch_task
-- optionally links back to the ops task it was created from.
-- ON DELETE CASCADE: deleting the ops task deletes its mirror automatically.
-- The reverse (deleting the launch_task deletes the ops task) is handled in
-- application code in launchTasks.js, since a FK can only cascade one way.

ALTER TABLE launch_tasks ADD COLUMN IF NOT EXISTS ops_task_id INTEGER UNIQUE REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_launch_tasks_ops_task_id ON launch_tasks(ops_task_id);
