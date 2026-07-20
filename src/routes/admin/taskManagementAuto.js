const express = require('express')
const router = express.Router()
const pool = require('../../config/db')

// ============================================================================
// AUTO-GENERATE PRODUCTION PLAN FROM MENU & ORDERS
// ============================================================================

// Generate production plan for upcoming week based on actual customers
router.post('/auto-generate-plan', async (req, res) => {
  try {
    // Auto-detect current week if not provided
    let { week_start, week_end } = req.body

    if (!week_start || !week_end) {
      const today = new Date()
      const saturday = new Date(today)
      saturday.setDate(today.getDate() - today.getDay() + 6) // This Saturday
      const nextSaturday = new Date(saturday)
      nextSaturday.setDate(saturday.getDate() + 7)

      week_start = saturday.toISOString().split('T')[0]
      week_end = nextSaturday.toISOString().split('T')[0]
    }

    // 1. Get latest menu week
    const latestMenuResult = await pool.query(
      `SELECT id, week_label FROM menus ORDER BY created_at DESC LIMIT 1`
    )
    const latestMenu = latestMenuResult.rows[0]

    if (!latestMenu) {
      return res.status(400).json({ error: 'No menus found in database' })
    }

    // 2. Get all recipes in this week's menu
    const recipesResult = await pool.query(
      `SELECT
        mr.id,
        mr.recipe_name,
        mr.day_of_week,
        mr.position
       FROM menu_recipes mr
       WHERE mr.menu_id = $1
       ORDER BY mr.day_of_week, mr.position`,
      [latestMenu.id]
    )
    const recipes = recipesResult.rows

    // 3. Get total meal count from order_totals for this menu
    const ordersResult = await pool.query(
      `SELECT
        COUNT(DISTINCT customer_id) as active_customers,
        SUM(total_meals) as total_meals
       FROM order_totals
       WHERE menu_id = $1`,
      [latestMenu.id]
    )
    const orderStats = ordersResult.rows[0]
    const totalExpectedMeals = orderStats.total_meals || recipes.length * 5

    // 4. Create production plan
    const planResult = await pool.query(
      `INSERT INTO production_plans (week_start, week_end, status, notes, created_at, updated_at)
       VALUES ($1, $2, 'PENDING', $3, NOW(), NOW())
       RETURNING *`,
      [
        week_start,
        week_end,
        `Auto-generated for ${latestMenu.week_label}. Expected ${Math.round(totalExpectedMeals)} meals from ${orderStats.active_customers || 0} customers. ${recipes.length} recipes.`
      ]
    )
    const plan = planResult.rows[0]

    // 5. Dummy ingredients for now (will be replaced with actual recipe ingredients)
    const ingredients = recipes.map(r => ({
      ingredient: r.recipe_name,
      component_type: 'RECIPE',
      meals_using: 1
    }))

    // 6. Map production schedule to operational calendar
    const scheduleMap = generateOperationalSchedule(week_start, recipes, totalExpectedMeals)

    // 7. Create production schedule items for each day
    for (const daySchedule of scheduleMap) {
      await pool.query(
        `INSERT INTO production_schedule (plan_id, meal_id, target_quantity, target_time_minutes, created_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          plan.id,
          latestMenu.id, // Reference the menu week, not individual recipe
          Math.ceil(daySchedule.quantity),
          Math.round(daySchedule.time_minutes),
          daySchedule.date,
          daySchedule.station
        ]
      )
    }

    // 8. Calculate ingredient orders and costs
    const procurementPlan = await calculateProcurementPlan(plan.id, recipes, ingredients, week_start)

    // 9. Create labor plan
    await createLaborPlan(plan.id, totalExpectedMeals)

    res.json({
      success: true,
      plan: plan,
      summary: {
        active_customers: orderStats.active_customers || 0,
        estimated_meals: totalExpectedMeals,
        menu: latestMenu.week_label,
        recipes: recipes.length,
        ingredients: ingredients.length
      },
      recipes: recipes,
      ingredients: ingredients,
      schedule: scheduleMap.slice(0, 5),
      procurement: procurementPlan
    })
  } catch (error) {
    console.error('Error auto-generating production plan:', error)
    res.status(500).json({ error: error.message, stack: error.stack })
  }
})

// ============================================================================
// CREATE LABOR PLAN
// ============================================================================

async function createLaborPlan(planId, totalMeals) {
  try {
    // Calculate labor needs based on meal volume
    const laborRoles = [
      { role: 'HEAD_CHEF', target_hours: Math.ceil(totalMeals / 11), hourly_rate: 28 },
      { role: 'LINE_COOK', target_hours: Math.ceil(totalMeals / 22), hourly_rate: 18 },
      { role: 'PREP_STAFF', target_hours: Math.ceil(totalMeals / 30), hourly_rate: 14 },
      { role: 'PACKAGING', target_hours: Math.ceil(totalMeals / 50), hourly_rate: 12 }
    ]

    for (const role of laborRoles) {
      await pool.query(
        `INSERT INTO labor_plan (plan_id, role, target_hours, budget_cost)
         VALUES ($1, $2, $3, $4)`,
        [planId, role.role, role.target_hours, role.target_hours * role.hourly_rate]
      )
    }
  } catch (error) {
    console.error('Error creating labor plan:', error)
  }
}

// ============================================================================
// OPERATIONAL CALENDAR MAPPING
// ============================================================================

function generateOperationalSchedule(weekStart, recipes, totalMeals) {
  const startDate = new Date(weekStart)
  const schedule = []

  // Distribute meals evenly across recipes
  const mealsPerRecipe = Math.ceil(totalMeals / Math.max(recipes.length, 1))

  // Distribute meals across days
  const mealDistribution = {
    Saturday: 0.25,
    Sunday: 0.35,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0.20,
    Thursday: 0,
    Friday: 0.20
  }

  recipes.forEach((recipe) => {
    const avgTime = 90
    const portionsPerRecipe = mealsPerRecipe

    // Saturday: Vegetable prep
    schedule.push({
      meal_id: recipe.id,
      meal_name: recipe.recipe_name,
      date: addDays(startDate, 0),
      station: 'VEG_PREP',
      type: 'PREP',
      quantity: Math.ceil(portionsPerRecipe * mealDistribution.Saturday),
      time_minutes: avgTime * mealDistribution.Saturday
    })

    // Sunday: Cooking & assembly
    schedule.push({
      meal_id: recipe.id,
      meal_name: recipe.recipe_name,
      date: addDays(startDate, 1),
      station: 'COOKING',
      type: 'COOK',
      quantity: Math.ceil(portionsPerRecipe * mealDistribution.Sunday),
      time_minutes: avgTime * mealDistribution.Sunday
    })

    // Wednesday: Mid-week prep/cook
    schedule.push({
      meal_id: recipe.id,
      meal_name: recipe.recipe_name,
      date: addDays(startDate, 4),
      station: 'PREP_COOK',
      type: 'PREP_COOK',
      quantity: Math.ceil(portionsPerRecipe * mealDistribution.Wednesday),
      time_minutes: avgTime * mealDistribution.Wednesday
    })

    // Friday: Final assembly
    schedule.push({
      meal_id: recipe.id,
      meal_name: recipe.recipe_name,
      date: addDays(startDate, 5),
      station: 'PACKAGING',
      type: 'PACKAGING',
      quantity: Math.ceil(portionsPerRecipe * mealDistribution.Friday),
      time_minutes: 45
    })
  })

  return schedule
}

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result.toISOString().split('T')[0]
}

// ============================================================================
// PROCUREMENT PLAN (Auto-calculate ingredient orders)
// ============================================================================

async function calculateProcurementPlan(planId, recipes, ingredients, weekStart) {
  try {
    // Map ingredient names to suppliers (hardcoded for now, can be from DB)
    const supplierMap = {
      'Chicken': { supplier: 'FreshMeat Co', cost: 2.45, unit: 'lbs' },
      'Ground Beef': { supplier: 'Premium Proteins', cost: 3.65, unit: 'lbs' },
      'Ground Turkey': { supplier: 'FreshMeat Co', cost: 2.10, unit: 'lbs' },
      'Salmon': { supplier: 'SeaFresh Inc', cost: 6.50, unit: 'lbs' },
      'Potatoes': { supplier: 'Organic Farm', cost: 0.80, unit: 'lbs' },
      'Rice': { supplier: 'Pasta & Grains', cost: 0.50, unit: 'lbs' },
      'Broccoli': { supplier: 'Organic Farm', cost: 1.50, unit: 'lbs' },
      'Asparagus': { supplier: 'Organic Farm', cost: 2.00, unit: 'lbs' },
      'Zucchini': { supplier: 'Organic Farm', cost: 1.20, unit: 'lbs' },
      'Quinoa': { supplier: 'Pasta & Grains', cost: 1.80, unit: 'lbs' }
    }

    // Group orders by supplier
    const supplierOrders = {}
    let totalCost = 0

    ingredients.forEach(ing => {
      const supplierInfo = supplierMap[ing.ingredient] || {
        supplier: 'Pantry Basics',
        cost: 1.00,
        unit: 'lbs'
      }
      const supplier = supplierInfo.supplier

      if (!supplierOrders[supplier]) {
        supplierOrders[supplier] = { items: [], total_cost: 0 }
      }

      // Estimate quantity needed (meals using this ingredient × average quantity)
      const mealsUsingThisIngredient = ing.meals_using || 1
      const estimatedQuantity = (mealsUsingThisIngredient * 20) // rough estimate
      const cost = estimatedQuantity * supplierInfo.cost
      totalCost += cost

      supplierOrders[supplier].items.push({
        ingredient: ing.ingredient,
        quantity: estimatedQuantity,
        unit: supplierInfo.unit,
        cost_per_unit: supplierInfo.cost,
        total_cost: cost
      })

      supplierOrders[supplier].total_cost += cost
    })

    // Save procurement orders to database
    for (const [supplier, details] of Object.entries(supplierOrders)) {
      await pool.query(
        `INSERT INTO procurement_plan (plan_id, supplier_name, order_date, delivery_date, total_cost, items_json, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
        [
          planId,
          supplier,
          addDays(new Date(weekStart), 1), // Order Sunday
          addDays(new Date(weekStart), 5), // Delivery Friday
          details.total_cost,
          JSON.stringify(details.items)
        ]
      )
    }

    return {
      suppliers: Object.keys(supplierOrders).length,
      total_cost: totalCost,
      orders: supplierOrders
    }
  } catch (error) {
    console.error('Error calculating procurement plan:', error)
    return null
  }
}

// ============================================================================
// GET FULL PRODUCTION PLAN WITH TIMELINE
// ============================================================================

router.get('/production-plan/:id/full-timeline', async (req, res) => {
  try {
    const { id } = req.params

    // Get plan
    const planResult = await pool.query(
      `SELECT * FROM production_plans WHERE id = $1`,
      [id]
    )
    const plan = planResult.rows[0]

    // Get schedule grouped by day/station
    const scheduleResult = await pool.query(
      `SELECT
        ps.created_date as date,
        ps.station,
        COUNT(*) as task_count,
        SUM(ps.target_quantity) as total_qty,
        SUM(ps.target_time_minutes) as total_time,
        json_agg(json_build_object(
          'id', ps.id,
          'meal_name', m.name,
          'quantity', ps.target_quantity,
          'time', ps.target_time_minutes,
          'protein', m.protein,
          'carb', m.carb,
          'vegetable', m.vegetable
        )) as meals
       FROM production_schedule ps
       LEFT JOIN menus m ON ps.meal_id = m.id
       WHERE ps.plan_id = $1
       GROUP BY ps.created_date, ps.station
       ORDER BY ps.created_date, ps.station`,
      [id]
    )
    const schedule = scheduleResult.rows

    // Get procurement plan
    const procurementResult = await pool.query(
      `SELECT
        supplier_name,
        order_date,
        delivery_date,
        total_cost,
        status,
        items_json
       FROM procurement_plan
       WHERE plan_id = $1
       ORDER BY order_date`,
      [id]
    )
    const procurement = procurementResult.rows

    // Get labor plan
    const laborResult = await pool.query(
      `SELECT * FROM labor_plan WHERE plan_id = $1`,
      [id]
    )
    const laborPlan = laborResult.rows

    // Format timeline
    const timeline = []
    const weekDays = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const startDate = new Date(plan.week_start)

    weekDays.forEach((day, idx) => {
      const date = addDays(startDate, idx)
      const daySchedule = schedule.filter(s => s.date === date)
      const dayProcurement = procurement.filter(p => new Date(p.order_date).toISOString().split('T')[0] === date)

      timeline.push({
        day: day,
        date: date,
        activity_type: getActivityType(day),
        production: daySchedule,
        procurement: dayProcurement,
        notes: getActivityNotes(day)
      })
    })

    res.json({
      plan: plan,
      timeline: timeline,
      labor_plan: laborPlan,
      total_procurement_cost: procurement.reduce((sum, p) => sum + p.total_cost, 0)
    })
  } catch (error) {
    console.error('Error fetching production plan timeline:', error)
    res.status(500).json({ error: error.message })
  }
})

function getActivityType(day) {
  const types = {
    'Saturday': 'PREP',
    'Sunday': 'COOK',
    'Monday': 'DELIVERY',
    'Tuesday': 'ADMIN_SHOPPING',
    'Wednesday': 'PREP_COOK',
    'Thursday': 'DELIVERY',
    'Friday': 'ADMIN'
  }
  return types[day] || 'OTHER'
}

function getActivityNotes(day) {
  const notes = {
    'Saturday': 'Vegetable prep, portioning, component prep',
    'Sunday': 'Cook proteins, assemble meals, final QC',
    'Monday': 'Pack meals, load delivery, ship to customers',
    'Tuesday': 'Shopping, restocking, admin & planning for rest of week',
    'Wednesday': 'Mid-week prep/cook for Thursday delivery',
    'Thursday': 'Pack & deliver mid-week orders',
    'Friday': 'Weekly wrap-up, inventory audit, planning next week'
  }
  return notes[day] || ''
}

// ============================================================================
// PROCUREMENT PLAN TABLE
// ============================================================================

router.get('/procurement-plan/:plan_id', async (req, res) => {
  try {
    const { plan_id } = req.params

    const result = await pool.query(
      `SELECT
        id,
        supplier_name,
        order_date,
        delivery_date,
        total_cost,
        status,
        items_json,
        created_at
       FROM procurement_plan
       WHERE plan_id = $1
       ORDER BY order_date`,
      [plan_id]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching procurement plan:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update procurement status
router.put('/procurement-plan/:id/status', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const result = await pool.query(
      `UPDATE procurement_plan SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating procurement status:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
