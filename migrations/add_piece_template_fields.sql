-- Marketing project items become real "pieces" with production details --
-- format, size, a reference link, a status/flow stage, a price, and an
-- optional schedule date. task_id links a scheduled piece to a real row in
-- the unified tasks table (department='Marketing') so it actually shows up
-- on the existing Operations Hub dashboard instead of a disconnected
-- calendar.

BEGIN;

ALTER TABLE marketing_project_items
  ADD COLUMN format TEXT,
  ADD COLUMN size TEXT,
  ADD COLUMN template_link TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'idea',
  ADD COLUMN price_cents INTEGER,
  ADD COLUMN scheduled_date DATE,
  ADD COLUMN notes TEXT,
  ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX idx_marketing_project_items_scheduled_date ON marketing_project_items(scheduled_date);

COMMIT;
