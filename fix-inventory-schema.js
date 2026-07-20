require('dotenv').config();
const db = require('./src/config/db');

async function fixSchema() {
  try {
    console.log('Checking inventory table schema...');

    // Check if unit_price_cents column exists
    const checkColumn = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'inventory' AND column_name = 'unit_price_cents'`
    );

    if (checkColumn.rows.length === 0) {
      console.log('✅ Adding unit_price_cents column to inventory table...');
      await db.query(`
        ALTER TABLE inventory
        ADD COLUMN unit_price_cents INTEGER DEFAULT 0
      `);
      console.log('✅ Column added successfully');
    } else {
      console.log('✅ unit_price_cents column already exists');
    }

    // Check if current_stock_g exists
    const checkStock = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'inventory' AND column_name = 'current_stock_g'`
    );

    if (checkStock.rows.length === 0) {
      console.log('✅ Adding current_stock_g column to inventory table...');
      await db.query(`
        ALTER TABLE inventory
        ADD COLUMN current_stock_g INTEGER DEFAULT 0
      `);
      console.log('✅ Column added successfully');
    } else {
      console.log('✅ current_stock_g column already exists');
    }

    // List all columns in inventory table
    const allColumns = await db.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'inventory'
       ORDER BY ordinal_position`
    );

    console.log('\n✅ Inventory table schema:');
    allColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixSchema();
