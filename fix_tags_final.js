#!/usr/bin/env node

/**
 * FINAL FIX - Customer pipeline tags
 * Logic:
 * - ACTIVE: Has ANY order in Week of 7.12 (most recent week)
 * - PROSPECT_LOST: Has past orders but NONE in Week of 7.12
 * - PROSPECT: Never ordered
 */

const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://karimmevs@localhost:5432/fit4sure'
});

async function fixTags() {
  try {
    await client.connect();
    console.log('\n🔧 FIXING CUSTOMER PIPELINE TAGS\n');

    // Get Week 7.12 active customer list
    const activeResult = await client.query(`
      SELECT DISTINCT c.id, c.name
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      JOIN customers c ON o.customer_id = c.id
      WHERE m.week_label = 'Week of 7.12'
      ORDER BY c.name
    `);
    const activeIds = activeResult.rows.map(r => r.id);
    console.log(`📍 Week 7.12 Active customers: ${activeResult.rows.map(r => r.name).join(', ')}\n`);

    // Get all customers with orders
    const pastResult = await client.query(`
      SELECT DISTINCT c.id, c.name, SUM(o.quantity) as total_meals
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `);
    const pastIds = pastResult.rows.map(r => r.id);

    // STEP 1: Reset everyone to prospect
    await client.query(
      `UPDATE customers SET sales_pipeline_stage = 'prospect', conversion_probability = 0, engagement_score = 0, days_since_last_contact = 365`
    );
    console.log('✅ Step 1: Reset all customers to prospect');

    // STEP 2: Mark past customers (anyone with orders) as prospect_lost
    if (pastIds.length > 0) {
      const pastUpdates = await client.query(
        `UPDATE customers c
         SET sales_pipeline_stage = 'prospect_lost',
             conversion_probability = CASE
               WHEN (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE customer_id = c.id) > 50 THEN 35
               WHEN (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE customer_id = c.id) > 30 THEN 20
               ELSE 10
             END,
             engagement_score = CASE
               WHEN (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE customer_id = c.id) > 50 THEN 65
               WHEN (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE customer_id = c.id) > 30 THEN 40
               ELSE 20
             END,
             lifetime_value_cents = COALESCE((SELECT SUM(quantity) * 1500 FROM orders WHERE customer_id = c.id), 0)
         WHERE c.id = ANY($1)`,
        [pastIds]
      );
      console.log(`✅ Step 2: Marked ${pastIds.length} past customers as prospect_lost`);
    }

    // STEP 3: Mark ONLY Week 7.12 customers as ACTIVE
    if (activeIds.length > 0) {
      const activeUpdates = await client.query(
        `UPDATE customers
         SET sales_pipeline_stage = 'active',
             conversion_probability = 100,
             engagement_score = 95,
             days_since_last_contact = 0
         WHERE id = ANY($1)`,
        [activeIds]
      );
      console.log(`✅ Step 3: Marked ${activeIds.length} Week 7.12 customers as ACTIVE`);
    }

    // VERIFY
    const verify = await client.query(`
      SELECT
        sales_pipeline_stage,
        COUNT(*) as count,
        COALESCE(ROUND(AVG(conversion_probability)::numeric, 0), 0) as avg_conversion,
        COALESCE(ROUND(AVG(engagement_score)::numeric, 0), 0) as avg_engagement,
        COALESCE(ROUND(SUM(lifetime_value_cents) / 100 / COUNT(*), 2), 0) as avg_ltv
      FROM customers
      GROUP BY sales_pipeline_stage
      ORDER BY CASE WHEN sales_pipeline_stage = 'active' THEN 0 ELSE 1 END
    `);

    console.log('\n📊 FINAL PIPELINE STATUS:');
    console.log('━'.repeat(80));
    verify.rows.forEach(row => {
      const emoji = row.sales_pipeline_stage === 'active' ? '🟢' : row.sales_pipeline_stage === 'prospect_lost' ? '🟡' : '⚪';
      console.log(`${emoji} ${row.sales_pipeline_stage.padEnd(15)} | Count: ${row.count.toString().padStart(3)} | Avg Conv: ${row.avg_conversion.toString().padStart(3)} | Avg Eng: ${row.avg_engagement.toString().padStart(3)}`);
    });

    // Show active customers with meal counts
    if (activeIds.length > 0) {
      console.log('\n🟢 ACTIVE CUSTOMERS (Week of 7.12):');
      const details = await client.query(`
        SELECT c.name, COALESCE(SUM(o.quantity), 0) as meals, c.conversion_probability, c.engagement_score
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        WHERE c.sales_pipeline_stage = 'active'
        GROUP BY c.id, c.name, c.conversion_probability, c.engagement_score
        ORDER BY c.name
      `);
      details.rows.forEach(row => {
        console.log(`   • ${row.name.padEnd(30)} | Meals: ${row.meals.toString().padStart(3)} | Conv: ${row.conversion_probability} | Eng: ${row.engagement_score}`);
      });
    }

    console.log('\n' + '━'.repeat(80));
    console.log('✅ Customer pipeline tags fixed successfully!\n');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshoot:');
    console.error('  • Is PostgreSQL running?');
    console.error('  • Is fit4sure database created?');
    console.error('  • Run: psql -l | grep fit4sure');
    process.exit(1);
  }
}

fixTags();
