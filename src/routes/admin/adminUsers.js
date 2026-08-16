const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')

// ============================================================================
// STAFF/ADMIN ACCOUNTS -- unifies the old (empty) staff table and the shared
// admin@fit4sure.local login into one real accounts table (users). Every
// person who can access the admin dashboard has their own login here.
// Single-tier permissions: every account created here is role='admin'.
// ============================================================================

const STATUSES = ['available', 'busy', 'off']

const SAFE_COLUMNS = `user_id, email, display_name, department, status, role, is_active, created_at, updated_at`

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${SAFE_COLUMNS} FROM users WHERE role = 'admin' ORDER BY display_name NULLS LAST, email`
    )
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error listing users:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { email, password, display_name, department } = req.body
    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'email, password, and display_name are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' })
    }

    const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, department, role, is_active)
       VALUES ($1, $2, $3, $4, 'admin', true)
       RETURNING ${SAFE_COLUMNS}`,
      [email, passwordHash, display_name, department || null]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error creating user:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { display_name, department, status, is_active } = req.body
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` })
    }

    const fields = []
    const params = []
    const set = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`) }

    if (display_name !== undefined) set('display_name', display_name)
    if (department !== undefined) set('department', department)
    if (status !== undefined) set('status', status)
    if (is_active !== undefined) set('is_active', is_active)
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    fields.push(`updated_at = NOW()`)
    params.push(req.params.id)

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE user_id = $${params.length} AND role = 'admin' RETURNING ${SAFE_COLUMNS}`,
      params
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' })
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id/password', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { current_password, new_password } = req.body
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'new_password must be at least 8 characters' })
    }

    const isSelf = Number(req.params.id) === req.userId
    if (isSelf) {
      if (!current_password) return res.status(400).json({ error: 'current_password is required' })
      const current = await pool.query('SELECT password_hash FROM users WHERE user_id = $1', [req.params.id])
      if (current.rows.length === 0) return res.status(404).json({ error: 'User not found' })
      const valid = await bcrypt.compare(current_password, current.rows[0].password_hash)
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
    }

    const newHash = await bcrypt.hash(new_password, 12)
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2 AND role = 'admin' RETURNING user_id`,
      [newHash, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' })
    res.json({ success: true, message: 'Password updated' })
  } catch (error) {
    console.error('Error updating password:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
