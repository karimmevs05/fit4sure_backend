-- Mobile team PM tool (f4s-team-pm-tool-spec.md) -- Step 1: PIN login
-- column + a fresh 3-phase launch tracker. See the spec for the full
-- decision trail (2026-10-20).
--
-- PIN login is a second entry point onto the EXISTING users/JWT system --
-- not a parallel auth system. A successful PIN check mints the same JWT
-- requireAuth already verifies everywhere, so no other endpoint needs to
-- change for mobile to work. Hashed with bcrypt (pin_hash), same as
-- password_hash, even though a 4-digit PIN's keyspace is small -- the
-- point is "not plaintext in the DB," not "uncrackable."
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Deliberately NOT a reuse or relabel of launch_milestones (6 fixed rows,
-- untouched/stale since 2026-08-07 -- a different, pre-existing concept:
-- "global launch-readiness gates," not phases of the business). This is a
-- new, separate 3-row table the team edits by hand -- no derivation logic
-- from the old table, no shared ownership between the two.
CREATE TABLE IF NOT EXISTS launch_phases (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, complete
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO launch_phases (name, sort_order)
SELECT name, sort_order FROM (VALUES
  ('Production', 0),
  ('Soft Distribution', 1),
  ('Scale Distribution', 2)
) AS seed(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM launch_phases);
