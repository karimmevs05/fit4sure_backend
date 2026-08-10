-- One row per actual receipt (a single Drive scan, or one manual/screenshot
-- entry), linking together the expense line items it produced and a direct
-- view link back to the source image in Google Drive. `drive_file_id` is
-- UNIQUE so it doubles as the guard against re-processing a receipt whose
-- Drive archive-move previously failed (Postgres allows multiple NULLs in a
-- unique column, so manual/screenshot entries with no Drive file are fine).
CREATE TABLE IF NOT EXISTS receipt_scans (
  id SERIAL PRIMARY KEY,
  vendor VARCHAR(255),
  receipt_date DATE,
  total_amount_cents INTEGER,
  drive_file_id VARCHAR(255) UNIQUE,
  drive_view_link TEXT,
  low_confidence BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_scan_id INTEGER REFERENCES receipt_scans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_receipt_scan_id ON expenses(receipt_scan_id);
