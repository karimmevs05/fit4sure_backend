require('dotenv').config();
const db = require('./src/config/db');

// Simple keyword-based mapping
const mappings = [
  { keywords: ['kefta'], recipeId: 116 }, // Kefta
  { keywords: ['steak', 'cafe'], recipeId: 111 }, // Steak Cafe
  { keywords: ['steak', 'taco'], recipeId: 112 }, // Steak Taco Bowl
  { keywords: ['balsamic'], recipeId: 113 }, // Balsamic Chuck
  { keywords: ['blackened', 'chicken'], recipeId: 118 }, // Blackened Chicken
  { keywords: ['lemon', 'chicken'], recipeId: 119 }, // Lemon Chicken
  { keywords: ['mexican', 'chicken'], recipeId: 120 }, // Mexican Chicken
  { keywords: ['pesto', 'chicken'], recipeId: 120 }, // Mexican Chicken (similar)
  { keywords: ['peruvian', 'chicken'], recipeId: 121 }, // Peruvian Chicken
  { keywords: ['thai', 'chicken'], recipeId: 122 }, // Thai Chicken
  { keywords: ['greek', 'chicken'], recipeId: 123 }, // Greek Chicken
  { keywords: ['carnitas', 'pork'], recipeId: 111 }, // Use Steak Cafe as fallback
  { keywords: ['ground', 'beef', 'gochujang'], recipeId: 116 }, // Kefta
  { keywords: ['turkey'], recipeId: 124 }, // Greek Turkey Patties
];

async function linkRecipes() {
  try {
    console.log('Linking recipes to menu...\n');

    // Get all menu recipes
    const menuRecipesResult = await db.query(
      `SELECT id, recipe_name FROM menu_recipes WHERE recipe_id IS NULL`
    );

    let linked = 0;
    let notLinked = [];

    for (const menuRecipe of menuRecipesResult.rows) {
      const name = menuRecipe.recipe_name.toLowerCase();

      // Find matching recipe
      const match = mappings.find(m =>
        m.keywords.every(keyword => name.includes(keyword))
      );

      if (match) {
        await db.query(
          `UPDATE menu_recipes SET recipe_id = $1 WHERE id = $2`,
          [match.recipeId, menuRecipe.id]
        );
        console.log(`✅ Linked "${menuRecipe.recipe_name}" to recipe ${match.recipeId}`);
        linked++;
      } else {
        notLinked.push(menuRecipe.recipe_name);
      }
    }

    console.log(`\n✅ Linked ${linked} recipes`);

    if (notLinked.length > 0) {
      console.log(`\n⚠️  Could not link (${notLinked.length}):`);
      notLinked.forEach(name => console.log(`  - ${name}`));
      console.log('\nPlease manually map these in the database.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

linkRecipes();
