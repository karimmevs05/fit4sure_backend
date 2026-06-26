const express = require('express')
const pool = require('../config/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

// GET /api/xp
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COALESCE(SUM(points), 0) AS total_xp FROM xp_logs WHERE user_id = $1',
      [req.userId]
    )
    const logs = await pool.query(
      'SELECT * FROM xp_logs WHERE user_id = $1 ORDER BY earned_at DESC LIMIT 20',
      [req.userId]
    )
    res.json({ total_xp: parseInt(result.rows[0].total_xp), recent: logs.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
