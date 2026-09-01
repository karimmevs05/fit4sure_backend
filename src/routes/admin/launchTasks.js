const express = require('express')
const router = express.Router()
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')
const { urgencyToPriority, tagToDepartment, launchStatusToOpsStatus } = require('../../utils/taskSync')

// ============================================================================
// LAUNCH TASK MANAGEMENT DASHBOARD -- Fit4Sure launch checklist (budget-aware
// task tracker + investor-facing readiness view). Separate tool from the
// Operations Hub (adminTasks.js) -- deliberately different table names
// (launch_*) so the two never collide, even though this dashboard replaces
// Operations Hub's nav entry.
//
// Owner is a real users.user_id FK (unified identity, decided 2026-08-07) --
// not free text. Actor attribution (who did this) always comes from the
// authenticated request (req.userName), never from the request body, so it
// can't be spoofed by whoever's calling the API.
// ============================================================================

const TAGS = ['operations', 'admin', 'marketing', 'sales']
const URGENCIES = ['critical', 'workon', 'eventually']
const STATUSES = ['open', 'done']

// Project start anchor for phase display buckets -- fixed, not relative to
// "today". week 1-2 = days 0-13 from start, week 3-4 = days 14-27, week 5-8 = 28+.
const PROJECT_START = '2026-08-01'

function validateEnum(value, allowed, field) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    return `${field} must be one of: ${allowed.join(', ')}`
  }
  return null
}

function isForeignKeyViolation(error) {
  return error.code === '23503'
}

