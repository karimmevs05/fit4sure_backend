const express = require('express')
const router = express.Router()
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')

// Freeform note per calendar day, separate from per-task notes.
// One row per date -- see launch_day_notes in create_launch_tasks.sql.

router.get('/:date', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM launch_day_notes WHERE date = $1`, [req.params.date])
    res.json({ success: true, data: result.rows[0] || { date: req.params.date, note: '' } })
  } catch (error) {
    console.error('Error fetching day note:', error)
    res.status(500).json({ error: error.message })
  }
})

router.put('/:date', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { note } = req.body
    const result = await pool.query(
      `INSERT INTO launch_day_notes (date, note, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (date) DO UPDATE SET note = EXCLUDED.note, updated_at = NOW()
       RETURNING *`,
      [req.params.date, note ?? '']
    )

    await pool.query(
      `INSERT INTO launch_activity_log (task_id, actor, type, text) VALUES (NULL, $1, 'note', $2)`,
      [req.userName, `${req.userName} updated the note for ${req.params.date}`]
    )

    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating day note:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
