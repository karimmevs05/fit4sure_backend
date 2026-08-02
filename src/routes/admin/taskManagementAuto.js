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

// Which physical station each task type happens at
const STATIONS = {
  'Vegetable prep, portioning': 'Veg Prep Station',
  'Cook proteins, assemble, QC': 'Cooking Station',
  'Prep, cook, assemble': 'Prep+Cook Station',
  'Pack & deliver': 'Packaging & Loading',
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

    // Real completion/notes state already saved for this week, keyed by
    // (day, plate_id) -- overlaid onto the live-computed schedule below
    const statusResult = await pool.query(
      `SELECT day, plate_id, completed, completed_at, actual_quantity, notes
       FROM production_task_status WHERE week_start = $1`,
      [week_start]
    )
    const statusByDayPlate = {}
    for (const row of statusResult.rows) {
      statusByDayPlate[`${row.day}:${row.plate_id}`] = row
    }

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
      const scaleFactor = quantity != null ? quantity : 1

      const plateRecipes = []

      for (const r of recipesResult.rows) {
        const ingredients = await getRecipeIngredientNeeds(r.recipe_id, parseFloat(r.servings))

        plateRecipes.push({
          recipe_name: r.recipe_name,
          servings_per_plate: parseFloat(r.servings),
          ingredients: ingredients.map((ing) => ({
            name: ing.name,
            store: ing.store,
            pounds_needed: +((ing.gramsNeeded * scaleFactor) / 453.592).toFixed(2),
            cost: ing.unitPriceCents != null ? +(((ing.gramsNeeded * scaleFactor) / 453.592) * (ing.unitPriceCents / 100)).toFixed(2) : null,
          })),
        })

        // Scale by real order quantity when known; otherwise show per-batch
        // needs for 1x the plate (staff can scale manually until orders come in)
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
        recipes: plateRecipes,
      }

      // Pack/deliver tasks are always critical (customer-facing deadline).
      // Prep/cook tasks are critical once real orders confirm they're needed.
      const packDeliverCritical = true
      const prepCookCritical = quantity != null

      const pushDay = (day, task) => {
        const status = statusByDayPlate[`${day}:${plate.id}`]
        scheduleByDay[day].push({
          ...planItem,
          task,
          station: STATIONS[task] || 'General',
          critical: task === 'Pack & deliver' ? packDeliverCritical : prepCookCritical,
          completed: status?.completed || false,
          completed_at: status?.completed_at || null,
          actual_quantity: status?.actual_quantity != null ? parseFloat(status.actual_quantity) : null,
          notes: status?.notes || '',
        })
      }

      if (plate.delivery_day === 'monday') {
        pushDay('Saturday', 'Vegetable prep, portioning')
        pushDay('Sunday', 'Cook proteins, assemble, QC')
        pushDay('Monday', 'Pack & deliver')
      } else if (plate.delivery_day === 'thursday') {
        pushDay('Wednesday', 'Prep, cook, assemble')
        pushDay('Thursday', 'Pack & deliver')
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

// ============================================================================
// TASK STATUS -- mark complete, log actual quantity, add notes.
// Upserts on (week_start, day, plate_id) -- never creates duplicates no
// matter how many times it's called.
// ============================================================================
router.post('/task-status', async (req, res) => {
  try {
    const { week_start, day, plate_id, completed, actual_quantity, notes } = req.body
    if (!week_start || !day || !plate_id) {
      return res.status(400).json({ error: 'week_start, day, and plate_id are required' })
    }

    const result = await pool.query(
      `INSERT INTO production_task_status (week_start, day, plate_id, completed, completed_at, actual_quantity, notes, updated_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, $5, $6, NOW())
       ON CONFLICT (week_start, day, plate_id)
       DO UPDATE SET
         completed = $4,
         completed_at = CASE WHEN $4 THEN NOW() ELSE NULL END,
         actual_quantity = COALESCE($5, production_task_status.actual_quantity),
         notes = COALESCE($6, production_task_status.notes),
         updated_at = NOW()
       RETURNING *`,
      [week_start, day, plate_id, completed ?? false, actual_quantity ?? null, notes ?? null]
    )

    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error saving task status:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// ISSUES / REQUESTS -- flag a problem or request a schedule change, with a
// reason and proposed solution. A log, not a single overwritable field.
// ============================================================================
router.get('/issues', async (req, res) => {
  try {
    const { week_start } = req.query
    if (!week_start) return res.status(400).json({ error: 'week_start is required' })

    const result = await pool.query(
      `SELECT i.*, m.name AS plate_name
       FROM production_task_issues i
       LEFT JOIN menus m ON i.plate_id = m.id
       WHERE i.week_start = $1
       ORDER BY i.status = 'open' DESC, i.created_at DESC`,
      [week_start]
    )
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error fetching issues:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/issues', async (req, res) => {
  try {
    const { week_start, day, plate_id, issue_type, reason, proposed_solution } = req.body
    if (!week_start || !day || !issue_type || !reason) {
      return res.status(400).json({ error: 'week_start, day, issue_type, and reason are required' })
    }

    const result = await pool.query(
      `INSERT INTO production_task_issues (week_start, day, plate_id, issue_type, reason, proposed_solution, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW())
       RETURNING *`,
      [week_start, day, plate_id || null, issue_type, reason, proposed_solution || null]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error logging issue:', error)
    res.status(500).json({ error: error.message })
  }
})

router.put('/issues/:id/resolve', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE production_task_issues SET status = 'resolved', resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Issue not found' })
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Error resolving issue:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// SUGGESTIONS -- real flags computed from real data: low stock vs what's
// actually needed this week, and days carrying unusually heavy load.
// ============================================================================
router.get('/suggestions', async (req, res) => {
  try {
    const { week_start } = req.query
    if (!week_start) return res.status(400).json({ error: 'week_start is required' })

    const suggestions = []

    // Low stock: real ingredient need this week vs real current inventory stock
    const plates = await pool.query(`SELECT id FROM menus WHERE planned_week_start = $1`, [week_start])
    const neededByIngredient = {} // inventory_id -> { name, gramsNeeded }

    for (const plate of plates.rows) {
      const recipes = await pool.query(
        `SELECT mpr.recipe_id, mpr.servings FROM menu_plan_recipes mpr WHERE mpr.menu_id = $1`,
        [plate.id]
      )
      const orderQty = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) AS qty FROM orders WHERE menu_id = $1
         AND (date_trunc('week', created_at + interval '1 day') - interval '1 day') = $2`,
        [plate.id, week_start]
      )
      const scale = parseFloat(orderQty.rows[0].qty) || 1

      for (const r of recipes.rows) {
        const ingredients = await getRecipeIngredientNeeds(r.recipe_id, parseFloat(r.servings))
        for (const ing of ingredients) {
          if (!neededByIngredient[ing.inventoryId]) neededByIngredient[ing.inventoryId] = { name: ing.name, gramsNeeded: 0 }
          neededByIngredient[ing.inventoryId].gramsNeeded += ing.gramsNeeded * scale
        }
      }
    }

    const inventoryIds = Object.keys(neededByIngredient)
    if (inventoryIds.length > 0) {
      const stockResult = await pool.query(
        `SELECT id, name, current_stock_g FROM inventory WHERE id = ANY($1::int[])`,
        [inventoryIds]
      )
      for (const item of stockResult.rows) {
        const needed = neededByIngredient[item.id]
        const currentStock = parseFloat(item.current_stock_g) || 0
        if (needed && needed.gramsNeeded > currentStock) {
          suggestions.push({
            type: 'low_stock',
            severity: 'warning',
            message: `${item.name}: need ~${(needed.gramsNeeded / 453.592).toFixed(1)} lbs but only ${(currentStock / 453.592).toFixed(1)} lbs in stock`,
          })
        }
      }
    }

    // Overloaded days: flag any day carrying notably more plates than the week's average
    const scheduleCounts = await pool.query(
      `SELECT delivery_day, COUNT(*) AS plate_count FROM menus WHERE planned_week_start = $1 GROUP BY delivery_day`,
      [week_start]
    )
    if (scheduleCounts.rows.length > 1) {
      const counts = scheduleCounts.rows.map((r) => parseInt(r.plate_count))
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length
      for (const row of scheduleCounts.rows) {
        if (parseInt(row.plate_count) > avg * 1.5) {
          suggestions.push({
            type: 'overloaded_day',
            severity: 'info',
            message: `${row.delivery_day} delivery has ${row.plate_count} plates, notably more than the week's average (${avg.toFixed(1)})`,
          })
        }
      }
    }

    res.json({ success: true, data: suggestions })
  } catch (error) {
    console.error('Error computing suggestions:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// COMPARISON -- this week's planned quantities vs last week's actual
// completion (real data from production_task_status, not a guess)
// ============================================================================
router.get('/comparison', async (req, res) => {
  try {
    const { week_start } = req.query
    if (!week_start) return res.status(400).json({ error: 'week_start is required' })

    const priorWeekResult = await pool.query(`SELECT ($1::date - interval '7 days')::date AS prior`, [week_start])
    const priorWeek = priorWeekResult.rows[0].prior

    const priorStatus = await pool.query(
      `SELECT pts.day, pts.plate_id, m.name AS plate_name, pts.completed, pts.actual_quantity
       FROM production_task_status pts
       JOIN menus m ON pts.plate_id = m.id
       WHERE pts.week_start = $1`,
      [priorWeek]
    )

    const totalTasks = priorStatus.rows.length
    const completedTasks = priorStatus.rows.filter((r) => r.completed).length

    res.json({
      success: true,
      data: {
        prior_week: priorWeek,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        completion_rate: totalTasks > 0 ? +((completedTasks / totalTasks) * 100).toFixed(1) : null,
        tasks: priorStatus.rows,
      },
    })
  } catch (error) {
    console.error('Error computing comparison:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
