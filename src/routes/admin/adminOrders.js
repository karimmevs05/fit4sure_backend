const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { google } = require('googleapis');
const { CATEGORY_PRICES, findOrCreateMenu, getWeeklyMenu } = require('../../services/orderingService');
const { getRecipeIngredientNeeds } = require('../../utils/recipeCost');

// The Google Sheet behind the weekly order Form. The "Order_Details" tab is
// already cleaned into (Timestamp, Client, Category, Meal Name, Qty, Notes)
// rows by an existing Apps Script -- we read that tab directly rather than
// re-parsing the raw 1000+ column Form Responses sheet.
const ORDERS_SPREADSHEET_ID = '1k8n2nSF1BcQly23muB6Pp9A6rFEefZRTdnn4JDWAVtY';
const ORDERS_SHEET_NAME = 'Order_Details';

// The order form's meal names bake the delivery day into the text itself
// using Unicode Mathematical Bold styling (e.g. "Steak Bowl — 𝐓𝐡𝐮𝐫𝐬𝐝𝐚𝐲
// 𝐃𝐞𝐥𝐢𝐯𝐞𝐫𝐲"), which (a) never matches Menu Planner's plain-text name for
// the same dish -- so every sync created a fresh duplicate menus row instead
// of reusing one -- and (b) meant day_of_week never got parsed onto the
// order at all. Normalize the bold styling back to plain ASCII first, since
// regex/string comparisons don't recognize styled Unicode letters as
// equivalent to their plain counterparts.
function normalizeUnicodeBold(str) {
  return (str || '').replace(/[\u{1D400}-\u{1D433}]/gu, (ch) => {
    const cp = ch.codePointAt(0);
    if (cp <= 0x1D419) return String.fromCharCode(cp - 0x1D400 + 65); // bold A-Z
    return String.fromCharCode(cp - 0x1D41A + 97); // bold a-z
  });
}

