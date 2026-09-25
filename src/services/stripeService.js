// Shared between the public customer checkout (publicOrdering.js) and the
// staff-triggered "Send Payment Link" action (adminOrders.js) -- both just
// need "one Checkout Session covering these order ids, at this amount."
// The webhook (payments.js) is the only place that ever marks an order
// paid; this file only ever creates sessions, never touches payment_status
// itself, so there's exactly one path that can mark money as received.

const Stripe = require('stripe');

let stripeClient = null;
function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  if (!stripeClient) stripeClient = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

// amountCents must already be a rounded integer -- callers own the
// dollars-to-cents conversion so this function never silently mis-rounds a
// real charge amount.
async function createOrderCheckoutSession({ orderIds, amountCents, customerEmail, description, successUrl, cancelUrl }) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) throw new Error('orderIds is required');
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amountCents must be a positive integer');

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: description || 'Fit4Sure order' },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    customer_email: customerEmail || undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { order_ids: orderIds.join(',') },
  });

  return session;
}

module.exports = { getStripeClient, createOrderCheckoutSession };
