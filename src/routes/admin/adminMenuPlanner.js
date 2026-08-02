const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { computeYieldCorrectedRecipe } = require('./adminCookingMethods');

const CATEGORY_PRICES = { Regular: 13.79, Large: 16.79 };

async function getNextWeekDates() {
  const result = await db.query(`
    SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day' + interval '7 days')::date AS sunday
  `);
  const sunday = result.rows[0].sunday;
  const sundayDate = new Date(sunday);
  const monday = new Date(sundayDate); monday.setDate(sundayDate.getDate() + 1);
  const thursday = new Date(sundayDate); thursday.setDate(sundayDate.getDate() + 4);
  return { sunday: sundayDate, monday, thursday };
}

router.get('/next-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    res.json({ data: await getNextWeekDates() });
  } catch (error) {
    console.error('Error getting next week dates:', error);
    res.status(500).json({ error: 'Failed to get next week dates' });
  }
});

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

// Real allergens used across a recipe's ingredients (deduplicated)
async function getRecipeAllergens(recipeId) {
  const result = await db.query(
    `SELECT DISTINCT unnest(i.allergens) AS allergen
     FROM recipe_ingredients ri JOIN inventory i ON ri.inventory_id = i.id
     WHERE ri.recipe_id = $1 AND i.allergens IS NOT NULL`,
    [recipeId]
  );
  return result.rows.map(r => r.allergen);
}

// Ingredients below a safe threshold relative to what this recipe needs,
// so Menu Planner can warn you before you commit to a plate, not after.
async function getLowStockWarnings(recipeId, servings) {
  const result = await db.query(
    `SELECT i.name, i.current_stock_g, ri.quantity_g * $2 AS needed_g
     FROM recipe_ingredients ri JOIN inventory i ON ri.inventory_id = i.id
     WHERE ri.recipe_id = $1`,
    [recipeId, servings]
  );
  return result.rows
    .filter(r => parseFloat(r.current_stock_g) < parseFloat(r.needed_g))
    .map(r => ({ name: r.name, have_g: parseFloat(r.current_stock_g), need_g: parseFloat(r.needed_g) }));
}

router.get('/plates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();

    const platesResult = await db.query(`
      SELECT id, name, category, delivery_day, large_variant_of, price
      FROM menus WHERE planned_week_start = $1
      ORDER BY delivery_day, large_variant_of NULLS FIRST, name
    `, [sunday]);

    const plates = [];
    for (const plate of platesResult.rows) {
      const recipesResult = await db.query(
        `SELECT recipe_id, servings FROM menu_plan_recipes WHERE menu_id = $1`,
        [plate.id]
      );

      const recipeDetails = [];
      let totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cost_cents: 0, raw_weight_g: 0, cooked_weight_g: 0 };
      const allergenSet = new Set();
      const lowStockWarnings = [];

      for (const r of recipesResult.rows) {
        const detail = await computeYieldCorrectedRecipe(r.recipe_id, parseFloat(r.servings));
        if (detail) {
          recipeDetails.push(detail);
          totals.calories += detail.calories;
          totals.protein_g += detail.protein_g;
          totals.carbs_g += detail.carbs_g;
          totals.fat_g += detail.fat_g;
          totals.cost_cents += detail.cost_cents;
          totals.raw_weight_g += detail.raw_weight_g;
          totals.cooked_weight_g += detail.cooked_weight_g;
        }

        const recipeAllergens = await getRecipeAllergens(r.recipe_id);
        recipeAllergens.forEach(a => allergenSet.add(a));

        const warnings = await getLowStockWarnings(r.recipe_id, parseFloat(r.servings));
        lowStockWarnings.push(...warnings);
      }

      totals.protein_g = +totals.protein_g.toFixed(1);
      totals.carbs_g = +totals.carbs_g.toFixed(1);
      totals.fat_g = +totals.fat_g.toFixed(1);
      totals.raw_weight_g = +totals.raw_weight_g.toFixed(1);
      totals.cooked_weight_g = +totals.cooked_weight_g.toFixed(1);

      const priceCents = Math.round(parseFloat(plate.price) * 100);
      const profitCents = priceCents - totals.cost_cents;
      const marginPct = priceCents > 0 ? +((profitCents / priceCents) * 100).toFixed(1) : 0;

      plates.push({
        ...plate,
        recipes: recipeDetails,
        totals,
        allergens: Array.from(allergenSet),
        lowStockWarnings,
        profit: { price_cents: priceCents, cost_cents: totals.cost_cents, profit_cents: profitCents, margin_pct: marginPct },
      });
    }

    res.json({ data: { weekStart: sunday, plates } });
  } catch (error) {
    console.error('Error fetching plates:', error);
    res.status(500).json({ error: 'Failed to fetch plates' });
  }
});

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

router.delete('/plates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const menuResult = await db.query('SELECT id, large_variant_of FROM menus WHERE id = $1', [id]);
    if (menuResult.rows.length === 0) return res.status(404).json({ error: 'Plate not found' });
    await db.query('DELETE FROM menus WHERE id = $1 OR large_variant_of = $1', [id]);
    res.json({ success: true, message: 'Plate deleted' });
  } catch (error) {
    console.error('Error deleting plate:', error);
    res.status(500).json({ error: 'Failed to delete plate' });
  }
});

module.exports = router;
