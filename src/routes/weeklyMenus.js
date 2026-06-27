const express = require('express')
const pool = require('../config/db')

const router = express.Router()

// GET /api/weekly-menus?week=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { week } = req.query
  console.log('Received request for weekly menu with week:', week);
  if (!week) return res.status(400).json({ error: 'week query param required (YYYY-MM-DD)' })
  try {
    const result = await pool.query(
      `SELECT m.*, mc.name AS category_name, wm.weekly_menu_id, wm.week_start
       FROM weekly_menus wm
       JOIN meals m ON wm.meal_id = m.meal_id
       JOIN meal_categories mc ON m.meal_category_id = mc.meal_category_id
       WHERE wm.week_start = $1 AND wm.is_available = true AND m.is_available = true
       ORDER BY mc.display_order, m.name`,
      [week]
    )
    if(result) console.log('No result returned from database query for week:', week);
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
