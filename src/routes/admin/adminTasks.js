const express = require('express')
const router = express.Router()
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')
const { getRecipeIngredientNeeds } = require('../../utils/recipeCost')

// ============================================================================
// OPERATIONS HUB -- generic cross-department task manager. Replaces the old
// Menu Planner-only taskManagementAuto.js production schedule.
// ============================================================================

const DEPARTMENTS = ['Kitchen', 'Sales', 'Marketing', 'Customer Success', 'Procurement', 'Finance', 'Operations', 'Administration', 'Personal']
const PRIORITIES = ['critical', 'high', 'medium', 'low']
const STATUSES = ['not_started', 'in_progress', 'waiting', 'blocked', 'completed', 'cancelled']
const OPERATIONAL_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const PRIORITY_RANK_SQL = `CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`

// Offset in days from week_start (Sunday) for each operational day.
const OPERATIONAL_DAY_OFFSET = { saturday: -1, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 }

function validateEnum(value, allowed, field) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    return `${field} must be one of: ${allowed.join(', ')}`
  }
  return null
}

async function fetchTaskWithDetails(taskId) {
  const taskResult = await pool.query(
    `SELECT t.*, s.name AS owner_name
     FROM tasks t
     LEFT JOIN staff s ON t.owner_id = s.id
     WHERE t.id = $1`,
    [taskId]
  )
  if (taskResult.rows.length === 0) return null

  const [checklistResult, commentsResult] = await Promise.all([
    pool.query(`SELECT * FROM task_checklist_items WHERE task_id = $1 ORDER BY sort_order, id`, [taskId]),
    pool.query(
      `SELECT c.*, s.name AS staff_name FROM task_comments c LEFT JOIN staff s ON c.staff_id = s.id
       WHERE c.task_id = $1 ORDER BY c.created_at`,
      [taskId]
    ),
  ])

  return { ...taskResult.rows[0], checklist_items: checklistResult.rows, comments: commentsResult.rows }
}

