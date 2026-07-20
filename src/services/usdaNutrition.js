const axios = require('axios');

const USDA_API_KEY = process.env.USDA_API_KEY;
const USDA_BASE_URL = 'https://fdc.nal.usda.gov/api/foods/search';

/**
 * Search USDA FoodData Central for ingredient nutrition info
 * Returns protein, carbs, fat, calories per 100g
 */
async function searchUSDANutrition(ingredientName) {
  try {
    if (!USDA_API_KEY) {
      console.warn('⚠️  USDA_API_KEY not set. Get one free at https://fdc.nal.usda.gov/api-key-signup.html');
      return null;
    }

    console.log(`🔍 Searching USDA for: ${ingredientName}`);

    const response = await axios.get(USDA_BASE_URL, {
      params: {
        query: ingredientName,
        api_key: USDA_API_KEY,
        pageSize: 1,
      },
      timeout: 5000,
    });

    if (!response.data.foods || response.data.foods.length === 0) {
      console.log(`❌ No USDA match for: ${ingredientName}`);
      return null;
    }

    const food = response.data.foods[0];
    const nutrients = extractNutrients(food.foodNutrients);

    if (!nutrients) {
      console.log(`⚠️  USDA match found but missing macro data: ${food.description}`);
      return null;
    }

    console.log(`✅ Found USDA match: ${food.description}`);

    return {
      fdcId: food.fdcId,
      name: food.description,
      protein_per_100g: nutrients.protein,
      carbs_per_100g: nutrients.carbs,
      fat_per_100g: nutrients.fat,
      calories_per_100g: nutrients.calories,
    };
  } catch (error) {
    console.error('Error searching USDA:', error.message);
    return null;
  }
}

/**
 * Extract macros from USDA nutrient array
 */
function extractNutrients(foodNutrients) {
  if (!Array.isArray(foodNutrients)) return null;

  const nutrients = {};

  // USDA nutrient IDs:
  // 1003 = protein (g)
  // 1005 = carbs (g)
  // 1004 = fat (g)
  // 1008 = energy (kcal)

  for (const nutrient of foodNutrients) {
    const value = nutrient.value;

    if (nutrient.nutrientId === 1003) {
      nutrients.protein = parseFloat(value);
    } else if (nutrient.nutrientId === 1005) {
      nutrients.carbs = parseFloat(value);
    } else if (nutrient.nutrientId === 1004) {
      nutrients.fat = parseFloat(value);
    } else if (nutrient.nutrientId === 1008) {
      nutrients.calories = parseFloat(value);
    }
  }

  // Verify we got all macros
  if (
    nutrients.protein !== undefined &&
    nutrients.carbs !== undefined &&
    nutrients.fat !== undefined &&
    nutrients.calories !== undefined
  ) {
    return nutrients;
  }

  return null;
}

module.exports = {
  searchUSDANutrition,
};