// `metadata` is what makes an entry actually undoable -- it captures
// exactly what to restore (a previous field value, a related row's id, or a
// full snapshot of a row that got deleted) rather than trying to re-derive
// intent from the human-readable `text`, which is intentionally lossy.
// Omit it for actions that either can't be sanely undone (a generic
// "created" needs nothing beyond task_id, already on the row) or shouldn't
// be (nothing currently falls in this bucket, but the option exists).
async function logActivity(taskId, actor, type, text, metadata = null) {
  const result = await pool.query(
    `INSERT INTO launch_activity_log (task_id, actor, type, text, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [taskId ?? null, actor, type, text, metadata ? JSON.stringify(metadata) : null]
  )
  return result.rows[0]
}

// Whether an activity-log row can actually be reversed -- every undoable
// entry's metadata carries an `action` naming exactly which branch of
// POST /activity-log/:id/undo applies, so this never has to guess from the
// display `type` (which is reused across genuinely different actions, e.g.
// 'status_change' covers both "reopened" and a milestone note with no
// task_id at all).
function computeCanUndo(row) {
  // Every undo action targets a task (even 'delete_task', which targets the
  // task being undone-out-of-existence) -- if task_id is null the task's
  // since been deleted for real (FK is ON DELETE SET NULL), so there's
  // nothing left to act on regardless of what metadata says.
  return !row.undone_at && !!row.metadata && !!row.metadata.action && row.task_id != null
}

async function fetchTaskRow(id) {
  const result = await pool.query(
    `SELECT t.*, u.display_name AS owner_name,
       COALESCE(e.paid_cents, 0)::int AS paid_cents,
       COALESCE(e.expense_count, 0)::int AS expense_count,
       CASE
         WHEN (t.due_date - $2::date) <= 13 THEN 'week 1-2'
         WHEN (t.due_date - $2::date) <= 27 THEN 'week 3-4'
         ELSE 'week 5-8'
       END AS phase
     FROM launch_tasks t
     LEFT JOIN users u ON t.owner_id = u.user_id
     LEFT JOIN (
       SELECT task_id, SUM(amount_cents) AS paid_cents, COUNT(*) AS expense_count
       FROM launch_task_expenses GROUP BY task_id
     ) e ON e.task_id = t.id
     WHERE t.id = $1`,
    [id, PROJECT_START]
  )
  if (result.rows.length === 0) return null

  const todosResult = await pool.query(
    `SELECT * FROM launch_task_todos WHERE task_id = $1 ORDER BY sort_order, id`,
    [id]
  )
  return { ...result.rows[0], todos: todosResult.rows }
}

// Push edits back to the linked Operations Hub task (see adminTasks.js for
// the other direction). No-op for tasks that didn't originate in Ops Hub
// (ops_task_id null). See src/utils/taskSync.js for the (lossy) mappings.
async function pushLaunchTaskToOpsMirror(launchTask, actor) {
  if (!launchTask.ops_task_id) return
  const beforeResult = await pool.query(`SELECT status, completed_at FROM tasks WHERE id = $1`, [launchTask.ops_task_id])
  if (beforeResult.rows.length === 0) return
  const before = beforeResult.rows[0]
  const newStatus = launchStatusToOpsStatus(launchTask.status)
  const completedAt = newStatus === 'completed' ? (before.status === 'completed' ? before.completed_at : new Date()) : null

  await pool.query(
    `UPDATE tasks SET title = $1, owner_id = $2, department = $3, priority = $4, due_date = $5, status = $6, completed_at = $7, updated_at = NOW()
     WHERE id = $8`,
    [launchTask.name, launchTask.owner_id, tagToDepartment(launchTask.tag), urgencyToPriority(launchTask.urgency), launchTask.due_date, newStatus, completedAt, launchTask.ops_task_id]
  )
}

// Shared by DELETE /:id and the "undo a task creation" branch of
// POST /activity-log/:id/undo -- same cascade either way.
async function deleteLaunchTaskCascade(id) {
  const existing = await pool.query(`SELECT ops_task_id FROM launch_tasks WHERE id = $1`, [id])
  if (existing.rows.length === 0) return false
  // Mirrored from Ops Hub: delete the ops task instead. launch_tasks.ops_task_id
  // has ON DELETE CASCADE, so that automatically deletes this row too.
  if (existing.rows[0].ops_task_id) {
    await pool.query(`DELETE FROM tasks WHERE id = $1`, [existing.rows[0].ops_task_id])
  } else {
    await pool.query(`DELETE FROM launch_tasks WHERE id = $1`, [id])
  }
  return true
}

// ----------------------------------------------------------------------------
// TASKS
// ----------------------------------------------------------------------------

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.display_name AS owner_name,
         COALESCE(e.paid_cents, 0)::int AS paid_cents,
         COALESCE(e.expense_count, 0)::int AS expense_count,
         CASE
           WHEN (t.due_date - $1::date) <= 13 THEN 'week 1-2'
           WHEN (t.due_date - $1::date) <= 27 THEN 'week 3-4'
           ELSE 'week 5-8'
         END AS phase
       FROM launch_tasks t
       LEFT JOIN users u ON t.owner_id = u.user_id
       LEFT JOIN (
         SELECT task_id, SUM(amount_cents) AS paid_cents, COUNT(*) AS expense_count
         FROM launch_task_expenses GROUP BY task_id
       ) e ON e.task_id = t.id
       ORDER BY t.due_date ASC, t.id ASC`,
      [PROJECT_START]
    )

    const taskIds = result.rows.map((t) => t.id)
    const todosByTask = {}
    if (taskIds.length > 0) {
      const todosResult = await pool.query(
        `SELECT * FROM launch_task_todos WHERE task_id = ANY($1::int[]) ORDER BY sort_order, id`,
        [taskIds]
      )
      for (const todo of todosResult.rows) {
        if (!todosByTask[todo.task_id]) todosByTask[todo.task_id] = []
        todosByTask[todo.task_id].push(todo)
      }
    }

    const data = result.rows.map((t) => ({ ...t, todos: todosByTask[t.id] || [] }))
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error listing launch tasks:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/milestones', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM launch_milestones ORDER BY sort_order, id`)
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error listing milestones:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/milestones/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body
    const statusError = validateEnum(status, ['not_started', 'in_progress', 'complete'], 'status')
    if (statusError) return res.status(400).json({ error: statusError })
    if (status === undefined) return res.status(400).json({ error: 'status is required' })

    const result = await pool.query(
      `UPDATE launch_milestones SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Milestone not found' })

    const milestone = result.rows[0]
    await logActivity(null, req.userName, 'status_change', `${req.userName} marked milestone "${milestone.name}" as ${status.replace('_', ' ')}`)
    res.json({ success: true, data: milestone })
  } catch (error) {
    console.error('Error updating milestone:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/activity-log', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20
    const result = await pool.query(
      `SELECT l.*, t.name AS task_name FROM launch_activity_log l
       LEFT JOIN launch_tasks t ON l.task_id = t.id
       ORDER BY l.created_at DESC LIMIT $1`,
      [limit]
    )
    const data = result.rows.map((row) => ({ ...row, can_undo: computeCanUndo(row) }))
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching activity log:', error)
    res.status(500).json({ error: error.message })
  }
})

// Reverses one activity-log entry using the metadata it was logged with
// (see logActivity/computeCanUndo above) -- never re-derived from the
// display `text`. Idempotent: a second call on the same entry 404s via the
// undone_at guard instead of silently double-applying (e.g. re-deleting an
// expense that undo already deleted once).
router.post('/activity-log/:id/undo', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const logResult = await pool.query(`SELECT * FROM launch_activity_log WHERE id = $1`, [req.params.id])
    if (logResult.rows.length === 0) return res.status(404).json({ error: 'Activity entry not found' })
    const entry = logResult.rows[0]

    if (!computeCanUndo(entry)) {
      return res.status(400).json({ error: entry.undone_at ? 'Already undone' : 'This activity can\'t be undone' })
    }

    const who = req.userName
    const meta = entry.metadata
    const taskId = entry.task_id

    // Re-verify the task is still there right before acting -- computeCanUndo
    // already checked task_id != null against the row we just loaded, but
    // acting on a stale read would be a real correctness bug, not a
    // theoretical one, given how easy it is to fire two undos in a row.
    const taskResult = await pool.query(`SELECT * FROM launch_tasks WHERE id = $1`, [taskId])
    if (taskResult.rows.length === 0) return res.status(400).json({ error: 'The task this belongs to no longer exists' })
    const task = taskResult.rows[0]

    switch (meta.action) {
      case 'delete_task': {
        await deleteLaunchTaskCascade(taskId)
        break
      }
      case 'set_status': {
        const updated = (await pool.query(
          `UPDATE launch_tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [meta.value, taskId]
        )).rows[0]
        await pushLaunchTaskToOpsMirror(updated, who)
        break
      }
      case 'set_needs_decision': {
        await pool.query(`UPDATE launch_tasks SET needs_decision = $1, updated_at = NOW() WHERE id = $2`, [meta.value, taskId])
        break
      }
      case 'restore_fields': {
        const columns = Object.keys(meta.fields)
        if (columns.length === 0) break
        const params = []
        const setClauses = columns.map((col) => { params.push(meta.fields[col]); return `${col} = $${params.length}` })
        params.push(taskId)
        const updated = (await pool.query(
          `UPDATE launch_tasks SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
          params
        )).rows[0]
        await pushLaunchTaskToOpsMirror(updated, who)
        break
      }
      case 'restore_note': {
        await pool.query(
          `UPDATE launch_tasks SET note = $1, note_updated_at = NOW(), note_updated_by = $2, updated_at = NOW() WHERE id = $3`,
          [meta.value ?? '', who, taskId]
        )
        break
      }
      case 'delete_expense': {
        await pool.query(`DELETE FROM launch_task_expenses WHERE id = $1 AND task_id = $2`, [meta.expense_id, taskId])
        break
      }
      case 'add_expense': {
        await pool.query(
          `INSERT INTO launch_task_expenses (task_id, date, description, amount_cents, created_by) VALUES ($1, $2, $3, $4, $5)`,
          [taskId, meta.date, meta.description, meta.amount_cents, who]
        )
        break
      }
      case 'delete_todo': {
        await pool.query(`DELETE FROM launch_task_todos WHERE id = $1 AND task_id = $2`, [meta.todo_id, taskId])
        break
      }
      case 'add_todo': {
        await pool.query(
          `INSERT INTO launch_task_todos (task_id, text, urgency, sort_order) VALUES ($1, $2, $3, $4)`,
          [taskId, meta.text, meta.urgency, meta.sort_order]
        )
        break
      }
      case 'set_todo_done': {
        await pool.query(`UPDATE launch_task_todos SET done = $1 WHERE id = $2 AND task_id = $3`, [meta.value, meta.todo_id, taskId])
        break
      }
      default:
        return res.status(400).json({ error: `Unknown undo action: ${meta.action}` })
    }

    await pool.query(`UPDATE launch_activity_log SET undone_at = NOW() WHERE id = $1`, [entry.id])
    // The task itself no longer exists after 'delete_task' -- the FK on
    // launch_activity_log.task_id can't reference a row that isn't there,
    // so this one entry logs against no task, same as a milestone entry.
    await logActivity(meta.action === 'delete_task' ? null : taskId, who, 'undo', `${who} undid: ${entry.text}`)

    const full = meta.action === 'delete_task' ? null : await fetchTaskRow(taskId)
    res.json({ success: true, data: full, task_deleted: meta.action === 'delete_task' })
  } catch (error) {
    console.error('Error undoing activity:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const task = await fetchTaskRow(req.params.id)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json({ success: true, data: task })
  } catch (error) {
    console.error('Error fetching launch task:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, owner_id, tag, urgency, due_date, budget_cents, committed_cents, needs_decision, source_ref } = req.body
    if (!name || !owner_id || !tag || !due_date) {
      return res.status(400).json({ error: 'name, owner_id, tag, and due_date are required' })
    }

    const tagError = validateEnum(tag, TAGS, 'tag')
    const urgencyError = validateEnum(urgency, URGENCIES, 'urgency')
    const validationError = tagError || urgencyError
    if (validationError) return res.status(400).json({ error: validationError })

    const result = await pool.query(
      `INSERT INTO launch_tasks (name, owner_id, tag, urgency, due_date, budget_cents, committed_cents, needs_decision, source_ref)
       VALUES ($1, $2, $3, COALESCE($4, 'workon'), $5, COALESCE($6, 0), COALESCE($7, 0), COALESCE($8, false), $9)
       RETURNING *`,
      [name, owner_id, tag, urgency || null, due_date, budget_cents || 0, committed_cents || 0, needs_decision || false, source_ref || null]
    )
    const task = result.rows[0]
    await logActivity(task.id, req.userName, 'created', `${req.userName} created ${task.name}`, { action: 'delete_task' })

    const full = await fetchTaskRow(task.id)
    res.status(201).json({ success: true, data: full })
  } catch (error) {
    if (isForeignKeyViolation(error)) return res.status(400).json({ error: 'owner_id does not match a real account' })
    console.error('Error creating launch task:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, owner_id, tag, urgency, due_date, budget_cents, committed_cents, status, needs_decision, source_ref } = req.body

    const tagError = validateEnum(tag, TAGS, 'tag')
    const urgencyError = validateEnum(urgency, URGENCIES, 'urgency')
    const statusError = validateEnum(status, STATUSES, 'status')
    const validationError = tagError || urgencyError || statusError
    if (validationError) return res.status(400).json({ error: validationError })

    const beforeResult = await pool.query(`SELECT * FROM launch_tasks WHERE id = $1`, [req.params.id])
    if (beforeResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    const before = beforeResult.rows[0]

    const fields = []
    const params = []
    const set = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`) }

    // Tracks the pre-change value of every generic field that actually
    // changed, keyed by column name -- exactly what an 'edit' undo needs to
    // restore, so it doesn't have to guess from the (lossy) text sentence.
    const changedFieldsOld = {}
    const setEdit = (column, newValue, oldValue) => { set(column, newValue); changedFieldsOld[column] = oldValue }

    if (name !== undefined && name !== before.name) setEdit('name', name, before.name)
    if (owner_id !== undefined && owner_id !== before.owner_id) setEdit('owner_id', owner_id, before.owner_id)
    if (tag !== undefined && tag !== before.tag) setEdit('tag', tag, before.tag)
    if (urgency !== undefined && urgency !== before.urgency) setEdit('urgency', urgency, before.urgency)
    const beforeDueDate = before.due_date instanceof Date ? before.due_date.toISOString().slice(0, 10) : before.due_date
    if (due_date !== undefined && due_date !== beforeDueDate) setEdit('due_date', due_date, beforeDueDate)
    if (budget_cents !== undefined && budget_cents !== before.budget_cents) setEdit('budget_cents', budget_cents, before.budget_cents)
    if (committed_cents !== undefined && committed_cents !== before.committed_cents) setEdit('committed_cents', committed_cents, before.committed_cents)
    if (source_ref !== undefined && source_ref !== before.source_ref) setEdit('source_ref', source_ref, before.source_ref)
    if (status !== undefined) set('status', status)
    if (needs_decision !== undefined) set('needs_decision', needs_decision)

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    fields.push(`updated_at = NOW()`)
    params.push(req.params.id)

    const result = await pool.query(
      `UPDATE launch_tasks SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    const task = result.rows[0]
    const who = req.userName

    if (status !== undefined && status !== before.status) {
      await logActivity(
        task.id, who, status === 'done' ? 'complete' : 'status_change',
        status === 'done' ? `${who} completed ${task.name}` : `${who} reopened ${task.name}`,
        { action: 'set_status', value: before.status }
      )
    }
    if (needs_decision !== undefined && needs_decision !== before.needs_decision) {
      await logActivity(
        task.id, who, 'decision_flag',
        needs_decision ? `${who} flagged ${task.name} as needing a decision` : `${who} cleared the decision flag on ${task.name}`,
        { action: 'set_needs_decision', value: before.needs_decision }
      )
    }
    if (Object.keys(changedFieldsOld).length > 0) {
      await logActivity(task.id, who, 'edit', `${who} updated ${task.name}`, { action: 'restore_fields', fields: changedFieldsOld })
    }

    await pushLaunchTaskToOpsMirror(task, who)
    const full = await fetchTaskRow(task.id)
    res.json({ success: true, data: full })
  } catch (error) {
    if (isForeignKeyViolation(error)) return res.status(400).json({ error: 'owner_id does not match a real account' })
    console.error('Error updating launch task:', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await deleteLaunchTaskCascade(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Task not found' })
    res.json({ success: true, message: 'Task deleted' })
  } catch (error) {
    console.error('Error deleting launch task:', error)
    res.status(500).json({ error: error.message })
  }
})

// ----------------------------------------------------------------------------
// EXPENSES -- itemized entries; paid_cents on the task is always SUM(amount_cents),
// never stored, so it can't drift.
// ----------------------------------------------------------------------------

router.get('/:id/expenses', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM launch_task_expenses WHERE task_id = $1 ORDER BY date DESC, id DESC`,
      [req.params.id]
    )
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error listing expenses:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/expenses', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { date, description, amount_cents } = req.body
    if (!date || !description || !amount_cents || amount_cents <= 0) {
      return res.status(400).json({ error: 'date, description, and a positive amount_cents are required' })
    }

    const taskResult = await pool.query(`SELECT * FROM launch_tasks WHERE id = $1`, [req.params.id])
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    const task = taskResult.rows[0]

    const result = await pool.query(
      `INSERT INTO launch_task_expenses (task_id, date, description, amount_cents, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, date, description, amount_cents, req.userName]
    )

    const who = req.userName
    const amountLabel = `$${(amount_cents / 100).toLocaleString()}`
    const budgetLabel = task.budget_cents > 0 ? ` (budgeted $${(task.budget_cents / 100).toLocaleString()})` : ''
    await logActivity(task.id, who, 'expense', `${who} logged ${amountLabel} paid on ${task.name}${budgetLabel}`, {
      action: 'delete_expense',
      expense_id: result.rows[0].id,
    })

    const full = await fetchTaskRow(task.id)
    res.status(201).json({ success: true, data: { expense: result.rows[0], task: full } })
  } catch (error) {
    console.error('Error logging expense:', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id/expenses/:expId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const taskResult = await pool.query(`SELECT * FROM launch_tasks WHERE id = $1`, [req.params.id])
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    const task = taskResult.rows[0]

    const result = await pool.query(
      `DELETE FROM launch_task_expenses WHERE id = $1 AND task_id = $2 RETURNING *`,
      [req.params.expId, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Expense not found' })

    const who = req.userName
    const deleted = result.rows[0]
    const amountLabel = `$${(deleted.amount_cents / 100).toLocaleString()}`
    const deletedDate = deleted.date instanceof Date ? deleted.date.toISOString().slice(0, 10) : deleted.date
    await logActivity(task.id, who, 'expense', `${who} removed a ${amountLabel} expense from ${task.name}`, {
      action: 'add_expense',
      date: deletedDate,
      description: deleted.description,
      amount_cents: deleted.amount_cents,
    })

    const full = await fetchTaskRow(task.id)
    res.json({ success: true, data: full })
  } catch (error) {
    console.error('Error deleting expense:', error)
    res.status(500).json({ error: error.message })
  }
})

// ----------------------------------------------------------------------------
// NOTE
// ----------------------------------------------------------------------------

router.patch('/:id/note', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { note } = req.body
    const who = req.userName

    const beforeResult = await pool.query(`SELECT note FROM launch_tasks WHERE id = $1`, [req.params.id])
    if (beforeResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    const previousNote = beforeResult.rows[0].note

    const result = await pool.query(
      `UPDATE launch_tasks SET note = $1, note_updated_at = NOW(), note_updated_by = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [note ?? '', who, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' })

    await logActivity(result.rows[0].id, who, 'note', `${who} added a note to ${result.rows[0].name}`, {
      action: 'restore_note',
      value: previousNote,
    })

    const full = await fetchTaskRow(result.rows[0].id)
    res.json({ success: true, data: full })
  } catch (error) {
    console.error('Error updating note:', error)
    res.status(500).json({ error: error.message })
  }
})

