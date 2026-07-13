const express = require('express')
const pool = require('../config/db')
const { requireAuth, optionalAuth } = require('../middleware/auth')

const router = express.Router()

// POST /api/boxes — guest or authenticated
router.post('/', optionalAuth, async (req, res) => {
  const {
    guest_email,
    week_start,
    delivery_day,
    delivery_window,
    delivery_address_line1,
    delivery_address_line2,
    delivery_city,
    delivery_state,
    delivery_postal_code,
    items, // [{ meal_id, quantity }]
  } = req.body

  if (!week_start || !items?.length) {
    return res.status(400).json({ error: 'week_start and items are required' })
  }
  if (!req.userId && !guest_email) {
    return res.status(400).json({ error: 'guest_email is required for guest checkout' })
  }

  try {
    // Fetch meal prices
    const mealIds = items.map(i => i.meal_id)
    const mealsResult = await pool.query(
      'SELECT meal_id, price_cents FROM meals WHERE meal_id = ANY($1)',
      [mealIds]
    )
    const priceMap = Object.fromEntries(mealsResult.rows.map(m => [m.meal_id, m.price_cents]))

    // Calculate subtotal
    let subtotal = 0
    for (const item of items) {
      subtotal += (priceMap[item.meal_id] || 0) * item.quantity
    }

    // Apply bulk discount
    const totalMeals = items.reduce((sum, i) => sum + i.quantity, 0)
    const discountResult = await pool.query(
      'SELECT discount_cents_per_meal FROM bulk_discount_tiers WHERE min_meals <= $1 ORDER BY min_meals DESC LIMIT 1',
      [totalMeals]
    )
    const discountPerMeal = discountResult.rows[0]?.discount_cents_per_meal || 0
    const bulkDiscount = discountPerMeal * totalMeals
    const total = subtotal - bulkDiscount

    // Create box
    const boxResult = await pool.query(
      `INSERT INTO boxes (
        user_id, guest_email, week_start, delivery_day, delivery_window,
        delivery_address_line1, delivery_address_line2, delivery_city,
        delivery_state, delivery_postal_code, subtotal_cents, bulk_discount_cents, total_cents
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        req.userId || null,
        guest_email || null,
        week_start,
        delivery_day || null,
        delivery_window || null,
        delivery_address_line1 || null,
        delivery_address_line2 || null,
        delivery_city || null,
        delivery_state || null,
        delivery_postal_code || null,
        subtotal,
        bulkDiscount,
        total,
      ]
    )
    const box = boxResult.rows[0]

    // Insert box items
    for (const item of items) {
      await pool.query(
        'INSERT INTO box_items (box_id, meal_id, quantity, price_cents) VALUES ($1,$2,$3,$4)',
        [box.box_id, item.meal_id, item.quantity, priceMap[item.meal_id] || 0]
      )
    }

    // Award XP for placing a box (authenticated users only)
    if (req.userId) {
      await pool.query(
        'INSERT INTO xp_logs (user_id, points, reason) VALUES ($1, $2, $3)',
        [req.userId, 50, 'box_placed']
      )
    }

    res.status(201).json(box)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/boxes — customer's box history
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.box_id, b.user_id, b.guest_email,
        to_char(b.week_start, 'YYYY-MM-DD') AS week_start,
        b.delivery_day, b.delivery_window,
        b.delivery_address_line1, b.delivery_address_line2,
        b.delivery_city, b.delivery_state, b.delivery_postal_code,
        b.status, b.subtotal_cents, b.bulk_discount_cents, b.total_cents,
        b.created_at,
        COALESCE(SUM(bi.quantity), 0)::int AS total_meals,
        COALESCE(
          json_agg(
            json_build_object('meal_name', m.name, 'quantity', bi.quantity, 'price_cents', bi.price_cents)
          ) FILTER (WHERE bi.box_item_id IS NOT NULL),
          '[]'
        ) AS items
       FROM boxes b
       LEFT JOIN box_items bi ON bi.box_id = b.box_id
       LEFT JOIN meals m ON bi.meal_id = m.meal_id
       WHERE b.user_id = $1
       GROUP BY b.box_id
       ORDER BY b.created_at DESC`,
      [req.userId]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/boxes/:box_id
router.get('/:box_id', requireAuth, async (req, res) => {
  try {
    const boxResult = await pool.query(
      'SELECT * FROM boxes WHERE box_id = $1 AND user_id = $2',
      [req.params.box_id, req.userId]
    )
    if (!boxResult.rows[0]) return res.status(404).json({ error: 'Box not found' })

    const itemsResult = await pool.query(
      `SELECT bi.*, m.name, m.image_url, m.calories, m.protein, m.carbs, m.fat, m.tags
       FROM box_items bi JOIN meals m ON bi.meal_id = m.meal_id
       WHERE bi.box_id = $1`,
      [req.params.box_id]
    )
    res.json({ ...boxResult.rows[0], items: itemsResult.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
