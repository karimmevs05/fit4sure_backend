# Fit4Sure Team PM Tool — Mobile Entry Point

Status: **DRAFT — open questions below must be resolved before build starts.**
Written by Claude Code from Karim's voice-note request (2026-10-20), after auditing both repos. Not yet approved.

## Goal

A tool to keep the team accountable through the launch of Fit4Sure, now that the
business has moved into the kitchen phase. The focus is shifting from
production setup to distribution, and this tool should make it obvious at a
glance how that shift is going — what's open, what's overdue, who owns what,
and how far along each phase is.

It is not a separate launch-only tool — it's meant to become the team's
ongoing project management tool, pinned in the WhatsApp group as the one link
everyone checks.

## Audit findings (read this before the plan)

The backend already has almost all of the data model this needs. Building a
new parallel system would undo work already done on 2026-09-15 to *unify*
three separate task systems into one (`migrations/unify_task_systems.sql`).
This tool should be a **mobile-first view on top of what already exists**,
not a new set of tables.

Already live and reusable:
- **`tasks`** table — `owner_id` (FK → `users`), `due_date`, `status`,
  `completed_at`, `budget_cents`, `committed_cents`, `note`, `source_ref`
  (a link field), `department`, `priority`. API: `src/routes/admin/launchTasks.js`
  (709 lines, mounted at `/api/admin/launch-tasks`) — full CRUD already exists.
- **`task_expenses`** — `date`, `description`, `amount_cents`, `created_by`,
  FK'd to `tasks`. A task's `paid_cents` is literally `SUM(task_expenses.amount_cents)`
  computed at query time — there is no separate paid/unpaid state today;
  logging an expense **is** marking it paid. See open question #3.
- **`task_checklist_items`** — subtasks, has `urgency`.
- **`launch_activity_log`** — audit trail with undo, already repointed at
  the unified `tasks.id`.
- **Day notes** — `src/routes/admin/launchDayNotes.js` already exists; this
  is very likely the backend for the "Notes" screen.
- **The existing Dashboard tab** (`/dashboard` → `src/pages/TaskDashboard.tsx`,
  361 lines) is already a real project-management dashboard: task list/filter,
  activity log with undo, meeting highlights, calendar/day-notes, week
  summary. The new mobile tool should be the phone-shaped front door to this
  same data, not a rebuild of it.
- **Team members** — Xavier, Agnes, Robert (as "Robert Pardo"), and Karim
  already exist as active `users` rows (role: admin). **Brandon does not
  have an account yet.** No new "members" migration is needed beyond adding
  Brandon.
- **A cost sheet very likely already exists**: `expenses` table (169 real
  rows live in production right now) with `vendor`, `amount`, `category`,
  `date`, `description`, `status`, `receipt_scan_id`, `source_type`,
  `approved_by`, `approved_at` — a full receipt-scan-and-approve workflow
  (`src/routes/admin/adminExpenses.js`, `src/services/receiptProcessor.js`),
  surfaced today in `src/pages/Financials.tsx`. This is almost certainly
  "the cost sheet" referenced below. **Per Karim's explicit instruction this
  is being left open, not wired up — flagged here, not assumed.** See open
  question #2.

