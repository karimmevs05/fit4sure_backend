require('dotenv').config();
const db = require('./src/config/db');

// USDA FoodData Central nutrition data for common ingredients
// All values per 100g of food
const nutritionData = [
  // Proteins
  { name: 'Chicken Breast', protein: 31.0, carbs: 0, fat: 3.6, calories: 165, fdc_id: 'USDA_170102' },
  { name: 'Chicken Thighs', protein: 26.0, carbs: 0, fat: 9.3, calories: 189, fdc_id: 'USDA_170103' },
  { name: 'Ground beef', protein: 27.0, carbs: 0, fat: 11.0, calories: 215, fdc_id: 'USDA_170073' },
  { name: 'Flank Steak', protein: 26.2, carbs: 0, fat: 8.6, calories: 192, fdc_id: 'USDA_170006' },
  { name: 'Chuck Roll', protein: 25.6, carbs: 0, fat: 13.7, calories: 226, fdc_id: 'USDA_170016' },
  { name: 'Ground Turkey', protein: 29.0, carbs: 0, fat: 0.5, calories: 120, fdc_id: 'USDA_170145' },
  { name: 'Salmon', protein: 25.4, carbs: 0, fat: 13.6, calories: 208, fdc_id: 'USDA_170090' },
  { name: 'Lamb Roast', protein: 27.0, carbs: 0, fat: 10.0, calories: 209, fdc_id: 'USDA_170115' },
  { name: 'Pork Tenderloin', protein: 27.3, carbs: 0, fat: 3.1, calories: 143, fdc_id: 'USDA_170126' },
  { name: 'Ribeye Grassfed & Finished', protein: 26.0, carbs: 0, fat: 9.0, calories: 200, fdc_id: 'USDA_170005' },
  { name: 'Top Sirloin Grassfed & Finished', protein: 27.0, carbs: 0, fat: 7.5, calories: 195, fdc_id: 'USDA_170009' },
  { name: 'Beef Heart', protein: 21.0, carbs: 0, fat: 5.0, calories: 130, fdc_id: 'USDA_170024' },
  { name: 'Beef Liver', protein: 26.4, carbs: 5.3, fat: 6.3, calories: 175, fdc_id: 'USDA_170022' },
  { name: 'Beef Patties', protein: 27.0, carbs: 0, fat: 11.0, calories: 215, fdc_id: 'USDA_170073' },
  { name: 'Eggs', protein: 13.0, carbs: 1.1, fat: 11.0, calories: 155, fdc_id: 'USDA_170145' },

  // Vegetables
  { name: 'Organic Asparagus', protein: 2.2, carbs: 3.7, fat: 0.1, calories: 20, fdc_id: 'USDA_170030' },
  { name: 'Corn Can', protein: 3.3, carbs: 17.2, fat: 1.2, calories: 86, fdc_id: 'USDA_170128' },
  { name: 'Cauliflower', protein: 1.9, carbs: 4.9, fat: 0.3, calories: 25, fdc_id: 'USDA_170135' },
  { name: 'Broccoli', protein: 2.8, carbs: 6.6, fat: 0.4, calories: 34, fdc_id: 'USDA_170133' },
  { name: 'Spring Mix', protein: 1.3, carbs: 1.7, fat: 0.1, calories: 10, fdc_id: 'USDA_170421' },
  { name: 'Carrots', protein: 0.9, carbs: 9.6, fat: 0.2, calories: 41, fdc_id: 'USDA_170085' },
  { name: 'Color bell peppers', protein: 0.9, carbs: 6.0, fat: 0.3, calories: 31, fdc_id: 'USDA_170107' },
  { name: 'Golden Potatoes', protein: 2.0, carbs: 17.5, fat: 0.1, calories: 77, fdc_id: 'USDA_170148' },
  { name: 'Organic Bella Mushrooms', protein: 3.1, carbs: 3.3, fat: 0.3, calories: 22, fdc_id: 'USDA_170520' },
  { name: 'Grape Tomatoes', protein: 0.9, carbs: 3.9, fat: 0.2, calories: 18, fdc_id: 'USDA_170560' },
  { name: 'Green Beans', protein: 1.8, carbs: 6.9, fat: 0.1, calories: 31, fdc_id: 'USDA_170134' },
  { name: 'Squash Zucchini', protein: 1.2, carbs: 3.1, fat: 0.3, calories: 17, fdc_id: 'USDA_170591' },
  { name: 'Mini Peppers', protein: 0.9, carbs: 6.0, fat: 0.3, calories: 31, fdc_id: 'USDA_170107' },
  { name: 'Spinach Organic', protein: 2.7, carbs: 3.6, fat: 0.4, calories: 23, fdc_id: 'USDA_170515' },
  { name: 'Sweet Onion', protein: 1.1, carbs: 9.3, fat: 0.1, calories: 40, fdc_id: 'USDA_170100' },

  // Carbohydrates
  { name: 'Couscous', protein: 12.0, carbs: 76.0, fat: 0.6, calories: 354, fdc_id: 'USDA_20028' },
  { name: 'Quinoa', protein: 14.1, carbs: 64.2, fat: 6.3, calories: 368, fdc_id: 'USDA_20037' },
  { name: 'Gold/Yellow Potatoes', protein: 2.0, carbs: 17.5, fat: 0.1, calories: 77, fdc_id: 'USDA_170148' },
  { name: 'Sweet Potatoes', protein: 1.6, carbs: 20.1, fat: 0.1, calories: 86, fdc_id: 'USDA_170165' },
  { name: 'White rice', protein: 2.7, carbs: 78.0, fat: 0.3, calories: 321, fdc_id: 'USDA_20037' },
  { name: 'Brown Rice', protein: 2.6, carbs: 77.2, fat: 0.8, calories: 320, fdc_id: 'USDA_20034' },
  { name: 'Black Beans', protein: 8.9, carbs: 24.4, fat: 0.5, calories: 132, fdc_id: 'USDA_170512' },
  { name: 'Purple Sweet Potato', protein: 1.6, carbs: 20.1, fat: 0.1, calories: 86, fdc_id: 'USDA_170165' },
  { name: 'Plantains', protein: 1.3, carbs: 27.9, fat: 0.3, calories: 122, fdc_id: 'USDA_170219' },
  { name: 'Organic Chickpeas', protein: 19.0, carbs: 27.0, fat: 6.0, calories: 270, fdc_id: 'USDA_170510' },

  // Dairy
  { name: 'Gruyere', protein: 29.0, carbs: 0.4, fat: 32.0, calories: 413, fdc_id: 'USDA_170248' },
  { name: 'Roquefort', protein: 21.5, carbs: 2.4, fat: 35.0, calories: 369, fdc_id: 'USDA_170253' },

  // Sauces & Condiments
  { name: 'Worcestershire Sauce', protein: 0.5, carbs: 2.5, fat: 0, calories: 13, fdc_id: 'USDA_430421' },
  { name: 'Soy Sauce', protein: 7.6, carbs: 5.6, fat: 0.6, calories: 61, fdc_id: 'USDA_430486' },

  // Spices & Seasonings
  { name: 'Black Pepper', protein: 10.4, carbs: 64.8, fat: 3.3, calories: 251, fdc_id: 'USDA_431287' },
  { name: 'Paprika', protein: 14.0, carbs: 49.0, fat: 13.0, calories: 282, fdc_id: 'USDA_431321' },
  { name: 'Onion Powder', protein: 8.7, carbs: 84.4, fat: 0.7, calories: 341, fdc_id: 'USDA_431339' },
  { name: 'Thyme', protein: 5.6, carbs: 63.9, fat: 1.7, calories: 276, fdc_id: 'USDA_431356' },
  { name: 'Chili Powder', protein: 13.5, carbs: 49.4, fat: 13.3, calories: 282, fdc_id: 'USDA_431326' },
  { name: 'Garlic Powder', protein: 6.4, carbs: 82.6, fat: 0.5, calories: 331, fdc_id: 'USDA_431371' },
  { name: 'Pink Salt', protein: 0, carbs: 0, fat: 0, calories: 0, fdc_id: 'USDA_431325' },
  { name: 'Peeled Garlic', protein: 6.4, carbs: 33.1, fat: 0.5, calories: 149, fdc_id: 'USDA_170378' },
  { name: 'Ground Ginger', protein: 8.8, carbs: 71.6, fat: 4.3, calories: 335, fdc_id: 'USDA_431316' },
  { name: 'Coriander', protein: 12.0, carbs: 54.9, fat: 17.8, calories: 298, fdc_id: 'USDA_431314' },
  { name: 'Cumin', protein: 17.6, carbs: 44.0, fat: 22.3, calories: 375, fdc_id: 'USDA_431315' },

  // Oils
  { name: 'Olive Oil', protein: 0, carbs: 0, fat: 100.0, calories: 884, fdc_id: 'USDA_171329' },

  // Citrus
  { name: 'Lemons', protein: 1.1, carbs: 9.3, fat: 0.3, calories: 29, fdc_id: 'USDA_170143' },
  { name: 'Limes', protein: 0.7, carbs: 11.0, fat: 0.2, calories: 30, fdc_id: 'USDA_170144' },
];

