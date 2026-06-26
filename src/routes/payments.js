const express = require('express')
const Stripe = require('stripe')
const pool = require('../config/db')
const { optionalAuth } = require('../middleware/auth')

const router = express.Router()

// POST /api/payments/checkout
router.post('/checkout', optionalAuth, async (req, res) => {
  const { box_id } = req.body
  if (!box_id) return res.status(400).json({ error: 'box_id is required' })
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
    const boxResult = await pool.query('SELECT * FROM boxes WHERE box_id = $1', [box_id])
    const box = boxResult.rows[0]
    if (!box) return res.status(404).json({ error: 'Box not found' })
    if (box.status !== 'pending') return res.status(400).json({ error: 'Box already paid or cancelled' })

    const paymentIntent = await stripe.paymentIntents.create({
      amount: box.total_cents,
      currency: 'usd',
      metadata: { box_id: String(box_id) },
    })

    await pool.query(
      'UPDATE boxes SET stripe_payment_intent_id = $1 WHERE box_id = $2',
      [paymentIntent.id, box_id]
    )

    res.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/payments/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
  const sig = req.headers['stripe-signature']
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object
    await pool.query(
      "UPDATE boxes SET status = 'paid' WHERE stripe_payment_intent_id = $1",
      [paymentIntent.id]
    )
  }

  res.json({ received: true })
})

module.exports = router
