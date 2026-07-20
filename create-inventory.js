require('dotenv').config();
const db = require('./src/config/db');

async function createInventoryTable() {
  try {
    console.log('Creating inventory table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        serving_size_g INTEGER NOT NULL,
        current_stock_g INTEGER DEFAULT 0,
        store VARCHAR(100),
        grade VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ Inventory table created!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createInventoryTable();
