require('dotenv').config();
const db = require('./src/config/db');

async function addMacrosToInventory() {
  try {
    console.log('Adding macro columns to inventory table...');

    await db.query(`
      ALTER TABLE inventory
      ADD COLUMN IF NOT EXISTS protein_per_100g DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS carbs_per_100g DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS fat_per_100g DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS calories_per_100g DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS usda_fdc_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS macros_source VARCHAR(50) DEFAULT 'manual'
    `);

    console.log('✅ Macro columns added to inventory table!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addMacrosToInventory();
