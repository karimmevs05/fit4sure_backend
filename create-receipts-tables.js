require('dotenv').config();
const db = require('./src/config/db');

async function createReceiptsTables() {
  try {
    console.log('Creating receipts tables...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        store VARCHAR(255),
        total_amount_cents INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS receipt_items (
        id SERIAL PRIMARY KEY,
        receipt_id INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES inventory(id),
        inventory_name VARCHAR(255),
        quantity_grams DECIMAL(10,2) NOT NULL,
        unit VARCHAR(50),
        quantity DECIMAL(10,2),
        unit_price_cents INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS financial_entries (
        id SERIAL PRIMARY KEY,
        entry_type VARCHAR(50) NOT NULL,
        description TEXT,
        receipt_id INTEGER REFERENCES receipts(id),
        inventory_id INTEGER REFERENCES inventory(id),
        quantity_grams DECIMAL(10,2),
        amount_cents INTEGER NOT NULL,
        entry_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ Receipts tables created!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createReceiptsTables();