// ----------------------------------------------------------------------------
// TODOS
// ----------------------------------------------------------------------------

router.post('/:id/todos', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { text, urgency } = req.body
    if (!text) return res.status(400).json({ error: 'text is required' })
    const urgencyError = validateEnum(urgency, URGENCIES, 'urgency')
    if (urgencyError) return res.status(400).json({ error: urgencyError })

    const taskResult = await pool.query(`SELECT * FROM launch_tasks WHERE id = $1`, [req.params.id])
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    const task = taskResult.rows[0]

    const sortResult = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM launch_task_todos WHERE task_id = $1`,
      [req.params.id]
    )
    const result = await pool.query(
      `INSERT INTO launch_task_todos (task_id, text, urgency, sort_order) VALUES ($1, $2, COALESCE($3, 'workon'), $4) RETURNING *`,
      [req.params.id, text, urgency || null, sortResult.rows[0].next_order]
    )

    await logActivity(task.id, req.userName, 'status_change', `${req.userName} added a to-do to ${task.name}`, {
      action: 'delete_todo',
      todo_id: result.rows[0].id,
    })

    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error adding todo:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id/todos/:todoId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { text, done, urgency } = req.body
    const urgencyError = validateEnum(urgency, URGENCIES, 'urgency')
    if (urgencyError) return res.status(400).json({ error: urgencyError })

    const taskResult = await pool.query(`SELECT * FROM launch_tasks WHERE id = $1`, [req.params.id])
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    const task = taskResult.rows[0]

    const beforeTodoResult = await pool.query(`SELECT done FROM launch_task_todos WHERE id = $1 AND task_id = $2`, [req.params.todoId, req.params.id])
    if (beforeTodoResult.rows.length === 0) return res.status(404).json({ error: 'Todo not found' })
    const previousDone = beforeTodoResult.rows[0].done

    const fields = []
    const params = []
    const set = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`) }

    if (text !== undefined) set('text', text)
    if (done !== undefined) set('done', done)
    if (urgency !== undefined) set('urgency', urgency)
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    params.push(req.params.todoId, req.params.id)
    const result = await pool.query(
      `UPDATE launch_task_todos SET ${fields.join(', ')} WHERE id = $${params.length - 1} AND task_id = $${params.length} RETURNING *`,
      params
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Todo not found' })

    if (done !== undefined && done !== previousDone) {
      const who = req.userName
      await logActivity(
        task.id, who, done ? 'complete' : 'status_change',
        done ? `${who} completed a to-do on ${task.name}` : `${who} reopened a to-do on ${task.name}`,
        { action: 'set_todo_done', todo_id: Number(req.params.todoId), value: previousDone }
      )
    }

    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating todo:', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id/todos/:todoId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const taskResult = await pool.query(`SELECT * FROM launch_tasks WHERE id = $1`, [req.params.id])
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    const task = taskResult.rows[0]

    const result = await pool.query(
      `DELETE FROM launch_task_todos WHERE id = $1 AND task_id = $2 RETURNING *`,
      [req.params.todoId, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Todo not found' })

    const deleted = result.rows[0]
    await logActivity(task.id, req.userName, 'status_change', `${req.userName} removed a to-do from ${task.name}`, {
      action: 'add_todo',
      text: deleted.text,
      urgency: deleted.urgency,
      sort_order: deleted.sort_order,
    })

    res.json({ success: true, message: 'Todo deleted' })
  } catch (error) {
    console.error('Error deleting todo:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
