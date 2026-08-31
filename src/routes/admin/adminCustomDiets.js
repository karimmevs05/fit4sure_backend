const express = require('express')
const router = express.Router()
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')

// Named, reusable plate collections (e.g. "Keto Reset") -- see
// create_custom_diets.sql. A customer gets tagged with one of these
// (separate feature, not yet built); this file is just the diet + its
// plate list, fed from the Custom Plate Builder's "Add plate to custom
// diet" action.

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.id, d.name, d.created_at, COUNT(p.id)::int AS plate_count
      FROM custom_diets d
      LEFT JOIN custom_diet_plates p ON p.diet_id = d.id
      GROUP BY d.id
      ORDER BY d.name
    `)
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error fetching custom diets:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const name = (req.body.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name is required' })

    const result = await pool.query(
      `INSERT INTO custom_diets (name) VALUES ($1) RETURNING id, name, created_at, 0 AS plate_count`,
      [name]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `A diet named "${req.body.name}" already exists` })
    }
    console.error('Error creating custom diet:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id/plates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM custom_diet_plates WHERE diet_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    )
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error fetching diet plates:', error)
    res.status(500).json({ error: error.message })
  }
})

// Body: { name, calories, protein_g, carbs_g, fat_g, cost_cents, items }
// items is a snapshot of what made up the plate (recipe name + grams),
// for reference -- not live-linked to recipe_ingredients.
router.post('/:id/plates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, calories, protein_g, carbs_g, fat_g, cost_cents, items } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })

    const result = await pool.query(
      `INSERT INTO custom_diet_plates (diet_id, name, calories, protein_g, carbs_g, fat_g, cost_cents, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id,
        name,
        calories || 0,
        protein_g || 0,
        carbs_g || 0,
        fat_g || 0,
        cost_cents || 0,
        JSON.stringify(items || []),
      ]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error adding plate to diet:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
