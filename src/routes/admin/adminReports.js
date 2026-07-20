const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const db = require('../../config/db');

/**
 * GET /api/admin/reports/weekly-performance
 * Weekly performance KPIs
 */
router.get('/weekly-performance', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // Get revenue
    const revenue = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as total_cents
      FROM financial_entries
      WHERE entry_type = 'purchase' AND created_at >= $1
    `, [weekStart]);

    // Get expenses
    const expenses = await db.query(`
      SELECT COALESCE(SUM(amount_cents), 0) as total_cents
      FROM financial_entries
      WHERE entry_type = 'expense' AND created_at >= $1
    `, [weekStart]);

    // Get order count
    const orders = await db.query(`
      SELECT COUNT(*) as count, COUNT(DISTINCT customer_id) as unique_customers
      FROM orders
      WHERE created_at >= $1
    `, [weekStart]);

    // Get active customers
    const customers = await db.query(`
      SELECT COUNT(*) as active_count
      FROM users
      WHERE role = 'customer' AND last_login >= $1
    `, [weekStart]);

    const totalRevenue = parseInt(revenue.rows[0].total_cents) / 100;
    const totalExpenses = parseInt(expenses.rows[0].total_cents) / 100;
    const margin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        period: 'week',
        revenue: totalRevenue.toFixed(2),
        expenses: totalExpenses.toFixed(2),
        margin: margin + '%',
        orderCount: orders.rows[0].count,
        uniqueCustomers: orders.rows[0].unique_customers,
        activeCustomers: customers.rows[0].active_count
      }
    });
  } catch (error) {
    console.error('Error fetching weekly performance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/kitchen-prep
 * Daily prep schedule and requirements
 */
router.get('/kitchen-prep', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get meals for today's deliveries
    const meals = await db.query(`
      SELECT m.id, m.name, COUNT(bi.id) as quantity, m.prep_time_minutes
      FROM meals m
      LEFT JOIN box_items bi ON m.id = bi.meal_id
      LEFT JOIN boxes b ON bi.box_id = b.id
      LEFT JOIN orders o ON b.id = o.box_id
      WHERE o.delivery_date >= $1 AND o.delivery_date < $2
      GROUP BY m.id, m.name, m.prep_time_minutes
      ORDER BY m.name
    `, [today, tomorrow]);

    // Get ingredients needed
    const ingredients = await db.query(`
      SELECT ri.ingredient_id, i.name, SUM(ri.quantity * bi.quantity) as total_needed, i.unit
      FROM recipe_ingredients ri
      JOIN meals m ON ri.recipe_id = m.id
      JOIN box_items bi ON m.id = bi.meal_id
      JOIN boxes b ON bi.box_id = b.id
      JOIN orders o ON b.id = o.box_id
      LEFT JOIN inventory i ON ri.ingredient_id = i.id
      WHERE o.delivery_date >= $1 AND o.delivery_date < $2
      GROUP BY ri.ingredient_id, i.name, i.unit
      ORDER BY i.name
    `, [today, tomorrow]);

    res.json({
      success: true,
      data: {
        date: today.toISOString().split('T')[0],
        meals: meals.rows,
        ingredients: ingredients.rows,
        totalMealsToPrep: meals.rows.reduce((sum, m) => sum + parseInt(m.quantity || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error fetching kitchen prep:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/inventory-usage
 * Inventory consumption and waste tracking
 */
router.get('/inventory-usage', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get inventory usage from financial entries
    const usage = await db.query(`
      SELECT
        i.name,
        i.unit,
        i.current_quantity,
        i.reorder_point,
        COALESCE(SUM(fe.quantity_grams), 0) as used_grams,
        i.last_restock_date
      FROM inventory i
      LEFT JOIN financial_entries fe ON i.id = fe.inventory_id
        AND fe.entry_type = 'inventory_adjustment' AND fe.created_at >= $1
      GROUP BY i.id, i.name, i.unit, i.current_quantity, i.reorder_point, i.last_restock_date
      ORDER BY i.name
    `, [thirtyDaysAgo]);

    // Identify low stock
    const lowStock = usage.rows.filter(item =>
      item.current_quantity <= (item.reorder_point || 0)
    );

    res.json({
      success: true,
      data: {
        period: '30 days',
        allItems: usage.rows,
        lowStockItems: lowStock,
        lowStockCount: lowStock.length
      }
    });
  } catch (error) {
    console.error('Error fetching inventory usage:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/recipe-profitability
 * Recipe cost and margin analysis
 */
router.get('/recipe-profitability', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const recipes = await db.query(`
      SELECT
        r.id,
        r.name,
        COALESCE(SUM(ri.quantity * rp.last_purchase_price_cents), 0) as total_cost_cents,
        COUNT(DISTINCT bi.id) as times_sold,
        r.prep_time_minutes
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      LEFT JOIN receipt_products rp ON LOWER(ri.ingredient_id::text) = LOWER(rp.id::text)
      LEFT JOIN meals m ON r.id = m.recipe_id
      LEFT JOIN box_items bi ON m.id = bi.meal_id
      GROUP BY r.id, r.name, r.prep_time_minutes
      ORDER BY total_cost_cents DESC
    `);

    res.json({
      success: true,
      data: {
        recipes: recipes.rows.map(r => ({
          id: r.id,
          name: r.name,
          costCents: r.total_cost_cents,
          cost: (r.total_cost_cents / 100).toFixed(2),
          timesSold: r.times_sold,
          prepTimeMinutes: r.prep_time_minutes
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching recipe profitability:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/orders-fulfillment
 * Order status and fulfillment metrics
 */
router.get('/orders-fulfillment', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Get order status breakdown
    const statusBreakdown = await db.query(`
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE created_at >= $1
      GROUP BY status
    `, [weekAgo]);

    // Get fulfillment rate
    const fulfillment = await db.query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'pending' OR status = 'processing' THEN 1 END) as pending,
        COUNT(CASE WHEN delivery_date < NOW() AND status != 'delivered' THEN 1 END) as overdue
      FROM orders
      WHERE created_at >= $1
    `, [weekAgo]);

    const totalOrders = parseInt(fulfillment.rows[0].total_orders);
    const deliveredCount = parseInt(fulfillment.rows[0].delivered);
    const fulfillmentRate = totalOrders > 0 ? ((deliveredCount / totalOrders) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        period: 'last 7 days',
        totalOrders: totalOrders,
        statusBreakdown: statusBreakdown.rows,
        deliveredCount: deliveredCount,
        pendingCount: parseInt(fulfillment.rows[0].pending),
        overdueCount: parseInt(fulfillment.rows[0].overdue),
        fulfillmentRate: fulfillmentRate + '%'
      }
    });
  } catch (error) {
    console.error('Error fetching orders fulfillment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/customers
 * Customer activity and churn analysis
 */
router.get('/customers', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Active customers (ordered in last 30 days)
    const active = await db.query(`
      SELECT COUNT(DISTINCT customer_id) as count
      FROM orders
      WHERE created_at >= $1
    `, [thirtyDaysAgo]);

    // Inactive customers (no orders in last 60 days but had orders before)
    const inactive = await db.query(`
      SELECT COUNT(DISTINCT u.id) as count
      FROM users u
      LEFT JOIN orders o ON u.id = o.customer_id AND o.created_at >= $1
      WHERE u.role = 'customer'
      AND o.id IS NULL
      AND EXISTS (SELECT 1 FROM orders WHERE customer_id = u.id AND created_at < $2)
    `, [thirtyDaysAgo, sixtyDaysAgo]);

    // Repeat customers (2+ orders)
    const repeat = await db.query(`
      SELECT COUNT(DISTINCT customer_id) as count
      FROM orders
      GROUP BY customer_id
      HAVING COUNT(*) >= 2
    `);

    res.json({
      success: true,
      data: {
        activeCustomers: parseInt(active.rows[0].count),
        inactiveCustomers: parseInt(inactive.rows[0].count),
        repeatCustomers: repeat.rows.length,
        churnRate: parseInt(inactive.rows[0].count) > 0 ?
          ((parseInt(inactive.rows[0].count) / (parseInt(active.rows[0].count) + parseInt(inactive.rows[0].count))) * 100).toFixed(2)
          : '0'
      }
    });
  } catch (error) {
    console.error('Error fetching customers report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/delivery
 * Delivery routes and performance
 */
router.get('/delivery', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delivery by zone
    const byZone = await db.query(`
      SELECT dz.name, COUNT(o.id) as order_count, COUNT(DISTINCT o.customer_id) as customer_count
      FROM delivery_zones dz
      LEFT JOIN orders o ON dz.id = o.delivery_zone_id AND o.created_at >= $1
      GROUP BY dz.id, dz.name
      ORDER BY order_count DESC
    `, [thirtyDaysAgo]);

    // On-time delivery rate
    const onTime = await db.query(`
      SELECT
        COUNT(*) as total_delivered,
        COUNT(CASE WHEN delivery_date >= updated_at::date THEN 1 END) as on_time
      FROM orders
      WHERE status = 'delivered' AND created_at >= $1
    `, [thirtyDaysAgo]);

    const totalDelivered = parseInt(onTime.rows[0].total_delivered);
    const onTimeCount = parseInt(onTime.rows[0].on_time);
    const onTimeRate = totalDelivered > 0 ? ((onTimeCount / totalDelivered) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        period: 'last 30 days',
        byZone: byZone.rows,
        onTimeDeliveries: onTimeCount,
        totalDeliveries: totalDelivered,
        onTimeRate: onTimeRate + '%'
      }
    });
  } catch (error) {
    console.error('Error fetching delivery report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/suppliers
 * Supplier performance and pricing
 */
router.get('/suppliers', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Supplier metrics
    const suppliers = await db.query(`
      SELECT
        store,
        COUNT(DISTINCT id) as order_count,
        COALESCE(SUM(total_amount_cents), 0) as total_spent_cents,
        AVG(total_amount_cents) as avg_order_cents,
        MAX(created_at) as last_order_date
      FROM receipts
      WHERE created_at >= $1 AND store IS NOT NULL
      GROUP BY store
      ORDER BY total_spent_cents DESC
    `, [ninetyDaysAgo]);

    res.json({
      success: true,
      data: {
        period: 'last 90 days',
        suppliers: suppliers.rows.map(s => ({
          name: s.store,
          orderCount: s.order_count,
          totalSpent: (s.total_spent_cents / 100).toFixed(2),
          avgOrder: (s.avg_order_cents / 100).toFixed(2),
          lastOrderDate: s.last_order_date
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching suppliers report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/monthly-summary
 * Comprehensive monthly report with insights
 */
router.get('/monthly-summary', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Use all 2026 data since we're tracking historical performance
    const monthStart = new Date('2026-01-01');
    const monthEnd = new Date('2026-07-31');

    // Current month revenue and meals
    const currentMonth = await db.query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(DISTINCT o.customer_id) as active_customers,
        COALESCE(SUM(o.quantity), 0)::integer as total_meals,
        COALESCE(SUM(o.quantity) * 15, 0)::integer as estimated_revenue_dollars
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE m.created_at >= $1 AND m.created_at <= $2
    `, [monthStart, monthEnd]);

    // Last month comparison (use same period for now)
    const lastMonth = await db.query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(DISTINCT o.customer_id) as active_customers,
        COALESCE(SUM(o.quantity), 0)::integer as total_meals,
        COALESCE(SUM(o.quantity) * 15, 0)::integer as estimated_revenue_dollars
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE m.created_at >= $1 AND m.created_at <= $2
    `, [monthStart, monthEnd]);

    // Top customers this month
    const topCustomers = await db.query(`
      SELECT
        c.name,
        COUNT(DISTINCT CASE WHEN m.week_label IS NOT NULL THEN m.week_label END) as weeks_ordered,
        COALESCE(SUM(o.quantity), 0)::integer as meals_ordered,
        c.sales_pipeline_stage,
        COALESCE(c.engagement_score, 0)::integer as engagement_score
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      LEFT JOIN menus m ON o.menu_id = m.id AND m.created_at >= $1 AND m.created_at <= $2
      GROUP BY c.id, c.name, c.sales_pipeline_stage, c.engagement_score
      HAVING COALESCE(SUM(o.quantity), 0) > 0
      ORDER BY meals_ordered DESC
      LIMIT 10
    `, [monthStart, monthEnd]);

    // Customer breakdown by status
    const customerStatus = await db.query(`
      SELECT
        COALESCE(c.sales_pipeline_stage, 'unknown') as sales_pipeline_stage,
        COUNT(*) as count,
        COUNT(CASE WHEN EXISTS (
          SELECT 1 FROM orders o
          JOIN menus m ON o.menu_id = m.id
          WHERE o.customer_id = c.id AND m.created_at >= $1 AND m.created_at <= $2
        ) THEN 1 END) as ordered_this_month
      FROM customers c
      GROUP BY c.sales_pipeline_stage
    `, [monthStart, monthEnd]);

    // Weekly breakdown
    const weeklyBreakdown = await db.query(`
      SELECT
        m.week_label,
        COUNT(*)::integer as total_orders,
        COUNT(DISTINCT o.customer_id)::integer as unique_customers,
        COALESCE(SUM(o.quantity), 0)::integer as meals,
        COALESCE(SUM(o.quantity) * 15, 0)::integer as estimated_revenue
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE m.created_at >= $1 AND m.created_at <= $2
      GROUP BY m.week_label, m.created_at
      ORDER BY m.created_at DESC
    `, [monthStart, monthEnd]);

    // Growth metrics
    const curr = currentMonth.rows[0] || { total_orders: 0, active_customers: 0, total_meals: 0, estimated_revenue_dollars: 0 };
    const prev = lastMonth.rows[0] || { total_meals: 0, estimated_revenue_dollars: 0, active_customers: 0 };
    const mealGrowth = prev.total_meals > 0 ? (((curr.total_meals - prev.total_meals) / prev.total_meals) * 100).toFixed(1) : '0';
    const customerGrowth = prev.active_customers > 0 ? (((curr.active_customers - prev.active_customers) / prev.active_customers) * 100).toFixed(1) : '0';

    res.json({
      success: true,
      data: {
        period: 'Jan - Jul 2026',
        currentMonth: {
          totalOrders: parseInt(curr.total_orders) || 0,
          activeCustomers: parseInt(curr.active_customers) || 0,
          totalMeals: parseInt(curr.total_meals) || 0,
          estimatedRevenue: (parseInt(curr.estimated_revenue_dollars) / 100).toFixed(2),
          avgMealsPerCustomer: curr.active_customers > 0 ? (parseInt(curr.total_meals) / parseInt(curr.active_customers)).toFixed(1) : '0'
        },
        comparison: {
          mealGrowth: mealGrowth + '%',
          customerGrowth: customerGrowth + '%',
          lastMonthMeals: parseInt(prev.total_meals) || 0,
          lastMonthRevenue: (parseInt(prev.estimated_revenue_dollars) / 100).toFixed(2)
        },
        topCustomers: (topCustomers.rows || []).map(c => ({
          name: c.name,
          meals: parseInt(c.meals_ordered) || 0,
          weeks: parseInt(c.weeks_ordered) || 0,
          status: c.sales_pipeline_stage,
          engagement: parseInt(c.engagement_score) || 0
        })),
        customerBreakdown: (customerStatus.rows || []).map(s => ({
          stage: s.sales_pipeline_stage,
          total: parseInt(s.count) || 0,
          orderedThisMonth: parseInt(s.ordered_this_month) || 0
        })),
        weeklyBreakdown: (weeklyBreakdown.rows || []).map(w => ({
          week: w.week_label,
          orders: parseInt(w.total_orders) || 0,
          customers: parseInt(w.unique_customers) || 0,
          meals: parseInt(w.meals) || 0,
          revenue: (parseInt(w.estimated_revenue) / 100).toFixed(2)
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/customer-insights
 * Deep dive into customer patterns and retention
 */
router.get('/customer-insights', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Cohort analysis - when customers joined and their retention
    const cohorts = await db.query(`
      SELECT
        COALESCE(DATE_TRUNC('month', c.created_at)::date, NOW()::date) as cohort_month,
        COUNT(*) as cohort_size,
        COUNT(CASE WHEN c.sales_pipeline_stage = 'active' THEN 1 END) as still_active,
        COUNT(CASE WHEN c.sales_pipeline_stage = 'prospect_lost' THEN 1 END) as churned,
        COUNT(CASE WHEN c.sales_pipeline_stage = 'prospect' THEN 1 END) as never_ordered,
        ROUND(100.0 * COUNT(CASE WHEN c.sales_pipeline_stage = 'active' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as retention_rate
      FROM customers c
      GROUP BY DATE_TRUNC('month', c.created_at)
      ORDER BY DATE_TRUNC('month', c.created_at) DESC NULLS LAST
    `);

    // Lifetime value distribution
    const ltv = await db.query(`
      WITH ltv_buckets AS (
        SELECT
          CASE
            WHEN c.lifetime_value_cents / 100 = 0 THEN '0'
            WHEN c.lifetime_value_cents / 100 < 500 THEN '$0-500'
            WHEN c.lifetime_value_cents / 100 < 1000 THEN '$500-1000'
            WHEN c.lifetime_value_cents / 100 < 2000 THEN '$1000-2000'
            ELSE '$2000+'
          END as ltv_bracket,
          c.lifetime_value_cents / 100 as ltv_value
        FROM customers c
      )
      SELECT
        ltv_bracket,
        COUNT(*) as customer_count,
        ROUND(AVG(ltv_value), 2) as avg_ltv
      FROM ltv_buckets
      GROUP BY ltv_bracket
      ORDER BY CASE
        WHEN ltv_bracket = '0' THEN 0
        WHEN ltv_bracket = '$0-500' THEN 1
        WHEN ltv_bracket = '$500-1000' THEN 2
        WHEN ltv_bracket = '$1000-2000' THEN 3
        ELSE 4
      END
    `);

    // Repeat purchase rate
    const repeatRate = await db.query(`
      WITH customer_weeks AS (
        SELECT o.customer_id, COUNT(DISTINCT m.week_label) as week_count
        FROM orders o
        JOIN menus m ON o.menu_id = m.id
        GROUP BY o.customer_id
      )
      SELECT
        (SELECT COUNT(DISTINCT customer_id) FROM orders)::integer as total_customers,
        COUNT(CASE WHEN week_count > 1 THEN 1 END)::integer as repeat_customers,
        CASE
          WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(CASE WHEN week_count > 1 THEN 1 END) / COUNT(*), 1)
          ELSE 0
        END as repeat_rate
      FROM customer_weeks
    `);

    // Customer satisfaction proxy (engagement score)
    const engagement = await db.query(`
      SELECT
        CASE
          WHEN c.engagement_score >= 80 THEN 'Highly Engaged'
          WHEN c.engagement_score >= 50 THEN 'Engaged'
          WHEN c.engagement_score > 0 THEN 'Low Engagement'
          ELSE 'No Activity'
        END as engagement_level,
        COUNT(*) as customer_count,
        ROUND(AVG(c.engagement_score), 1) as avg_score,
        ROUND(AVG(c.lifetime_value_cents / 100), 2) as avg_ltv
      FROM customers c
      GROUP BY engagement_level
    `);

    res.json({
      success: true,
      data: {
        cohortAnalysis: (cohorts.rows || []).map(c => ({
          month: c.cohort_month ? new Date(c.cohort_month).toLocaleString('default', { month: 'short', year: '2-digit' }) : 'Unknown',
          cohortSize: parseInt(c.cohort_size) || 0,
          active: parseInt(c.still_active) || 0,
          churned: parseInt(c.churned) || 0,
          neverOrdered: parseInt(c.never_ordered) || 0,
          retentionRate: (parseFloat(c.retention_rate) || 0).toFixed(1) + '%'
        })),
        ltvDistribution: (ltv.rows || []).map(l => ({
          bracket: l.ltv_bracket,
          customers: parseInt(l.customer_count) || 0,
          avgLTV: '$' + (parseFloat(l.avg_ltv) || 0).toFixed(2)
        })),
        repeatPurchase: {
          totalCustomers: parseInt((repeatRate.rows[0] || {}).total_customers) || 0,
          repeatCustomers: parseInt((repeatRate.rows[0] || {}).repeat_customers) || 0,
          repeatRate: (parseFloat((repeatRate.rows[0] || {}).repeat_rate) || 0).toFixed(1) + '%'
        },
        engagementLevels: (engagement.rows || []).map(e => ({
          level: e.engagement_level,
          count: parseInt(e.customer_count) || 0,
          avgScore: (parseFloat(e.avg_score) || 0).toFixed(1),
          avgLTV: '$' + (parseFloat(e.avg_ltv) || 0).toFixed(2)
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching customer insights:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/operational-metrics
 * Meal prep efficiency and operational health
 */
router.get('/operational-metrics', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const monthStart = new Date('2026-01-01');
    const monthEnd = new Date('2026-07-31');

    // Meals per week trend
    const weeklyTrend = await db.query(`
      SELECT
        m.week_label,
        COALESCE(SUM(o.quantity), 0)::integer as meals,
        COUNT(DISTINCT o.customer_id)::integer as customers,
        ROUND(COALESCE(SUM(o.quantity), 0)::numeric / NULLIF(COUNT(DISTINCT o.customer_id), 0), 2) as meals_per_customer,
        MAX(m.created_at) as max_date
      FROM menus m
      LEFT JOIN orders o ON m.id = o.menu_id
      WHERE m.created_at >= $1 AND m.created_at <= $2
      GROUP BY m.week_label
      ORDER BY MAX(m.created_at) DESC
    `, [monthStart, monthEnd]);

    // Menu diversity - unique menus this month
    const menuDiversity = await db.query(`
      SELECT COUNT(DISTINCT id) as unique_menus
      FROM menus
      WHERE created_at >= $1 AND created_at <= $2
    `, [monthStart, monthEnd]);

    // Order consistency (weeks with orders vs weeks without)
    const consistency = await db.query(`
      SELECT
        COUNT(DISTINCT m.week_label) as weeks_with_orders,
        COUNT(DISTINCT DATE_TRUNC('week', m.created_at)) as total_calendar_weeks
      FROM menus m
      WHERE EXISTS (
        SELECT 1 FROM orders WHERE menu_id = m.id
      ) AND m.created_at >= $1 AND m.created_at <= $2
    `, [monthStart, monthEnd]);

    res.json({
      success: true,
      data: {
        period: 'Jan - Jul 2026',
        weeklyTrend: (weeklyTrend.rows || []).map(w => ({
          week: w.week_label || 'Unknown',
          meals: parseInt(w.meals) || 0,
          customers: parseInt(w.customers) || 0,
          mealsPerCustomer: parseFloat(w.meals_per_customer) || 0
        })),
        menuDiversity: {
          uniqueMenusThisMonth: parseInt((menuDiversity.rows[0] || {}).unique_menus) || 0
        },
        orderConsistency: {
          weeksWithOrders: parseInt((consistency.rows[0] || {}).weeks_with_orders) || 0,
          totalCalendarWeeks: parseInt((consistency.rows[0] || {}).total_calendar_weeks) || 1,
          consistency: ((consistency.rows[0] || {}).total_calendar_weeks) > 0 ?
            (100 * parseInt(((consistency.rows[0] || {}).weeks_with_orders) || 0) / parseInt(((consistency.rows[0] || {}).total_calendar_weeks) || 1)).toFixed(1) + '%' : '0%'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching operational metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/financial-summary
 * Budget vs actual and expense breakdown
 */
router.get('/financial-summary', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Revenue and expenses
    const summary = await db.query(`
      SELECT
        SUM(CASE WHEN entry_type = 'purchase' THEN amount ELSE 0 END) as revenue_cents,
        SUM(CASE WHEN entry_type = 'expense' THEN amount_cents ELSE 0 END) as expense_cents
      FROM financial_entries
      WHERE created_at >= $1
    `, [thirtyDaysAgo]);

    // Expenses by category
    const byCategory = await db.query(`
      SELECT category, COUNT(*) as count, SUM(amount_cents) as total_cents
      FROM financial_entries
      WHERE entry_type = 'expense' AND created_at >= $1
      GROUP BY category
      ORDER BY total_cents DESC
    `, [thirtyDaysAgo]);

    const revenue = parseInt(summary.rows[0].revenue_cents || 0) / 100;
    const expenses = parseInt(summary.rows[0].expense_cents || 0) / 100;
    const profit = revenue - expenses;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        period: 'last 30 days',
        revenue: revenue.toFixed(2),
        expenses: expenses.toFixed(2),
        profit: profit.toFixed(2),
        marginPercent: margin,
        expensesByCategory: byCategory.rows.map(c => ({
          category: c.category,
          count: c.count,
          total: (c.total_cents / 100).toFixed(2)
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
