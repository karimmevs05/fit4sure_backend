#!/usr/bin/env node

/**
 * Fix customer pipeline tags based on 2026 ordering history
 * Run: node fix_customer_tags.js
 */

const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://karimmevs@localhost:5432/fit4sure'
});

async function fixCustomerTags() {
  try {
    console.log('\n🔄 Fixing customer pipeline tags...');
    console.log('━'.repeat(80));

    await client.connect();
    console.log('✅ Connected to database');

    // 1. Reset all to prospect
    await client.query(
      "UPDATE customers SET sales_pipeline_stage = 'prospect', conversion_probability = 0, engagement_score = 0, days_since_last_contact = 0"
    );
    console.log('✅ Step 1: Reset all customers to prospect');

    // 2. Mark customers with ANY orders as prospect_lost
    const step2 = await client.query(`
      UPDATE customers c
      SET sales_pipeline_stage = 'prospect_lost',
          conversion_probability = CASE
            WHEN total_meals > 50 THEN 40
            WHEN total_meals > 30 THEN 25
            ELSE 15
          END,
          engagement_score = CASE
            WHEN total_meals > 50 THEN 60
            WHEN total_meals > 30 THEN 40
            ELSE 20
          END,
          lifetime_value_cents = COALESCE(total_meals * 1500, 0)
      FROM (
        SELECT customer_id, SUM(quantity) as total_meals
        FROM orders
        GROUP BY customer_id
      ) o
      WHERE c.id = o.customer_id
      RETURNING c.name
    `);
    console.log(`✅ Step 2: Marked ${step2.rows.length} customers with past orders as prospect_lost`);

    // 3. Mark ONLY Week of 7.12 customers as ACTIVE
    const step3 = await client.query(`
      UPDATE customers c
      SET sales_pipeline_stage = 'active',
          conversion_probability = 100,
          engagement_score = 95,
          days_since_last_contact = 0
      WHERE c.id IN (
        SELECT DISTINCT o.customer_id
        FROM orders o
        JOIN menus m ON o.menu_id = m.id
        WHERE m.week_label = 'Week of 7.12'
      )
      RETURNING c.name
    `);
    console.log(`✅ Step 3: Marked ${step3.rows.length} Week of 7.12 customers as ACTIVE`);

    // Verify and display results
    console.log('\n📊 FINAL PIPELINE STATUS:');
    console.log('━'.repeat(80));

    const summary = await client.query(`
      SELECT
        sales_pipeline_stage,
        COUNT(*) as count,
        ROUND(SUM(COALESCE((SELECT SUM(quantity) FROM orders WHERE customer_id = c.id), 0))::numeric, 0) as total_meals
      FROM customers c
      GROUP BY sales_pipeline_stage
      ORDER BY CASE WHEN sales_pipeline_stage = 'active' THEN 0 ELSE 1 END
    `);

    summary.rows.forEach(row => {
      const emoji = row.sales_pipeline_stage === 'active' ? '🟢' : row.sales_pipeline_stage === 'prospect_lost' ? '🟡' : '⚪';
      console.log(`${emoji} ${row.sales_pipeline_stage.toUpperCase().padEnd(15)} | ${row.count.toString().padStart(3)} customers | ${row.total_meals} total meals`);
    });

    // Show active customers
    console.log('\n🟢 ACTIVE CUSTOMERS (Week of 7.12):');
    const active = await client.query(`
      SELECT name, (SELECT SUM(quantity) FROM orders WHERE customer_id = c.id) as meals
      FROM customers c
      WHERE sales_pipeline_stage = 'active'
      ORDER BY name
    `);

    if (active.rows.length === 0) {
      console.log('   ⚠️  No active customers found!');
    } else {
      active.rows.forEach(row => {
        console.log(`   • ${row.name.padEnd(30)} (${row.meals} meals)`);
      });
    }

    console.log('\n' + '━'.repeat(80));
    console.log('✅ Customer pipeline tags fixed successfully!\n');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nMake sure:');
    console.error('  1. PostgreSQL is running');
    console.error('  2. fit4sure database exists');
    console.error('  3. DATABASE_URL is set or you have psql access to fit4sure');
    process.exit(1);
  }
}

fixCustomerTags();