// ----------------------------------------------------------------------------
// TASKS
// ----------------------------------------------------------------------------

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { department, owner_id, priority, status, due_date, due_date_from, due_date_to, week_start, source_type, source_id, q, sort_by, sort_dir, limit } = req.query

    const conditions = []
    const params = []

    if (department) { params.push(department); conditions.push(`department = $${params.length}`) }
    if (owner_id) { params.push(owner_id); conditions.push(`owner_id = $${params.length}`) }
    if (priority) { params.push(priority); conditions.push(`priority = $${params.length}`) }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`) }
    if (due_date) { params.push(due_date); conditions.push(`due_date = $${params.length}`) }
    if (due_date_from) { params.push(due_date_from); conditions.push(`due_date >= $${params.length}`) }
    if (due_date_to) { params.push(due_date_to); conditions.push(`due_date <= $${params.length}`) }
    if (week_start) {
      params.push(week_start)
      conditions.push(`due_date >= $${params.length}`)
      params.push(week_start)
      conditions.push(`due_date < ($${params.length}::date + interval '7 days')`)
    }
    if (source_type) { params.push(source_type); conditions.push(`source_type = $${params.length}`) }
    if (source_id) { params.push(source_id); conditions.push(`source_id = $${params.length}`) }
    if (q) { params.push(`%${q}%`); conditions.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`) }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const sortColumns = { due_date: 'due_date', priority: PRIORITY_RANK_SQL, status: 'status', created_at: 'created_at', title: 'title' }
    const sortColumn = sortColumns[sort_by] || 'due_date'
    const sortDirection = sort_dir === 'desc' ? 'DESC' : 'ASC'
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10) || 500}` : 'LIMIT 500'

    const result = await pool.query(
      `SELECT t.*, s.name AS owner_name
       FROM tasks t
       LEFT JOIN staff s ON t.owner_id = s.id
       ${whereClause}
       ORDER BY ${sortColumn} ${sortDirection}, t.id ${sortDirection}
       ${limitClause}`,
      params
    )

    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error listing tasks:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/summary', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    let { week_start } = req.query
    if (!week_start) {
      const nextWeekResult = await pool.query(`
        SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day' + interval '7 days')::date AS sunday
      `)
      week_start = nextWeekResult.rows[0].sunday
    }

    const result = await pool.query(
      `SELECT
         due_date,
         COUNT(*) AS total_tasks,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed_tasks,
         COUNT(*) FILTER (WHERE priority IN ('critical', 'high')) AS high_priority_count,
         department,
         COUNT(*) AS department_count
       FROM tasks
       WHERE due_date >= $1::date AND due_date < ($1::date + interval '7 days')
       GROUP BY GROUPING SETS ((due_date), (due_date, department))`,
      [week_start]
    )

    const days = {}
    for (const row of result.rows) {
      const key = row.due_date.toISOString().slice(0, 10)
      if (!days[key]) days[key] = { date: key, total_tasks: 0, completed_tasks: 0, high_priority_count: 0, departments: {} }
      if (row.department === null) {
        days[key].total_tasks = parseInt(row.total_tasks)
        days[key].completed_tasks = parseInt(row.completed_tasks)
        days[key].high_priority_count = parseInt(row.high_priority_count)
      } else {
        days[key].departments[row.department] = parseInt(row.department_count)
      }
    }

    res.json({ success: true, data: { week_start, days: Object.values(days) } })
  } catch (error) {
    console.error('Error computing task summary:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/today-overview', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)

    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_tasks,
         COUNT(*) FILTER (WHERE priority IN ('critical', 'high')) AS high_priority,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status != 'completed' AND due_date < $1::date) AS overdue,
         COALESCE(SUM(estimated_minutes), 0) AS estimated_minutes
       FROM tasks
       WHERE due_date = $1::date`,
      [date]
    )

    const row = result.rows[0]
    res.json({
      success: true,
      data: {
        date,
        total_tasks: parseInt(row.total_tasks),
        high_priority: parseInt(row.high_priority),
        completed: parseInt(row.completed),
        overdue: parseInt(row.overdue),
        estimated_minutes: parseInt(row.estimated_minutes),
      },
    })
  } catch (error) {
    console.error('Error computing today overview:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/my-focus', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { owner_id, limit } = req.query
    if (!owner_id) return res.status(400).json({ error: 'owner_id is required' })

    const result = await pool.query(
      `SELECT t.*, s.name AS owner_name
       FROM tasks t
       LEFT JOIN staff s ON t.owner_id = s.id
       WHERE t.owner_id = $1 AND t.status NOT IN ('completed', 'cancelled')
       ORDER BY ${PRIORITY_RANK_SQL}, t.due_date ASC NULLS LAST
       LIMIT $2`,
      [owner_id, parseInt(limit, 10) || 5]
    )

    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error computing my focus:', error)
    res.status(500).json({ error: error.message })
  }
})

