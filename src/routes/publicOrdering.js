// The real, public, unauthenticated customer-facing ordering page posts
// here directly -- no login, no admin token. Two routes: read the live
// weekly menu, and submit a real order. Both share their core logic with
// the authenticated admin picker via orderingService.js, so the two never
// quote different prices or different live recipes.

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const {
  RECIPE_FORMATS,
  SIDE_FORMAT,
  SAUCE_ADDON_FORMAT,
  ADD_ON_FORMATS,
  ADD_ON_FREE_PRICE,
  ADD_ON_EXTRA_PRICE,
  findOrCreateMenu,
  findOrCreateCustomerByContact,
  getWeeklyMenu,
} = require('../services/orderingService');
const { createOrderCheckoutSession } = require('../services/stripeService');

// GET /api/public/menu - same shape as the admin picker's weekly-menu, no auth.
router.get('/menu', async (req, res) => {
  try {
    res.json({ data: await getWeeklyMenu() });
  } catch (error) {
    console.error('Error fetching public weekly menu:', error);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// POST /api/public/orders - the real order submission from the customer
// ordering page. Body: { customerName, phone, email?, items: [{ recipeName,
// day, format, quantity, notes? }] }.
//
// Every item is validated against THIS week's actual live menu (from
// getWeeklyMenu()) before anything is written -- a public, unauthenticated
// endpoint must never let a request invent its own recipe name or price.
// Items are saved one at a time (matching the rest of this app's batch
// patterns, e.g. importOrderRow) so one bad line doesn't block the others;
// the response reports exactly what saved and what didn't.
router.post('/orders', async (req, res) => {
  const { customerName, phone, email, address, items, origin, smsConsent } = req.body;

  const cleanName = (customerName || '').trim();
  const cleanPhone = (phone || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!cleanPhone) return res.status(400).json({ error: 'Phone number is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
  // A2P 10DLC compliance -- order confirmation and payment-link texts are
  // core to this flow, so real consent is required server-side too, not
  // just enforced by the order page's own checkbox (a direct POST could
  // otherwise skip it entirely).
  if (!smsConsent) return res.status(400).json({ error: 'You must agree to receive order and payment texts to place an order' });

  try {
    const menu = await getWeeklyMenu();
    // The order page shows the draft plan for browsing before it's
    // published (customers can see what's coming, pick formats, build a
    // cart), but real submission stays blocked server-side until the chef
    // actually publishes -- the page's own disabled Submit button is only
    // the UI half of this; without this check here, a direct POST could
    // place a real order against an unfinished, still-changing plan.
    if (!menu.menuReady) {
      return res.status(403).json({ error: "This week's menu hasn't been published yet -- check back soon to order." });
    }
    const liveRecipesByDay = {
      monday: new Set(menu.monday.map((r) => r.name)),
      thursday: new Set(menu.thursday.map((r) => r.name)),
    };

    const customerId = await findOrCreateCustomerByContact({ name: cleanName, phone: cleanPhone, email, address, smsConsent });
    if (!customerId) return res.status(500).json({ error: 'Could not resolve customer' });

    const saved = [];
    const errors = [];

    for (const item of items) {
      const day = (item.day || '').toLowerCase();
      const format = item.format;
      const quantity = Number(item.quantity);
      const recipeName = (item.recipeName || '').trim();

      if (!['monday', 'thursday'].includes(day)) { errors.push({ item, reason: 'invalid day' }); continue; }
      if (!RECIPE_FORMATS.includes(format) && format !== SIDE_FORMAT && format !== SAUCE_ADDON_FORMAT) { errors.push({ item, reason: 'invalid format' }); continue; }
      if (!quantity || quantity <= 0) { errors.push({ item, reason: 'invalid quantity' }); continue; }
      if (!recipeName || !liveRecipesByDay[day].has(recipeName)) { errors.push({ item, reason: 'recipe is not on this week\'s live menu' }); continue; }

      // Sides/sauces are add-ons whose real price depends on tap order within
      // this specific plate (sides: first 2 free; sauces: first 1 free;
      // every one after that is +$2.50) -- that can't be looked up from the
      // fixed CATEGORY_PRICES table, so for these two formats only, trust
      // the client's submitted price, but strictly clamp it to one of the
      // two legitimate values first.
      if (ADD_ON_FORMATS.includes(format)) {
        const submittedPrice = Number(item.price);
        if (submittedPrice !== ADD_ON_FREE_PRICE && submittedPrice !== ADD_ON_EXTRA_PRICE) {
          errors.push({ item, reason: 'invalid add-on price' });
          continue;
        }
      }

      try {
        const menuId = await findOrCreateMenu(recipeName, format);
        let totalPrice;
        if (ADD_ON_FORMATS.includes(format)) {
          totalPrice = Number(item.price) * quantity;
        } else {
          const menuPriceResult = await db.query('SELECT price FROM menus WHERE id = $1', [menuId]);
          const price = menuPriceResult.rows[0]?.price;
          totalPrice = price != null ? price * quantity : null;
        }

        // payment_status defaults to 'paid' at the table level (that default
        // predates real payment collection, matching how revenue was
        // counted before Stripe existed) -- a public order isn't actually
        // paid yet, so this must override it to 'pending' explicitly. The
        // Stripe webhook (payments.js) is the only thing that flips it to
        // 'paid', once the customer actually completes checkout.
        const result = await db.query(
          `INSERT INTO orders (customer_id, menu_id, quantity, day_of_week, total_price, source, notes, payment_status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'form', $6, 'pending', NOW(), NOW())
           RETURNING id, quantity, day_of_week, total_price`,
          [customerId, menuId, quantity, day, totalPrice, item.notes || null]
        );
        saved.push(result.rows[0]);
      } catch (itemError) {
        console.error('Error saving public order item:', itemError);
        errors.push({ item, reason: 'failed to save' });
      }
    }

    if (saved.length === 0) {
      return res.status(400).json({ error: 'No items could be saved', errors });
    }

    const total = saved.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

    // Real checkout: one Stripe Checkout Session covers every row from this
    // submission (a cart can contain several plates -> several order rows).
    // `origin` is the ordering page's own window.location.origin, sent by
    // the client -- built here rather than hardcoded so it keeps working
    // regardless of which domain/subdomain the page is actually served
    // from. Stripe isn't configured as a hard requirement for placing an
    // order (STRIPE_SECRET_KEY may not be set yet, or Stripe may hiccup) --
    // the order itself is already saved above, so a Stripe failure here is
    // reported but doesn't roll that back.
    let checkoutUrl = null;
    const checkoutOrigin = origin || process.env.PUBLIC_SITE_URL;
    if (total > 0 && checkoutOrigin) {
      try {
        const session = await createOrderCheckoutSession({
          orderIds: saved.map((o) => o.id),
          amountCents: Math.round(total * 100),
          customerEmail: email || undefined,
          description: `Fit4Sure order for ${cleanName}`,
          successUrl: `${checkoutOrigin}/order/?paid=1`,
          cancelUrl: `${checkoutOrigin}/order/?cancelled=1`,
        });
        checkoutUrl = session.url;
        await db.query(
          'UPDATE orders SET stripe_checkout_session_id = $1, updated_at = NOW() WHERE id = ANY($2::int[])',
          [session.id, saved.map((o) => o.id)]
        );
      } catch (stripeError) {
        console.error('Error creating Stripe checkout session for public order:', stripeError);
      }
    }

    res.status(201).json({ data: { customerId, orders: saved, total, checkoutUrl, errors: errors.length ? errors : undefined } });
  } catch (error) {
    console.error('Error submitting public order:', error);
    res.status(500).json({ error: 'Failed to submit order' });
  }
});

module.exports = router;
