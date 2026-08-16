-- ============================================================================
-- Migration: recipe_steps
-- ============================================================================
-- Structured, ordered prep steps per recipe -- title + free-text description
-- + optional time estimate. Replaces the single `instructions` text blob as
-- the primary way recipes are written; `recipes.instructions` is kept and
-- still auto-populated (as a joined plain-text version of the steps) so any
-- other part of the app still reading that column keeps working unchanged.

CREATE TABLE IF NOT EXISTS recipe_steps (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  title TEXT,
  description TEXT NOT NULL,
  time_estimate_minutes INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_id ON recipe_steps(recipe_id);

-- Run this once against the Railway Postgres instance (same way menuplan-1
-- was applied). Nothing here touches existing rows -- recipes with no steps
-- yet just return an empty steps array until you add some.