// Real ingredient lbs/cost needed for one menu plate, ported forward from the
// old taskManagementAuto.js /auto-generate-plan (per-plate slice of that logic).
router.get('/procurement', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { menu_id, week_start } = req.query
    if (!menu_id || !week_start) return res.status(400).json({ error: 'menu_id and week_start are required' })

    const plateResult = await pool.query(`SELECT id, name FROM menus WHERE id = $1`, [menu_id])
    if (plateResult.rows.length === 0) return res.status(404).json({ error: 'Menu plate not found' })

    const orderQtyResult = await pool.query(
      `SELECT SUM(quantity) AS total_qty FROM orders WHERE menu_id = $1
       AND (date_trunc('week', created_at + interval '1 day') - interval '1 day') = $2`,
      [menu_id, week_start]
    )
    const realQty = orderQtyResult.rows[0].total_qty != null ? parseFloat(orderQtyResult.rows[0].total_qty) : null
    const scaleFactor = realQty != null ? realQty : 1

    const recipesResult = await pool.query(
      `SELECT mpr.recipe_id, mpr.servings, r.name AS recipe_name
       FROM menu_plan_recipes mpr JOIN recipes r ON mpr.recipe_id = r.recipe_id
       WHERE mpr.menu_id = $1`,
      [menu_id]
    )

    let totalCost = 0
    const recipes = []
    for (const r of recipesResult.rows) {
      const ingredients = await getRecipeIngredientNeeds(r.recipe_id, parseFloat(r.servings))
      const ingredientLines = ingredients.map((ing) => {
        const pounds = (ing.gramsNeeded * scaleFactor) / 453.592
        const cost = ing.unitPriceCents != null ? pounds * (ing.unitPriceCents / 100) : null
        if (cost != null) totalCost += cost
        return {
          name: ing.name,
          store: ing.store,
          pounds_needed: +pounds.toFixed(2),
          cost: cost != null ? +cost.toFixed(2) : null,
        }
      })
      recipes.push({ recipe_name: r.recipe_name, servings_per_plate: parseFloat(r.servings), ingredients: ingredientLines })
    }

    res.json({
      success: true,
      data: {
        plate_id: plateResult.rows[0].id,
        plate_name: plateResult.rows[0].name,
        week_start,
        quantity: realQty,
        quantity_is_estimate: realQty == null,
        total_cost: +totalCost.toFixed(2),
        recipes,
      },
    })
  } catch (error) {
    console.error('Error computing procurement panel:', error)
    res.status(500).json({ error: error.message })
  }
})

// All tasks for the operational week, grouped by operational_day (Sat..Fri).
router.get('/week/:weekStart', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { weekStart } = req.params
    const result = await pool.query(
      `SELECT t.*, s.name AS owner_name
       FROM tasks t
       LEFT JOIN staff s ON t.owner_id = s.id
       WHERE t.week_start = $1
       ORDER BY ${PRIORITY_RANK_SQL}, t.id`,
      [weekStart]
    )

    const days = {}
    for (const day of OPERATIONAL_DAYS) days[day] = []
    for (const row of result.rows) {
      if (row.operational_day && days[row.operational_day]) days[row.operational_day].push(row)
    }

    res.json({ success: true, data: { week_start: weekStart, days } })
  } catch (error) {
    console.error('Error fetching week tasks:', error)
    res.status(500).json({ error: error.message })
  }
})

// One operational day's tasks, grouped by department.
router.get('/day/:weekStart/:day', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { weekStart, day } = req.params
    const dayError = validateEnum(day, OPERATIONAL_DAYS, 'day')
    if (dayError) return res.status(400).json({ error: dayError })

    const result = await pool.query(
      `SELECT t.*, s.name AS owner_name
       FROM tasks t
       LEFT JOIN staff s ON t.owner_id = s.id
       WHERE t.week_start = $1 AND t.operational_day = $2
       ORDER BY ${PRIORITY_RANK_SQL}, t.id`,
      [weekStart, day]
    )

    const departments = {}
    for (const dept of DEPARTMENTS) departments[dept] = []
    for (const row of result.rows) {
      if (!departments[row.department]) departments[row.department] = []
      departments[row.department].push(row)
    }

    res.json({ success: true, data: { week_start: weekStart, day, departments } })
  } catch (error) {
    console.error('Error fetching day tasks:', error)
    res.status(500).json({ error: error.message })
  }
})

// ----------------------------------------------------------------------------
// RECURRING TASK TEMPLATES
// ----------------------------------------------------------------------------

