require('dotenv').config();
const axios = require('axios');

const USDA_API_KEY = process.env.USDA_API_KEY;
const USDA_BASE_URL = 'https://fdc.nal.usda.gov/api/foods/search';

async function testUSDA() {
  try {
    console.log('🔍 Testing USDA API...');
    console.log(`API Key present: ${!!USDA_API_KEY}`);
    console.log(`API Key length: ${USDA_API_KEY?.length}`);
    console.log();

    const testItems = [
      'Chicken Breast',
      'chicken breast',
      'Beef',
      'Flank Steak',
      'Broccoli',
      'Olive Oil',
      'Soy Sauce',
    ];

    for (const item of testItems) {
      console.log(`Testing: "${item}"`);
      try {
        const response = await axios.get(USDA_BASE_URL, {
          params: {
            query: item,
            api_key: USDA_API_KEY,
            pageSize: 1,
          },
          timeout: 5000,
        });

        if (response.data.foods && response.data.foods.length > 0) {
          const food = response.data.foods[0];
          console.log(`  ✅ Found: ${food.description}`);
          console.log(`  Nutrients count: ${food.foodNutrients?.length || 0}`);

          // Show first few nutrients
          if (food.foodNutrients) {
            food.foodNutrients.slice(0, 5).forEach((n) => {
              console.log(`    - ${n.nutrientId}: ${n.value}`);
            });
          }
        } else {
          console.log(`  ❌ No results`);
        }
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
      }
      console.log();

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

testUSDA();
