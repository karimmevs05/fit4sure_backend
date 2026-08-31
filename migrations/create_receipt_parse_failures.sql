-- Tracks how many times a given Drive file has failed to parse, across
-- separate sync runs (a receipt that fails stays in the inbox and gets
-- re-attempted on every "Sync Now" click, so this needs to persist between
-- runs, not just live in memory for one call). Once a file crosses the
-- quarantine threshold in googleDriveSync.js, it gets moved out of the
-- inbox into a "Needs Attention" folder instead of retrying forever.
CREATE TABLE IF NOT EXISTS receipt_parse_failures (
  drive_file_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  last_attempted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
