require('dotenv').config();
const db = require('./src/config/db');

async function addBreakfastColumn() {
  try {
    console.log('Adding breakfast_meals column to order_totals...\n');

    await db.query(`
      ALTER TABLE order_totals
      ADD COLUMN IF NOT EXISTS breakfast_meals INTEGER DEFAULT 0
    `);

    console.log('✅ breakfast_meals column added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addBreakfastColumn();
