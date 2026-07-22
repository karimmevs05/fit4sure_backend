const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

// Known price tiers (fit4sure.net). "By The LB" has no fixed price -- it's
// priced per item, so new By The LB menus are created with a null price
// until set manually.
const CATEGORY_PRICES = {
  Regular: 13.79,
  Large: 16.79,
  Breakfast: 11.30,
};

// Find an existing menu matching (name, category), or create one.
async function findOrCreateMenu(name, category) {
  const cleanName = (name || '').trim();
  const cleanCategory = (category || '').trim();
  if (!cleanName) return null;

  const existing = await db.query(
    `SELECT id FROM menus WHERE LOWER(name) = LOWER($1) AND LOWER(COALESCE(category, '')) = LOWER($2) LIMIT 1`,
    [cleanName, cleanCategory]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const price = CATEGORY_PRICES[cleanCategory] ?? null;
  const created = await db.query(
    `INSERT INTO menus (name, category, price, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
    [cleanName, cleanCategory || null, price]
  );
  return created.rows[0].id;
}

// Find an existing customer by name, or create one.
async function findOrCreateCustomer(name) {
  const cleanName = (name || '').trim();
  if (!cleanName) return null;

  const existing = await db.query(
    `SELECT id FROM customers WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [cleanName]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const created = await db.query(
    `INSERT INTO customers (name, status, sales_pipeline_stage, created_at, updated_at)
     VALUES ($1, 'prospect', 'prospect', NOW(), NOW()) RETURNING id`,
    [cleanName]
  );
  return created.rows[0].id;
}

// GET /api/admin/orders/this-week - Orders placed in the current week
// (Monday-based week, matching the real Monday/Thursday delivery cadence)
router.get('/this-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const ordersResult = await db.query(`
      SELECT o.id, o.customer_id, c.name AS customer_name, o.menu_id, m.name AS menu_name,
        m.category, o.quantity, o.day_of_week, o.total_price, o.source, o.notes, o.created_at
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN menus m ON o.menu_id = m.id
      WHERE date_trunc('week', o.created_at) = date_trunc('week', NOW())
      ORDER BY c.name, m.category, m.name
    `);

    const menuTotalsResult = await db.query(`
      SELECT m.id, m.name, m.category, o.day_of_week,
        SUM(CASE WHEN m.category = 'Regular' THEN o.quantity ELSE 0 END) AS regular_count,
        SUM(CASE WHEN m.category = 'Large' THEN o.quantity ELSE 0 END) AS large_count,
        SUM(o.quantity) AS total_count
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE date_trunc('week', o.created_at) = date_trunc('week', NOW())
      GROUP BY m.id, m.name, m.category, o.day_of_week
      ORDER BY m.name
    `);

    const summaryResult = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN o.day_of_week ILIKE 'monday' THEN o.quantity ELSE 0 END), 0) AS monday_meals,
        COALESCE(SUM(CASE WHEN o.day_of_week ILIKE 'thursday' THEN o.quantity ELSE 0 END), 0) AS thursday_meals,
        COALESCE(SUM(CASE WHEN m.category = 'Breakfast' THEN o.quantity ELSE 0 END), 0) AS breakfast_meals,
        COALESCE(SUM(o.quantity), 0) AS total_meals,
        COUNT(DISTINCT o.customer_id) AS total_customers,
        COUNT(DISTINCT CASE WHEN o.source = 'form' THEN o.customer_id END) AS form_customers,
        COUNT(DISTINCT CASE WHEN o.source = 'manual' THEN o.customer_id END) AS manual_customers
      FROM orders o
      LEFT JOIN menus m ON o.menu_id = m.id
      WHERE date_trunc('week', o.created_at) = date_trunc('week', NOW())
    `);

    const nonRespondersResult = await db.query(`
      SELECT c.id, c.name
      FROM customers c
      WHERE c.sales_pipeline_stage IN ('active', 'engaged', 'trial')
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.customer_id = c.id
            AND date_trunc('week', o.created_at) = date_trunc('week', NOW())
        )
      ORDER BY c.name
    `);

    res.json({
      data: {
        orders: ordersResult.rows,
        menuTotals: menuTotalsResult.rows,
        summary: summaryResult.rows[0],
        nonResponders: nonRespondersResult.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching this week orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/admin/orders/history - Weekly order history
router.get('/history', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        date_trunc('week', o.created_at) AS week_start,
        COUNT(DISTINCT o.customer_id) AS total_customers,
        SUM(o.quantity) AS total_meals,
        ROUND(AVG(o.quantity)::numeric, 1) AS avg_order_size
      FROM orders o
      GROUP BY date_trunc('week', o.created_at)
      ORDER BY week_start DESC
    `);

    res.json({
      data: result.rows.map((row) => ({
        week: row.week_start,
        totalMeals: parseInt(row.total_meals) || 0,
        customers: parseInt(row.total_customers) || 0,
        avgOrderSize: parseFloat(row.avg_order_size) || 0,
      })),
    });
  } catch (error) {
    console.error('Error fetching order history:', error);
    res.status(500).json({ error: 'Failed to fetch order history' });
  }
});

// GET /api/admin/orders/insights - Real analytics computed from actual order data
router.get('/insights', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const historyResult = await db.query(`
      SELECT
        SUM(quantity) AS total_meals,
        COUNT(DISTINCT date_trunc('week', created_at)) AS total_weeks,
        COUNT(DISTINCT customer_id) AS total_customers
      FROM orders
    `);
    const history = historyResult.rows[0];
    const avgMealsPerWeek = history.total_weeks > 0
      ? Math.round(history.total_meals / history.total_weeks)
      : 0;

    const peakResult = await db.query(`
      SELECT date_trunc('week', created_at) AS week_start, SUM(quantity) AS total_meals
      FROM orders
      GROUP BY date_trunc('week', created_at)
      ORDER BY total_meals DESC
      LIMIT 1
    `);
    const peakWeek = peakResult.rows[0] || { week_start: null, total_meals: 0 };

    const recipesResult = await db.query(`
      SELECT m.name AS recipe_name, SUM(o.quantity) AS order_count
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      GROUP BY m.name
      ORDER BY order_count DESC
      LIMIT 5
    `);

    const customerResult = await db.query(`
      SELECT c.id, c.name,
        COUNT(DISTINCT date_trunc('week', o.created_at)) AS weeks_active,
        SUM(o.quantity) AS total_meals_ordered
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      GROUP BY c.id, c.name
      ORDER BY total_meals_ordered DESC
      LIMIT 5
    `);

    res.json({
      data: {
        metrics: {
          avgMealsPerWeek,
          totalCustomers: parseInt(history.total_customers) || 0,
          totalWeeks: parseInt(history.total_weeks) || 0,
          peakWeek: peakWeek.week_start,
          peakWeekMeals: parseInt(peakWeek.total_meals) || 0,
        },
        topRecipes: recipesResult.rows,
        topCustomers: customerResult.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// GET /api/admin/orders/non-responders - Customers with no order yet this
// week, plus their most recent order (for the "start from last time" default
// in the manual-entry UI)
router.get('/non-responders', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const nonResponders = await db.query(`
      SELECT c.id, c.name
      FROM customers c
      WHERE c.sales_pipeline_stage IN ('active', 'engaged', 'trial')
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.customer_id = c.id
            AND date_trunc('week', o.created_at) = date_trunc('week', NOW())
        )
      ORDER BY c.name
    `);

    const results = [];
    for (const customer of nonResponders.rows) {
      const lastOrder = await db.query(`
        SELECT m.name AS menu_name, m.category, o.quantity, o.day_of_week
        FROM orders o
        JOIN menus m ON o.menu_id = m.id
        WHERE o.customer_id = $1
          AND o.created_at = (SELECT MAX(created_at) FROM orders WHERE customer_id = $1)
        ORDER BY m.name
      `, [customer.id]);
      results.push({ ...customer, lastOrder: lastOrder.rows });
    }

    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching non-responders:', error);
    res.status(500).json({ error: 'Failed to fetch non-responders' });
  }
});

// POST /api/admin/orders/import - Bulk import clean Order_Details-shaped rows
// (Client, Category, Meal Name, Qty, Notes). Marks every imported row as
// source='form' since this path is for actual client submissions.
router.post('/import', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    let imported = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const { client, category, mealName, qty, dayOfWeek, notes } = row;
        if (!client || !mealName || !qty) continue;

        const customerId = await findOrCreateCustomer(client);
        const menuId = await findOrCreateMenu(mealName, category);
        if (!customerId || !menuId) continue;

        const quantity = parseFloat(qty);
        const menuPriceResult = await db.query('SELECT price FROM menus WHERE id = $1', [menuId]);
        const price = menuPriceResult.rows[0]?.price;
        const totalPrice = price != null ? price * quantity : null;

        await db.query(
          `INSERT INTO orders (customer_id, menu_id, quantity, day_of_week, total_price, source, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'form', $6, NOW(), NOW())`,
          [customerId, menuId, quantity, dayOfWeek || null, totalPrice, notes || null]
        );
        imported++;
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }

    res.json({ success: true, imported, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('Error importing orders:', error);
    res.status(500).json({ error: 'Failed to import orders' });
  }
});

// POST /api/admin/orders - Create a single manual order line (staff entry
// for a non-responding customer)
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { customerId, customerName, mealName, category, quantity, dayOfWeek, notes } = req.body;

    const resolvedCustomerId = customerId || await findOrCreateCustomer(customerName);
    const menuId = await findOrCreateMenu(mealName, category);

    if (!resolvedCustomerId || !menuId || !quantity) {
      return res.status(400).json({ error: 'customer, meal, and quantity are required' });
    }

    const menuPriceResult = await db.query('SELECT price FROM menus WHERE id = $1', [menuId]);
    const price = menuPriceResult.rows[0]?.price;
    const totalPrice = price != null ? price * quantity : null;

    const result = await db.query(
      `INSERT INTO orders (customer_id, menu_id, quantity, day_of_week, total_price, source, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'manual', $6, NOW(), NOW())
       RETURNING *`,
      [resolvedCustomerId, menuId, quantity, dayOfWeek || null, totalPrice, notes || null]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// PUT /api/admin/orders/:id - Update an order line
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { quantity, dayOfWeek, notes } = req.body;
    const fields = [];
    const values = [];
    let n = 1;

    if (quantity !== undefined) { fields.push(`quantity = $${n++}`); values.push(quantity); }
    if (dayOfWeek !== undefined) { fields.push(`day_of_week = $${n++}`); values.push(dayOfWeek); }
    if (notes !== undefined) { fields.push(`notes = $${n++}`); values.push(notes); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await db.query(
      `UPDATE orders SET ${fields.join(', ')} WHERE id = $${n} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// DELETE /api/admin/orders/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM orders WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, message: 'Order deleted' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

module.exports = router;
