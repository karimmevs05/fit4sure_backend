const express = require('express')
const pool = require('../config/db')

const router = express.Router()

// GET /api/delivery-zones/check?zip=XXXXX
router.get('/check', async (req, res) => {
  const { zip } = req.query
  if (!zip) return res.status(400).json({ error: 'zip query param required' })
  try {
    const result = await pool.query(
      'SELECT is_active FROM delivery_zones WHERE postal_code = $1',
      [zip.trim()]
    )
    const available = result.rows.length > 0 && result.rows[0].is_active
    res.json({ available })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
