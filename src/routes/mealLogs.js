const express = require('express')
const pool = require('../config/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

// POST /api/meal-logs
router.post('/', requireAuth, async (req, res) => {
  const { meal_id } = req.body
  if (!meal_id) return res.status(400).json({ error: 'meal_id is required' })
  try {
    const mealResult = await pool.query(
      'SELECT calories, protein, carbs, fat FROM meals WHERE meal_id = $1',
      [meal_id]
    )
    if (!mealResult.rows[0]) return res.status(404).json({ error: 'Meal not found' })
    const meal = mealResult.rows[0]

    const result = await pool.query(
      `INSERT INTO meal_logs (user_id, meal_id, calories, protein, carbs, fat)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.userId, meal_id, meal.calories, meal.protein, meal.carbs, meal.fat]
    )

    // Award XP for logging a meal
    await pool.query(
      'INSERT INTO xp_logs (user_id, points, reason) VALUES ($1,$2,$3)',
      [req.userId, 10, 'meal_logged']
    )

    res.status(201).json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/meal-logs?date=YYYY-MM-DD
router.get('/', requireAuth, async (req, res) => {
  const { date } = req.query
  try {
    let query = `
      SELECT ml.*, m.name, m.image_url
      FROM meal_logs ml JOIN meals m ON ml.meal_id = m.meal_id
      WHERE ml.user_id = $1
    `
    const params = [req.userId]
    if (date) {
      params.push(date)
      query += ` AND ml.logged_at::date = $${params.length}`
    }
    query += ' ORDER BY ml.logged_at DESC'
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