router.get('/templates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { operational_day, is_active } = req.query
    const conditions = []
    const params = []
    if (operational_day) { params.push(operational_day); conditions.push(`tt.operational_day = $${params.length}`) }
    if (is_active !== undefined) { params.push(is_active === 'true'); conditions.push(`tt.is_active = $${params.length}`) }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const templatesResult = await pool.query(
      `SELECT tt.*, s.name AS default_owner_name
       FROM task_templates tt
       LEFT JOIN staff s ON tt.default_owner_id = s.id
       ${whereClause}
       ORDER BY tt.operational_day, tt.name`,
      params
    )

    const templateIds = templatesResult.rows.map((t) => t.id)
    const itemsByTemplate = {}
    if (templateIds.length > 0) {
      const itemsResult = await pool.query(
        `SELECT * FROM task_template_items WHERE template_id = ANY($1::int[]) ORDER BY sort_order, id`,
        [templateIds]
      )
      for (const item of itemsResult.rows) {
        if (!itemsByTemplate[item.template_id]) itemsByTemplate[item.template_id] = []
        itemsByTemplate[item.template_id].push(item)
      }
    }

    const data = templatesResult.rows.map((t) => ({ ...t, items: itemsByTemplate[t.id] || [] }))
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error listing templates:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/templates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, department, operational_day, default_owner_id, priority, estimated_minutes, items } = req.body
    if (!name || !department || !operational_day) {
      return res.status(400).json({ error: 'name, department, and operational_day are required' })
    }

    const deptError = validateEnum(department, DEPARTMENTS, 'department')
    const dayError = validateEnum(operational_day, OPERATIONAL_DAYS, 'operational_day')
    const priorityError = validateEnum(priority, PRIORITIES, 'priority')
    const validationError = deptError || dayError || priorityError
    if (validationError) return res.status(400).json({ error: validationError })

    const result = await pool.query(
      `INSERT INTO task_templates (name, department, operational_day, default_owner_id, priority, estimated_minutes)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'medium'), $6)
       RETURNING *`,
      [name, department, operational_day, default_owner_id || null, priority || null, estimated_minutes || null]
    )
    const template = result.rows[0]

    if (Array.isArray(items) && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        await pool.query(
          `INSERT INTO task_template_items (template_id, label, sort_order) VALUES ($1, $2, $3)`,
          [template.id, items[i].label, items[i].sort_order ?? i]
        )
      }
    }

    const itemsResult = await pool.query(`SELECT * FROM task_template_items WHERE template_id = $1 ORDER BY sort_order, id`, [template.id])
    res.status(201).json({ success: true, data: { ...template, items: itemsResult.rows } })
  } catch (error) {
    console.error('Error creating template:', error)
    res.status(500).json({ error: error.message })
  }
})

router.put('/templates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, department, operational_day, default_owner_id, priority, estimated_minutes, is_active } = req.body

    const deptError = validateEnum(department, DEPARTMENTS, 'department')
    const dayError = validateEnum(operational_day, OPERATIONAL_DAYS, 'operational_day')
    const priorityError = validateEnum(priority, PRIORITIES, 'priority')
    const validationError = deptError || dayError || priorityError
    if (validationError) return res.status(400).json({ error: validationError })

    const fields = []
    const params = []
    const set = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`) }

    if (name !== undefined) set('name', name)
    if (department !== undefined) set('department', department)
    if (operational_day !== undefined) set('operational_day', operational_day)
    if (default_owner_id !== undefined) set('default_owner_id', default_owner_id)
    if (priority !== undefined) set('priority', priority)
    if (estimated_minutes !== undefined) set('estimated_minutes', estimated_minutes)
    if (is_active !== undefined) set('is_active', is_active)
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    params.push(req.params.id)
    const result = await pool.query(
      `UPDATE task_templates SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' })

    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating template:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/templates/:id/items', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { label, sort_order } = req.body
    if (!label) return res.status(400).json({ error: 'label is required' })

    const result = await pool.query(
      `INSERT INTO task_template_items (template_id, label, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, label, sort_order ?? 0]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error adding template item:', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/templates/:id/items/:itemId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM task_template_items WHERE id = $1 AND template_id = $2 RETURNING id`,
      [req.params.itemId, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template item not found' })
    res.json({ success: true, message: 'Template item deleted' })
  } catch (error) {
    console.error('Error deleting template item:', error)
    res.status(500).json({ error: error.message })
  }
})

