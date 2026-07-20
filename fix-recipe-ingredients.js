require('dotenv').config();
const db = require('./src/config/db');

async function fixRecipeIngredients() {
  try {
    console.log('Fixing recipe_ingredients table...');

    // Drop the old table if it exists
    await db.query('DROP TABLE IF EXISTS recipe_ingredients CASCADE');

    // Create the correct table
    await db.query(`
      CREATE TABLE recipe_ingredients (
        id SERIAL PRIMARY KEY,
        recipe_id INTEGER REFERENCES recipes(recipe_id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES inventory(id),
        quantity_g DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ recipe_ingredients table fixed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixRecipeIngredients();
