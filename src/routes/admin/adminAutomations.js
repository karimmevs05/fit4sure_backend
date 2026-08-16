// Automation rules, customer lists (the targeting mechanism for mass
// actions -- deliberately no "message everyone"), and the human-task side
// of automations (crm_tasks -- renamed from the source package's `tasks`,
// which collided with the real, already-live Operations Hub `tasks` table).

const express = require('express')
const router = express.Router()
const db = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')
const { enrollCustomers } = require('../../services/automationEngine')

// ---- Automation rules ------------------------------------------------------

// GET /api/admin/automation-rules -- each rule with its ordered steps
router.get('/automation-rules', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const rulesResult = await db.query('SELECT * FROM automation_rules ORDER BY created_at DESC')
    const rules = rulesResult.rows
    for (const rule of rules) {
      const stepsResult = await db.query(
        'SELECT * FROM automation_steps WHERE rule_id = $1 ORDER BY step_order',
        [rule.id]
      )
      rule.steps = stepsResult.rows
      const countResult = await db.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'active') AS active_count FROM automation_enrollments WHERE rule_id = $1`,
        [rule.id]
      )
      rule.active_enrollments = Number(countResult.rows[0].active_count)
    }
    res.json({ data: rules })
  } catch (error) {
    console.error('Error fetching automation rules:', error)
    res.status(500).json({ error: 'Failed to fetch automation rules' })
  }
})

// POST /api/admin/automation-rules
// Body: { name, trigger_type, trigger_config, steps: [{ delay_days, action_type, template_id?, task_title?, task_description? }] }
router.post('/automation-rules', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, trigger_type, trigger_config, steps } = req.body
  if (!name || !trigger_type || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'name, trigger_type, and at least one step are required' })
  }
  try {
    const ruleResult = await db.query(
      `INSERT INTO automation_rules (name, trigger_type, trigger_config, is_active) VALUES ($1, $2, $3, true) RETURNING *`,
      [name, trigger_type, trigger_config || null]
    )
    const rule = ruleResult.rows[0]

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      await db.query(
        `INSERT INTO automation_steps (rule_id, step_order, delay_days, action_type, template_id, task_title, task_description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [rule.id, i, s.delay_days || 0, s.action_type, s.template_id || null, s.task_title || null, s.task_description || null]
      )
    }
    res.status(201).json({ data: rule })
  } catch (error) {
    console.error('Error creating automation rule:', error)
    res.status(500).json({ error: 'Failed to create automation rule' })
  }
})

// PUT /api/admin/automation-rules/:id/toggle -- flip is_active
router.put('/automation-rules/:id/toggle', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE automation_rules SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Rule not found' })
    res.json({ data: result.rows[0] })
  } catch (error) {
    console.error('Error toggling automation rule:', error)
    res.status(500).json({ error: 'Failed to toggle rule' })
  }
})

// DELETE /api/admin/automation-rules/:id
router.delete('/automation-rules/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM automation_rules WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting automation rule:', error)
    res.status(500).json({ error: 'Failed to delete rule' })
  }
})

// POST /api/admin/automation-rules/:id/enroll -- the mass-trigger action.
// Body: { customer_ids: number[] }
router.post('/automation-rules/:id/enroll', requireAuth, requireRole('admin'), async (req, res) => {
  const { customer_ids } = req.body
  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    return res.status(400).json({ error: 'customer_ids is required' })
  }
  try {
    const enrolled = await enrollCustomers(req.params.id, customer_ids, 'manual')
    res.json({ success: true, enrolled })
  } catch (error) {
    console.error('Error enrolling customers:', error)
    res.status(500).json({ error: 'Failed to enroll customers' })
  }
})

// ---- Customer lists ---------------------------------------------------------