async function seedNutritionDb() {
  try {
    console.log('🌱 Seeding nutrition database...\n');

    for (const item of nutritionData) {
      try {
        // Check if ingredient exists
        const checkResult = await db.query(
          'SELECT id FROM inventory WHERE LOWER(name) = LOWER($1)',
          [item.name]
        );

        if (checkResult.rows.length > 0) {
          const inventoryId = checkResult.rows[0].id;

          // Update with nutrition data
          await db.query(
            `UPDATE inventory
             SET protein_per_100g = $1, carbs_per_100g = $2, fat_per_100g = $3, calories_per_100g = $4, usda_fdc_id = $5, macros_source = 'local_seed'
             WHERE id = $6`,
            [item.protein, item.carbs, item.fat, item.calories, item.fdc_id, inventoryId]
          );

          console.log(`✅ ${item.name}`);
          console.log(`   Protein: ${item.protein}g | Carbs: ${item.carbs}g | Fat: ${item.fat}g | Calories: ${item.calories}`);
        } else {
          console.log(`⚠️  ${item.name} not found in inventory (skip)`);
        }
      } catch (err) {
        console.log(`❌ Error processing ${item.name}: ${err.message}`);
      }
    }

    console.log('\n✅ Nutrition database seeded!');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

seedNutritionDb();
