require('dotenv').config();
const db = require('./src/config/db');

async function check() {
  try {
    // Check menu_recipes
    const menuRecipes = await db.query(
      `SELECT id, recipe_name, recipe_id FROM menu_recipes LIMIT 5`
    );

    console.log('📋 Menu Recipes:');
    menuRecipes.rows.forEach(r => {
      console.log(`  - ${r.recipe_name} (recipe_id: ${r.recipe_id})`);
    });

    // Check if any are linked
    const linked = await db.query(
      `SELECT COUNT(*) as count FROM menu_recipes WHERE recipe_id IS NOT NULL`
    );

    console.log(`\n🔗 Linked recipes: ${linked.rows[0].count}`);

    // Check recipes table
    const recipes = await db.query(
      `SELECT recipe_id, name, servings FROM recipes LIMIT 3`
    );

    console.log('\n📚 Sample Recipes:');
    recipes.rows.forEach(r => {
      console.log(`  - ${r.name} (ID: ${r.recipe_id}, Servings: ${r.servings})`);
    });

    // Check recipe_ingredients
    const ing = await db.query(
      `SELECT r.name, COUNT(*) as ing_count
       FROM recipe_ingredients ri
       JOIN recipes r ON ri.recipe_id = r.recipe_id
       GROUP BY r.recipe_id, r.name
       LIMIT 3`
    );

    console.log('\n🥕 Sample Recipe Ingredients:');
    ing.rows.forEach(r => {
      console.log(`  - ${r.name}: ${r.ing_count} ingredients`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

check();
