-- Gates when a week's recipe plan actually goes live on the public
-- ordering page. Before this migration, getWeeklyMenu() considered a week
-- "ready" the instant any block had a recipe saved -- so every "Save
-- Block" click during planning was immediately visible to real customers.
-- Presence of a row for a given planned_week_start now means that week has
-- been explicitly published; getWeeklyMenu() checks for it instead of
-- inferring readiness from block contents.
CREATE TABLE IF NOT EXISTS weekly_menu_publish_state (
  planned_week_start DATE PRIMARY KEY,
  published_at TIMESTAMP NOT NULL DEFAULT NOW()
);
