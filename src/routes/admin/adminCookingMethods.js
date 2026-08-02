const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

// ============================================================================
// COOKING METHODS LIBRARY -- CRUD for the yield-% reference table
// ============================================================================
router.get('/cooking-methods', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cooking_methods ORDER BY name');
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching cooking methods:', error);
    res.status(500).json({ error: 'Failed to fetch cooking methods' });
  }
});

router.post('/cooking-methods', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, typical_yield_pct, notes } = req.body;
    if (!name || typical_yield_pct === undefined) {
      return res.status(400).json({ error: 'name and typical_yield_pct are required' });
    }
    const result = await db.query(
      `INSERT INTO cooking_methods (name, typical_yield_pct, notes) VALUES ($1, $2, $3) RETURNING *`,
      [name, typical_yield_pct, notes || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error creating cooking method:', error);
    res.status(500).json({ error: 'Failed to create cooking method' });
  }
});

router.put('/cooking-methods/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, typical_yield_pct, notes } = req.body;
    const result = await db.query(
      `UPDATE cooking_methods SET name = COALESCE($1, name), typical_yield_pct = COALESCE($2, typical_yield_pct), notes = COALESCE($3, notes) WHERE id = $4 RETURNING *`,
      [name, typical_yield_pct, notes, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cooking method not found' });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error updating cooking method:', error);
    res.status(500).json({ error: 'Failed to update cooking method' });
  }
});

// ============================================================================
// PER-INGREDIENT YIELD OVERRIDES
// ============================================================================
router.get('/ingredient-yields', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { inventory_id } = req.query;
    const result = await db.query(
      inventory_id
        ? `SELECT icy.*, cm.name AS method_name, i.name AS ingredient_name
           FROM ingredient_cooking_yields icy
           JOIN cooking_methods cm ON icy.cooking_method_id = cm.id
           JOIN inventory i ON icy.inventory_id = i.id
           WHERE icy.inventory_id = $1`
        : `SELECT icy.*, cm.name AS method_name, i.name AS ingredient_name
           FROM ingredient_cooking_yields icy
           JOIN cooking_methods cm ON icy.cooking_method_id = cm.id
           JOIN inventory i ON icy.inventory_id = i.id`,
      inventory_id ? [inventory_id] : []
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching ingredient yields:', error);
    res.status(500).json({ error: 'Failed to fetch ingredient yields' });
  }
});

router.post('/ingredient-yields', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { inventory_id, cooking_method_id, yield_pct } = req.body;
    if (!inventory_id || !cooking_method_id || yield_pct === undefined) {
      return res.status(400).json({ error: 'inventory_id, cooking_method_id, and yield_pct are required' });
    }
    const result = await db.query(
      `INSERT INTO ingredient_cooking_yields (inventory_id, cooking_method_id, yield_pct)
       VALUES ($1, $2, $3)
       ON CONFLICT (inventory_id, cooking_method_id) DO UPDATE SET yield_pct = $3
       RETURNING *`,
      [inventory_id, cooking_method_id, yield_pct]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error saving ingredient yield override:', error);
    res.status(500).json({ error: 'Failed to save ingredient yield override' });
  }
});

// ============================================================================
// SET COOKING METHOD ON A SPECIFIC RECIPE INGREDIENT
// ============================================================================
router.put('/recipe-ingredients/:id/cooking-method', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { cooking_method_id } = req.body; // null = raw/no cooking
    const result = await db.query(
      `UPDATE recipe_ingredients SET cooking_method_id = $1 WHERE id = $2 RETURNING *`,
      [cooking_method_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recipe ingredient not found' });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error setting cooking method:', error);
    res.status(500).json({ error: 'Failed to set cooking method' });
  }
});

