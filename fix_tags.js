const db = require('./src/config/db');

async function fixTags() {
  try {
    // Reset all to prospect
    await db.query("UPDATE customers SET sales_pipeline_stage = 'prospect', conversion_probability = 0, engagement_score = 0");
    console.log('✅ Reset all customers to prospect');

    // Mark customers with ANY 2026 orders as prospect_lost
    const result1 = await db.query(`
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
    console.log(`✅ Marked ${result1.rows.length} customers with past orders as prospect_lost`);

    // Mark ONLY Week of 7.12 customers as ACTIVE
    const result2 = await db.query(`
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
    console.log(`✅ Marked ${result2.rows.length} Week of 7.12 customers as ACTIVE`);
    console.log('\n🟢 Active customers for Week of 7.12:');
    result2.rows.forEach(r => console.log(`   ${r.name}`));

    // Verify the changes
    const verify = await db.query(`
      SELECT name, sales_pipeline_stage, conversion_probability, engagement_score,
             (SELECT SUM(quantity) FROM orders WHERE customer_id = c.id) as total_meals
      FROM customers c
      ORDER BY CASE WHEN sales_pipeline_stage = 'active' THEN 0 ELSE 1 END, total_meals DESC
    `);

    console.log('\n📊 FINAL PIPELINE STATUS:');
    console.log('━'.repeat(80));
    
    const active = verify.rows.filter(r => r.sales_pipeline_stage === 'active');
    const lost = verify.rows.filter(r => r.sales_pipeline_stage === 'prospect_lost');
    const prospect = verify.rows.filter(r => r.sales_pipeline_stage === 'prospect');
    
    console.log(`\n🟢 ACTIVE (${active.length}):`);
    active.forEach(r => console.log(`  • ${r.name.padEnd(30)} Meals: ${(r.total_meals || 0).toString().padStart(3)}`));
    
    console.log(`\n🟡 PROSPECT_LOST (${lost.length}):`);
    lost.slice(0, 10).forEach(r => console.log(`  • ${r.name.padEnd(30)} Meals: ${(r.total_meals || 0).toString().padStart(3)}`));
    if (lost.length > 10) console.log(`  ... and ${lost.length - 10} more`);
    
    console.log(`\n⚪ PROSPECT (${prospect.length}):`);
    console.log(`  Never ordered`);
    
    console.log('\n' + '━'.repeat(80));
    console.log('✅ All customer pipeline tags corrected!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixTags();
