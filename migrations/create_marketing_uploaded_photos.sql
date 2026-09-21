-- Direct photo uploads for Marketing "Create piece" -- a Google service
-- account has zero storage quota and cannot create files in a personal My
-- Drive folder (only Shared Drives, which need a paid Workspace plan), so
-- uploads from the user's device are stored here instead. Referenced
-- elsewhere as a piece "file_id" of the form 'local:<id>'.

CREATE TABLE marketing_uploaded_photos (
  id SERIAL PRIMARY KEY,
  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
