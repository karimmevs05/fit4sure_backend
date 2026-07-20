require('dotenv').config();
const db = require('./src/config/db');

async function createOrdersSchema() {
  try {
    console.log('📋 Creating orders schema...\n');

    // Create menus table (weekly menus)
    await db.query(`
      CREATE TABLE IF NOT EXISTS menus (
        id SERIAL PRIMARY KEY,
        week_label VARCHAR(50) NOT NULL UNIQUE,
        week_start_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ menus table created');

    // Create menu_recipes table (recipes in each week's menu)
    await db.query(`
      CREATE TABLE IF NOT EXISTS menu_recipes (
        id SERIAL PRIMARY KEY,
        menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
        recipe_id INTEGER REFERENCES recipes(recipe_id),
        recipe_name VARCHAR(255) NOT NULL,
        day_of_week VARCHAR(20) NOT NULL,
        position INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ menu_recipes table created');

    // Create customers table
    await db.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        notes TEXT,
        dietary_restrictions TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ customers table created');

    // Create orders table (individual customer orders)
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        day_of_week VARCHAR(20) NOT NULL,
        menu_recipe_id INTEGER REFERENCES menu_recipes(id),
        quantity INTEGER DEFAULT 1,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ orders table created');

    // Create order_totals table (weekly summaries)
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_totals (
        id SERIAL PRIMARY KEY,
        menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        total_meals_monday INTEGER DEFAULT 0,
        total_meals_thursday INTEGER DEFAULT 0,
        total_meals INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ order_totals table created');

    console.log('\n✅ Orders schema created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating schema:', error.message);
    process.exit(1);
  }
}

createOrdersSchema();
