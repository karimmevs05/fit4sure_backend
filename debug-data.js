require('dotenv').config();
const db = require('./src/config/db');

async function debug() {
  try {
    // Check menus
    const menus = await db.query('SELECT id, week_label FROM menus LIMIT 2');
    console.log('📋 Menus:');
    menus.rows.forEach(m => console.log(`  - ${m.week_label} (id: ${m.id})`));

    if (menus.rows.length === 0) {
      console.log('❌ No menus found!');
      process.exit(0);
    }

    const menuId = menus.rows[0].id;

    // Check menu_recipes
    const menuRecipes = await db.query(
      'SELECT id, recipe_name, day_of_week FROM menu_recipes WHERE menu_id = $1 LIMIT 5',
      [menuId]
    );
    console.log('\n🍽️  Menu Recipes:');
    menuRecipes.rows.forEach(r => console.log(`  - ${r.recipe_name} (${r.day_of_week})`));

    // Check recipes table
    const recipes = await db.query('SELECT recipe_id, name, servings FROM recipes LIMIT 5');
    console.log('\n📚 Recipes Table:');
    recipes.rows.forEach(r => console.log(`  - ${r.name} (${r.servings} servings)`));

    // Check if recipe names match
    if (menuRecipes.rows.length > 0 && recipes.rows.length > 0) {
      const firstMenuRecipe = menuRecipes.rows[0].recipe_name;
      const matchingRecipe = recipes.rows.find(r => r.name.toLowerCase() === firstMenuRecipe.toLowerCase());
      console.log(`\n🔍 Matching "${firstMenuRecipe}": ${matchingRecipe ? '✅ Found' : '❌ No match'}`);
    }

    // Check inventory
    const inventory = await db.query('SELECT id, name, current_stock_g, unit_price_cents FROM inventory LIMIT 3');
    console.log('\n📦 Inventory Sample:');
    inventory.rows.forEach(i => console.log(`  - ${i.name}: ${i.current_stock_g}g @ ${i.unit_price_cents}¢`));

    // Check recipe_ingredients
    const recipeIngredients = await db.query('SELECT COUNT(*) as count FROM recipe_ingredients');
    console.log(`\n🥕 Recipe Ingredients: ${recipeIngredients.rows[0].count} total`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debug();
