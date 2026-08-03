const pool = require('../config/db')

// Real per-serving ingredient needs + cost for a recipe (mirrors adminMenuPlanner.js).
// Extracted from the old taskManagementAuto.js so it survives that file's removal.
async function getRecipeIngredientNeeds(recipeId, servings) {
  const ingredientsResult = await pool.query(
    `SELECT ri.quantity_g, i.id AS inventory_id, i.name, i.store, i.unit_price_cents
     FROM recipe_ingredients ri
     JOIN inventory i ON ri.inventory_id = i.id
     WHERE ri.recipe_id = $1`,
    [recipeId]
  )
  return ingredientsResult.rows.map((ing) => ({
    inventoryId: ing.inventory_id,
    name: ing.name,
    store: ing.store,
    unitPriceCents: ing.unit_price_cents,
    gramsNeeded: (ing.quantity_g || 0) * servings,
  }))
}

module.exports = { getRecipeIngredientNeeds }
