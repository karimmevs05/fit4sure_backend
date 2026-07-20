const express = require('express')
const pool = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')

const router = express.Router()

// Unit conversion helper - convert any unit to grams
function convertToGrams(quantity, unit) {
  const conversions = {
    'g': 1,
    'kg': 1000,
    'oz': 28.3495,
    'lb': 453.592,
    'cup': 240,
    'tbsp': 15,
    'tsp': 5,
    'ml': 1,
    'l': 1000,
  }
  return (quantity || 0) * (conversions[unit?.toLowerCase()] || 1)
}

// Calculate cost in cents from price per pound
function calculateIngredientCost(pricePerPound, quantityG) {
  if (!pricePerPound) return 0
  // pricePerPound is in dollars, convert to cents and calculate cost per gram
  const priceCentsPerGram = (pricePerPound * 100) / 453.592
  return Math.round(priceCentsPerGram * quantityG)
}

// Calculate recipe macros from ingredients
async function calculateRecipeMacros(recipeId, servings) {
  const ingredientsResult = await pool.query(
    `SELECT ri.quantity_g, i.protein_per_100g, i.carbs_per_100g, i.fat_per_100g, i.calories_per_100g
     FROM recipe_ingredients ri
     LEFT JOIN inventory i ON ri.inventory_id = i.id
     WHERE ri.recipe_id = $1`,
    [recipeId]
  )

  if (ingredientsResult.rows.length === 0) {
    return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  }

  // Sum macros for all ingredients
  let totalCalories = 0
  let totalProtein = 0
  let totalCarbs = 0
  let totalFat = 0

  for (const ing of ingredientsResult.rows) {
    if (ing.quantity_g && ing.calories_per_100g) {
      totalCalories += (ing.calories_per_100g * ing.quantity_g) / 100
      totalProtein += (ing.protein_per_100g * ing.quantity_g) / 100
      totalCarbs += (ing.carbs_per_100g * ing.quantity_g) / 100
      totalFat += (ing.fat_per_100g * ing.quantity_g) / 100
    }
  }

  // Divide by servings to get per-serving macros
  const divisor = servings || 1
  return {
    calories: Math.round(totalCalories / divisor),
    protein_g: (totalProtein / divisor).toFixed(1),
    carbs_g: (totalCarbs / divisor).toFixed(1),
    fat_g: (totalFat / divisor).toFixed(1)
  }
}

