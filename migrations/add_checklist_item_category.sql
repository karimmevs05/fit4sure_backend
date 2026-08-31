-- Lets the SOP page color-code each recipe's column by its own category
-- even when multiple categories are combined into one task (one section per
-- operational day/phase instead of one task per category).
ALTER TABLE task_checklist_items ADD COLUMN IF NOT EXISTS category VARCHAR(30);
