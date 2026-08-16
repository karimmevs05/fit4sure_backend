// Field mapping between Operations Hub tasks (generic cross-department,
// day-to-day) and Task Management's launch_tasks (launch checklist,
// budget/investor-aware). The two schemas don't line up 1:1, so these
// mappings are lossy in places -- documented inline. Kept in one place so
// both adminTasks.js and launchTasks.js apply the exact same rules.

// priority (critical/high/medium/low) <-> urgency (critical/workon/eventually)
// Lossy: high and medium both collapse to "workon" going one way; coming
// back, "workon" always expands to "medium" (not "high") -- a task bumped
// to Ops Hub "high" and then edited from the Task Management side will
// settle at "medium" if urgency is touched again.
const PRIORITY_TO_URGENCY = { critical: 'critical', high: 'workon', medium: 'workon', low: 'eventually' }
const URGENCY_TO_PRIORITY = { critical: 'critical', workon: 'medium', eventually: 'low' }

function priorityToUrgency(priority) {
  return PRIORITY_TO_URGENCY[priority] || 'workon'
}
function urgencyToPriority(urgency) {
  return URGENCY_TO_PRIORITY[urgency] || 'medium'
}

// department (9 values) <-> tag (4 values). Lossy: several departments
// collapse onto the same tag; the reverse mapping always lands on one
// canonical department per tag, so editing tag from the Task Management
// side can normalize away a more specific original department.
const DEPARTMENT_TO_TAG = {
  Kitchen: 'operations',
  Procurement: 'operations',
  Operations: 'operations',
  Finance: 'admin',
  Administration: 'admin',
  Personal: 'admin',
  Marketing: 'marketing',
  Sales: 'sales',
  'Customer Success': 'sales',
}
const TAG_TO_DEPARTMENT = { operations: 'Operations', admin: 'Administration', marketing: 'Marketing', sales: 'Sales' }

function departmentToTag(department) {
  return DEPARTMENT_TO_TAG[department] || 'operations'
}
function tagToDepartment(tag) {
  return TAG_TO_DEPARTMENT[tag] || 'Operations'
}

// status: Ops Hub has 6 states, launch_tasks has 2 (open/done).
// Lossy: not_started/in_progress/waiting/blocked all collapse to "open";
// completed/cancelled both collapse to "done". Reopening from the Task
// Management side always lands on "not_started", losing in_progress/
// waiting/blocked distinctions.
const OPS_STATUS_TO_LAUNCH_STATUS = {
  not_started: 'open', in_progress: 'open', waiting: 'open', blocked: 'open',
  completed: 'done', cancelled: 'done',
}

function opsStatusToLaunchStatus(status) {
  return OPS_STATUS_TO_LAUNCH_STATUS[status] || 'open'
}
function launchStatusToOpsStatus(status) {
  return status === 'done' ? 'completed' : 'not_started'
}

// launch_tasks.due_date is NOT NULL; Ops Hub tasks can lack an explicit
// due_date (recurring tasks keyed on week_start + operational_day instead).
// Derive one so every ops task can be mirrored; return null only when
// there's truly nothing to derive from (mirror creation is skipped then).
const OPERATIONAL_DAY_OFFSET = { saturday: -1, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 }

function deriveDueDate(opsTask) {
  if (opsTask.due_date) return opsTask.due_date
  if (opsTask.week_start && opsTask.operational_day) {
    const offset = OPERATIONAL_DAY_OFFSET[opsTask.operational_day]
    const d = new Date(opsTask.week_start)
    d.setDate(d.getDate() + offset)
    return d.toISOString().slice(0, 10)
  }
  return null
}

module.exports = {
  priorityToUrgency,
  urgencyToPriority,
  departmentToTag,
  tagToDepartment,
  opsStatusToLaunchStatus,
  launchStatusToOpsStatus,
  deriveDueDate,
}
