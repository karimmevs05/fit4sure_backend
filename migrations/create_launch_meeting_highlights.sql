-- Quick-entry "big topics" list for the task dashboard, deliberately
-- separate from the auto-generated Next meeting topics agenda (which is
-- derived from overdue/critical/decision tasks). This is a manual,
-- freeform highlight someone wants to make sure gets raised live.
CREATE TABLE IF NOT EXISTS launch_meeting_highlights (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launch_meeting_highlights_created ON launch_meeting_highlights(created_at);
