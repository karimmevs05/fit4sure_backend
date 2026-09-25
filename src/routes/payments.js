// Real Stripe webhook. Checkout Sessions themselves are created in
// publicOrdering.js (customer self-checkout) and adminOrders.js (staff
// "Send Payment Link") via stripeService.createOrderCheckoutSession -- this
// file's only job is to receive Stripe's confirmation and mark the right
// orders paid. It used to reference a `boxes` table that never existed in
// the live schema (dead code, never fired); this is the real replacement,
// tied to `orders`.

const express = require('express')
const pool = require('../config/db')
const { getStripeClient } = require('../services/stripeService')

const router = express.Router()

// POST /api/payments/webhook
// Mounted with express.raw() in app.js (before the global express.json()
// middleware) -- Stripe's signature check needs the exact raw request
// body, not a re-serialized parsed copy.
router.post('/webhook', async (req, res) => {
  let stripe
  try {
    stripe = getStripeClient()
  } catch (err) {
    console.error('Stripe webhook received but STRIPE_SECRET_KEY is not set:', err.message)
    return res.status(500).json({ error: 'Stripe is not configured' })
  }

  const sig = req.headers['stripe-signature']
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message)
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const orderIds = (session.metadata?.order_ids || '')
      .split(',')
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isInteger(id))

    if (orderIds.length > 0) {
      try {
        await pool.query(
          `UPDATE orders
           SET payment_status = 'paid', paid_at = NOW(), payment_method = 'stripe',
               stripe_payment_intent_id = $1, updated_at = NOW()
           WHERE id = ANY($2::int[])`,
          [typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null, orderIds]
        )
      } catch (err) {
        console.error('Failed to mark orders paid from Stripe webhook:', err)
        // Stripe retries on non-2xx -- still ack receipt of the event since
        // the failure is ours (DB), not a signal the event itself is bad.
      }
    } else {
      console.error('Stripe checkout.session.completed with no valid order_ids in metadata:', session.id)
    }
  }

  res.json({ received: true })
})

module.exports = router
