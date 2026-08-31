const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { getRecipeIngredientNeeds } = require('../../utils/recipeCost');

// ============================================================================
// WEEKLY PREP -- reads from the same live tables Orders already uses
// (`orders`, `menus`), not the old disconnected `menu_recipes`/`order_totals`/
// `menus.week_label`, which had no real data under the current schema.
//
// Recipe linkage reuses the existing `menu_plan_recipes` table (menu_id ->
// recipe_id, servings) rather than adding a new column -- real orders this
// week already match several `menus` rows created by the Menu Planner Plate
// Builder (via name+category lookup in findOrCreateMenu), and those rows
// already have real menu_plan_recipes links. Adding a second, weaker
// one-recipe-per-menu column would fragment data that's already linked
// correctly (a plate can have more than one recipe, e.g. protein + side).
// Items with no menu_plan_recipes row are honestly reported as unlinked
// (recipe_linked: false) rather than falling back to a full inventory dump.
//
// Every week boundary below is the same Sunday-anchored formula used
// everywhere else in the app (adminOrders.js, adminMenuPlanner.js), so
// Weekly Prep and the Orders "This Week" tab always agree.
// ============================================================================

const WEEK_BOUNDARY = `(date_trunc('week', o.created_at + interval '1 day') - interval '1 day')::date`;

function isValidWeek(week) {
  return /^\d{4}-\d{2}-\d{2}$/.test(week);
}

// GET /api/admin/prep/weeks/list - real weeks that actually have orders
router.get('/weeks/list', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT (date_trunc('week', created_at + interval '1 day') - interval '1 day')::date AS week_start
      FROM orders
      ORDER BY week_start DESC
      LIMIT 20
    `);
    res.json({ data: result.rows.map((row) => ({ week: row.week_start.toISOString().slice(0, 10) })) });
  } catch (error) {
    console.error('Error fetching weeks:', error);
    res.status(500).json({ error: 'Failed to fetch weeks' });
  }
});

// GET /api/admin/prep/this-week/summary - compact performance summary for the
// task dashboard: meals, revenue, COGS, margin, profit, prep time invested.
// Defined before /:week so Express doesn't swallow "this-week" as a :week
// param. Reuses the exact same recipe-linkage/ingredient-cost logic as
// /:week (menu_plan_recipes -> recipe_ingredients -> inventory) so COGS here
// always agrees with Weekly Prep's own total_cost_cents for the same week --
// revenue is orders.total_price (stored in dollars, unlike every cost field
// here which is cents) converted to cents once, up front, so profit/margin
// never mixes units.
router.get('/this-week/summary', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const weekResult = await db.query(`SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day')::date AS week_start`);
    const week = weekResult.rows[0].week_start.toISOString().slice(0, 10);

    const summaryResult = await db.query(
      `SELECT COALESCE(SUM(o.quantity), 0) AS total_meals, COALESCE(SUM(o.total_price), 0) AS total_revenue_dollars
       FROM orders o
       WHERE ${WEEK_BOUNDARY} = $1::date`,
      [week]
    );
    const totalMeals = parseFloat(summaryResult.rows[0].total_meals) || 0;
    const totalRevenueCents = Math.round((parseFloat(summaryResult.rows[0].total_revenue_dollars) || 0) * 100);

    const menuTotalsResult = await db.query(
      `SELECT m.id AS menu_id, o.quantity
       FROM orders o
       JOIN menus m ON o.menu_id = m.id
       WHERE ${WEEK_BOUNDARY} = $1::date`,
      [week]
    );

    const menuIds = [...new Set(menuTotalsResult.rows.map((r) => r.menu_id))];
    const linkedResult = menuIds.length > 0
      ? await db.query(`SELECT menu_id, recipe_id, servings FROM menu_plan_recipes WHERE menu_id = ANY($1::int[])`, [menuIds])
      : { rows: [] };
    const linksByMenu = {};
    for (const l of linkedResult.rows) {
      if (!linksByMenu[l.menu_id]) linksByMenu[l.menu_id] = [];
      linksByMenu[l.menu_id].push(l);
    }

    const recipeIds = [...new Set(linkedResult.rows.map((l) => l.recipe_id))];
    const recipesResult = recipeIds.length > 0
      ? await db.query(`SELECT recipe_id, prep_time_minutes FROM recipes WHERE recipe_id = ANY($1::int[])`, [recipeIds])
      : { rows: [] };
    const prepTimeByRecipe = {};
    for (const r of recipesResult.rows) prepTimeByRecipe[r.recipe_id] = parseFloat(r.prep_time_minutes) || 0;

    let totalCogsCents = 0;
    let prepTimeMinutes = 0;
    for (const row of menuTotalsResult.rows) {
      const qty = parseFloat(row.quantity) || 0;
      const links = linksByMenu[row.menu_id] || [];
      for (const link of links) {
        const servings = parseFloat(link.servings) || 0;
        const needs = await getRecipeIngredientNeeds(link.recipe_id, servings);
        for (const ing of needs) {
          if (ing.unitPriceCents == null) continue;
          totalCogsCents += Math.round((ing.unitPriceCents / 453.592) * ing.gramsNeeded * qty);
        }
        prepTimeMinutes += (prepTimeByRecipe[link.recipe_id] || 0) * qty;
      }
    }

    const profitCents = totalRevenueCents - totalCogsCents;
    const marginPct = totalRevenueCents > 0 ? Math.round((profitCents / totalRevenueCents) * 1000) / 10 : 0;

    res.json({
      data: {
        weekStart: week,
        totalMeals: Math.round(totalMeals),
        totalRevenueCents,
        totalCogsCents,
        profitCents,
        marginPct,
        prepTimeMinutes: Math.round(prepTimeMinutes),
      },
    });
  } catch (error) {
    console.error('Error computing this-week summary:', error);
    res.status(500).json({ error: 'Failed to compute this-week summary' });
  }
});

