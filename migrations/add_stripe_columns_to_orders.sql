-- Real Stripe Checkout integration: an order (or a batch of order rows from
-- one customer submission) gets one Checkout Session; the session id lets
-- staff/debugging trace which Stripe session an order is tied to, and the
-- payment intent id is the durable record of the actual charge once the
-- webhook confirms it (see src/routes/payments.js).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_checkout_session_id);
