const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { computeYieldCorrectedRecipe } = require('./adminCookingMethods');
const { getReceiptFallbackPriceCents } = require('../../utils/recipeCost');

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

// Returns every published recipe for next week's planned window, joined
// against whatever's already been selected for each block -- so the UI can
// render the full recipe list with each one's checked/unchecked state and
// expected volume in a single call.
router.get('/recipe-plan', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();

    const recipesResult = await db.query(`
      SELECT recipe_id, name, category
      FROM recipes
      WHERE category != 'prepared_meal'
      ORDER BY category, name
    `);

    const planResult = await db.query(
      `SELECT recipe_id, block, expected_volume
       FROM weekly_recipe_plan
       WHERE planned_week_start = $1`,
      [sunday]
    );

    const planByKey = {};
    for (const row of planResult.rows) {
      planByKey[`${row.recipe_id}:${row.block}`] = row.expected_volume;
    }

    const withPlan = (block) =>
      recipesResult.rows.map((r) => {
        const key = `${r.recipe_id}:${block}`;
        const selected = Object.prototype.hasOwnProperty.call(planByKey, key);
        return {
          recipe_id: r.recipe_id,
          name: r.name,
          category: r.category,
          selected,
          expected_volume: selected ? planByKey[key] : 0,
        };
      });

    res.json({
      data: {
        weekStart: sunday,
        monday: withPlan('monday'),
        thursday: withPlan('thursday'),
      },
    });
  } catch (error) {
    console.error('Error fetching recipe plan:', error);
    res.status(500).json({ error: 'Failed to fetch recipe plan' });
  }
});

