const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

const CATEGORY_PRICES = { Regular: 13.79, Large: 16.79 };

// Next week's Sunday (the week we're planning for), Monday, and Thursday
async function getNextWeekDates() {
  const result = await db.query(`
    SELECT
      (date_trunc('week', NOW() + interval '1 day') - interval '1 day' + interval '7 days')::date AS sunday
  `);
  const sunday = result.rows[0].sunday;
  const sundayDate = new Date(sunday);
  const monday = new Date(sundayDate); monday.setDate(sundayDate.getDate() + 1);
  const thursday = new Date(sundayDate); thursday.setDate(sundayDate.getDate() + 4);
  return { sunday: sundayDate, monday, thursday };
}

// Live-computed macros + cost for one recipe at a given number of servings.
// Mirrors the exact per-serving calculation used in adminRecipes.js, scaled
// by the servings quantity entered when building the plate.
async function getRecipeMacrosAtServings(recipeId, servings) {
  const recipeResult = await db.query('SELECT recipe_id, name, servings AS base_servings FROM recipes WHERE recipe_id = $1', [recipeId]);
  if (recipeResult.rows.length === 0) return null;
  const recipe = recipeResult.rows[0];

  const ingredientsResult = await db.query(
    `SELECT ri.quantity_g, i.protein_per_100g, i.carbs_per_100g, i.fat_per_100g, i.calories_per_100g, i.unit_price_cents
     FROM recipe_ingredients ri
     JOIN inventory i ON ri.inventory_id = i.id
     WHERE ri.recipe_id = $1`,
    [recipeId]
  );

  const divisor = recipe.base_servings || 1;
  let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalCostCents = 0;

  for (const ing of ingredientsResult.rows) {
    if (ing.quantity_g && ing.calories_per_100g) totalCalories += (ing.calories_per_100g * ing.quantity_g) / 100;
    if (ing.quantity_g && ing.protein_per_100g) totalProtein += (ing.protein_per_100g * ing.quantity_g) / 100;
    if (ing.quantity_g && ing.carbs_per_100g) totalCarbs += (ing.carbs_per_100g * ing.quantity_g) / 100;
    if (ing.quantity_g && ing.fat_per_100g) totalFat += (ing.fat_per_100g * ing.quantity_g) / 100;
    if (ing.quantity_g && ing.unit_price_cents) totalCostCents += (ing.unit_price_cents / 453.592) * ing.quantity_g;
  }

  const perServing = {
    calories: totalCalories / divisor,
    protein_g: totalProtein / divisor,
    carbs_g: totalCarbs / divisor,
    fat_g: totalFat / divisor,
    cost_cents: totalCostCents / divisor,
  };

  return {
    recipe_id: recipe.recipe_id,
    name: recipe.name,
    servings,
    calories: Math.round(perServing.calories * servings),
    protein_g: +(perServing.protein_g * servings).toFixed(1),
    carbs_g: +(perServing.carbs_g * servings).toFixed(1),
    fat_g: +(perServing.fat_g * servings).toFixed(1),
    cost_cents: Math.round(perServing.cost_cents * servings),
  };
}

// GET /api/admin/menu-planner/next-week - the target week's dates
router.get('/next-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const dates = await getNextWeekDates();
    res.json({ data: dates });
  } catch (error) {
    console.error('Error getting next week dates:', error);
    res.status(500).json({ error: 'Failed to get next week dates' });
  }
});

