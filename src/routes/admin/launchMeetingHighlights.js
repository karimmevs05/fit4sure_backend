const express = require('express')
const router = express.Router()
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')

// Manual "big topics" list for the task dashboard -- see
// create_launch_meeting_highlights.sql. Separate from the auto-generated
// Next meeting topics agenda; this is whatever someone wants to make sure
// gets raised live, typed in directly.

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM launch_meeting_highlights ORDER BY created_at ASC`)
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error fetching meeting highlights:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const text = (req.body.text || '').trim()
    if (!text) return res.status(400).json({ error: 'text is required' })

    const result = await pool.query(
      `INSERT INTO launch_meeting_highlights (text, created_by) VALUES ($1, $2) RETURNING *`,
      [text, req.userName]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error creating meeting highlight:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const text = (req.body.text || '').trim()
    if (!text) return res.status(400).json({ error: 'text is required' })

    const result = await pool.query(
      `UPDATE launch_meeting_highlights SET text = $1 WHERE id = $2 RETURNING *`,
      [text, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating meeting highlight:', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM launch_meeting_highlights WHERE id = $1`, [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting meeting highlight:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