// ============================================================================
// YIELD-CORRECTED RECIPE CALCULATION
// Nutrients (protein/carbs/fat/calories) are conserved from raw weight --
// cooking changes water content, not nutrient mass. What changes is the
// COOKED WEIGHT (for real portioning) and therefore the macro DENSITY per
// 100g of the food as actually served.
// ============================================================================
async function computeYieldCorrectedRecipe(recipeId, servings) {
  const recipeResult = await db.query(
    'SELECT recipe_id, name, servings AS base_servings FROM recipes WHERE recipe_id = $1',
    [recipeId]
  );
  if (recipeResult.rows.length === 0) return null;
  const recipe = recipeResult.rows[0];
  const scaleFactor = servings / (recipe.base_servings || 1);

  const ingredientsResult = await db.query(
    `SELECT ri.id AS recipe_ingredient_id, ri.quantity_g, ri.cooking_method_id,
            i.id AS inventory_id, i.name AS ingredient_name,
            i.protein_per_100g, i.carbs_per_100g, i.fat_per_100g, i.calories_per_100g,
            i.unit_price_cents,
            cm.typical_yield_pct, cm.name AS method_name,
            icy.yield_pct AS override_yield_pct
     FROM recipe_ingredients ri
     JOIN inventory i ON ri.inventory_id = i.id
     LEFT JOIN cooking_methods cm ON ri.cooking_method_id = cm.id
     LEFT JOIN ingredient_cooking_yields icy
       ON icy.inventory_id = i.id AND icy.cooking_method_id = ri.cooking_method_id
     WHERE ri.recipe_id = $1`,
    [recipeId]
  );

  let totalRawG = 0, totalCookedG = 0;
  let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalCostCents = 0;
  const ingredientBreakdown = [];

  for (const ing of ingredientsResult.rows) {
    const rawG = (ing.quantity_g || 0) * scaleFactor;
    // Effective yield %: per-ingredient override > generic method default > 0 (raw/no change)
    const yieldPct = ing.override_yield_pct != null
      ? parseFloat(ing.override_yield_pct)
      : (ing.typical_yield_pct != null ? parseFloat(ing.typical_yield_pct) : 0);
    const cookedG = rawG * (1 + yieldPct / 100);

    const calories = ing.calories_per_100g ? (ing.calories_per_100g * rawG) / 100 : 0;
    const protein = ing.protein_per_100g ? (ing.protein_per_100g * rawG) / 100 : 0;
    const carbs = ing.carbs_per_100g ? (ing.carbs_per_100g * rawG) / 100 : 0;
    const fat = ing.fat_per_100g ? (ing.fat_per_100g * rawG) / 100 : 0;
    const cost = ing.unit_price_cents ? (ing.unit_price_cents / 453.592) * rawG : 0;

    totalRawG += rawG;
    totalCookedG += cookedG;
    totalCalories += calories;
    totalProtein += protein;
    totalCarbs += carbs;
    totalFat += fat;
    totalCostCents += cost;

    ingredientBreakdown.push({
      name: ing.ingredient_name,
      cooking_method: ing.method_name || 'Raw / No Cooking',
      raw_g: +rawG.toFixed(1),
      cooked_g: +cookedG.toFixed(1),
      yield_pct: yieldPct,
    });
  }

  return {
    recipe_id: recipe.recipe_id,
    name: recipe.name,
    servings,
    raw_weight_g: +totalRawG.toFixed(1),
    cooked_weight_g: +totalCookedG.toFixed(1),
    // True nutrient totals -- unaffected by cooking, conserved from raw weight
    calories: Math.round(totalCalories),
    protein_g: +totalProtein.toFixed(1),
    carbs_g: +totalCarbs.toFixed(1),
    fat_g: +totalFat.toFixed(1),
    cost_cents: Math.round(totalCostCents),
    // Macro density as actually served on the cooked plate (per 100g cooked)
    cooked_basis_per_100g: totalCookedG > 0 ? {
      calories: +((totalCalories / totalCookedG) * 100).toFixed(1),
      protein_g: +((totalProtein / totalCookedG) * 100).toFixed(1),
      carbs_g: +((totalCarbs / totalCookedG) * 100).toFixed(1),
      fat_g: +((totalFat / totalCookedG) * 100).toFixed(1),
    } : null,
    ingredients: ingredientBreakdown,
  };
}

router.get('/recipes/:id/yield-corrected', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const servings = req.query.servings ? parseFloat(req.query.servings) : null;
    const recipeResult = await db.query('SELECT servings FROM recipes WHERE recipe_id = $1', [req.params.id]);
    if (recipeResult.rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });

    const targetServings = servings || recipeResult.rows[0].servings || 1;
    const result = await computeYieldCorrectedRecipe(req.params.id, targetServings);
    res.json({ data: result });
  } catch (error) {
    console.error('Error computing yield-corrected recipe:', error);
    res.status(500).json({ error: 'Failed to compute yield-corrected recipe' });
  }
});

module.exports = router;
module.exports.computeYieldCorrectedRecipe = computeYieldCorrectedRecipe;
