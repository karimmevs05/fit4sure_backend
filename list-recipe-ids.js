require('dotenv').config();
const db = require('./src/config/db');

(async () => {
  try {
    const recipes = await db.query('SELECT recipe_id, name FROM recipes ORDER BY recipe_id');
    console.log('Available recipes:');
    recipes.rows.forEach(r => console.log(`  ${r.recipe_id}: ${r.name}`));
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
