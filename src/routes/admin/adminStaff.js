const express = require('express')
const router = express.Router()
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')

const STAFF_STATUSES = ['available', 'busy', 'off']

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { is_active } = req.query
    const conditions = []
    const params = []
    if (is_active !== undefined) { params.push(is_active === 'true'); conditions.push(`is_active = $${params.length}`) }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`SELECT * FROM staff ${whereClause} ORDER BY name`, params)
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error listing staff:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, department, status } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    if (status !== undefined && !STAFF_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STAFF_STATUSES.join(', ')}` })
    }

    const result = await pool.query(
      `INSERT INTO staff (name, email, department, status) VALUES ($1, $2, $3, COALESCE($4, 'available')) RETURNING *`,
      [name, email || null, department || null, status || null]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error creating staff member:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, department, status, is_active } = req.body
    if (status !== undefined && !STAFF_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STAFF_STATUSES.join(', ')}` })
    }

    const fields = []
    const params = []
    const set = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`) }

    if (name !== undefined) set('name', name)
    if (email !== undefined) set('email', email)
    if (department !== undefined) set('department', department)
    if (status !== undefined) set('status', status)
    if (is_active !== undefined) set('is_active', is_active)
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    params.push(req.params.id)
    const result = await pool.query(
      `UPDATE staff SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Staff member not found' })

    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating staff member:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