// GET /api/admin/recipes - List all recipes with calculated costs and macros from ingredients
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM recipes ORDER BY name')

    // For each recipe, calculate cost and macros from ingredients
    const recipesWithCosts = await Promise.all(
      result.rows.map(async (recipe) => {
        try {
          const ingredientsResult = await pool.query(
            `SELECT ri.quantity_g, i.price_per_pound
             FROM recipe_ingredients ri
             LEFT JOIN inventory i ON ri.inventory_id = i.id
             WHERE ri.recipe_id = $1`,
            [recipe.recipe_id]
          )

          // Calculate total cost from ingredients
          const totalCostCents = ingredientsResult.rows.reduce((sum, ing) => {
            return sum + calculateIngredientCost(ing.price_per_pound, ing.quantity_g)
          }, 0)

          const costPerServingCents = recipe.servings ? Math.round(totalCostCents / recipe.servings) : 0

          // Calculate macros from ingredients
          const macros = await calculateRecipeMacros(recipe.recipe_id, recipe.servings)

          return {
            ...recipe,
            ...macros,
            cost_per_serving_cents: costPerServingCents,
            total_recipe_cost_cents: totalCostCents
          }
        } catch (err) {
          console.error(`Error calculating cost for recipe ${recipe.recipe_id}:`, err)
          return recipe
        }
      })
    )

    res.json({ data: recipesWithCosts })
  } catch (err) {
    console.error('Recipe list error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/recipes - Create recipe
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, category, prep_time_minutes, servings, instructions, calories, protein_g, carbs_g, fat_g, tags, ingredients } = req.body

  if (!name) return res.status(400).json({ error: 'name is required' })

  try {
    // Calculate cost from ingredients
    let cost = 0
    if (ingredients && ingredients.length > 0) {
      cost = Math.round(ingredients.reduce((sum, ing) => sum + (ing.cost_cents || 0), 0) / (servings || 1))
    }

    const recipeResult = await pool.query(
      `INSERT INTO recipes (
        name, category, prep_time_minutes, servings, instructions,
        calories, protein_g, carbs_g, fat_g, cost_per_serving_cents, tags,
        created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [name, category || null, prep_time_minutes || null, servings || 1, instructions || null,
       calories || 0, protein_g || 0, carbs_g || 0, fat_g || 0, cost, tags || [], req.userId]
    )

    const recipe = recipeResult.rows[0]

    // Insert ingredients
    if (ingredients && ingredients.length > 0) {
      for (const ing of ingredients) {
        await pool.query(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit, cost_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [recipe.recipe_id, ing.ingredient_name, ing.quantity, ing.unit || 'g', ing.cost_cents || 0]
        )
      }
    }

    res.status(201).json(recipe)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/recipes/:recipe_id - Get single recipe with ingredients, pricing, and macros
router.get('/:recipe_id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const recipeResult = await pool.query(
      'SELECT * FROM recipes WHERE recipe_id = $1',
      [req.params.recipe_id]
    )

    if (!recipeResult.rows[0]) return res.status(404).json({ error: 'Recipe not found' })

    const ingredientsResult = await pool.query(
      `SELECT ri.id, ri.inventory_id, i.name, ri.quantity_g, i.price_per_pound, i.protein_per_100g, i.carbs_per_100g, i.fat_per_100g, i.calories_per_100g
       FROM recipe_ingredients ri
       LEFT JOIN inventory i ON ri.inventory_id = i.id
       WHERE ri.recipe_id = $1
       ORDER BY i.name`,
      [req.params.recipe_id]
    )

    // Calculate costs for each ingredient
    const ingredientsWithCosts = ingredientsResult.rows.map(ing => ({
      ...ing,
      ingredient_cost_cents: calculateIngredientCost(ing.price_per_pound, ing.quantity_g)
    }))

    // Calculate total cost from ingredients
    const totalCostCents = ingredientsWithCosts.reduce((sum, ing) => sum + (ing.ingredient_cost_cents || 0), 0)
    const costPerServingCents = recipeResult.rows[0].servings ? Math.round(totalCostCents / recipeResult.rows[0].servings) : 0

    // Calculate macros from ingredients
    const macros = await calculateRecipeMacros(req.params.recipe_id, recipeResult.rows[0].servings)

    res.json({
      data: {
        ...recipeResult.rows[0],
        ...macros,
        cost_per_serving_cents: costPerServingCents,
        total_recipe_cost_cents: totalCostCents,
        ingredients: ingredientsWithCosts
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/recipes/:recipe_id - Update recipe
router.put('/:recipe_id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, category, prep_time_minutes, servings, instructions, calories, protein_g, carbs_g, fat_g, image } = req.body

  if (!name) return res.status(400).json({ error: 'name is required' })

  try {
    const result = await pool.query(
      `UPDATE recipes SET
        name = $1, category = $2, prep_time_minutes = $3, servings = $4,
        instructions = $5, calories = $6, protein_g = $7, carbs_g = $8,
        fat_g = $9, image = $10, updated_at = NOW()
       WHERE recipe_id = $11
       RETURNING *`,
      [name, category || null, prep_time_minutes || null, servings || 1, instructions || null,
       calories || 0, protein_g || 0, carbs_g || 0, fat_g || 0, image || null, req.params.recipe_id]
    )

    if (!result.rows[0]) return res.status(404).json({ error: 'Recipe not found' })

    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('Recipe update error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/admin/recipes/:recipe_id - Delete recipe
router.delete('/:recipe_id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [req.params.recipe_id])
    const result = await pool.query('DELETE FROM recipes WHERE recipe_id = $1 RETURNING recipe_id', [req.params.recipe_id])

    if (!result.rows[0]) return res.status(404).json({ error: 'Recipe not found' })

    res.json({ message: 'Recipe deleted' })
  } catch (err) {
    console.error('Recipe delete error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
