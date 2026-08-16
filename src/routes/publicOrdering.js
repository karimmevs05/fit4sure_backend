// The real, public, unauthenticated customer-facing ordering page posts
// here directly -- no login, no admin token. Two routes: read the live
// weekly menu, and submit a real order. Both share their core logic with
// the authenticated admin picker via orderingService.js, so the two never
// quote different prices or different live recipes.

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { RECIPE_FORMATS, findOrCreateMenu, findOrCreateCustomerByContact, getWeeklyMenu } = require('../services/orderingService');

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
  const { customerName, phone, email, address, items } = req.body;

  const cleanName = (customerName || '').trim();
  const cleanPhone = (phone || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!cleanPhone) return res.status(400).json({ error: 'Phone number is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

  try {
    const menu = await getWeeklyMenu();
    const liveRecipesByDay = {
      monday: new Set(menu.monday.map((r) => r.name)),
      thursday: new Set(menu.thursday.map((r) => r.name)),
    };

    const customerId = await findOrCreateCustomerByContact({ name: cleanName, phone: cleanPhone, email, address });
    if (!customerId) return res.status(500).json({ error: 'Could not resolve customer' });

    const saved = [];
    const errors = [];

    for (const item of items) {
      const day = (item.day || '').toLowerCase();
      const format = item.format;
      const quantity = Number(item.quantity);
      const recipeName = (item.recipeName || '').trim();

      if (!['monday', 'thursday'].includes(day)) { errors.push({ item, reason: 'invalid day' }); continue; }
      if (!RECIPE_FORMATS.includes(format)) { errors.push({ item, reason: 'invalid format' }); continue; }
      if (!quantity || quantity <= 0) { errors.push({ item, reason: 'invalid quantity' }); continue; }
      if (!recipeName || !liveRecipesByDay[day].has(recipeName)) { errors.push({ item, reason: 'recipe is not on this week\'s live menu' }); continue; }

      try {
        const menuId = await findOrCreateMenu(recipeName, format);
        const menuPriceResult = await db.query('SELECT price FROM menus WHERE id = $1', [menuId]);
        const price = menuPriceResult.rows[0]?.price;
        const totalPrice = price != null ? price * quantity : null;

        const result = await db.query(
          `INSERT INTO orders (customer_id, menu_id, quantity, day_of_week, total_price, source, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'form', $6, NOW(), NOW())
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
    res.status(201).json({ data: { customerId, orders: saved, total, errors: errors.length ? errors : undefined } });
  } catch (error) {
    console.error('Error submitting public order:', error);
    res.status(500).json({ error: 'Failed to submit order' });
  }
});

module.exports = router;
