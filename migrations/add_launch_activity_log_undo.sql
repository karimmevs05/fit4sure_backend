-- Lets specific activity-log entries carry exactly what's needed to reverse
-- them (previous field values, or the id/snapshot of a related row) instead
-- of trying to re-derive intent from the human-readable `text` sentence,
-- which is lossy by design. undone_at guards against double-undo and lets
-- the feed show an entry as already reversed.
ALTER TABLE launch_activity_log
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS undone_at TIMESTAMP;
