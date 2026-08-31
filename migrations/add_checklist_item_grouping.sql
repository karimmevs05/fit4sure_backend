-- Lets the SOP page group a batch task's checklist by recipe (group_label)
-- and style each line by what kind of instruction it is (line_kind), instead
-- of the frontend having to parse "{Recipe Name}: {text}" out of the label
-- string. Existing rows (created before this column existed) are left
-- NULL -- the SOP page falls back to an "Other" column/plain-line rendering
-- for those, nothing breaks.

ALTER TABLE task_checklist_items ADD COLUMN IF NOT EXISTS group_label VARCHAR(255);
-- mise_en_place, step, qc, portion, label, cleanup, portion_raw
ALTER TABLE task_checklist_items ADD COLUMN IF NOT EXISTS line_kind VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_task_checklist_items_group_label ON task_checklist_items(task_id, group_label);