// GET /api/admin/customer-lists -- each with member count
router.get('/customer-lists', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT cl.id, cl.name, cl.created_at, COUNT(clm.customer_id) AS member_count
      FROM customer_lists cl
      LEFT JOIN customer_list_members clm ON clm.list_id = cl.id
      GROUP BY cl.id
      ORDER BY cl.created_at DESC
    `)
    res.json({ data: result.rows })
  } catch (error) {
    console.error('Error fetching customer lists:', error)
    res.status(500).json({ error: 'Failed to fetch lists' })
  }
})

// GET /api/admin/customer-lists/:id/members -- full customer rows in this list
router.get('/customer-lists/:id/members', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.id, c.name, c.email, c.phone
       FROM customer_list_members clm
       JOIN customers c ON c.id = clm.customer_id
       WHERE clm.list_id = $1
       ORDER BY c.name`,
      [req.params.id]
    )
    res.json({ data: result.rows })
  } catch (error) {
    console.error('Error fetching list members:', error)
    res.status(500).json({ error: 'Failed to fetch list members' })
  }
})

// POST /api/admin/customer-lists -- create, optionally with initial members
// Body: { name, customer_ids?: number[] }
router.post('/customer-lists', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, customer_ids } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  try {
    const listResult = await db.query('INSERT INTO customer_lists (name) VALUES ($1) RETURNING *', [name])
    const list = listResult.rows[0]
    if (Array.isArray(customer_ids)) {
      for (const customerId of customer_ids) {
        await db.query(
          `INSERT INTO customer_list_members (list_id, customer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [list.id, customerId]
        )
      }
    }
    res.status(201).json({ data: list })
  } catch (error) {
    console.error('Error creating list:', error)
    res.status(500).json({ error: 'Failed to create list' })
  }
})

// POST /api/admin/customer-lists/:id/members -- add customers to an existing list
router.post('/customer-lists/:id/members', requireAuth, requireRole('admin'), async (req, res) => {
  const { customer_ids } = req.body
  if (!Array.isArray(customer_ids)) return res.status(400).json({ error: 'customer_ids is required' })
  try {
    for (const customerId of customer_ids) {
      await db.query(
        `INSERT INTO customer_list_members (list_id, customer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, customerId]
      )
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Error adding list members:', error)
    res.status(500).json({ error: 'Failed to add members' })
  }
})

router.delete('/customer-lists/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM customer_lists WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting list:', error)
    res.status(500).json({ error: 'Failed to delete list' })
  }
})

// ---- Tasks (crm_tasks) ------------------------------------------------------
//
// Routed at /crm-tasks, not /tasks -- the real Operations Hub already owns
// /api/admin/tasks (adminTasksRoutes) with a completely different schema.

// GET /api/admin/crm-tasks?status=open|completed|all
router.get('/crm-tasks', requireAuth, requireRole('admin'), async (req, res) => {
  const status = req.query.status || 'open'
  try {
    const where = status === 'open' ? 'WHERE t.completed_at IS NULL' : status === 'completed' ? 'WHERE t.completed_at IS NOT NULL' : ''
    const result = await db.query(`
      SELECT t.*, c.name AS customer_name
      FROM crm_tasks t
      LEFT JOIN customers c ON c.id = t.customer_id
      ${where}
      ORDER BY t.due_at ASC NULLS LAST, t.created_at DESC
    `)
    res.json({ data: result.rows })
  } catch (error) {
    console.error('Error fetching crm tasks:', error)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

// PUT /api/admin/crm-tasks/:id/complete
router.put('/crm-tasks/:id/complete', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('UPDATE crm_tasks SET completed_at = NOW() WHERE id = $1 RETURNING *', [req.params.id])
    if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' })
    res.json({ data: result.rows[0] })
  } catch (error) {
    console.error('Error completing crm task:', error)
    res.status(500).json({ error: 'Failed to complete task' })
  }
})

// POST /api/admin/automations/run-now -- manual scheduler trigger for testing,
// harmless to leave in place ("run the automations right now" on demand).
router.post('/automations/run-now', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { runDueSteps, checkTimeTriggers } = require('../../services/automationEngine')
    const executed = await runDueSteps()
    const enrolled = await checkTimeTriggers()
    res.json({ success: true, executed, enrolled })
  } catch (error) {
    console.error('Error running automations now:', error)
    res.status(500).json({ error: 'Failed to run automations' })
  }
})

module.exports = router
