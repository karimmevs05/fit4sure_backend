const express = require('express')
const router = express.Router()
const pool = require('../../config/db')

// ============================================================================
// PRODUCTION PLAN -- fully live-computed from real Menu Planner plates,
// real recipe ingredients, real inventory prices, and real order counts
// (where they exist yet). Nothing is persisted on each view -- this avoids
// the old bug where every page load inserted a brand new duplicate plan.
// ============================================================================

// Real per-serving ingredient needs + cost for a recipe (mirrors adminMenuPlanner.js)
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

// Real weeks that actually have plates built in Menu Planner, for the week selector
router.get('/weeks-with-plates', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT planned_week_start FROM menus WHERE planned_week_start IS NOT NULL ORDER BY planned_week_start DESC`
    )
    res.json({ success: true, weeks: result.rows.map((r) => r.planned_week_start) })
  } catch (error) {
    console.error('Error fetching weeks with plates:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/auto-generate-plan', async (req, res) => {
  try {
    // Target week: defaults to next week's Sunday, same as Menu Planner
    let { week_start } = req.body
    if (!week_start) {
      const nextWeekResult = await pool.query(`
        SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day' + interval '7 days')::date AS sunday
      `)
      week_start = nextWeekResult.rows[0].sunday
    }

    // Real plates planned for this week (from Menu Planner)
    const platesResult = await pool.query(
      `SELECT id, name, category, delivery_day, large_variant_of
       FROM menus
       WHERE planned_week_start = $1
       ORDER BY delivery_day, large_variant_of NULLS FIRST, name`,
      [week_start]
    )
    const plates = platesResult.rows

    if (plates.length === 0) {
      return res.json({
        success: true,
        summary: { active_customers: 0, estimated_meals: 0, plates: 0 },
        schedule: [],
        procurement: { suppliers: 0, total_cost: 0, orders: {} },
        labor: [],
        message: `No plates have been built yet for the week of ${week_start}. Build plates in Menu Planner first.`,
      })
    }

    // Real order counts for this week, if any exist yet (won't for a future
    // week that hasn't opened for ordering) -- honest 0 rather than a guess
    const orderCountsResult = await pool.query(
      `SELECT menu_id, SUM(quantity) AS total_qty, COUNT(DISTINCT customer_id) AS customers
       FROM orders
       WHERE (date_trunc('week', created_at + interval '1 day') - interval '1 day') = $1
       GROUP BY menu_id`,
      [week_start]
    )
    const orderCountsByMenu = {}
    let totalCustomers = 0
    for (const row of orderCountsResult.rows) {
      orderCountsByMenu[row.menu_id] = parseFloat(row.total_qty) || 0
      totalCustomers = Math.max(totalCustomers, parseInt(row.customers) || 0)
    }
    const hasRealOrders = orderCountsResult.rows.length > 0

    // Ingredient totals per plate (real recipe composition x real inventory cost)
    let totalMeals = 0
    const ingredientTotals = {} // inventoryId -> { name, store, unitPriceCents, gramsNeeded }
    const scheduleByDay = { Saturday: [], Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] }

    for (const plate of plates) {
      const recipesResult = await pool.query(
        `SELECT mpr.recipe_id, mpr.servings, r.name AS recipe_name
         FROM menu_plan_recipes mpr
         JOIN recipes r ON mpr.recipe_id = r.recipe_id
         WHERE mpr.menu_id = $1`,
        [plate.id]
      )

      // Real quantity if orders exist; otherwise flagged as an estimate
      const realQty = orderCountsByMenu[plate.id]
      const quantity = realQty != null ? realQty : null
      if (realQty != null) totalMeals += realQty

      for (const r of recipesResult.rows) {
        const ingredients = await getRecipeIngredientNeeds(r.recipe_id, parseFloat(r.servings))
        // Scale by real order quantity when known; otherwise show per-batch
        // needs for 1x the plate (staff can scale manually until orders come in)
        const scaleFactor = quantity != null ? quantity : 1
        for (const ing of ingredients) {
          if (!ingredientTotals[ing.inventoryId]) {
            ingredientTotals[ing.inventoryId] = { name: ing.name, store: ing.store, unitPriceCents: ing.unitPriceCents, gramsNeeded: 0 }
          }
          ingredientTotals[ing.inventoryId].gramsNeeded += ing.gramsNeeded * scaleFactor
        }
      }

      // Schedule: prep/cook happens before the delivery day, packaging on it.
      // Monday delivery -> prep Saturday, cook Sunday, pack/deliver Monday.
      // Thursday delivery -> prep+cook Wednesday, pack/deliver Thursday.
      const planItem = {
        plate_id: plate.id,
        plate_name: plate.name,
        category: plate.category,
        quantity: quantity,
        quantity_is_estimate: quantity == null,
      }

      if (plate.delivery_day === 'monday') {
        scheduleByDay.Saturday.push({ ...planItem, task: 'Vegetable prep, portioning' })
        scheduleByDay.Sunday.push({ ...planItem, task: 'Cook proteins, assemble, QC' })
        scheduleByDay.Monday.push({ ...planItem, task: 'Pack & deliver' })
      } else if (plate.delivery_day === 'thursday') {
        scheduleByDay.Wednesday.push({ ...planItem, task: 'Prep, cook, assemble' })
        scheduleByDay.Thursday.push({ ...planItem, task: 'Pack & deliver' })
      }
    }

    // Procurement: group real ingredient needs by real vendor (inventory.store)
    const supplierOrders = {}
    let totalProcurementCostCents = 0

    for (const ing of Object.values(ingredientTotals)) {
      const supplier = ing.store || 'Unspecified supplier'
      if (!supplierOrders[supplier]) supplierOrders[supplier] = { items: [], total_cost: 0 }

      const pounds = ing.gramsNeeded / 453.592
      const costCents = ing.unitPriceCents != null ? pounds * ing.unitPriceCents : null

      supplierOrders[supplier].items.push({
        ingredient: ing.name,
        quantity: +pounds.toFixed(2),
        unit: 'lbs',
        cost_per_lb: ing.unitPriceCents != null ? +(ing.unitPriceCents / 100).toFixed(2) : null,
        total_cost: costCents != null ? +(costCents / 100).toFixed(2) : null,
      })
      if (costCents != null) {
        supplierOrders[supplier].total_cost += costCents / 100
        totalProcurementCostCents += costCents
      }
    }

    // Labor: formula-based estimate, not derived from stored historical data
    // -- an honest planning heuristic, scaled to real (or estimated) meal volume
    const laborBasis = hasRealOrders ? totalMeals : plates.length * 10 // rough fallback if no real orders yet
    const laborPlan = [
      { role: 'HEAD_CHEF', target_hours: Math.ceil(laborBasis / 11), hourly_rate: 28 },
      { role: 'LINE_COOK', target_hours: Math.ceil(laborBasis / 22), hourly_rate: 18 },
      { role: 'PREP_STAFF', target_hours: Math.ceil(laborBasis / 30), hourly_rate: 14 },
      { role: 'PACKAGING', target_hours: Math.ceil(laborBasis / 50), hourly_rate: 12 },
    ].map((r) => ({ ...r, budget_cost: +(r.target_hours * r.hourly_rate).toFixed(2) }))

    res.json({
      success: true,
      summary: {
        week_start,
        active_customers: totalCustomers,
        estimated_meals: hasRealOrders ? totalMeals : null,
        meals_are_estimate: !hasRealOrders,
        plates: plates.length,
      },
      schedule: scheduleByDay,
      procurement: {
        suppliers: Object.keys(supplierOrders).length,
        total_cost: +(totalProcurementCostCents / 100).toFixed(2),
        orders: supplierOrders,
      },
      labor: laborPlan,
    })
  } catch (error) {
    console.error('Error generating production plan:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