// Saves the full recipe selection + expected volume for one block in a
// single call -- replace-all semantics, same pattern the plate builder uses
// for its recipe list. Body: { block: 'monday'|'thursday', selections: [{
// recipe_id, expected_volume }] }. Recipes left out of `selections` are
// simply not live for that block; they aren't deleted anywhere else.
router.post('/recipe-plan', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { block, selections } = req.body;

    if (!['monday', 'thursday'].includes(block)) {
      return res.status(400).json({ error: "block must be 'monday' or 'thursday'" });
    }
    if (!Array.isArray(selections)) {
      return res.status(400).json({ error: 'selections must be an array' });
    }

    const { sunday } = await getNextWeekDates();

    await db.query(
      `DELETE FROM weekly_recipe_plan WHERE block = $1 AND planned_week_start = $2`,
      [block, sunday]
    );

    for (const s of selections) {
      await db.query(
        `INSERT INTO weekly_recipe_plan (recipe_id, block, planned_week_start, expected_volume, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [s.recipe_id, block, sunday, s.expected_volume || 0]
      );
    }

    res.json({ success: true, message: 'Recipe plan saved' });
  } catch (error) {
    console.error('Error saving recipe plan:', error);
    res.status(500).json({ error: 'Failed to save recipe plan' });
  }
});

const GRAMS_PER_POUND = 455; // matches this app's stated "1 lb (455g)" convention

// Everything the chef needs to actually shop and prep for the week, derived
// from the Weekly Recipe Plan: scale each selected recipe's ingredient list
// up to its forecasted lb, then aggregate by real inventory ingredient
// across every selected recipe in both blocks -- so "how much chicken
// breast do I need this week" has one answer, not one per recipe. Cost is
// computed the same way and rolled up per block for the financials view.
router.get('/prep-and-financials', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();

    const planResult = await db.query(
      `SELECT wrp.recipe_id, wrp.block, wrp.expected_volume, r.name AS recipe_name
       FROM weekly_recipe_plan wrp
       JOIN recipes r ON r.recipe_id = wrp.recipe_id
       WHERE wrp.planned_week_start = $1`,
      [sunday]
    );

    const financials = {
      monday: { costCents: 0, lb: 0, recipeCount: 0 },
      thursday: { costCents: 0, lb: 0, recipeCount: 0 },
    };
    const ingredientTotals = {}; // inventory_id -> aggregated row

    // Each plan row's ingredient lookup is independent -- run them
    // concurrently rather than one at a time (learned from the same N+1
    // pattern in /plates earlier: sequential was 13.5s for a comparable
    // per-plate loop, parallel was ~1.1s).
    const perRecipe = await Promise.all(planResult.rows.map(async (planRow) => {
      const ingResult = await db.query(
        `SELECT ri.quantity_g, i.id AS inventory_id, i.name, i.category,
                i.unit_price_cents, i.current_stock_g
         FROM recipe_ingredients ri
         LEFT JOIN inventory i ON ri.inventory_id = i.id
         WHERE ri.recipe_id = $1`,
        [planRow.recipe_id]
      );

      const totalRecipeWeightG = ingResult.rows.reduce((sum, r) => sum + (parseFloat(r.quantity_g) || 0), 0);
      const forecastedG = (planRow.expected_volume || 0) * GRAMS_PER_POUND;
      const scale = totalRecipeWeightG > 0 ? forecastedG / totalRecipeWeightG : 0;

      let recipeCostCents = 0;
      const ingredientNeeds = [];
      for (const ing of ingResult.rows) {
        const neededG = (parseFloat(ing.quantity_g) || 0) * scale;
        // No price on file -- use the real price last actually paid on a
        // receipt rather than treating the ingredient as free.
        const unitPriceCents = ing.unit_price_cents ?? (ing.name ? await getReceiptFallbackPriceCents(ing.name) : null);
        const costCents = unitPriceCents ? (unitPriceCents / 453.592) * neededG : 0;
        recipeCostCents += costCents;
        if (ing.inventory_id) {
          ingredientNeeds.push({
            inventoryId: ing.inventory_id,
            name: ing.name,
            category: ing.category,
            unitPriceCents,
            currentStockG: parseFloat(ing.current_stock_g) || 0,
            neededG,
          });
        }
      }
      return { block: planRow.block, expectedVolume: planRow.expected_volume || 0, recipeCostCents, ingredientNeeds };
    }));

    for (const r of perRecipe) {
      financials[r.block].costCents += r.recipeCostCents;
      financials[r.block].lb += r.expectedVolume;
      financials[r.block].recipeCount += 1;

      for (const ing of r.ingredientNeeds) {
        if (!ingredientTotals[ing.inventoryId]) {
          ingredientTotals[ing.inventoryId] = {
            name: ing.name,
            category: ing.category,
            neededG: 0,
            unitPriceCents: ing.unitPriceCents,
            currentStockG: ing.currentStockG,
          };
        }
        ingredientTotals[ing.inventoryId].neededG += ing.neededG;
      }
    }

    const ingredients = Object.values(ingredientTotals)
      .map((i) => ({
        ...i,
        neededG: Math.round(i.neededG),
        shortfallG: Math.max(0, Math.round(i.neededG - i.currentStockG)),
      }))
      .sort((a, b) => b.neededG - a.neededG);

    financials.combined = {
      costCents: financials.monday.costCents + financials.thursday.costCents,
      lb: financials.monday.lb + financials.thursday.lb,
      recipeCount: financials.monday.recipeCount + financials.thursday.recipeCount,
    };
    financials.monday.costCents = Math.round(financials.monday.costCents);
    financials.thursday.costCents = Math.round(financials.thursday.costCents);
    financials.combined.costCents = Math.round(financials.combined.costCents);

    res.json({ data: { weekStart: sunday, ingredients, financials } });
  } catch (error) {
    console.error('Error fetching prep and financials:', error);
    res.status(500).json({ error: 'Failed to fetch prep and financials' });
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

    // Each plate's recipe rows are independent reads (yield-corrected macros,
    // allergens, low-stock) that were previously awaited one at a time in a
    // nested loop -- ~4 sequential DB round-trips per recipe, serialized
    // across every plate and recipe (this endpoint was taking 13+ seconds
    // with a full week's worth of plates). Running them concurrently instead
    // cuts it to roughly the time of the single slowest query.
    const plates = await Promise.all(platesResult.rows.map(async (plate) => {
      const recipesResult = await db.query(
        `SELECT recipe_id, servings FROM menu_plan_recipes WHERE menu_id = $1`,
        [plate.id]
      );

      const perRecipe = await Promise.all(recipesResult.rows.map(async (r) => {
        const servings = parseFloat(r.servings);
        const [detail, allergens, warnings] = await Promise.all([
          computeYieldCorrectedRecipe(r.recipe_id, servings),
          getRecipeAllergens(r.recipe_id),
          getLowStockWarnings(r.recipe_id, servings),
        ]);
        return { detail, allergens, warnings };
      }));

      let totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cost_cents: 0, raw_weight_g: 0, cooked_weight_g: 0 };
      const allergenSet = new Set();
      const lowStockWarnings = [];
      const recipeDetails = [];

      for (const { detail, allergens, warnings } of perRecipe) {
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
        allergens.forEach(a => allergenSet.add(a));
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

      return {
        ...plate,
        recipes: recipeDetails,
        totals,
        allergens: Array.from(allergenSet),
        lowStockWarnings,
        profit: { price_cents: priceCents, cost_cents: totals.cost_cents, profit_cents: profitCents, margin_pct: marginPct },
      };
    }));

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

// Updates an existing plate's name and recipe list (with per-recipe
// servings) in place, instead of the only previous option -- delete and
// recreate from scratch. Always operates on the Regular plate's id; its
// Large twin (1.5x servings), if any, is created/updated/removed to match.
router.put('/plates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, recipes, makeLarge } = req.body;

    if (!name || !Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: 'name and at least one recipe are required' });
    }

    const menuResult = await db.query('SELECT id, delivery_day, large_variant_of FROM menus WHERE id = $1', [id]);
    if (menuResult.rows.length === 0) return res.status(404).json({ error: 'Plate not found' });
    if (menuResult.rows[0].large_variant_of) {
      return res.status(400).json({ error: 'Edit the Regular plate, not its Large version -- the Large version updates automatically' });
    }

    await db.query(`UPDATE menus SET name = $1, updated_at = NOW() WHERE id = $2`, [name, id]);

    await db.query(`DELETE FROM menu_plan_recipes WHERE menu_id = $1`, [id]);
    for (const r of recipes) {
      await db.query(
        `INSERT INTO menu_plan_recipes (menu_id, recipe_id, servings) VALUES ($1, $2, $3)`,
        [id, r.recipe_id, r.servings]
      );
    }

    const existingLarge = await db.query('SELECT id FROM menus WHERE large_variant_of = $1', [id]);
    const largeId = existingLarge.rows[0]?.id || null;

    if (makeLarge) {
      let targetLargeId = largeId;
      if (!targetLargeId) {
        const delivery_day = menuResult.rows[0].delivery_day;
        const { sunday } = await getNextWeekDates();
        const largeMenu = await db.query(
          `INSERT INTO menus (name, category, price, planned_week_start, delivery_day, large_variant_of, created_at, updated_at)
           VALUES ($1, 'Large', $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
          [name, CATEGORY_PRICES.Large, sunday, delivery_day, id]
        );
        targetLargeId = largeMenu.rows[0].id;
      } else {
        await db.query(`UPDATE menus SET name = $1, updated_at = NOW() WHERE id = $2`, [name, targetLargeId]);
      }

      await db.query(`DELETE FROM menu_plan_recipes WHERE menu_id = $1`, [targetLargeId]);
      for (const r of recipes) {
        await db.query(
          `INSERT INTO menu_plan_recipes (menu_id, recipe_id, servings) VALUES ($1, $2, $3)`,
          [targetLargeId, r.recipe_id, r.servings * 1.5]
        );
      }
    } else if (largeId) {
      await db.query('DELETE FROM menus WHERE id = $1', [largeId]);
    }

    res.json({ success: true, message: 'Plate updated' });
  } catch (error) {
    console.error('Error updating plate:', error);
    res.status(500).json({ error: 'Failed to update plate' });
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
