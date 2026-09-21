-- Marketing "Projects" -- a named grouping of content pieces (e.g. "This
-- Week's Breakfast Push"), each piece being one uploaded Drive photo
-- (optionally linked to a recipe for real macros). Replaces the flat
-- 22-photo grid with tabs the user actually organizes.

BEGIN;

CREATE TABLE marketing_projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id INTEGER REFERENCES users(user_id)
);

CREATE TABLE marketing_project_items (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES marketing_projects(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  recipe_id INTEGER REFERENCES recipes(recipe_id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, drive_file_id)
);

CREATE INDEX idx_marketing_project_items_project_id ON marketing_project_items(project_id);

COMMIT;
