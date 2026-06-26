const express = require('express')
const pool = require('../config/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

// GET /api/diet-profile
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM diet_profiles WHERE user_id = $1',
      [req.userId]
    )
    res.json(result.rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/diet-profile
router.put('/', requireAuth, async (req, res) => {
  const {
    primary_goal,
    biggest_hurdle,
    protein_preference,
    dietary_preference,
    foods_to_avoid,
    daily_calorie_target,
  } = req.body
  try {
    const result = await pool.query(
      `INSERT INTO diet_profiles (user_id, primary_goal, biggest_hurdle, protein_preference, dietary_preference, foods_to_avoid, daily_calorie_target)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET
         primary_goal = EXCLUDED.primary_goal,
         biggest_hurdle = EXCLUDED.biggest_hurdle,
         protein_preference = EXCLUDED.protein_preference,
         dietary_preference = EXCLUDED.dietary_preference,
         foods_to_avoid = EXCLUDED.foods_to_avoid,
         daily_calorie_target = EXCLUDED.daily_calorie_target,
         updated_at = NOW()
       RETURNING *`,
      [req.userId, primary_goal, biggest_hurdle, protein_preference, dietary_preference, foods_to_avoid || [], daily_calorie_target || null]
    )

    // Award XP for setting goals (first time only)
    const xpCheck = await pool.query(
      "SELECT xp_log_id FROM xp_logs WHERE user_id = $1 AND reason = 'goal_set'",
      [req.userId]
    )
    if (xpCheck.rows.length === 0) {
      await pool.query(
        'INSERT INTO xp_logs (user_id, points, reason) VALUES ($1, $2, $3)',
        [req.userId, 20, 'goal_set']
      )
    }

    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
