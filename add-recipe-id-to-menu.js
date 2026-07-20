require('dotenv').config();
const db = require('./src/config/db');

async function migrate() {
  try {
    console.log('Adding recipe_id column to menu_recipes...');

    // Check if column exists
    const checkColumn = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'menu_recipes' AND column_name = 'recipe_id'`
    );

    if (checkColumn.rows.length === 0) {
      await db.query(`
        ALTER TABLE menu_recipes
        ADD COLUMN recipe_id INTEGER REFERENCES recipes(recipe_id)
      `);
      console.log('✅ Column added');
    } else {
      console.log('✅ Column already exists');
    }

    // Now manually map some recipes - start with the ones we imported
    const mappings = [
      { menu_name: 'Kefta', recipe_name: 'Kefta' },
      { menu_name: 'Steak', recipe_name: 'Steak Cafe' },
      { menu_name: 'Chicken', recipe_name: 'Blackened Chicken' },
    ];

    for (const mapping of mappings) {
      const recipeResult = await db.query(
        'SELECT recipe_id FROM recipes WHERE name ILIKE $1',
        [`%${mapping.recipe_name}%`]
      );

      if (recipeResult.rows.length > 0) {
        const recipeId = recipeResult.rows[0].recipe_id;
        await db.query(
          `UPDATE menu_recipes SET recipe_id = $1 WHERE recipe_name ILIKE $2`,
          [recipeId, `%${mapping.menu_name}%`]
        );
        console.log(`✅ Linked "${mapping.menu_name}" to recipe ID ${recipeId}`);
      }
    }

    // Show unlinked recipes
    const unlinked = await db.query(
      `SELECT DISTINCT recipe_name FROM menu_recipes WHERE recipe_id IS NULL LIMIT 10`
    );

    if (unlinked.rows.length > 0) {
      console.log('\n⚠️  Unlinked menu recipes:');
      unlinked.rows.forEach(r => console.log(`  - ${r.recipe_name}`));
      console.log('\nYou need to manually link these to recipes for COGS to work.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

migrate();
