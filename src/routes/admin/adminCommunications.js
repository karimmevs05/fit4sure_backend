const express = require('express')
const router = express.Router()
const db = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')
const { sendEmail, sendSms, mergeTags } = require('../../services/communicationService')

// GET /api/admin/customers/:id/activities -- full activity feed for one customer
router.get('/customers/:id/activities', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, type, direction, subject, body, status, metadata, created_at
       FROM customer_activities
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    )
    res.json({ data: result.rows })
  } catch (error) {
    console.error('Error fetching customer activities:', error)
    res.status(500).json({ error: 'Failed to fetch activities' })
  }
})

// POST /api/admin/customers/:id/activities -- log an activity, sending a
// real email/SMS first if type is 'email' or 'sms'.
//
// Body: { type: 'email'|'sms'|'call'|'note', subject?, body, direction? }
// direction defaults to 'outbound' for email/sms/call, is ignored for notes.
router.post('/customers/:id/activities', requireAuth, requireRole('admin'), async (req, res) => {
  const { type, subject, body, direction } = req.body
  if (!type || !body) return res.status(400).json({ error: 'type and body are required' })

  try {
    const customerResult = await db.query('SELECT id, name, email, phone FROM customers WHERE id = $1', [req.params.id])
    const customer = customerResult.rows[0]
    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    let status = 'logged'
    let metadata = null
    const mergedBody = mergeTags(body, customer)
    const mergedSubject = mergeTags(subject, customer)

    if (type === 'email') {
      if (!customer.email) return res.status(400).json({ error: 'Customer has no email on file' })
      const result = await sendEmail({ to: customer.email, subject: mergedSubject || '(no subject)', body: mergedBody })
      status = result.success ? 'sent' : 'failed'
      if (!result.success) metadata = { error: result.error }
    } else if (type === 'sms') {
      if (!customer.phone) return res.status(400).json({ error: 'Customer has no phone on file' })
      const result = await sendSms({ to: customer.phone, body: mergedBody })
      status = result.success ? 'sent' : 'failed'
      if (!result.success) metadata = { error: result.error }
    }
    // type === 'call' or 'note' -- just logged, no provider call, status stays 'logged'

    const insertResult = await db.query(
      `INSERT INTO customer_activities (customer_id, type, direction, subject, body, status, metadata, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, type, direction, subject, body, status, metadata, created_at`,
      [req.params.id, type, direction || (type === 'note' ? null : 'outbound'), mergedSubject || null, mergedBody, status, metadata, req.userId]
    )

    res.status(201).json({ data: insertResult.rows[0] })
  } catch (error) {
    console.error('Error logging activity:', error)
    res.status(500).json({ error: 'Failed to log activity' })
  }
})

// GET /api/admin/activities/recent -- org-wide feed across all customers,
// for the Customers page's Activities tab.
router.get('/activities/recent', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100)
    const result = await db.query(
      `SELECT ca.id, ca.type, ca.direction, ca.subject, ca.body, ca.status, ca.created_at,
              c.id AS customer_id, c.name AS customer_name
       FROM customer_activities ca
       JOIN customers c ON c.id = ca.customer_id
       ORDER BY ca.created_at DESC
       LIMIT $1`,
      [limit]
    )
    res.json({ data: result.rows })
  } catch (error) {
    console.error('Error fetching recent activity:', error)
    res.status(500).json({ error: 'Failed to fetch recent activity' })
  }
})

// GET /api/admin/communication-templates?channel=email|sms
router.get('/communication-templates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { channel } = req.query
    const result = channel
      ? await db.query('SELECT * FROM communication_templates WHERE channel = $1 ORDER BY name', [channel])
      : await db.query('SELECT * FROM communication_templates ORDER BY channel, name')
    res.json({ data: result.rows })
  } catch (error) {
    console.error('Error fetching templates:', error)
    res.status(500).json({ error: 'Failed to fetch templates' })
  }
})

// POST /api/admin/communication-templates -- add a new one later, from the UI or by hand
router.post('/communication-templates', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, channel, subject, body } = req.body
  if (!name || !channel || !body) return res.status(400).json({ error: 'name, channel, and body are required' })
  try {
    const result = await db.query(
      `INSERT INTO communication_templates (name, channel, subject, body) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, channel, subject || null, body]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (error) {
    console.error('Error creating template:', error)
    res.status(500).json({ error: 'Failed to create template' })
  }
})

module.exports = router
