require('dotenv').config();
const db = require('./src/config/db');

// Sample pricing data (in cents per pound)
const pricing = {
  'Black Beans': 150, // $1.50/lb
  'Brown Rice': 80,
  'Couscous': 120,
  'Gold/Yellow Potatoes': 60,
  'Organic Chickpeas': 200,
  'Plantains': 90,
  'Purple Sweet Potato': 100,
  'Quinoa': 350,
  'Sweet Potatoes': 80,
  'White rice': 70,
  'Black Pepper': 500,
  'Chili Powder': 400,
  'Coriander': 450,
  'Cumin': 400,
  'Garlic Powder': 300,
  'Ground Ginger': 550,
  'Gruyere': 1200,
  'Lemons': 120,
  'Limes': 110,
  'Olive Oil': 800,
  'Onion': 60,
  'Oregano': 450,
  'Paprika': 380,
  'Parmesan': 1100,
  'Parsley': 200,
  'Red Pepper Flakes': 600,
  'Red Wine Vinegar': 250,
  'Soy Sauce': 300,
  'Thyme': 500,
  'Turmeric': 480,
  'Chicken Breast': 400,
  'Flank Steak': 900,
  'Ground beef': 600,
  'Ground Turkey': 500,
  'Ribeye': 1200,
};

async function populatePricing() {
  try {
    console.log('Populating inventory pricing...');

    for (const [itemName, priceCents] of Object.entries(pricing)) {
      const result = await db.query(
        `UPDATE inventory SET unit_price_cents = $1 WHERE name ILIKE $2`,
        [priceCents, `%${itemName}%`]
      );

      if (result.rowCount > 0) {
        console.log(`✅ ${itemName}: $${(priceCents / 100).toFixed(2)}/lb`);
      }
    }

    console.log('\n✅ Pricing populated');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

populatePricing();
