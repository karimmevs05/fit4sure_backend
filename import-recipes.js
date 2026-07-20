require('dotenv').config();
const db = require('./src/config/db');

const recipes = [
  // PROTEIN - BEEF DISHES
  {
    name: 'Steak Cafe',
    category: 'beef',
    description: 'Flank steak with garlic, olive oil, coffee, soy sauce, oregano, and lime',
    ingredients: [
      { name: 'Flank Steak', quantity: 910, unit: 'g' },
      { name: 'Garlic Powder', quantity: 15, unit: 'g' },
      { name: 'Olive Oil', quantity: 120, unit: 'g' },
      { name: 'Soy Sauce', quantity: 240, unit: 'ml' },
      { name: 'Oregano', quantity: 30, unit: 'g' },
      { name: 'Limes', quantity: 90, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 30,
  },
  {
    name: 'Steak Taco Bowl',
    category: 'beef',
    description: 'Steak with lime, cilantro, and Mexican spices',
    ingredients: [
      { name: 'Flank Steak', quantity: 910, unit: 'g' },
      { name: 'Cumin', quantity: 10, unit: 'g' },
      { name: 'Olive Oil', quantity: 15, unit: 'g' },
      { name: 'Limes', quantity: 180, unit: 'g' },
      { name: 'Chili Powder', quantity: 5, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 25,
  },
  {
    name: 'Balsamic Chuck',
    category: 'beef',
    description: 'Chuck steak with balsamic vinegar and herbs',
    ingredients: [
      { name: 'Flank Steak', quantity: 910, unit: 'g' },
      { name: 'Balsamic Vinegar', quantity: 120, unit: 'ml' },
      { name: 'Garlic Powder', quantity: 15, unit: 'g' },
      { name: 'Worcestershire Sauce', quantity: 60, unit: 'ml' },
    ],
    servings: 6,
    prep_time_minutes: 35,
  },
  {
    name: 'Beef Shawarma',
    category: 'beef',
    description: 'Spiced steak with Middle Eastern seasonings',
    ingredients: [
      { name: 'Flank Steak', quantity: 910, unit: 'g' },
      { name: 'Olive Oil', quantity: 60, unit: 'g' },
      { name: 'Lemon Juice', quantity: 22.5, unit: 'g' },
      { name: 'Allspice', quantity: 15, unit: 'g' },
      { name: 'Coriander', quantity: 15, unit: 'g' },
      { name: 'Garlic Powder', quantity: 5, unit: 'g' },
      { name: 'Paprika', quantity: 15, unit: 'g' },
      { name: 'Cumin', quantity: 15, unit: 'g' },
      { name: 'Sumac', quantity: 5, unit: 'g' },
      { name: 'Black Pepper', quantity: 2.5, unit: 'g' },
      { name: 'Turmeric', quantity: 1.25, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 40,
  },
  {
    name: 'Chimichurri Beef',
    category: 'beef',
    description: 'Ground beef with chimichurri sauce',
    ingredients: [
      { name: 'Ground beef', quantity: 455, unit: 'g' },
      { name: 'Garlic Powder', quantity: 15, unit: 'g' },
      { name: 'Smoked Paprika', quantity: 5, unit: 'g' },
      { name: 'Red Pepper Flakes', quantity: 1.25, unit: 'g' },
      { name: 'Cumin', quantity: 2.5, unit: 'g' },
      { name: 'Onion Powder', quantity: 30, unit: 'g' },
    ],
    servings: 3,
    prep_time_minutes: 20,
  },
  {
    name: 'Kefta',
    category: 'beef',
    description: 'Moroccan-spiced ground beef with ginger and gochujang',
    ingredients: [
      { name: 'Ground beef', quantity: 910, unit: 'g' },
      { name: 'Soy Sauce', quantity: 120, unit: 'ml' },
      { name: 'Honey', quantity: 30, unit: 'g' },
      { name: 'Gochujang', quantity: 30, unit: 'g' },
      { name: 'Ginger', quantity: 15, unit: 'g' },
      { name: 'Garlic Powder', quantity: 30, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 25,
  },
  {
    name: 'Mediterranean Meatballs',
    category: 'beef',
    description: 'Beef and lamb meatballs with Mediterranean herbs',
    ingredients: [
      { name: 'Ground beef', quantity: 455, unit: 'g' },
      { name: 'Oregano', quantity: 20, unit: 'g' },
      { name: 'Cumin', quantity: 5, unit: 'g' },
      { name: 'Garlic Powder', quantity: 15, unit: 'g' },
      { name: 'Lemon Zest', quantity: 7.5, unit: 'g' },
      { name: 'Eggs', quantity: 1, unit: 'count' },
    ],
    servings: 3,
    prep_time_minutes: 30,
  },

  // PROTEIN - CHICKEN DISHES
  {
    name: 'Blackened Chicken',
    category: 'chicken',
    description: 'Chicken breast with blackened Cajun spices',
    ingredients: [
      { name: 'Chicken Breast', quantity: 910, unit: 'g' },
      { name: 'Cumin', quantity: 2.5, unit: 'g' },
      { name: 'Chili Powder', quantity: 10, unit: 'g' },
      { name: 'Coriander', quantity: 2.5, unit: 'g' },
      { name: 'Red Pepper Flakes', quantity: 1.25, unit: 'g' },
      { name: 'Olive Oil', quantity: 30, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 25,
  },
  {
    name: 'Lemon Chicken',
    category: 'chicken',
    description: 'Chicken with lemon and fresh herbs',
    ingredients: [
      { name: 'Chicken Breast', quantity: 910, unit: 'g' },
      { name: 'Lemon Zest', quantity: 15, unit: 'g' },
      { name: 'Olive Oil', quantity: 75, unit: 'g' },
      { name: 'Red Pepper Flakes', quantity: 10, unit: 'g' },
      { name: 'Parsley', quantity: 120, unit: 'g' },
      { name: 'Fresh Garlic', quantity: 30, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 30,
  },
  {
    name: 'Mexican Chicken',
    category: 'chicken',
    description: 'Chicken with Mexican spices and lime',
    ingredients: [
      { name: 'Chicken Breast', quantity: 910, unit: 'g' },
      { name: 'Smoked Paprika', quantity: 15, unit: 'g' },
      { name: 'Oregano', quantity: 15, unit: 'g' },
      { name: 'Chili Powder', quantity: 15, unit: 'g' },
      { name: 'Lime Juice', quantity: 60, unit: 'ml' },
      { name: 'Fresh Cilantro', quantity: 30, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 25,
  },
  {
    name: 'Peruvian Chicken',
    category: 'chicken',
    description: 'Chicken with Peruvian green sauce (aji verde style)',
    ingredients: [
      { name: 'Chicken Breast', quantity: 910, unit: 'g' },
      { name: 'Olive Oil', quantity: 15, unit: 'g' },
      { name: 'Cumin', quantity: 10, unit: 'g' },
      { name: 'Oregano', quantity: 20, unit: 'g' },
      { name: 'Paprika', quantity: 5, unit: 'g' },
      { name: 'Lime Juice', quantity: 30, unit: 'ml' },
      { name: 'Soy Sauce', quantity: 79.2, unit: 'ml' },
    ],
    servings: 6,
    prep_time_minutes: 30,
  },
  {
    name: 'Thai Chicken',
    category: 'chicken',
    description: 'Chicken with Thai spices and ginger',
    ingredients: [
      { name: 'Chicken Breast', quantity: 910, unit: 'g' },
      { name: 'Ginger Powder', quantity: 2.5, unit: 'g' },
      { name: 'Lime Juice', quantity: 30, unit: 'ml' },
      { name: 'Soy Sauce', quantity: 60, unit: 'ml' },
      { name: 'Red Pepper Flakes', quantity: 2.5, unit: 'g' },
      { name: 'Green Onions', quantity: 40, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 20,
  },
  {
    name: 'Greek Chicken',
    category: 'chicken',
    description: 'Chicken with Greek herbs and olive oil',
    ingredients: [
      { name: 'Chicken Breast', quantity: 455, unit: 'g' },
      { name: 'Olive Oil', quantity: 60, unit: 'g' },
      { name: 'Oregano', quantity: 20, unit: 'g' },
      { name: 'Lemon Juice', quantity: 15, unit: 'ml' },
      { name: 'Red Wine Vinegar', quantity: 30, unit: 'ml' },
      { name: 'Red Pepper Flakes', quantity: 2.5, unit: 'g' },
    ],
    servings: 3,
    prep_time_minutes: 25,
  },

  // PROTEIN - TURKEY
  {
    name: 'Greek Turkey Patties',
    category: 'turkey',
    description: 'Ground turkey patties with Greek seasonings',
    ingredients: [
      { name: 'Ground Turkey', quantity: 910, unit: 'g' },
      { name: 'Oregano', quantity: 5, unit: 'g' },
      { name: 'Dill', quantity: 30, unit: 'g' },
      { name: 'Garlic Powder', quantity: 30, unit: 'g' },
      { name: 'Parsley', quantity: 30, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 20,
  },
  {
    name: 'Greek Ground Turkey',
    category: 'turkey',
    description: 'Ground turkey with Greek herbs and spices',
    ingredients: [
      { name: 'Ground Turkey', quantity: 910, unit: 'g' },
      { name: 'Onion Powder', quantity: 5, unit: 'g' },
      { name: 'Garlic Powder', quantity: 5, unit: 'g' },
      { name: 'Thyme', quantity: 5, unit: 'g' },
      { name: 'Basil', quantity: 10, unit: 'g' },
      { name: 'Oregano', quantity: 20, unit: 'g' },
      { name: 'Sundried Tomatoes', quantity: 79.2, unit: 'g' },
    ],
    servings: 6,
    prep_time_minutes: 25,
  },

  // CARBOHYDRATES
  {
    name: 'Quinoa',
    category: 'carbohydrates',
    description: 'Basic quinoa with seasonings',
    ingredients: [
      { name: 'Quinoa', quantity: 150, unit: 'g' },
    ],
    servings: 1,
    prep_time_minutes: 15,
  },
  {
    name: 'Sweet Potato',
    category: 'carbohydrates',
    description: 'Roasted sweet potato with seasonings',
    ingredients: [
      { name: 'Sweet Potatoes', quantity: 200, unit: 'g' },
      { name: 'Paprika', quantity: 1.25, unit: 'g' },
      { name: 'Onion Powder', quantity: 1.25, unit: 'g' },
      { name: 'Garlic Powder', quantity: 2.5, unit: 'g' },
    ],
    servings: 1,
    prep_time_minutes: 20,
  },
  {
    name: 'Black Beans',
    category: 'carbohydrates',
    description: 'Seasoned black beans',
    ingredients: [
      { name: 'Black Beans', quantity: 100, unit: 'g' },
      { name: 'Cumin', quantity: 1.25, unit: 'g' },
      { name: 'Garlic Powder', quantity: 2.5, unit: 'g' },
    ],
    servings: 1,
    prep_time_minutes: 10,
  },

  // VEGETABLES
  {
    name: 'Roasted Broccoli',
    category: 'vegetables',
    description: 'Roasted broccoli with olive oil and seasonings',
    ingredients: [
      { name: 'Broccoli', quantity: 80, unit: 'g' },
      { name: 'Olive Oil', quantity: 15, unit: 'g' },
      { name: 'Garlic Powder', quantity: 5, unit: 'g' },
    ],
    servings: 1,
    prep_time_minutes: 15,
  },
  {
    name: 'Roasted Asparagus',
    category: 'vegetables',
    description: 'Roasted asparagus with lemon',
    ingredients: [
      { name: 'Organic Asparagus', quantity: 80, unit: 'g' },
      { name: 'Olive Oil', quantity: 15, unit: 'g' },
      { name: 'Limes', quantity: 10, unit: 'g' },
    ],
    servings: 1,
    prep_time_minutes: 12,
  },

  // SAUCES
  {
    name: 'Aji Verde Sauce',
    category: 'sauces',
    description: 'Green Peruvian sauce with jalapenos and cilantro',
    ingredients: [
      { name: 'Cilantro', quantity: 120, unit: 'g' },
      { name: 'Green Onions', quantity: 30, unit: 'g' },
      { name: 'Garlic Powder', quantity: 30, unit: 'g' },
      { name: 'Mayo', quantity: 120, unit: 'g' },
      { name: 'Lime Juice', quantity: 15, unit: 'ml' },
      { name: 'Olive Oil', quantity: 30, unit: 'g' },
    ],
    servings: 8,
    prep_time_minutes: 10,
  },
  {
    name: 'Ginger Sauce',
    category: 'sauces',
    description: 'Shoyu-based ginger sauce',
    ingredients: [
      { name: 'Soy Sauce', quantity: 240, unit: 'ml' },
      { name: 'Fresh Ginger', quantity: 50, unit: 'g' },
      { name: 'Honey', quantity: 5, unit: 'g' },
      { name: 'Onion', quantity: 120, unit: 'g' },
    ],
    servings: 10,
    prep_time_minutes: 10,
  },
];

async function importRecipes() {
  try {
    console.log('Importing recipes...');

    // Clear existing recipes
    console.log('Clearing existing recipes...');
    await db.query('DELETE FROM recipe_ingredients');
    await db.query('DELETE FROM recipes');

    // Get inventory items for ingredient matching
    const inventoryRes = await db.query(
      'SELECT id, name FROM inventory ORDER BY name'
    );
    const inventoryMap = {};
    inventoryRes.rows.forEach((item) => {
      inventoryMap[item.name.toLowerCase()] = item.id;
    });

    let recipeCount = 0;
    let ingredientCount = 0;

    for (const recipe of recipes) {
      // Create recipe
      const recipeRes = await db.query(
        `INSERT INTO recipes (name, category, description, servings, prep_time_minutes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING recipe_id`,
        [
          recipe.name,
          recipe.category,
          recipe.description,
          recipe.servings,
          recipe.prep_time_minutes,
        ]
      );

      const recipeId = recipeRes.rows[0].recipe_id;
      recipeCount++;

      // Add ingredients
      for (const ing of recipe.ingredients) {
        const inventoryId = inventoryMap[ing.name.toLowerCase()];

        if (inventoryId) {
          await db.query(
            `INSERT INTO recipe_ingredients (recipe_id, inventory_id, quantity_g)
             VALUES ($1, $2, $3)`,
            [recipeId, inventoryId, ing.quantity]
          );
          ingredientCount++;
        } else {
          console.warn(
            `⚠️  Could not match ingredient "${ing.name}" for recipe "${recipe.name}"`
          );
        }
      }
    }

    console.log(
      `✅ Imported ${recipeCount} recipes with ${ingredientCount} ingredients`
    );
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

importRecipes();
