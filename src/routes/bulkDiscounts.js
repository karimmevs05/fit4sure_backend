const express = require('express')
const pool = require('../config/db')

const router = express.Router()

// GET /api/bulk-discounts
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM bulk_discount_tiers ORDER BY min_meals ASC'
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