Conflicts / gaps found:
- **Phases**: a separate `launch_milestones` table already exists (6 fixed
  rows: Lease secured → Permits cleared → Kitchen ready → Systems ready →
  Soft launch → Open). Checked production directly: **all 6 are still
  `not_started`** — this table has not been touched since it was seeded on
  2026-08-07, despite real progress since then ("we've now moved into the
  kitchen"). It does not match the 3-phase model this spec asks for
  (production → soft distribution → scale distribution). It was explicitly
  *not* folded into the September unification ("a separate concept — global
  launch-readiness gates, not per-task"). See open question #1.
- **PIN login**: does not exist anywhere in either repo. The existing admin
  app uses email+password → JWT (`src/routes/auth.js`, `requireAuth`/
  `requireRole` middleware). No PIN table, no PIN column on `users`. Net new.
  See open question #4.
- **Receipt upload for the quick-add cost block**: no generic file-upload
  endpoint exists. The `adminExpenses.js` receipt-scan pipeline (above)
  accepts a receipt image today — if question #2 resolves toward reusing
  `expenses`, this may already solve it. If not, it's net-new infra
  (storage + endpoint). See open question #5.
- **`/order`** is a separate static vanilla-JS page outside the React SPA
  (no auth, customer-facing). That pattern doesn't fit here — this tool is
  internal and authenticated, so it should be a new route *inside* the
  existing React app with its own mobile layout, not a standalone static
  page.
- **PWA**: no `manifest.json` or service worker exists anywhere. Net new,
  low-risk.

## Who uses it

- **Xavier** — operator, runs day-to-day, building the team.
- **Agnes** — process-driven, accountant, works 9–5 outside the kitchen.
- **Robert** — Xavier's dad, financing + kitchen experience, guiding the business.
- **Brandon** — in and out.
- **Karim** — building the platform, also uses it as a team member.

Everyone is equal on the tool — anyone can create a task, assign it to
anyone, mark it done, log a cost against it.

## Screens

### Home
- Open tasks count, overdue count.
- Spent this month (sum of logged costs this month).
- Phase progress (see open question #1).
- Due this week list.

### Tasks
- Filterable by assignee.
- One-tap mark done.
- Cost + paid pill per task.
- Link icon (opens `source_ref` if set).
- Assignee avatar.

### Calendar
- Month view with due-date dots.
- "Coming up" list below the grid.

### Notes
- Team feed (reuse day notes backend — see audit findings).

### Timeline
- 3 phases: production → soft distribution → scale distribution.
- Each phase shows progress (needs open question #1 resolved first).

### Quick-add (floating "+")
- Task entry: title, due date, assignee, optional link.
- Optional cost/receipt block: amount, description, optional receipt photo.
- Target: under 15 seconds to add a task on a phone.

### Header
- "Full dashboard" button → links to the real web app (`/dashboard`).

## Success criteria

- Anyone on the team taps the WhatsApp-pinned link on their phone and within
  seconds sees what's overdue, what's due, and who owns it.
- Adding a task takes under 15 seconds on a phone.
- Every dollar spent is logged with proof and ends up in the cost sheet
  (destination TBD — see open question #2).
- At-a-glance phase visibility: which phase, how far along.

## Open questions — RESOLVED 2026-10-20

1. **Phases** — RESOLVED: retire `launch_milestones` by leaving it
   completely untouched (not deleted, not migrated). New, separate
   `launch_phases` table: exactly 3 hand-set rows (Production / Soft
   Distribution / Scale Distribution), each with a status and a
   `progress_pct` the team edits directly. No derivation logic from the old
   6-row table.
2. **Cost sheet destination** — RESOLVED: the existing `expenses` table
   (169 real rows, approval workflow, surfaced in `Financials.tsx`) is the
   real cost sheet. Quick-add's cost block creates a real `expenses` row,
   `status='pending'`, `source_type='manual'` — same shape `POST
   /api/admin/expenses` already accepts. It shows up in Financials/the
   approval queue like any other manually-entered expense. `task_expenses`
   is NOT used for this — a mobile-logged cost is a real expense from day
   one, not a second parallel log that would need reconciling with the real
   one later.
3. **"Marked paid and justified"** — RESOLVED by #2: `expenses.status` is
   already `pending | approved | reconciled | rejected`. "Justified" =
   the required vendor/amount/description on the row. "Paid" = status
   reaches `approved` or `reconciled` (via the existing Financials
   approve/reject flow — mobile doesn't need its own approval UI for v1,
   it just creates the pending row and shows its current status).
4. **PIN login** — RESOLVED: Karim assigns a PIN to each person as part of
   the seed step (needs the actual PIN values from Karim before Step 1
   runs — not invented here). A PIN login mints the same JWT
   `requireAuth` already expects, so every existing authenticated endpoint
   works immediately with no changes. Session length: TBD at build time,
   defaulting to a long-lived mobile session (weeks) unless told otherwise,
   since re-entering a PIN often on a phone defeats the point.
5. **Receipt upload storage** — mostly resolved as a non-issue:
   `POST /api/admin/expenses/scan-receipt` already does AI OCR on a
   base64 image today, but — checked directly — it does **not** persist
   the image anywhere (no S3/Drive write in that code path; the only
   existing persistent photo storage is a separate Google Drive sync
   pipeline this tool isn't plugging into). Recommendation, not yet
   confirmed: quick-add's receipt photo is OCR'd for auto-fill convenience
   only (vendor/amount) and then discarded, same as the existing
   `/save-receipt-items` grocery-receipt path — no new file storage infra
   needed for v1. Flagging this recommendation in the build-order message
   rather than re-opening it as a separate question.
6. **Brandon's account** — RESOLVED: create a real `users` row for him in
   the Step 1 seed, same as everyone else.
