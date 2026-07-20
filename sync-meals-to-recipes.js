require('dotenv').config();
const db = require('./src/config/db');

async function syncMealsToRecipes() {
  try {
    console.log('Syncing all order meals to recipes...\n');

    // Get all unique meals from menu_recipes
    const mealsResult = await db.query(
      `SELECT DISTINCT recipe_name FROM menu_recipes ORDER BY recipe_name`
    );

    const meals = mealsResult.rows.map(r => r.recipe_name);
    console.log(`Found ${meals.length} unique meals in order history\n`);

    // Check which ones exist in recipes
    let inserted = 0;
    let skipped = 0;
    let errors = [];

    for (const meal of meals) {
      try {
        // Check if recipe already exists
        const exists = await db.query(
          `SELECT recipe_id FROM recipes WHERE LOWER(name) = LOWER($1)`,
          [meal]
        );

        if (exists.rows.length > 0) {
          console.log(`⏭️  "${meal}" already exists`);
          skipped++;
          continue;
        }

        // Insert as new recipe (not linked yet — will be drafted)
        const result = await db.query(
          `INSERT INTO recipes (name, category, description, servings, prep_time_minutes)
           VALUES ($1, 'prepared_meal', $2, 1, 30)
           RETURNING recipe_id`,
          [meal, meal]
        );

        const recipeId = result.rows[0].recipe_id;

        // DON'T link to menu_recipes yet — keep as draft until ingredients are added
        // This way it shows in Drafts tab for ingredient assignment

        console.log(`✅ Created draft recipe "${meal}" (ID: ${recipeId})`);
        inserted++;
      } catch (err) {
        if (err.message.includes('duplicate')) {
          skipped++;
        } else {
          errors.push(`${meal}: ${err.message}`);
          console.error(`❌ ${meal}: ${err.message}`);
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  ✅ Inserted: ${inserted}`);
    console.log(`  ⏭️  Skipped: ${skipped}`);
    if (errors.length > 0) {
      console.log(`  ❌ Errors: ${errors.length}`);
    }

    console.log(`\n📝 Next step: Add ingredients to each recipe via the Recipes UI`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

syncMealsToRecipes();
