const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const GoogleSheetsSyncService = require('../../services/googleSheetsSync');

// GET /api/admin/orders/this-week - Get current week's menu and orders
router.get('/this-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Get the most recent menu
    const menuResult = await db.query(
      `SELECT id, week_label FROM menus ORDER BY created_at DESC LIMIT 1`
    );

    if (menuResult.rows.length === 0) {
      return res.json({ data: { menu: [], orders: [], customers: [] } });
    }

    const menuId = menuResult.rows[0].id;
    const weekLabel = menuResult.rows[0].week_label;

    // Get recipes for this week
    const recipesResult = await db.query(
      `SELECT id, recipe_name, day_of_week FROM menu_recipes WHERE menu_id = $1 ORDER BY day_of_week`,
      [menuId]
    );

    // Get all customers for this week with their names
    const customersResult = await db.query(
      `SELECT DISTINCT c.id, c.name
       FROM order_totals ot
       JOIN customers c ON ot.customer_id = c.id
       WHERE ot.menu_id = $1`,
      [menuId]
    );

    // Count regular vs large
    let largeCount = 0;
    let regularCount = 0;
    customersResult.rows.forEach(c => {
      if (c.name.includes('LARGE')) {
        largeCount++;
      } else {
        regularCount++;
      }
    });

    // Add counts to each recipe
    const recipesWithCounts = recipesResult.rows.map(r => ({
      ...r,
      large_count: largeCount,
      regular_count: regularCount,
    }));

    // Get orders for this week
    const ordersResult = await db.query(
      `SELECT
        ot.customer_id,
        c.name,
        c.notes as dietary_restrictions,
        ot.total_meals_monday,
        ot.total_meals_thursday,
        ot.breakfast_meals,
        ot.total_meals
       FROM order_totals ot
       JOIN customers c ON ot.customer_id = c.id
       WHERE ot.menu_id = $1
       ORDER BY c.name`,
      [menuId]
    );

    // Calculate totals
    const totalMeals = ordersResult.rows.reduce((sum, order) => sum + order.total_meals, 0);
    const mondayMeals = ordersResult.rows.reduce((sum, order) => sum + order.total_meals_monday, 0);
    const thursdayMeals = ordersResult.rows.reduce((sum, order) => sum + order.total_meals_thursday, 0);
    const breakfastMeals = ordersResult.rows.reduce((sum, order) => sum + (order.breakfast_meals || 0), 0);

    res.json({
      data: {
        week: weekLabel,
        menu: recipesWithCounts,
        orders: ordersResult.rows,
        customers: customersResult.rows,
        summary: {
          totalMeals,
          mondayMeals,
          thursdayMeals,
          breakfastMeals,
          totalCustomers: customersResult.rows.length,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching this week orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/admin/orders/history - Get all weeks' orders
router.get('/history', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        m.id,
        m.week_label,
        COUNT(DISTINCT c.id) as total_customers,
        SUM(ot.total_meals) as total_meals,
        ROUND(AVG(ot.total_meals)::numeric, 1) as avg_order_size
       FROM menus m
       LEFT JOIN order_totals ot ON m.id = ot.menu_id
       LEFT JOIN customers c ON ot.customer_id = c.id
       GROUP BY m.id, m.week_label
       ORDER BY m.created_at DESC`,
    );

    res.json({
      data: result.rows.map((row) => ({
        week: row.week_label,
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

// GET /api/admin/orders/insights - Get analytics and insights
router.get('/insights', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Get historical data
    const historyResult = await db.query(
      `SELECT
        SUM(ot.total_meals) as total_meals,
        COUNT(DISTINCT ot.menu_id) as total_weeks,
        COUNT(DISTINCT ot.customer_id) as total_customers
       FROM order_totals ot`,
    );

    const history = historyResult.rows[0];
    const avgMealsPerWeek = history.total_weeks > 0 ? Math.round(history.total_meals / history.total_weeks) : 0;

    // Get peak week
    const peakResult = await db.query(
      `SELECT
        m.week_label,
        SUM(ot.total_meals) as total_meals
       FROM menus m
       JOIN order_totals ot ON m.id = ot.menu_id
       GROUP BY m.id, m.week_label
       ORDER BY total_meals DESC
       LIMIT 1`,
    );

    const peakWeek = peakResult.rows[0] || { week_label: 'N/A', total_meals: 0 };

    // Get most popular recipes (by frequency in orders)
    const recipesResult = await db.query(
      `SELECT
        recipe_name,
        COUNT(*) as order_count
       FROM menu_recipes
       GROUP BY recipe_name
       ORDER BY order_count DESC
       LIMIT 5`,
    );

    // Get customer breakdown
    const customerResult = await db.query(
      `SELECT
        c.id,
        c.name,
        COUNT(DISTINCT ot.menu_id) as weeks_active,
        SUM(ot.total_meals) as total_meals_ordered
       FROM customers c
       JOIN order_totals ot ON c.id = ot.customer_id
       GROUP BY c.id, c.name
       ORDER BY total_meals_ordered DESC`,
    );

    res.json({
      data: {
        metrics: {
          avgMealsPerWeek,
          totalCustomers: parseInt(history.total_customers) || 0,
          totalWeeks: parseInt(history.total_weeks) || 0,
          peakWeek: peakWeek.week_label,
          peakWeekMeals: parseInt(peakWeek.total_meals) || 0,
        },
        topRecipes: recipesResult.rows,
        topCustomers: customerResult.rows.slice(0, 5),
      },
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// POST /api/admin/orders/sync-google-sheets - Sync orders from Google Sheets
router.post('/sync-google-sheets', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { spreadsheetId, weekLabel, sheetName = 'Form Responses 1' } = req.body;

    if (!spreadsheetId || !weekLabel) {
      return res.status(400).json({ error: 'spreadsheetId and weekLabel required' });
    }

    // Load Google credentials from environment
    const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS)
      : null;

    if (!credentials) {
      return res.status(500).json({ error: 'Google Sheets credentials not configured' });
    }

    const syncService = new GoogleSheetsSyncService(credentials);
    const result = await syncService.syncWeek(spreadsheetId, weekLabel, sheetName);

    res.json({ data: result });
  } catch (error) {
    console.error('Error syncing Google Sheets:', error);
    res.status(500).json({ error: 'Failed to sync Google Sheets' });
  }
});

// POST /api/admin/orders/import-google-form - Import orders from Google Form responses
router.post('/import-google-form', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { formResponses, weekLabel } = req.body;

    if (!formResponses || !weekLabel) {
      return res.status(400).json({ error: 'formResponses and weekLabel required' });
    }

    // Find or create menu for this week
    let menuResult = await db.query(
      `SELECT id FROM menus WHERE week_label = $1`,
      [weekLabel]
    );

    let menuId;
    if (menuResult.rows.length === 0) {
      const createMenuResult = await db.query(
        `INSERT INTO menus (week_label, created_at) VALUES ($1, NOW()) RETURNING id`,
        [weekLabel]
      );
      menuId = createMenuResult.rows[0].id;
    } else {
      menuId = menuResult.rows[0].id;
      // Delete existing orders for this week to avoid duplicates
      await db.query(
        `DELETE FROM order_totals WHERE menu_id = $1`,
        [menuId]
      );
    }

    // Parse each form response
    let importedCount = 0;
    const errors = [];

    for (const response of formResponses) {
      try {
        const { customerName, regularMeals = 0, largeMeals = 0, breakfastMeals = 0, byTheLbItems = 0, notes } = response;

        if (!customerName) continue;

        // Find or create customer
        let customerResult = await db.query(
          `SELECT id FROM customers WHERE LOWER(name) = LOWER($1)`,
          [customerName]
        );

        let customerId;
        if (customerResult.rows.length === 0) {
          const createCustomerResult = await db.query(
            `INSERT INTO customers (name, notes, created_at) VALUES ($1, $2, NOW()) RETURNING id`,
            [customerName, notes || '']
          );
          customerId = createCustomerResult.rows[0].id;
        } else {
          customerId = customerResult.rows[0].id;
        }

        const totalMeals = parseInt(regularMeals) + parseInt(largeMeals) + parseInt(breakfastMeals) + parseInt(byTheLbItems);

        if (totalMeals > 0) {
          // Create order
          await db.query(
            `INSERT INTO order_totals (
              menu_id, customer_id, total_meals_monday, total_meals_thursday,
              breakfast_meals, total_meals, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              menuId,
              customerId,
              Math.ceil(totalMeals / 2), // Approximate split
              Math.floor(totalMeals / 2),
              parseInt(breakfastMeals),
              totalMeals,
            ]
          );

          importedCount++;
        }
      } catch (error) {
        errors.push({ customer: response.customerName, error: error.message });
      }
    }

    res.json({
      success: true,
      imported: importedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Imported ${importedCount} customer orders for ${weekLabel}`,
    });
  } catch (error) {
    console.error('Error importing Google Form responses:', error);
    res.status(500).json({ error: 'Failed to import orders' });
  }
});

// GET /api/admin/orders/:week - Get specific week's orders
router.get('/:week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { week } = req.params;

    const menuResult = await db.query(
      `SELECT id FROM menus WHERE week_label = $1`,
      [week]
    );

    if (menuResult.rows.length === 0) {
      return res.status(404).json({ error: 'Week not found' });
    }

    const menuId = menuResult.rows[0].id;

    const ordersResult = await db.query(
      `SELECT
        ot.customer_id,
        c.name,
        c.notes,
        ot.total_meals_monday,
        ot.total_meals_thursday,
        ot.total_meals
       FROM order_totals ot
       JOIN customers c ON ot.customer_id = c.id
       WHERE ot.menu_id = $1
       ORDER BY c.name`,
      [menuId]
    );

    res.json({
      data: {
        week,
        orders: ordersResult.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching week orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

module.exports = router;
