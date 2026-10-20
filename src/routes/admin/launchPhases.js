const express = require('express')
const router = express.Router()
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')

// The mobile PM tool's 3-phase business tracker (Production / Soft
// Distribution / Scale Distribution) -- see f4s-team-pm-tool-spec.md.
// Deliberately separate from the existing launch_milestones table (6
// rows, a different pre-existing concept, untouched). Hand-set by the
// team, not derived from anything else.

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM launch_phases ORDER BY sort_order, id`)
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error listing launch phases:', error)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { status, progress_pct } = req.body
    const validStatuses = ['not_started', 'in_progress', 'complete']
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` })
    }
    if (progress_pct !== undefined && (!Number.isInteger(progress_pct) || progress_pct < 0 || progress_pct > 100)) {
      return res.status(400).json({ error: 'progress_pct must be an integer between 0 and 100' })
    }
    if (status === undefined && progress_pct === undefined) {
      return res.status(400).json({ error: 'status or progress_pct is required' })
    }

    const fields = []
    const params = []
    const set = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`) }
    if (status !== undefined) set('status', status)
    if (progress_pct !== undefined) set('progress_pct', progress_pct)
    fields.push('updated_at = NOW()')
    params.push(req.params.id)

    const result = await pool.query(
      `UPDATE launch_phases SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Phase not found' })
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error updating launch phase:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