// GET /api/admin/menu-planner/previous-week - real menu items actually
// ordered last week, for the planning reference panel
router.get('/previous-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT m.name, o.day_of_week
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE (date_trunc('week', o.created_at + interval '1 day') - interval '1 day')
          = (date_trunc('week', NOW() + interval '1 day') - interval '1 day' - interval '7 days')
      ORDER BY o.day_of_week, m.name
    `);
    res.json({
      data: {
        monday: result.rows.filter(r => r.day_of_week === 'monday').map(r => r.name),
        thursday: result.rows.filter(r => r.day_of_week === 'thursday').map(r => r.name),
      },
    });
  } catch (error) {
    console.error('Error fetching previous week menu:', error);
    res.status(500).json({ error: 'Failed to fetch previous week menu' });
  }
});

// GET /api/admin/menu-planner/plates - list plates already planned for next week
router.get('/plates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();

    const platesResult = await db.query(`
      SELECT id, name, category, delivery_day, large_variant_of, price
      FROM menus
      WHERE planned_week_start = $1
      ORDER BY delivery_day, large_variant_of NULLS FIRST, name
    `, [sunday]);

    const plates = [];
    for (const plate of platesResult.rows) {
      const recipesResult = await db.query(
        `SELECT recipe_id, servings FROM menu_plan_recipes WHERE menu_id = $1`,
        [plate.id]
      );

      const recipeDetails = [];
      let totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cost_cents: 0 };
      for (const r of recipesResult.rows) {
        const detail = await getRecipeMacrosAtServings(r.recipe_id, parseFloat(r.servings));
        if (detail) {
          recipeDetails.push(detail);
          totals.calories += detail.calories;
          totals.protein_g += detail.protein_g;
          totals.carbs_g += detail.carbs_g;
          totals.fat_g += detail.fat_g;
          totals.cost_cents += detail.cost_cents;
        }
      }

      plates.push({ ...plate, recipes: recipeDetails, totals });
    }

    res.json({ data: { weekStart: sunday, plates } });
  } catch (error) {
    console.error('Error fetching plates:', error);
    res.status(500).json({ error: 'Failed to fetch plates' });
  }
});

// POST /api/admin/menu-planner/plates - create a new plate (real menu item)
// for next week, optionally with an auto-generated Large-tier twin at 1.5x
// every recipe's servings.
router.post('/plates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, day, recipes, makeLarge } = req.body;

    if (!name || !day || !Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: 'name, day, and at least one recipe are required' });
    }
    if (!['monday', 'thursday'].includes(day)) {
      return res.status(400).json({ error: "day must be 'monday' or 'thursday'" });
    }

    const { sunday } = await getNextWeekDates();

    // Regular-tier plate
    const regularMenu = await db.query(
      `INSERT INTO menus (name, category, price, planned_week_start, delivery_day, created_at, updated_at)
       VALUES ($1, 'Regular', $2, $3, $4, NOW(), NOW()) RETURNING id`,
      [name, CATEGORY_PRICES.Regular, sunday, day]
    );
    const regularMenuId = regularMenu.rows[0].id;

    for (const r of recipes) {
      await db.query(
        `INSERT INTO menu_plan_recipes (menu_id, recipe_id, servings) VALUES ($1, $2, $3)`,
        [regularMenuId, r.recipe_id, r.servings]
      );
    }

    let largeMenuId = null;
    if (makeLarge) {
      const largeMenu = await db.query(
        `INSERT INTO menus (name, category, price, planned_week_start, delivery_day, large_variant_of, created_at, updated_at)
         VALUES ($1, 'Large', $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
        [name, CATEGORY_PRICES.Large, sunday, day, regularMenuId]
      );
      largeMenuId = largeMenu.rows[0].id;

      for (const r of recipes) {
        await db.query(
          `INSERT INTO menu_plan_recipes (menu_id, recipe_id, servings) VALUES ($1, $2, $3)`,
          [largeMenuId, r.recipe_id, r.servings * 1.5]
        );
      }
    }

    res.status(201).json({ data: { regularMenuId, largeMenuId } });
  } catch (error) {
    console.error('Error creating plate:', error);
    res.status(500).json({ error: 'Failed to create plate' });
  }
});

// DELETE /api/admin/menu-planner/plates/:id - delete a plate. If it has a
// Large twin (or is one), both are removed together so they never end up
// orphaned from each other.
router.delete('/plates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const menuResult = await db.query('SELECT id, large_variant_of FROM menus WHERE id = $1', [id]);
    if (menuResult.rows.length === 0) return res.status(404).json({ error: 'Plate not found' });

    const menu = menuResult.rows[0];

    // Delete this menu and, if it's a Regular plate, its Large twin too
    await db.query('DELETE FROM menus WHERE id = $1 OR large_variant_of = $1', [id]);

    // If this WAS a large twin (has large_variant_of), no extra cleanup needed --
    // the regular original stays intact.

    res.json({ success: true, message: 'Plate deleted' });
  } catch (error) {
    console.error('Error deleting plate:', error);
    res.status(500).json({ error: 'Failed to delete plate' });
  }
});

module.exports = router;
