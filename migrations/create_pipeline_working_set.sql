-- The Sales Pipeline's "working set" (who's actively being worked right
-- now, ticked from the Customers tab) used to live only in React state on
-- one browser tab -- gone on refresh, invisible to any other admin or
-- device, and invisible to any future automation/agent that needs to know
-- who's currently being worked. This makes it a real, shared row set.
CREATE TABLE IF NOT EXISTS pipeline_working_set (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by_user_id INTEGER REFERENCES users(user_id)
);
