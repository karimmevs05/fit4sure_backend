const pool = require('../config/db')

const GRAMS_PER_POUND = 453.592

// When an inventory item has never had a price entered, fall back to the
// real price we last actually paid for it on a scanned/logged receipt --
// last_purchase_price_cents ÷ last_purchase_weight_g, both real fields off
// a real purchase -- instead of silently treating the ingredient as free.
// "Not currently in stock" never blocks this: current_stock_g plays no part
// in the lookup, only whether a real historical price exists.
// last_purchase_weight_g is null for receipts scanned before that field
// existed, so this can still come back empty for older items -- honest
// null, not a guess.
async function getReceiptFallbackPriceCents(name) {
  const result = await pool.query(
    `SELECT last_purchase_price_cents, last_purchase_weight_g
     FROM receipt_products
     WHERE last_purchase_weight_g > 0
       AND (LOWER(name) LIKE '%' || LOWER($1) || '%' OR LOWER($1) LIKE '%' || LOWER(name) || '%')
     ORDER BY purchase_count DESC, last_purchase_date DESC
     LIMIT 1`,
    [name]
  )
  const row = result.rows[0]
  if (!row) return null
  return Math.round(row.last_purchase_price_cents / (row.last_purchase_weight_g / GRAMS_PER_POUND))
}

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

  const rows = ingredientsResult.rows
  const fallbackByInventoryId = {}
  for (const ing of rows) {
    if (ing.unit_price_cents != null) continue
    const fallbackCents = await getReceiptFallbackPriceCents(ing.name)
    if (fallbackCents != null) fallbackByInventoryId[ing.inventory_id] = fallbackCents
  }

  return rows.map((ing) => {
    const fallbackCents = fallbackByInventoryId[ing.inventory_id]
    return {
      inventoryId: ing.inventory_id,
      name: ing.name,
      store: ing.store,
      unitPriceCents: ing.unit_price_cents ?? fallbackCents ?? null,
      pricedFromReceipt: ing.unit_price_cents == null && fallbackCents != null,
      gramsNeeded: (ing.quantity_g || 0) * servings,
    }
  })
}

module.exports = { getRecipeIngredientNeeds, getReceiptFallbackPriceCents }
