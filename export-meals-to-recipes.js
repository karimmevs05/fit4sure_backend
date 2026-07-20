require('dotenv').config();
const db = require('./src/config/db');
const fs = require('fs');

async function exportMeals() {
  try {
    console.log('Exporting all unique meals from orders...\n');

    // Get all unique meal names from menu_recipes
    const mealsResult = await db.query(
      `SELECT DISTINCT recipe_name FROM menu_recipes ORDER BY recipe_name`
    );

    const meals = mealsResult.rows.map(row => row.recipe_name);

    console.log(`Found ${meals.length} unique meals\n`);

    // Create recipe objects
    const recipes = meals.map((meal, idx) => ({
      id: idx + 1,
      name: meal,
      category: 'prepared_meal',
      description: meal,
      servings: 1,
      prep_time_minutes: 30,
      ingredients: [], // Empty for manual entry
    }));

    // Save to CSV for easy importing
    const csv = [
      ['ID', 'Name', 'Category', 'Servings', 'Prep Time (min)', 'Description'].join(','),
      ...recipes.map(r =>
        [r.id, `"${r.name}"`, r.category, r.servings, r.prep_time_minutes, `"${r.description}"`].join(',')
      ),
    ].join('\n');

    fs.writeFileSync('/Users/karimmevs/Documents/fit4sure_backend/meals-export.csv', csv);
    console.log('✅ Exported to meals-export.csv\n');

    // Also create SQL insert statements
    const sql = recipes.map(r =>
      `INSERT INTO recipes (name, category, description, servings, prep_time_minutes) VALUES ('${r.name.replace(/'/g, "''")}', '${r.category}', '${r.description.replace(/'/g, "''")}', ${r.servings}, ${r.prep_time_minutes});`
    ).join('\n');

    fs.writeFileSync('/Users/karimmevs/Documents/fit4sure_backend/create-recipes-from-meals.sql', sql);
    console.log('✅ Created create-recipes-from-meals.sql\n');

    // Show sample
    console.log('Sample meals:');
    meals.slice(0, 10).forEach(meal => console.log(`  - ${meal}`));
    console.log(`  ... and ${meals.length - 10} more\n`);

    console.log('📝 Next steps:');
    console.log('1. Open meals-export.csv to review');
    console.log('2. Run: psql fit4sure < create-recipes-from-meals.sql');
    console.log('3. Then manually add ingredients to each recipe via the UI or database');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

exportMeals();