// Instantiates tasks from active templates for the given week -- insert-if-
// not-exists per template per week, keyed by recurring_template_id + week_start.
router.post('/templates/generate-week/:weekStart', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { weekStart } = req.params

    const templatesResult = await pool.query(`SELECT * FROM task_templates WHERE is_active = true`)
    const created = []

    for (const template of templatesResult.rows) {
      const existing = await pool.query(
        `SELECT id FROM tasks WHERE recurring_template_id = $1 AND week_start = $2`,
        [template.id, weekStart]
      )
      if (existing.rows.length > 0) continue

      const offset = OPERATIONAL_DAY_OFFSET[template.operational_day]
      const dueDateResult = await pool.query(`SELECT ($1::date + ($2 || ' days')::interval)::date AS due_date`, [weekStart, offset])
      const dueDate = dueDateResult.rows[0].due_date

      const taskResult = await pool.query(
        `INSERT INTO tasks (title, department, owner_id, priority, due_date, operational_day, week_start, estimated_minutes, recurring_template_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [template.name, template.department, template.default_owner_id, template.priority, dueDate, template.operational_day, weekStart, template.estimated_minutes, template.id]
      )
      const task = taskResult.rows[0]

      const itemsResult = await pool.query(`SELECT label, sort_order FROM task_template_items WHERE template_id = $1 ORDER BY sort_order, id`, [template.id])
      for (const item of itemsResult.rows) {
        await pool.query(`INSERT INTO task_checklist_items (task_id, label, sort_order) VALUES ($1, $2, $3)`, [task.id, item.label, item.sort_order])
      }

      created.push(task)
    }

    res.status(201).json({ success: true, data: { week_start: weekStart, created_count: created.length, tasks: created } })
  } catch (error) {
    console.error('Error generating week from templates:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const task = await fetchTaskWithDetails(req.params.id)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json({ success: true, data: task })
  } catch (error) {
    console.error('Error fetching task:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { title, description, department, owner_id, priority, status, due_date, operational_day, week_start, estimated_minutes, source_type, source_id } = req.body
    if (!title || !department) return res.status(400).json({ error: 'title and department are required' })

    const deptError = validateEnum(department, DEPARTMENTS, 'department')
    const priorityError = validateEnum(priority, PRIORITIES, 'priority')
    const statusError = validateEnum(status, STATUSES, 'status')
    const operationalDayError = validateEnum(operational_day, OPERATIONAL_DAYS, 'operational_day')
    const validationError = deptError || priorityError || statusError || operationalDayError
    if (validationError) return res.status(400).json({ error: validationError })

    const result = await pool.query(
      `INSERT INTO tasks (title, description, department, owner_id, priority, status, due_date, operational_day, week_start, estimated_minutes, source_type, source_id)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'medium'), COALESCE($6, 'not_started'), $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [title, description || null, department, owner_id || null, priority || null, status || null, due_date || null, operational_day || null, week_start || null, estimated_minutes || null, source_type || null, source_id || null]
    )

    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error creating task:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { title, description, department, owner_id, priority, status, due_date, operational_day, week_start, estimated_minutes, actual_minutes, source_type, source_id } = req.body

    const deptError = validateEnum(department, DEPARTMENTS, 'department')
    const priorityError = validateEnum(priority, PRIORITIES, 'priority')
    const statusError = validateEnum(status, STATUSES, 'status')
    const operationalDayError = validateEnum(operational_day, OPERATIONAL_DAYS, 'operational_day')
    const validationError = deptError || priorityError || statusError || operationalDayError
    if (validationError) return res.status(400).json({ error: validationError })

    const fields = []
    const params = []
    const set = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`) }

    if (title !== undefined) set('title', title)
    if (description !== undefined) set('description', description)
    if (department !== undefined) set('department', department)
    if (owner_id !== undefined) set('owner_id', owner_id)
    if (priority !== undefined) set('priority', priority)
    if (status !== undefined) {
      set('status', status)
      set('completed_at', status === 'completed' ? new Date() : null)
    }
    if (due_date !== undefined) set('due_date', due_date)
    if (operational_day !== undefined) set('operational_day', operational_day)
    if (week_start !== undefined) set('week_start', week_start)
    if (estimated_minutes !== undefined) set('estimated_minutes', estimated_minutes)
    if (actual_minutes !== undefined) set('actual_minutes', actual_minutes)
    if (source_type !== undefined) set('source_type', source_type)
    if (source_id !== undefined) set('source_id', source_id)

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    fields.push(`updated_at = NOW()`)
    params.push(req.params.id)

    const result = await pool.query(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' })

    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating task:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/complete', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const completed = req.body.completed !== false
    const result = await pool.query(
      `UPDATE tasks SET status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [completed ? 'completed' : 'not_started', completed ? new Date() : null, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' })

    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error completing task:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/duplicate', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const original = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [req.params.id])
    if (original.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    const t = original.rows[0]

    const cloneResult = await pool.query(
      `INSERT INTO tasks (title, description, department, owner_id, priority, status, due_date, operational_day, week_start, estimated_minutes, source_type, source_id)
       VALUES ($1, $2, $3, $4, $5, 'not_started', $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [t.title, t.description, t.department, t.owner_id, t.priority, t.due_date, t.operational_day, t.week_start, t.estimated_minutes, t.source_type, t.source_id]
    )
    const clone = cloneResult.rows[0]

    const checklistItems = await pool.query(`SELECT label, sort_order FROM task_checklist_items WHERE task_id = $1 ORDER BY sort_order, id`, [req.params.id])
    for (const item of checklistItems.rows) {
      await pool.query(
        `INSERT INTO task_checklist_items (task_id, label, sort_order) VALUES ($1, $2, $3)`,
        [clone.id, item.label, item.sort_order]
      )
    }

    const full = await fetchTaskWithDetails(clone.id)
    res.status(201).json({ success: true, data: full })
  } catch (error) {
    console.error('Error duplicating task:', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM tasks WHERE id = $1 RETURNING id`, [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    res.json({ success: true, message: 'Task deleted' })
  } catch (error) {
    console.error('Error deleting task:', error)
    res.status(500).json({ error: error.message })
  }
})

// ----------------------------------------------------------------------------
// CHECKLIST ITEMS
// ----------------------------------------------------------------------------

router.post('/:id/checklist-items', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { label, sort_order } = req.body
    if (!label) return res.status(400).json({ error: 'label is required' })

    const result = await pool.query(
      `INSERT INTO task_checklist_items (task_id, label, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, label, sort_order ?? 0]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error adding checklist item:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id/checklist-items/:itemId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { label, is_completed, sort_order } = req.body

    const fields = []
    const params = []
    const set = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`) }

    if (label !== undefined) set('label', label)
    if (is_completed !== undefined) set('is_completed', is_completed)
    if (sort_order !== undefined) set('sort_order', sort_order)
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    params.push(req.params.itemId, req.params.id)
    const result = await pool.query(
      `UPDATE task_checklist_items SET ${fields.join(', ')} WHERE id = $${params.length - 1} AND task_id = $${params.length} RETURNING *`,
      params
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Checklist item not found' })

    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating checklist item:', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id/checklist-items/:itemId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM task_checklist_items WHERE id = $1 AND task_id = $2 RETURNING id`,
      [req.params.itemId, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Checklist item not found' })
    res.json({ success: true, message: 'Checklist item deleted' })
  } catch (error) {
    console.error('Error deleting checklist item:', error)
    res.status(500).json({ error: error.message })
  }
})

// ----------------------------------------------------------------------------
// COMMENTS
// ----------------------------------------------------------------------------

router.get('/:id/comments', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, s.name AS staff_name FROM task_comments c LEFT JOIN staff s ON c.staff_id = s.id
       WHERE c.task_id = $1 ORDER BY c.created_at`,
      [req.params.id]
    )
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error fetching comments:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/comments', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { staff_id, comment } = req.body
    if (!comment) return res.status(400).json({ error: 'comment is required' })

    const result = await pool.query(
      `INSERT INTO task_comments (task_id, staff_id, comment) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, staff_id || null, comment]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error adding comment:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
