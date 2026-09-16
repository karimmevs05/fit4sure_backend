-- Ops Hub's own cross-cutting dashboards (bare task list, weekly summary,
-- today-overview, my-focus) query `tasks` with no department/week scoping,
-- because until now every row in `tasks` genuinely was an Ops Hub task.
-- Now that launch-checklist and customer-follow-up tasks live in the same
-- table, those dashboards need an explicit way to exclude them, or a
-- kitchen manager's "My Focus" list would suddenly include marketing
-- launch-checklist items and customer follow-ups.
--
-- Defaults true (every existing/future task is an Ops Hub task unless
-- flagged otherwise) so this is a no-op for the rows that already matter to
-- Ops Hub; only the tasks migrated from launch_tasks/crm_tasks get flipped.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_ops_task BOOLEAN NOT NULL DEFAULT true;

-- Every launch_tasks row now has ops_task_id set (unify_task_systems.sql
-- linked the 15 launch-native ones in step 4), so ops_task_id alone can no
-- longer tell a genuine ops-hub-originated mirror apart from a launch-native
-- task that just got a new tasks row. createLaunchMirror always wrote
-- source_ref = 'Operations Hub task #<id>' for a real mirror -- verified
-- against the live data that this pattern plus one pre-existing mirror
-- (ops_task_id 9, from before that source_ref line was added, identifiable
-- instead by having real operational_day/week_start scheduling set, which
-- no launch-native task ever has) accounts for exactly the 7 tasks that
-- predate this migration. Everything else linked from launch_tasks, plus
-- every migrated customer-follow-up, is not a real ops task.
UPDATE tasks t SET is_ops_task = false
WHERE t.source_type = 'customer'
   OR t.id IN (
     SELECT lt.ops_task_id FROM launch_tasks lt
     WHERE lt.ops_task_id IS NOT NULL
       AND lt.source_ref IS DISTINCT FROM ('Operations Hub task #' || lt.ops_task_id)
       AND lt.ops_task_id != 9
   );