// GET /api/admin/prep/:week - real prep data for one week (week = ISO date, the week's Sunday)
router.get('/:week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { week } = req.params;
    if (!isValidWeek(week)) {
      return res.status(400).json({ error: 'week must be an ISO date (YYYY-MM-DD)' });
    }

    // Per-menu-item totals this week, dynamic by whatever category actually
    // appears (Regular, Large, Breakfast, By The LB, anything staff typed) --
    // mirrors adminOrders.js's /this-week menuTotals query.
    const menuTotalsResult = await db.query(
      `SELECT m.id AS menu_id, m.name, m.category, o.day_of_week, SUM(o.quantity) AS quantity
       FROM orders o
       JOIN menus m ON o.menu_id = m.id
       WHERE ${WEEK_BOUNDARY} = $1::date
       GROUP BY m.id, m.name, m.category, o.day_of_week
       ORDER BY m.name, m.category`,
      [week]
    );

    const menuIds = [...new Set(menuTotalsResult.rows.map((r) => r.menu_id))];
    const linkedResult = menuIds.length > 0
      ? await db.query(`SELECT DISTINCT menu_id FROM menu_plan_recipes WHERE menu_id = ANY($1::int[])`, [menuIds])
      : { rows: [] };
    const linkedMenuIds = new Set(linkedResult.rows.map((r) => r.menu_id));

    // Real aggregate ingredient need this week, summed across every linked
    // menu item's recipe(s) -- exactly what adminProductionPlan.js already
    // does for the Plate Builder, applied here to what's actually ordered.
    const ingredientTotals = {}; // inventory_id -> { name, unitPriceCents, gramsNeeded }
    for (const row of menuTotalsResult.rows) {
      if (!linkedMenuIds.has(row.menu_id)) continue;
      const qty = parseFloat(row.quantity) || 0;
      const links = await db.query(`SELECT recipe_id, servings FROM menu_plan_recipes WHERE menu_id = $1`, [row.menu_id]);
      for (const link of links.rows) {
        const needs = await getRecipeIngredientNeeds(link.recipe_id, parseFloat(link.servings));
        for (const ing of needs) {
          if (!ingredientTotals[ing.inventoryId]) {
            ingredientTotals[ing.inventoryId] = { name: ing.name, unitPriceCents: ing.unitPriceCents, gramsNeeded: 0 };
          }
          ingredientTotals[ing.inventoryId].gramsNeeded += ing.gramsNeeded * qty;
        }
      }
    }

    const invIds = Object.keys(ingredientTotals);
    const stockResult = invIds.length > 0
      ? await db.query(`SELECT id, category, current_stock_g FROM inventory WHERE id = ANY($1::int[])`, [invIds])
      : { rows: [] };
    const stockById = {};
    for (const r of stockResult.rows) stockById[r.id] = r;

    let totalCostCents = 0;
    const ingredients = Object.entries(ingredientTotals).map(([invId, ing]) => {
      const neededG = Math.round(ing.gramsNeeded);
      const costCents = ing.unitPriceCents != null ? Math.round((ing.unitPriceCents / 453.592) * ing.gramsNeeded) : 0;
      totalCostCents += costCents;
      return {
        name: ing.name,
        category: stockById[invId]?.category || null,
        needed_g: neededG,
        available_g: parseFloat(stockById[invId]?.current_stock_g) || 0,
        unit_price_cents: ing.unitPriceCents || 0,
        cost_cents: costCents,
      };
    }).sort((a, b) => b.needed_g - a.needed_g);

    // Same summary numbers as Orders "This Week" -- same query, same boundary.
    const summaryResult = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN o.day_of_week ILIKE 'monday' THEN o.quantity ELSE 0 END), 0) AS monday_meals,
         COALESCE(SUM(CASE WHEN o.day_of_week ILIKE 'thursday' THEN o.quantity ELSE 0 END), 0) AS thursday_meals,
         COALESCE(SUM(CASE WHEN m.category = 'Breakfast' THEN o.quantity ELSE 0 END), 0) AS breakfast_meals,
         COALESCE(SUM(o.quantity), 0) AS total_meals
       FROM orders o
       LEFT JOIN menus m ON o.menu_id = m.id
       WHERE ${WEEK_BOUNDARY} = $1::date`,
      [week]
    );
    const summary = summaryResult.rows[0];

    // Real days actually present this week, not hardcoded to Monday/Thursday.
    const prepDays = [...new Set(menuTotalsResult.rows.map((r) => r.day_of_week).filter(Boolean))]
      .map((d) => d.charAt(0).toUpperCase() + d.slice(1));

    // One row per customer, Monday/Thursday/Breakfast split -- replaces the
    // old order_totals join with the same live boundary as everything else.
    const ordersResult = await db.query(
      `SELECT c.id, c.name,
         STRING_AGG(DISTINCT o.notes, '; ') FILTER (WHERE o.notes IS NOT NULL AND o.notes != '') AS notes,
         COALESCE(SUM(CASE WHEN o.day_of_week ILIKE 'monday' THEN o.quantity ELSE 0 END), 0) AS total_meals_monday,
         COALESCE(SUM(CASE WHEN o.day_of_week ILIKE 'thursday' THEN o.quantity ELSE 0 END), 0) AS total_meals_thursday,
         COALESCE(SUM(CASE WHEN m.category = 'Breakfast' THEN o.quantity ELSE 0 END), 0) AS breakfast_meals,
         COALESCE(SUM(o.quantity), 0) AS total_meals
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       LEFT JOIN menus m ON o.menu_id = m.id
       WHERE ${WEEK_BOUNDARY} = $1::date
       GROUP BY c.id, c.name
       ORDER BY c.name`,
      [week]
    );

    res.json({
      data: {
        week,
        recipes: menuTotalsResult.rows.map((row) => ({
          menu_id: row.menu_id,
          name: row.name,
          category: row.category,
          day_of_week: row.day_of_week,
          quantity: parseFloat(row.quantity) || 0,
          recipe_linked: linkedMenuIds.has(row.menu_id),
        })),
        ingredients,
        summary: {
          total_cost_cents: totalCostCents,
          total_servings: parseInt(summary.total_meals, 10) || 0,
          total_ingredients: ingredients.length,
          prep_days: prepDays,
          monday_meals: parseInt(summary.monday_meals, 10) || 0,
          thursday_meals: parseInt(summary.thursday_meals, 10) || 0,
          breakfast_meals: parseInt(summary.breakfast_meals, 10) || 0,
        },
        orders: ordersResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          notes: row.notes,
          total_meals_monday: parseInt(row.total_meals_monday, 10) || 0,
          total_meals_thursday: parseInt(row.total_meals_thursday, 10) || 0,
          breakfast_meals: parseInt(row.breakfast_meals, 10) || 0,
          total_meals: parseInt(row.total_meals, 10) || 0,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching prep data:', error);
    res.status(500).json({ error: 'Failed to fetch prep data', details: error.message });
  }
});

// GET /api/admin/prep/:week/:menuId - real detail for one specific menu item
// (one specific format/category row, e.g. "Chicken Shawarma... / Regular")
router.get('/:week/:menuId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { week, menuId } = req.params;
    if (!isValidWeek(week)) {
      return res.status(400).json({ error: 'week must be an ISO date (YYYY-MM-DD)' });
    }

    const menuResult = await db.query(`SELECT id, name, category FROM menus WHERE id = $1`, [menuId]);
    if (menuResult.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const menu = menuResult.rows[0];

    // Real customers who ordered this specific item this week, straight from
    // orders + customers -- no string-matching a "LARGE" naming convention.
    const ordersResult = await db.query(
      `SELECT o.id, o.quantity, o.notes, o.day_of_week, c.id AS customer_id, c.name AS customer_name
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.menu_id = $1 AND ${WEEK_BOUNDARY} = $2::date
       ORDER BY c.name`,
      [menuId, week]
    );

    const totalQty = ordersResult.rows.reduce((sum, o) => sum + (parseFloat(o.quantity) || 0), 0);
    const day = ordersResult.rows[0]?.day_of_week || null;

    const recipeLinksResult = await db.query(
      `SELECT mpr.recipe_id, mpr.servings, r.name AS recipe_name
       FROM menu_plan_recipes mpr JOIN recipes r ON r.recipe_id = mpr.recipe_id
       WHERE mpr.menu_id = $1`,
      [menuId]
    );
    const recipeLinked = recipeLinksResult.rows.length > 0;

    let ingredients = [];
    let totalCogsCents = 0;

    if (recipeLinked) {
      const ingTotals = {};
      for (const link of recipeLinksResult.rows) {
        const needs = await getRecipeIngredientNeeds(link.recipe_id, parseFloat(link.servings));
        for (const ing of needs) {
          if (!ingTotals[ing.inventoryId]) {
            ingTotals[ing.inventoryId] = { name: ing.name, unitPriceCents: ing.unitPriceCents, gramsNeeded: 0 };
          }
          ingTotals[ing.inventoryId].gramsNeeded += ing.gramsNeeded * totalQty;
        }
      }

      const invIds = Object.keys(ingTotals);
      const stockResult = invIds.length > 0
        ? await db.query(`SELECT id, category, current_stock_g FROM inventory WHERE id = ANY($1::int[])`, [invIds])
        : { rows: [] };
      const stockById = {};
      for (const r of stockResult.rows) stockById[r.id] = r;

      ingredients = Object.entries(ingTotals).map(([invId, ing]) => {
        const costCents = ing.unitPriceCents != null ? Math.round((ing.unitPriceCents / 453.592) * ing.gramsNeeded) : 0;
        totalCogsCents += costCents;
        return {
          name: ing.name,
          category: stockById[invId]?.category || null,
          quantity_g: Math.round(ing.gramsNeeded),
          unit_price_cents: ing.unitPriceCents || 0,
          cost_cents: costCents,
          available_g: parseFloat(stockById[invId]?.current_stock_g) || 0,
        };
      }).sort((a, b) => b.quantity_g - a.quantity_g);
    }

    const cogsPerPortion = totalQty > 0 ? Math.round(totalCogsCents / totalQty) : 0;

    res.json({
      data: {
        recipe: { id: menu.id, name: menu.name, category: menu.category, day },
        recipe_linked: recipeLinked,
        customers: ordersResult.rows.map((row) => ({
          id: row.customer_id,
          name: row.customer_name,
          notes: row.notes,
          quantity: parseFloat(row.quantity) || 0,
        })),
        ingredients,
        summary: {
          total_portions: totalQty,
          total_recipe_cost_cents: totalCogsCents,
          cogs_per_portion_cents: cogsPerPortion,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching menu item details:', error);
    res.status(500).json({ error: 'Failed to fetch menu item details', details: error.message });
  }
});

module.exports = router;
