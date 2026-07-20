require('dotenv').config();
const db = require('./src/config/db');
const { searchUSDANutrition } = require('./src/services/usdaNutrition');

async function backfillMacros() {
  try {
    console.log('🔍 Fetching inventory items without macros...');

    // Get all items that don't have macros
    const result = await db.query(
      `SELECT id, name FROM inventory WHERE protein_per_100g IS NULL ORDER BY id`
    );

    if (result.rows.length === 0) {
      console.log('✅ All inventory items already have macros!');
      process.exit(0);
    }

    console.log(`📊 Found ${result.rows.length} items to process\n`);

    let updated = 0;
    let skipped = 0;

    for (const item of result.rows) {
      console.log(`[${updated + skipped + 1}/${result.rows.length}] Processing: ${item.name}`);

      // Search USDA
      const usdaData = await searchUSDANutrition(item.name);

      if (usdaData) {
        // Update with USDA data
        await db.query(
          `UPDATE inventory
           SET protein_per_100g = $1, carbs_per_100g = $2, fat_per_100g = $3, calories_per_100g = $4, usda_fdc_id = $5, macros_source = 'usda'
           WHERE id = $6`,
          [usdaData.protein_per_100g, usdaData.carbs_per_100g, usdaData.fat_per_100g, usdaData.calories_per_100g, usdaData.fdcId, item.id]
        );
        updated++;
        console.log(`   ✅ Updated with USDA data\n`);
      } else {
        skipped++;
        console.log(`   ⚠️  No USDA match found\n`);
      }

      // Rate limiting to avoid API overload
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n✅ Backfill complete!`);
    console.log(`   Updated: ${updated} items`);
    console.log(`   Skipped: ${skipped} items (no USDA match)`);
    console.log(`   Total: ${result.rows.length} items processed`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

backfillMacros();
