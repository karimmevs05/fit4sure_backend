const express = require('express')
const pool = require('../config/db')

const router = express.Router()

// GET /api/meals
router.get('/', async (req, res) => {
  try {
    const { category, tag } = req.query
    let query = `
      SELECT m.*, mc.name AS category_name
      FROM meals m
      JOIN meal_categories mc ON m.meal_category_id = mc.meal_category_id
      WHERE m.is_available = true
    `
    const params = []
    if (category) {
      params.push(category)
      query += ` AND mc.name = $${params.length}`
    }
    if (tag) {
      params.push(tag)
      query += ` AND $${params.length} = ANY(m.tags)`
    }
    query += ' ORDER BY mc.display_order, m.name'
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/meals/:meal_id
router.get('/:meal_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, mc.name AS category_name
       FROM meals m
       JOIN meal_categories mc ON m.meal_category_id = mc.meal_category_id
       WHERE m.meal_id = $1`,
      [req.params.meal_id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Meal not found' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