// Splits "Dish Name — Monday Delivery" (in any mix of plain/bold Unicode)
// into { cleanName: "Dish Name", dayOfWeek: "monday" }. Falls back to the
// normalized-but-unsplit name with a null day when there's no such suffix.
function extractDayFromMealName(rawName) {
  const normalized = normalizeUnicodeBold(rawName).trim();
  const match = normalized.match(/^(.*?)\s*[-—–]\s*(monday|thursday)\s+delivery\s*$/i);
  if (match) {
    return { cleanName: match[1].trim(), dayOfWeek: match[2].toLowerCase() };
  }
  return { cleanName: normalized, dayOfWeek: null };
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

// Shared row-import logic for both the paste-import endpoint and the
// automatic Google Sheets sync. Deduplicates using the row's original
// timestamp -- since Order_Details keeps every submission ever made, running
// a sync repeatedly must not create duplicate orders for rows already
// imported. Returns 'imported', 'duplicate', or 'skipped' (missing data).
async function importOrderRow({ timestamp, client, category, mealName, qty, dayOfWeek, notes }) {
  if (!client || !mealName || !qty) return { status: 'skipped', reason: 'missing client, mealName, or qty' };

  const { cleanName, dayOfWeek: parsedDay } = extractDayFromMealName(mealName);
  const resolvedDay = dayOfWeek || parsedDay;

  const customerId = await findOrCreateCustomer(client);
  const menuId = await findOrCreateMenu(cleanName, category);
  if (!customerId || !menuId) return { status: 'skipped', reason: 'could not resolve customer or menu' };

  const orderedAt = timestamp ? new Date(timestamp) : new Date();
  if (isNaN(orderedAt.getTime())) return { status: 'skipped', reason: 'invalid timestamp' };

  // Dedup: same customer + same dish + same original submission timestamp
  // means this exact row was already imported before.
  const existing = await db.query(
    `SELECT id FROM orders WHERE customer_id = $1 AND menu_id = $2 AND created_at = $3 LIMIT 1`,
    [customerId, menuId, orderedAt]
  );
  if (existing.rows.length > 0) return { status: 'duplicate' };

  const quantity = parseFloat(qty);
  const menuPriceResult = await db.query('SELECT price FROM menus WHERE id = $1', [menuId]);
  const price = menuPriceResult.rows[0]?.price;
  const totalPrice = price != null ? price * quantity : null;

  await db.query(
    `INSERT INTO orders (customer_id, menu_id, quantity, day_of_week, total_price, source, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'form', $6, $7, NOW())`,
    [customerId, menuId, quantity, resolvedDay || null, totalPrice, notes || null, orderedAt]
  );
  return { status: 'imported' };
}

// GET /api/admin/orders/this-week - Orders placed in the current week
// (Monday-based week, matching the real Monday/Thursday delivery cadence)
router.get('/this-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const ordersResult = await db.query(`
      SELECT o.id, o.customer_id, c.name AS customer_name, c.dietary_restrictions, c.address,
        o.menu_id, m.name AS menu_name, m.category, o.quantity, o.day_of_week, o.total_price,
        o.source, o.notes, o.created_at
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN menus m ON o.menu_id = m.id
      WHERE (date_trunc('week', o.created_at + interval '1 day') - interval '1 day') = (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
      ORDER BY c.name, m.category, m.name
    `);

    const menuTotalsResult = await db.query(`
      SELECT m.id, m.name, m.category, o.day_of_week,
        SUM(CASE WHEN m.category = 'Regular' THEN o.quantity ELSE 0 END) AS regular_count,
        SUM(CASE WHEN m.category = 'Large' THEN o.quantity ELSE 0 END) AS large_count,
        SUM(o.quantity) AS total_count,
        SUM(o.total_price) AS revenue
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE (date_trunc('week', o.created_at + interval '1 day') - interval '1 day') = (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
      GROUP BY m.id, m.name, m.category, o.day_of_week
      ORDER BY m.name
    `);

    // Real prep status per menu item: 'ready'/'blocked' only make sense for
    // items linked to a recipe (menu_plan_recipes) -- everything else is
    // honestly 'unlinked' rather than a fabricated "pending" guess. Reuses
    // the same recipe-linkage + ingredient-need-vs-stock logic as adminPrep.js.
    const menuIds = menuTotalsResult.rows.map((r) => r.id);
    const linkedResult = menuIds.length > 0
      ? await db.query(`SELECT DISTINCT menu_id FROM menu_plan_recipes WHERE menu_id = ANY($1::int[])`, [menuIds])
      : { rows: [] };
    const linkedMenuIds = new Set(linkedResult.rows.map((r) => r.menu_id));

    const ingredientTotals = {}; // inventory_id -> gramsNeeded (across all linked items this week)
    const itemStatus = {}; // menu_id -> 'ready' | 'blocked' | 'unlinked'
    const shortByIngredient = {}; // inventory_id -> { name, shortG, affected: Set<string> }

    // Margin numerator/denominator, but ONLY for items where every needed
    // ingredient has a real unit_price_cents -- a recipe-linked item with
    // even one unpriced ingredient (common: most inventory rows have no
    // price yet) would otherwise silently count as near-zero cost and
    // blow the margin number up to something like 97%. Partial pricing
    // data must not produce a number that reads as complete.
    let linkedRevenueCents = 0;
    let linkedCostCents = 0;

    for (const row of menuTotalsResult.rows) {
      if (!linkedMenuIds.has(row.id)) {
        itemStatus[row.id] = 'unlinked';
        continue;
      }
      const qty = parseFloat(row.total_count) || 0;
      const links = await db.query(`SELECT recipe_id, servings FROM menu_plan_recipes WHERE menu_id = $1`, [row.id]);
      const rowNeeds = [];
      for (const link of links.rows) {
        const needs = await getRecipeIngredientNeeds(link.recipe_id, parseFloat(link.servings));
        for (const ing of needs) {
          const gramsNeeded = ing.gramsNeeded * qty;
          rowNeeds.push({ inventoryId: ing.inventoryId, name: ing.name, gramsNeeded });
          if (!ingredientTotals[ing.inventoryId]) ingredientTotals[ing.inventoryId] = { name: ing.name, gramsNeeded: 0 };
          ingredientTotals[ing.inventoryId].gramsNeeded += gramsNeeded;
        }
      }

      const invIds = rowNeeds.map((n) => n.inventoryId);
      const stockResult = invIds.length > 0
        ? await db.query(`SELECT id, current_stock_g, unit_price_cents FROM inventory WHERE id = ANY($1::int[])`, [invIds])
        : { rows: [] };
      const stockById = {};
      const priceById = {};
      for (const r of stockResult.rows) {
        stockById[r.id] = parseFloat(r.current_stock_g) || 0;
        priceById[r.id] = r.unit_price_cents;
      }

      let blocked = false;
      let rowCostCents = 0;
      let fullyPriced = rowNeeds.length > 0;
      for (const n of rowNeeds) {
        if (n.gramsNeeded > (stockById[n.inventoryId] || 0)) {
          blocked = true;
          if (!shortByIngredient[n.inventoryId]) shortByIngredient[n.inventoryId] = { name: n.name, shortG: 0, affected: new Set() };
          shortByIngredient[n.inventoryId].affected.add(`${row.day_of_week || 'unscheduled'} — ${row.name}`);
        }
        const priceCents = priceById[n.inventoryId];
        if (priceCents == null) {
          fullyPriced = false;
        } else {
          rowCostCents += Math.round((priceCents / 453.592) * n.gramsNeeded);
        }
      }
      itemStatus[row.id] = blocked ? 'blocked' : 'ready';

      if (fullyPriced) {
        linkedRevenueCents += Math.round((parseFloat(row.revenue) || 0) * 100);
        linkedCostCents += rowCostCents;
      }
    }

    // Compute real shortfall (needed vs total current stock) for the alert banner
    const neededInvIds = Object.keys(shortByIngredient);
    if (neededInvIds.length > 0) {
      const stockResult = await db.query(`SELECT id, current_stock_g, category FROM inventory WHERE id = ANY($1::int[])`, [neededInvIds]);
      for (const r of stockResult.rows) {
        if (shortByIngredient[r.id]) {
          shortByIngredient[r.id].shortG = Math.max(0, (ingredientTotals[r.id]?.gramsNeeded || 0) - (parseFloat(r.current_stock_g) || 0));
          shortByIngredient[r.id].category = r.category;
        }
      }
    }
    // short_g (raw grams) instead of a pre-converted decimal lb -- the
    // frontend formats protein-category shortfalls as lb:oz, everything
    // else in grams, and shouldn't have to guess back from a rounded decimal.
    const alerts = Object.values(shortByIngredient)
      .filter((s) => s.shortG > 0)
      .map((s) => ({
        ingredient: s.name,
        category: s.category || null,
        short_g: Math.round(s.shortG),
        affected: Array.from(s.affected),
      }))
      .sort((a, b) => b.short_g - a.short_g);

    // Null (not 0%) when there's no fully-priced linked revenue yet -- an
    // absent number is honest, a fabricated 0% or 97% is not.
    const knownMarginPct = linkedRevenueCents > 0 ? +(((linkedRevenueCents - linkedCostCents) / linkedRevenueCents) * 100).toFixed(1) : null;

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
      WHERE (date_trunc('week', o.created_at + interval '1 day') - interval '1 day') = (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
    `);

    // Same two numbers for last week, purely so the header can show a real
    // week-over-week delta instead of a made-up trend arrow.
    const lastWeekResult = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN o.day_of_week ILIKE 'monday' THEN o.quantity ELSE 0 END), 0) AS monday_meals,
        COALESCE(SUM(CASE WHEN o.day_of_week ILIKE 'thursday' THEN o.quantity ELSE 0 END), 0) AS thursday_meals
      FROM orders o
      WHERE (date_trunc('week', o.created_at + interval '1 day') - interval '1 day') = (date_trunc('week', NOW() + interval '1 day') - interval '1 day' - interval '7 days')
    `);

    // Just id/name -- the Needs Follow-Up card only shows the customer name
    // and an "Add New Order" button that opens a blank order form, so their
    // previous order (still available from Order History if needed) isn't
    // worth an extra per-customer query here.
    const nonRespondersResult = await db.query(`
      SELECT c.id, c.name
      FROM customers c
      WHERE c.sales_pipeline_stage IN ('active', 'engaged', 'trial')
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.customer_id = c.id
            AND (date_trunc('week', o.created_at + interval '1 day') - interval '1 day') = (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
        )
      ORDER BY c.name
    `);
    const nonResponders = nonRespondersResult.rows;

    res.json({
      data: {
        orders: ordersResult.rows,
        menuTotals: menuTotalsResult.rows.map((row) => ({ ...row, status: itemStatus[row.id] })),
        summary: {
          ...summaryResult.rows[0],
          monday_meals_last_week: parseInt(lastWeekResult.rows[0].monday_meals, 10) || 0,
          thursday_meals_last_week: parseInt(lastWeekResult.rows[0].thursday_meals, 10) || 0,
          known_margin_pct: knownMarginPct,
        },
        alerts,
        nonResponders,
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
        (date_trunc('week', o.created_at + interval '1 day') - interval '1 day') AS week_start,
        COUNT(DISTINCT o.customer_id) AS total_customers,
        SUM(o.quantity) AS total_meals,
        ROUND(AVG(o.quantity)::numeric, 1) AS avg_order_size
      FROM orders o
      GROUP BY (date_trunc('week', o.created_at + interval '1 day') - interval '1 day')
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
        COUNT(DISTINCT (date_trunc('week', created_at + interval '1 day') - interval '1 day')) AS total_weeks,
        COUNT(DISTINCT customer_id) AS total_customers
      FROM orders
    `);
    const history = historyResult.rows[0];
    const avgMealsPerWeek = history.total_weeks > 0
      ? Math.round(history.total_meals / history.total_weeks)
      : 0;

    const peakResult = await db.query(`
      SELECT (date_trunc('week', created_at + interval '1 day') - interval '1 day') AS week_start, SUM(quantity) AS total_meals
      FROM orders
      GROUP BY (date_trunc('week', created_at + interval '1 day') - interval '1 day')
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
        COUNT(DISTINCT (date_trunc('week', o.created_at + interval '1 day') - interval '1 day')) AS weeks_active,
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
            AND (date_trunc('week', o.created_at + interval '1 day') - interval '1 day') = (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
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

// GET /api/admin/orders/weekly-menu - The real menu clients are ordering
// from THIS delivery week, shaped for the "Add Order" picker grid: every
// recipe the chef marked live per block in the Weekly Recipe Plan, each
// offered in all 5 standing formats (Regular/Large/High Protein/Low
// Carb/1 Pound) priced from CATEGORY_PRICES -- plus standing Breakfast
// items that have actually been ordered before (keeps stale/test menu
// entries with no real order history out of the Breakfast list).
//
// Sourced from `weekly_recipe_plan`, not the old plate-builder `menus`
// table -- same planned_week_start formula Menu Planner itself uses, so
// this always reflects whatever the chef most recently marked live there.
router.get('/weekly-menu', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    res.json({ data: await getWeeklyMenu() });
  } catch (error) {
    console.error('Error fetching weekly menu:', error);
    res.status(500).json({ error: 'Failed to fetch weekly menu' });
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

    let imported = 0, duplicates = 0, skipped = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const result = await importOrderRow(row);
        if (result.status === 'imported') imported++;
        else if (result.status === 'duplicate') duplicates++;
        else skipped++;
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }

    res.json({ success: true, imported, duplicates, skipped, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('Error importing orders:', error);
    res.status(500).json({ error: 'Failed to import orders' });
  }
});

// POST /api/admin/orders/sync-google-sheets - Automatically pull new rows
// from the Order_Details tab of the order Form's spreadsheet. Safe to run
// repeatedly -- already-imported rows are skipped via the same
// timestamp-based dedup as manual import.
router.post('/sync-google-sheets', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS)
      : null;

    if (!credentials) {
      return res.status(500).json({ error: 'GOOGLE_SHEETS_CREDENTIALS not configured' });
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: ORDERS_SPREADSHEET_ID,
      range: `'${ORDERS_SHEET_NAME}'!A:F`,
    });

    const values = response.data.values || [];
    if (values.length < 2) {
      return res.json({ success: true, imported: 0, duplicates: 0, skipped: 0, message: 'No order rows found in sheet' });
    }

    let imported = 0, duplicates = 0, skipped = 0;
    const errors = [];

    // Row 0 is the header (Timestamp, Client, Category, Meal Name, Qty, Notes)
    for (let i = 1; i < values.length; i++) {
      const [timestamp, client, category, mealName, qty, notes] = values[i];
      try {
        const result = await importOrderRow({ timestamp, client, category, mealName, qty, notes });
        if (result.status === 'imported') imported++;
        else if (result.status === 'duplicate') duplicates++;
        else skipped++;
      } catch (err) {
        errors.push({ row: values[i], error: err.message });
      }
    }

    res.json({
      success: true,
      imported,
      duplicates,
      skipped,
      totalRows: values.length - 1,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error syncing Google Sheets:', error);
    res.status(500).json({ error: error.message || 'Failed to sync Google Sheets' });
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
