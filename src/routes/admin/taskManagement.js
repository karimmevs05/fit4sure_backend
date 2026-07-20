const express = require('express')
const router = express.Router()
const pool = require('../../config/db')

// ============================================================================
// PRODUCTION PLANS (Weekly Planning)
// ============================================================================

// Create new production plan
router.post('/production-plans', async (req, res) => {
  try {
    const { week_start, week_end, status, notes } = req.body

    const result = await pool.query(
      `INSERT INTO production_plans (week_start, week_end, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [week_start, week_end, status || 'PENDING', notes || null]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error creating production plan:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get all production plans with summary
router.get('/production-plans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        pp.id, pp.week_start, pp.week_end, pp.status, pp.notes, pp.created_at,
        COUNT(DISTINCT ps.id) as total_tasks,
        SUM(ps.target_quantity) as total_meal_count,
        SUM(ps.target_time_minutes) as total_prep_time,
        AVG(ps.target_quantity)::INTEGER as avg_meals_per_day
      FROM production_plans pp
      LEFT JOIN production_schedule ps ON pp.id = ps.plan_id
      GROUP BY pp.id, pp.week_start, pp.week_end, pp.status, pp.notes, pp.created_at
      ORDER BY pp.week_start DESC
    `)
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching production plans:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get single production plan with full detail
router.get('/production-plans/:id', async (req, res) => {
  try {
    const { id } = req.params

    const planResult = await pool.query(
      'SELECT * FROM production_plans WHERE id = $1',
      [id]
    )

    const scheduleResult = await pool.query(
      `SELECT ps.*, m.name as meal_name, m.protein, m.price
       FROM production_schedule ps
       LEFT JOIN menus m ON ps.meal_id = m.id
       WHERE ps.plan_id = $1
       ORDER BY ps.created_date, ps.id`,
      [id]
    )

    const laborResult = await pool.query(
      `SELECT * FROM labor_plan WHERE plan_id = $1
       ORDER BY role`,
      [id]
    )

    res.json({
      plan: planResult.rows[0],
      schedule: scheduleResult.rows,
      labor_plan: laborResult.rows
    })
  } catch (error) {
    console.error('Error fetching production plan:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// PRODUCTION SCHEDULE (Daily breakdown of what to prep)
// ============================================================================

// Create production schedule item
router.post('/production-schedule', async (req, res) => {
  try {
    const { plan_id, meal_id, target_quantity, assigned_staff_id, target_time_minutes, created_date, notes } = req.body

    const result = await pool.query(
      `INSERT INTO production_schedule (plan_id, meal_id, target_quantity, assigned_staff_id, target_time_minutes, created_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [plan_id, meal_id, target_quantity, assigned_staff_id || null, target_time_minutes, created_date, notes || null]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error creating production schedule:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get schedule for a specific plan
router.get('/production-schedule/:plan_id', async (req, res) => {
  try {
    const { plan_id } = req.params

    const result = await pool.query(
      `SELECT ps.*, m.name as meal_name, m.protein, m.price
       FROM production_schedule ps
       LEFT JOIN menus m ON ps.meal_id = m.id
       WHERE ps.plan_id = $1
       ORDER BY ps.created_date`,
      [plan_id]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching production schedule:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// PRODUCTION TASKS (Real-time daily tracking)
// ============================================================================

// Create task (when production starts)
router.post('/production-tasks', async (req, res) => {
  try {
    const { schedule_id, station, status, assigned_staff_id } = req.body

    const result = await pool.query(
      `INSERT INTO production_tasks (schedule_id, station, status, assigned_staff_id, started_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'IN_PROGRESS' THEN NOW() ELSE NULL END)
       RETURNING *`,
      [schedule_id, station, status || 'TODO', assigned_staff_id || null]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error creating production task:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update task status & time
router.put('/production-tasks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status, actual_quantity, actual_time_minutes } = req.body

    let query = 'UPDATE production_tasks SET status = $1'
    const params = [status, id]

    if (actual_quantity) {
      query += ', actual_quantity = $' + (params.length)
      params.splice(-1, 0, actual_quantity)
    }

    if (actual_time_minutes) {
      query += ', actual_time_minutes = $' + (params.length)
      params.splice(-1, 0, actual_time_minutes)
    }

    if (status === 'IN_PROGRESS') {
      query += ', started_at = NOW()'
    }

    if (status === 'DONE') {
      query += ', completed_at = NOW()'
    }

    query += ' WHERE id = $' + (params.length) + ' RETURNING *'

    const result = await pool.query(query, params)
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating production task:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get today's tasks
router.get('/production-tasks/date/:date', async (req, res) => {
  try {
    const { date } = req.params

    const result = await pool.query(
      `SELECT pt.*, ps.meal_id, ps.target_quantity, ps.target_time_minutes, m.name as meal_name
       FROM production_tasks pt
       JOIN production_schedule ps ON pt.schedule_id = ps.id
       LEFT JOIN menus m ON ps.meal_id = m.id
       WHERE DATE(ps.created_date) = $1
       ORDER BY pt.station, pt.id`,
      [date]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching production tasks:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// PRODUCTION ISSUES (Logging problems in real-time)
// ============================================================================

router.post('/production-issues', async (req, res) => {
  try {
    const { task_id, category, severity, description, resolution } = req.body

    const result = await pool.query(
      `INSERT INTO production_issues (task_id, category, severity, description, resolution, logged_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [task_id, category, severity || 'MEDIUM', description, resolution || null]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error logging production issue:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get issues for a plan
router.get('/production-issues/:plan_id', async (req, res) => {
  try {
    const { plan_id } = req.params

    const result = await pool.query(
      `SELECT pi.*, pt.station, ps.meal_id, m.name as meal_name
       FROM production_issues pi
       JOIN production_tasks pt ON pi.task_id = pt.id
       JOIN production_schedule ps ON pt.schedule_id = ps.id
       LEFT JOIN menus m ON ps.meal_id = m.id
       WHERE ps.plan_id = $1
       ORDER BY pi.logged_at DESC`,
      [plan_id]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching production issues:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// WASTE TRACKING
// ============================================================================

router.post('/waste-log', async (req, res) => {
  try {
    const { plan_id, waste_type, quantity, unit, estimated_cost, root_cause } = req.body

    const result = await pool.query(
      `INSERT INTO waste_log (plan_id, waste_type, quantity, unit, estimated_cost, root_cause, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [plan_id, waste_type, quantity, unit, estimated_cost || 0, root_cause || null]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error logging waste:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get waste for a plan
router.get('/waste-log/:plan_id', async (req, res) => {
  try {
    const { plan_id } = req.params

    const result = await pool.query(
      `SELECT * FROM waste_log WHERE plan_id = $1
       ORDER BY logged_at DESC`,
      [plan_id]
    )

    const summary = await pool.query(
      `SELECT
        waste_type,
        COUNT(*) as incidents,
        SUM(quantity) as total_quantity,
        SUM(estimated_cost) as total_cost
       FROM waste_log WHERE plan_id = $1
       GROUP BY waste_type`,
      [plan_id]
    )

    res.json({ log: result.rows, summary: summary.rows })
  } catch (error) {
    console.error('Error fetching waste log:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// LABOR TRACKING
// ============================================================================

router.post('/labor-log', async (req, res) => {
  try {
    const { staff_id, plan_id, role, hours_worked, cost, logged_date } = req.body

    const result = await pool.query(
      `INSERT INTO labor_log (staff_id, plan_id, role, hours_worked, cost, logged_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [staff_id, plan_id, role, hours_worked, cost, logged_date]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error logging labor:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get labor for a plan
router.get('/labor-log/:plan_id', async (req, res) => {
  try {
    const { plan_id } = req.params

    const result = await pool.query(
      `SELECT * FROM labor_log WHERE plan_id = $1
       ORDER BY logged_date`,
      [plan_id]
    )

    const summary = await pool.query(
      `SELECT
        role,
        SUM(hours_worked) as total_hours,
        SUM(cost) as total_cost,
        AVG(cost)::INTEGER as avg_cost_per_day
       FROM labor_log WHERE plan_id = $1
       GROUP BY role`,
      [plan_id]
    )

    res.json({ log: result.rows, summary: summary.rows })
  } catch (error) {
    console.error('Error fetching labor log:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// DAILY PRODUCTION SUMMARY
// ============================================================================

router.get('/daily-summary/:plan_id/:date', async (req, res) => {
  try {
    const { plan_id, date } = req.params

    // Actual production
    const actual = await pool.query(
      `SELECT
        SUM(pt.actual_quantity)::INTEGER as total_meals,
        COUNT(DISTINCT pt.station) as stations_completed,
        AVG(CASE WHEN pt.actual_time_minutes > 0 THEN pt.actual_time_minutes ELSE NULL END)::INTEGER as avg_time_per_meal
       FROM production_tasks pt
       JOIN production_schedule ps ON pt.schedule_id = ps.id
       WHERE ps.plan_id = $1 AND DATE(ps.created_date) = $2 AND pt.status = 'DONE'`,
      [plan_id, date]
    )

    // Planned production
    const planned = await pool.query(
      `SELECT
        SUM(ps.target_quantity)::INTEGER as total_meals,
        SUM(ps.target_time_minutes) as total_target_time
       FROM production_schedule ps
       WHERE ps.plan_id = $1 AND ps.created_date = $2`,
      [plan_id, date]
    )

    // Issues
    const issues = await pool.query(
      `SELECT category, COUNT(*) as count
       FROM production_issues pi
       JOIN production_tasks pt ON pi.task_id = pt.id
       JOIN production_schedule ps ON pt.schedule_id = ps.id
       WHERE ps.plan_id = $1 AND DATE(ps.created_date) = $2
       GROUP BY category`,
      [plan_id, date]
    )

    // Waste
    const waste = await pool.query(
      `SELECT SUM(quantity)::DECIMAL as total_waste, SUM(estimated_cost)::DECIMAL as total_cost
       FROM waste_log WHERE plan_id = $1 AND DATE(logged_at) = $2`,
      [plan_id, date]
    )

    res.json({
      actual: actual.rows[0] || { total_meals: 0, stations_completed: 0, avg_time_per_meal: 0 },
      planned: planned.rows[0] || { total_meals: 0, total_target_time: 0 },
      issues: issues.rows,
      waste: waste.rows[0] || { total_waste: 0, total_cost: 0 }
    })
  } catch (error) {
    console.error('Error fetching daily summary:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// WEEKLY REVIEW ANALYTICS
// ============================================================================

router.get('/weekly-review/:plan_id', async (req, res) => {
  try {
    const { plan_id } = req.params

    // Weekly plan summary
    const plan = await pool.query(
      `SELECT pp.*,
        COUNT(DISTINCT ps.id) as total_schedule_items,
        SUM(ps.target_quantity)::INTEGER as planned_total_meals,
        SUM(ps.target_time_minutes) as planned_total_time
       FROM production_plans pp
       LEFT JOIN production_schedule ps ON pp.id = ps.plan_id
       WHERE pp.id = $1
       GROUP BY pp.id`,
      [plan_id]
    )

    // Actual vs Planned by day
    const dayComparison = await pool.query(
      `SELECT
        ps.created_date as day,
        SUM(ps.target_quantity)::INTEGER as planned_meals,
        COALESCE(SUM(pt.actual_quantity), 0)::INTEGER as actual_meals,
        (COALESCE(SUM(pt.actual_quantity), 0) - SUM(ps.target_quantity))::INTEGER as variance
       FROM production_schedule ps
       LEFT JOIN production_tasks pt ON ps.id = pt.schedule_id AND pt.status = 'DONE'
       WHERE ps.plan_id = $1
       GROUP BY ps.created_date
       ORDER BY ps.created_date`,
      [plan_id]
    )

    // Station efficiency
    const stationEfficiency = await pool.query(
      `SELECT
        pt.station,
        COUNT(*) as total_tasks,
        SUM(CASE WHEN pt.status = 'DONE' THEN 1 ELSE 0 END) as completed_tasks,
        AVG(CASE WHEN pt.actual_time_minutes > 0 THEN pt.actual_time_minutes ELSE NULL END)::INTEGER as avg_actual_time,
        AVG(ps.target_time_minutes)::INTEGER as avg_target_time,
        ROUND(100.0 * SUM(CASE WHEN pt.status = 'DONE' THEN 1 ELSE 0 END) / COUNT(*), 1)::DECIMAL as completion_rate
       FROM production_tasks pt
       JOIN production_schedule ps ON pt.schedule_id = ps.id
       WHERE ps.plan_id = $1
       GROUP BY pt.station`,
      [plan_id]
    )

    // Waste summary
    const wasteSummary = await pool.query(
      `SELECT
        waste_type,
        COUNT(*) as incidents,
        SUM(quantity)::DECIMAL as total_quantity,
        SUM(estimated_cost)::DECIMAL as total_cost
       FROM waste_log WHERE plan_id = $1
       GROUP BY waste_type`,
      [plan_id]
    )

    // Labor summary
    const laborSummary = await pool.query(
      `SELECT
        role,
        SUM(hours_worked)::DECIMAL as total_hours,
        SUM(cost)::DECIMAL as total_cost,
        AVG(cost)::INTEGER as avg_cost_per_day,
        COUNT(DISTINCT logged_date) as days_worked
       FROM labor_log WHERE plan_id = $1
       GROUP BY role`,
      [plan_id]
    )

    // Issues summary
    const issuesSummary = await pool.query(
      `SELECT
        category,
        severity,
        COUNT(*) as count
       FROM production_issues pi
       JOIN production_tasks pt ON pi.task_id = pt.id
       JOIN production_schedule ps ON pt.schedule_id = ps.id
       WHERE ps.plan_id = $1
       GROUP BY category, severity
       ORDER BY severity`,
      [plan_id]
    )

    res.json({
      plan: plan.rows[0],
      day_comparison: dayComparison.rows,
      station_efficiency: stationEfficiency.rows,
      waste_summary: wasteSummary.rows,
      labor_summary: laborSummary.rows,
      issues_summary: issuesSummary.rows
    })
  } catch (error) {
    console.error('Error fetching weekly review:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
