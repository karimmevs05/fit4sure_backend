const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

// GET /api/admin/prep/weeks - Get all available weeks
router.get('/weeks/list', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, week_label FROM menus ORDER BY created_at DESC`
    );

    res.json({
      data: result.rows.map(row => ({
        id: row.id,
        week: row.week_label,
      })),
    });
  } catch (error) {
    console.error('Error fetching weeks:', error);
    res.status(500).json({ error: 'Failed to fetch weeks' });
  }
});

// GET /api/admin/prep/:week - Get comprehensive prep data for a week
router.get('/:week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Decode the week label from URL
    const week = decodeURIComponent(req.params.week);

    // Get menu ID
    const menuResult = await db.query(
      'SELECT id FROM menus WHERE week_label = $1',
      [week]
    );

    if (menuResult.rows.length === 0) {
      return res.status(404).json({ error: 'Week not found' });
    }

    const menuId = menuResult.rows[0].id;

    // Get all recipes for this week
    const recipesResult = await db.query(
      `SELECT id, recipe_name, day_of_week FROM menu_recipes WHERE menu_id = $1 ORDER BY day_of_week`,
      [menuId]
    );

    // Get all customer order totals for this week
    const customerOrdersResult = await db.query(
      `SELECT ot.customer_id, c.name, ot.total_meals_monday, ot.total_meals_thursday, ot.breakfast_meals
       FROM order_totals ot
       JOIN customers c ON ot.customer_id = c.id
       WHERE ot.menu_id = $1
       ORDER BY c.name`,
      [menuId]
    );

    // Count regular vs large based on customer names
    let regularCount = 0;
    let largeCount = 0;

    for (const order of customerOrdersResult.rows) {
      if (order.name.includes('LARGE')) {
        largeCount += 1;
      } else {
        regularCount += 1;
      }
    }

    // Calculate total servings
    const totalServings = customerOrdersResult.rows.reduce(
      (sum, order) => sum + (order.total_meals_monday || 0) + (order.total_meals_thursday || 0) + (order.breakfast_meals || 0),
      0
    );

    // Get all inventory items with stock and pricing
    const inventoryResult = await db.query(
      `SELECT id, name, category, unit_price_cents, current_stock_g FROM inventory ORDER BY category, name`
    );

    // Convert to ingredient format with costs
    const ingredients = inventoryResult.rows.map(row => ({
      name: row.name,
      category: row.category,
      available_g: row.current_stock_g || 0,
      unit_price_cents: row.unit_price_cents || 0,
      cost_cents: Math.round(((row.unit_price_cents || 0) / 453.592) * (row.current_stock_g || 0)),
    }));

    // Calculate total cost of current inventory
    let totalCost = 0;
    for (const ing of ingredients) {
      totalCost += ing.cost_cents;
    }

    // Add counts to recipes
    const recipesWithCounts = recipesResult.rows.map(recipe => ({
      recipe_id: recipe.id,
      recipe_name: recipe.recipe_name,
      day_of_week: recipe.day_of_week,
      regular_count: regularCount,
      large_count: largeCount,
    }));

    res.json({
      data: {
        week,
        recipes: recipesWithCounts,
        ingredients: ingredients,
        summary: {
          total_cost_cents: Math.round(totalCost),
          total_servings: totalServings,
          total_ingredients: ingredients.length,
          prep_days: ['Monday', 'Thursday'],
        },
        orders: customerOrdersResult.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching prep data:', error);
    res.status(500).json({ error: 'Failed to fetch prep data', details: error.message });
  }
});

// GET /api/admin/prep/:week/:recipeId - Get detailed info for a specific recipe
router.get('/:week/:recipeId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Decode the week label from URL
    const week = decodeURIComponent(req.params.week);
    const recipeId = req.params.recipeId;

    // Get menu ID
    const menuResult = await db.query(
      'SELECT id FROM menus WHERE week_label = $1',
      [week]
    );

    if (menuResult.rows.length === 0) {
      return res.status(404).json({ error: 'Week not found' });
    }

    const menuId = menuResult.rows[0].id;

    // Get recipe details
    const recipeResult = await db.query(
      `SELECT id, recipe_name, day_of_week, recipe_id FROM menu_recipes WHERE id = $1 AND menu_id = $2`,
      [recipeId, menuId]
    );

    if (recipeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    const recipe = recipeResult.rows[0];

    // Get all customers for this week
    const customersResult = await db.query(
      `SELECT c.id, c.name, c.notes, ot.total_meals_monday, ot.total_meals_thursday, ot.breakfast_meals
       FROM order_totals ot
       JOIN customers c ON ot.customer_id = c.id
       WHERE ot.menu_id = $1
       ORDER BY c.name`,
      [menuId]
    );

    // Split by regular vs large
    const regularCustomers = customersResult.rows.filter(c => !c.name.includes('LARGE'));
    const largeCustomers = customersResult.rows.filter(c => c.name.includes('LARGE'));

    // Get ingredients for this recipe from inventory
    // First, try to find a linked recipe in the recipes table
    const linkedRecipe = await db.query(
      `SELECT recipe_id FROM menu_recipes WHERE id = $1`,
      [recipe.id]
    );

    let ingredients = [];
    let totalCogs = 0;
    let cogsPerPortion = 0;

    // If we have a linked recipe, get its ingredients
    if (linkedRecipe.rows.length > 0 && linkedRecipe.rows[0].recipe_id) {
      const recipeId = linkedRecipe.rows[0].recipe_id;

      // Get recipe info (servings)
      const recipeInfo = await db.query(
        `SELECT servings FROM recipes WHERE recipe_id = $1`,
        [recipeId]
      );

      const servings = recipeInfo.rows[0]?.servings || 1;

      const recipeIngredientsResult = await db.query(
        `SELECT ri.quantity_g, i.id, i.name, i.category, i.unit_price_cents, i.current_stock_g
         FROM recipe_ingredients ri
         JOIN inventory i ON ri.inventory_id = i.id
         WHERE ri.recipe_id = $1`,
        [recipeId]
      );

      // Calculate cost per ingredient for this recipe
      recipeIngredientsResult.rows.forEach(ing => {
        const costCents = Math.round(((ing.unit_price_cents || 0) / 453.592) * ing.quantity_g);
        totalCogs += costCents;
      });

      // Cost per serving of this recipe
      cogsPerPortion = Math.round(totalCogs / servings);

      ingredients = recipeIngredientsResult.rows.map(ing => {
        const costCents = Math.round(((ing.unit_price_cents || 0) / 453.592) * ing.quantity_g);
        return {
          name: ing.name,
          category: ing.category,
          quantity_g: ing.quantity_g,
          unit_price_cents: ing.unit_price_cents || 0,
          cost_cents: costCents,
          available_g: ing.current_stock_g || 0,
        };
      });
    } else {
      // Fallback: show all inventory with per-portion cost
      const allInventory = await db.query(
        `SELECT id, name, category, unit_price_cents, current_stock_g FROM inventory ORDER BY category, name`
      );

      const totalPortions = regularCustomers.length + largeCustomers.length || 1;

      ingredients = allInventory.rows.map(ing => {
        const costCents = Math.round(((ing.unit_price_cents || 0) / 453.592) * (ing.current_stock_g || 0));
        totalCogs += costCents;
        return {
          name: ing.name,
          category: ing.category,
          quantity_g: 0,
          unit_price_cents: ing.unit_price_cents || 0,
          cost_cents: costCents,
          available_g: ing.current_stock_g || 0,
        };
      });

      cogsPerPortion = Math.round(totalCogs / totalPortions);
    }

    res.json({
      data: {
        recipe: {
          id: recipe.id,
          name: recipe.recipe_name,
          day: recipe.day_of_week,
        },
        regular_customers: regularCustomers,
        large_customers: largeCustomers,
        ingredients: ingredients,
        summary: {
          total_regular: regularCustomers.length,
          total_large: largeCustomers.length,
          total_portions: regularCustomers.length + largeCustomers.length,
          total_recipe_cost_cents: totalCogs,
          cogs_per_portion_cents: cogsPerPortion,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching recipe details:', error);
    res.status(500).json({ error: 'Failed to fetch recipe details', details: error.message });
  }
});

module.exports = router;
