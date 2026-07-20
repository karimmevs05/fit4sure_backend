require('dotenv').config();
const db = require('./src/config/db');

// Inventory data: name -> { stock_g, price_cents_per_lb }
const inventoryData = {
  'Black Beans': { stock: 2000, price: 150 },
  'Brown Rice': { stock: 3000, price: 80 },
  'Couscous': { stock: 1500, price: 120 },
  'Gold/Yellow Potatoes': { stock: 5000, price: 60 },
  'Organic Chickpeas': { stock: 1000, price: 200 },
  'Plantains': { stock: 2000, price: 90 },
  'Purple Sweet Potato': { stock: 3000, price: 100 },
  'Quinoa': { stock: 1000, price: 350 },
  'Sweet Potatoes': { stock: 4000, price: 80 },
  'White rice': { stock: 3500, price: 70 },
  'Black Pepper': { stock: 500, price: 500 },
  'Chili Powder': { stock: 300, price: 400 },
  'Coriander': { stock: 250, price: 450 },
  'Cumin': { stock: 400, price: 400 },
  'Garlic Powder': { stock: 600, price: 300 },
  'Ground Ginger': { stock: 200, price: 550 },
  'Gruyere': { stock: 800, price: 1200 },
  'Lemons': { stock: 1500, price: 120 },
  'Limes': { stock: 1500, price: 110 },
  'Olive Oil': { stock: 2000, price: 800 },
  'Onion': { stock: 3000, price: 60 },
  'Oregano': { stock: 300, price: 450 },
  'Paprika': { stock: 400, price: 380 },
  'Parmesan': { stock: 600, price: 1100 },
  'Parsley': { stock: 500, price: 200 },
  'Red Pepper Flakes': { stock: 200, price: 600 },
  'Red Wine Vinegar': { stock: 1000, price: 250 },
  'Soy Sauce': { stock: 1500, price: 300 },
  'Thyme': { stock: 250, price: 500 },
  'Turmeric': { stock: 300, price: 480 },
  'Chicken Breast': { stock: 5000, price: 400 },
  'Flank Steak': { stock: 3000, price: 900 },
  'Ground beef': { stock: 4000, price: 600 },
  'Ground Turkey': { stock: 3500, price: 500 },
  'Ribeye': { stock: 2000, price: 1200 },
  'Broccoli': { stock: 2000, price: 150 },
  'Organic Asparagus': { stock: 1500, price: 200 },
  'Cilantro': { stock: 500, price: 300 },
  'Green Onions': { stock: 800, price: 180 },
  'Mayo': { stock: 1500, price: 400 },
  'Fresh Ginger': { stock: 400, price: 500 },
  'Honey': { stock: 1000, price: 600 },
  'Gochujang': { stock: 800, price: 700 },
};

async function populateInventory() {
  try {
    console.log('Populating inventory with stock and pricing...\n');

    let updated = 0;
    let notFound = [];

    for (const [itemName, data] of Object.entries(inventoryData)) {
      const result = await db.query(
        `UPDATE inventory
         SET current_stock_g = $1, unit_price_cents = $2
         WHERE name ILIKE $3`,
        [data.stock, data.price, `%${itemName}%`]
      );

      if (result.rowCount > 0) {
        console.log(`✅ ${itemName}: ${data.stock}g @ $${(data.price / 100).toFixed(2)}/lb`);
        updated++;
      } else {
        notFound.push(itemName);
      }
    }

    console.log(`\n✅ Updated ${updated} items`);

    if (notFound.length > 0) {
      console.log(`\n⚠️  Not found in inventory (${notFound.length}):`);
      notFound.forEach(name => console.log(`  - ${name}`));
    }

    // Show what's in inventory now
    const allItems = await db.query(
      `SELECT name, current_stock_g, unit_price_cents FROM inventory WHERE current_stock_g > 0 ORDER BY name LIMIT 5`
    );

    console.log('\n📦 Sample inventory now:');
    allItems.rows.forEach(row => {
      const costPerLb = row.unit_price_cents / 100;
      console.log(`  - ${row.name}: ${row.current_stock_g}g @ $${costPerLb.toFixed(2)}/lb`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

populateInventory();
