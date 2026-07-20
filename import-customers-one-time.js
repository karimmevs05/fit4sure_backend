#!/usr/bin/env node

/**
 * One-time customer import from order history
 * Run this script to populate pipeline data for all customers
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'fit4sure.db');
const db = new Database(dbPath);

console.log('🔄 Importing customers from order history...\n');

try {
  // Get all unique customers from order_totals
  const customers = db.prepare(`
    SELECT
      c.id, c.name,
      COUNT(DISTINCT ot.menu_id) as weeks_active,
      SUM(ot.total_meals) as total_meals_ordered,
      MAX(m.created_at) as last_order_date
    FROM customers c
    LEFT JOIN order_totals ot ON c.id = ot.customer_id
    LEFT JOIN menus m ON ot.menu_id = m.id
    WHERE c.name IS NOT NULL AND c.name != ''
    GROUP BY c.id, c.name
    ORDER BY total_meals_ordered DESC NULLS LAST
  `).all();

  console.log(`Found ${customers.length} customers\n`);

  const updateStmt = db.prepare(`
    UPDATE customers
    SET
      total_meals_ordered = ?,
      weeks_active = ?,
      last_order_date = ?,
      lifetime_value_cents = ?,
      sales_pipeline_stage = ?,
      conversion_probability = ?,
      engagement_score = ?,
      days_since_last_contact = ?
    WHERE id = ?
  `);

  let importedCount = 0;

  for (const customer of customers) {
    const totalMeals = customer.total_meals_ordered || 0;
    const weeksActive = customer.weeks_active || 0;
    const ltv = Math.floor((totalMeals * 15) * 100);

    let stage = 'prospect';
    let conversionProb = 30;
    let engagementScore = 0;

    if (totalMeals > 150) {
      stage = 'active';
      conversionProb = 100;
      engagementScore = 95;
    } else if (totalMeals > 80) {
      stage = 'trial';
      conversionProb = 80;
      engagementScore = 70;
    } else if (totalMeals > 40) {
      stage = 'engaged';
      conversionProb = 65;
      engagementScore = 55;
    } else if (totalMeals > 0) {
      stage = 'engaged';
      conversionProb = 50;
      engagementScore = 40;
    }

    updateStmt.run(
      totalMeals,
      weeksActive,
      customer.last_order_date,
      ltv,
      stage,
      conversionProb,
      engagementScore,
      Math.floor(Math.random() * 30),
      customer.id
    );

    console.log(`✓ ${customer.name.padEnd(25)} | ${String(totalMeals).padStart(3)} meals | ${String(weeksActive).padStart(2)} weeks | Stage: ${stage.padEnd(8)} | Conv: ${String(conversionProb).padStart(3)}%`);
    importedCount++;
  }

  // Get summary
  const summary = db.prepare(`
    SELECT
      sales_pipeline_stage,
      COUNT(*) as count,
      ROUND(AVG(conversion_probability), 0) as avg_conversion,
      ROUND(AVG(total_meals_ordered), 0) as avg_meals,
      SUM(lifetime_value_cents) as total_ltv
    FROM customers
    WHERE total_meals_ordered > 0
    GROUP BY sales_pipeline_stage
    ORDER BY
      CASE
        WHEN sales_pipeline_stage = 'active' THEN 1
        WHEN sales_pipeline_stage = 'trial' THEN 2
        WHEN sales_pipeline_stage = 'engaged' THEN 3
        ELSE 4
      END
  `).all();

  console.log('\n📊 Pipeline Summary:');
  console.log('====================');
  summary.forEach(row => {
    console.log(`${row.sales_pipeline_stage.padEnd(10)} | ${String(row.count).padEnd(3)} customers | Avg Conv: ${String(row.avg_conversion).padEnd(3)}% | Avg Meals: ${String(row.avg_meals).padEnd(3)} | LTV: $${(row.total_ltv / 100).toFixed(0)}`);
  });

  console.log('\n✅ Import complete!');
  db.close();
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  db.close();
  process.exit(1);
}
