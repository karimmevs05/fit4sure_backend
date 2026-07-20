require('dotenv').config();
const db = require('./src/config/db');

async function rebuildInventory() {
  try {
    console.log('Dropping old inventory table...');
    await db.query('DROP TABLE IF EXISTS inventory CASCADE');

    console.log('Creating new inventory table with correct schema...');
    await db.query(`
      CREATE TABLE inventory (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        store VARCHAR(100),
        grade VARCHAR(100),
        net_weight_g DECIMAL(10,2),
        price_per_pound DECIMAL(10,2),
        serving_size_g DECIMAL(10,2) NOT NULL,
        servings_per_container DECIMAL(10,2),
        price_total_cents INTEGER,
        price_per_serving_cents INTEGER NOT NULL,
        date_purchased DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('Inserting inventory data from Cost sheet...');

    const inventoryData = [
      // PROTEIN - Direct from your sheet
      { name: 'Chicken Breast', category: 'Protein', store: 'Sams Club', grade: 'Organic', net_weight_g: 454, price_per_pound: 5.98, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 598, price_per_serving_cents: 243, date_purchased: '2024-11-26' },
      { name: 'Chicken Thighs', category: 'Protein', store: 'Sams Club', grade: 'Organic', net_weight_g: 454, price_per_pound: 5.28, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 598, price_per_serving_cents: 243, date_purchased: '2024-04-25' },
      { name: 'Ground beef', category: 'Protein', store: 'Sams Club', grade: 'Pastured', net_weight_g: 454, price_per_pound: 5.78, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 578, price_per_serving_cents: 235, date_purchased: '2025-05-13' },
      { name: 'Flank Steak', category: 'Protein', grade: 'USDA Choice', net_weight_g: 454, price_per_pound: 11.98, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 1198, price_per_serving_cents: 487 },
      { name: 'Chuck Roll', category: 'Protein', store: 'Sams Club', grade: 'USDA Choice', net_weight_g: 454, price_per_pound: 5.98, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 598, price_per_serving_cents: 243, date_purchased: '2024-11-13' },
      { name: 'Ground Turkey', category: 'Protein', store: 'Sams', grade: 'Natural', net_weight_g: 1814, price_per_pound: 4.25, serving_size_g: 141.7, servings_per_container: 12.8, price_total_cents: 1699, price_per_serving_cents: 172, date_purchased: '2024-11-26' },
      { name: 'Ground Turkey (Costco)', category: 'Protein', store: 'Costco', grade: 'Organic', net_weight_g: 1361, price_per_pound: 5.00, serving_size_g: 141.7, servings_per_container: 9.6, price_total_cents: 1999, price_per_serving_cents: 271, date_purchased: '2024-11-27' },
      { name: 'Salmon', category: 'Protein', store: 'Sams', grade: 'Wild Caught', net_weight_g: 454, price_per_pound: 13.99, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 1399, price_per_serving_cents: 568 },
      { name: 'Lamb Roast', category: 'Protein', grade: 'Pastured', net_weight_g: 454, price_per_pound: 5.48, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 0, price_per_serving_cents: 0 },
      { name: 'Pork Tenderloin', category: 'Protein', grade: 'N/A', net_weight_g: 454, price_per_pound: 2.60, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 298, price_per_serving_cents: 121 },
      { name: 'Ribeye Grassfed & Finished', category: 'Protein', store: 'Sams', grade: 'Pastured', net_weight_g: 454, price_per_pound: 12.98, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 1298, price_per_serving_cents: 527 },
      { name: 'Ribeye Grassfed & Finished (Aldi)', category: 'Protein', store: 'Aldi', grade: 'Grass-fed', net_weight_g: 454, price_per_pound: 11.49, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 1149, price_per_serving_cents: 467 },
      { name: 'Top Sirloin Grassfed & Finished', category: 'Protein', store: 'Sams', grade: 'Pastured', net_weight_g: 454, price_per_pound: 8.98, serving_size_g: 141.7, servings_per_container: 3.2, price_total_cents: 898, price_per_serving_cents: 365 },
      { name: 'Beef Heart', category: 'Protein', store: 'Blackwing Meats', grade: 'Pastured', net_weight_g: 454, price_per_pound: 8.00, serving_size_g: 28, servings_per_container: 16.2, price_total_cents: 800, price_per_serving_cents: 64 },
      { name: 'Beef Liver', category: 'Protein', store: 'Trailbail', grade: 'Pastured', net_weight_g: 454, price_per_pound: 8.00, serving_size_g: 14, servings_per_container: 32.4, price_total_cents: 800, price_per_serving_cents: 32 },
      { name: 'Beef Patties', category: 'Protein', store: 'Costco', grade: 'Grassfed', net_weight_g: 2270, price_per_pound: 5.40, serving_size_g: 140, servings_per_container: 15.0, price_total_cents: 2699, price_per_serving_cents: 234, date_purchased: '2025-01-06' },
      { name: 'Eggs', category: 'Protein', store: 'Sam\'s Club', grade: 'Pastured', serving_size_g: 1, servings_per_container: 18.0, price_total_cents: 622, price_per_serving_cents: 43, date_purchased: '2025-01-05' },

      // VEGETABLES
      { name: 'Organic Asparagus', category: 'Vegetables', store: 'Costco', grade: 'Organic', net_weight_g: 900, price_per_pound: 4.52, serving_size_g: 80, servings_per_container: 11.3, price_total_cents: 896, price_per_serving_cents: 100, date_purchased: '2025-05-13' },
      { name: 'Corn Can', category: 'Vegetables', store: 'Walmart', grade: 'Organic', net_weight_g: 400, serving_size_g: 80, servings_per_container: 5.0, price_total_cents: 168, price_per_serving_cents: 42, date_purchased: '2024-11-26' },
      { name: 'Cauliflower', category: 'Vegetables', net_weight_g: 907, serving_size_g: 100, servings_per_container: 9.1, price_total_cents: 599, price_per_serving_cents: 83 },
      { name: 'Broccoli', category: 'Vegetables', store: 'Costco', grade: 'Organic', net_weight_g: 1816, serving_size_g: 80, servings_per_container: 22.7, price_total_cents: 949, price_per_serving_cents: 52, date_purchased: '2024-11-26' },
      { name: 'Spring Mix', category: 'Vegetables', store: 'Costco', grade: 'Organic', net_weight_g: 454, price_per_pound: 4.49, serving_size_g: 100, servings_per_container: 4.54, price_total_cents: 449, price_per_serving_cents: 100 },
      { name: 'Carrots', category: 'Vegetables', store: 'Sams Club', grade: 'Organic', net_weight_g: 907, price_per_pound: 1.99, serving_size_g: 80, servings_per_container: 11.3, price_total_cents: 397, price_per_serving_cents: 44, date_purchased: '2024-04-25' },
      { name: 'Carrots (Costco)', category: 'Vegetables', store: 'Costco', grade: 'Rainbow', net_weight_g: 907, price_per_pound: 1.37, serving_size_g: 80, servings_per_container: 11.3, price_total_cents: 549, price_per_serving_cents: 61, date_purchased: '2024-11-26' },
      { name: 'Color bell peppers', category: 'Vegetables', store: 'Sams Club', net_weight_g: 907, price_per_pound: 1.15, serving_size_g: 80, servings_per_container: 11.3, price_total_cents: 688, price_per_serving_cents: 76, date_purchased: '2024-04-25' },
      { name: 'Golden Potatoes', category: 'Vegetables', net_weight_g: 4536, serving_size_g: 100, servings_per_container: 45.4, price_total_cents: 629, price_per_serving_cents: 17 },
      { name: 'Organic Bella Mushrooms', category: 'Vegetables', net_weight_g: 680, serving_size_g: 80, servings_per_container: 8.5, price_total_cents: 549, price_per_serving_cents: 81 },
      { name: 'Grape Tomatoes', category: 'Vegetables', store: 'Sams Club', net_weight_g: 907, price_per_pound: 2.94, serving_size_g: 100, servings_per_container: 9.1, price_total_cents: 587, price_per_serving_cents: 81, date_purchased: '2024-04-25' },
      { name: 'Green Beans', category: 'Vegetables', store: 'Sams Club', grade: 'Organic', net_weight_g: 907, price_per_pound: 2.44, serving_size_g: 80, servings_per_container: 11.3, price_total_cents: 488, price_per_serving_cents: 54, date_purchased: '2024-04-25' },
      { name: 'Squash Zucchini', category: 'Vegetables', store: 'Costco', grade: 'Organic', net_weight_g: 1588, price_per_pound: 2.28, serving_size_g: 90, servings_per_container: 17.6, price_total_cents: 799, price_per_serving_cents: 57, date_purchased: '2024-04-25' },
      { name: 'Mini Peppers', category: 'Vegetables', store: 'Sams Club', net_weight_g: 679, price_per_pound: 3.72, serving_size_g: 80, servings_per_container: 8.49, price_total_cents: 557, price_per_serving_cents: 65, date_purchased: '2024-04-25' },
      { name: 'Spinach Organic', category: 'Vegetables', store: 'Sams Club', grade: 'Organic', net_weight_g: 454, price_per_pound: 4.38, serving_size_g: 70, servings_per_container: 6.5, price_total_cents: 438, price_per_serving_cents: 84, date_purchased: '2024-04-25' },
      { name: 'Sweet Onion', category: 'Vegetables', store: 'Sams Club', net_weight_g: 2721, price_per_pound: 0.99, serving_size_g: 100, servings_per_container: 27.21, price_total_cents: 592, price_per_serving_cents: 22, date_purchased: '2024-04-25' },

      // CARBOHYDRATES
      { name: 'Couscous', category: 'Carbohydrates', net_weight_g: 454, serving_size_g: 125, servings_per_container: 3.6, price_total_cents: 594, price_per_serving_cents: 164 },
      { name: 'Quinoa', category: 'Carbohydrates', store: 'Sams Club', grade: 'Organic', net_weight_g: 2041, price_per_pound: 2.22, serving_size_g: 150, servings_per_container: 13.6, price_total_cents: 999, price_per_serving_cents: 73, date_purchased: '2024-12-12' },
      { name: 'Gold/Yellow Potatoes', category: 'Carbohydrates', store: 'Sam\'s Club', net_weight_g: 4480, price_per_pound: 0.68, serving_size_g: 200, servings_per_container: 22.4, price_total_cents: 682, price_per_serving_cents: 30, date_purchased: '2024-12-13' },
      { name: 'Sweet Potatoes', category: 'Carbohydrates', store: 'Sams Club', net_weight_g: 2268, price_per_pound: 1.00, serving_size_g: 200, servings_per_container: 11.3, price_total_cents: 498, price_per_serving_cents: 44, date_purchased: '2024-04-25' },
      { name: 'White rice', category: 'Carbohydrates', store: 'Costco', grade: 'Organic', net_weight_g: 9080, price_per_pound: 0.80, serving_size_g: 150, servings_per_container: 60.5, price_total_cents: 1599, price_per_serving_cents: 26, date_purchased: '2024-11-26' },
      { name: 'Brown Rice', category: 'Carbohydrates', store: 'Costco', grade: 'Organic', net_weight_g: 4540, price_per_pound: 2.16, serving_size_g: 150, servings_per_container: 30.3, price_total_cents: 1399, price_per_serving_cents: 46, date_purchased: '2024-11-26' },
      { name: 'Black Beans', category: 'Carbohydrates', store: 'Costco', grade: 'Organic', net_weight_g: 3200, serving_size_g: 100, servings_per_container: 32.0, price_total_cents: 849, price_per_serving_cents: 27, date_purchased: '2024-11-26' },
      { name: 'Purple Sweet Potato', category: 'Carbohydrates', store: 'Abbys', grade: 'Organic', net_weight_g: 454, price_per_pound: 3.99, serving_size_g: 150, servings_per_container: 3.0, price_total_cents: 399, price_per_serving_cents: 132 },
      { name: 'Plantains', category: 'Carbohydrates', store: 'Sams', net_weight_g: 2270, price_per_pound: 3.57, serving_size_g: 150, servings_per_container: 15.1, price_total_cents: 370, price_per_serving_cents: 24 },
      { name: 'Organic Chickpeas', category: 'Carbohydrates', store: 'Costco', net_weight_g: 3200, serving_size_g: 100, servings_per_container: 32.0, price_total_cents: 849, price_per_serving_cents: 27, date_purchased: '2024-11-26' },

      // CONDIMENTS
      { name: 'Gruyere', category: 'Condiments', store: 'Costco', grade: 'Raw', net_weight_g: 455, price_per_pound: 12.79, serving_size_g: 28, servings_per_container: 16.2, price_total_cents: 1279, price_per_serving_cents: 79, date_purchased: '2024-12-12' },
      { name: 'Roquefort', category: 'Condiments', store: 'Sam\'s Club', grade: 'Raw', net_weight_g: 455, price_per_pound: 16.24, serving_size_g: 28, servings_per_container: 16.2, price_total_cents: 1624, price_per_serving_cents: 100, date_purchased: '2024-12-13' },
      { name: 'Worcestershire Sauce', category: 'Condiments', store: 'Sams Club', net_weight_g: 1120, price_per_pound: 9.38, serving_size_g: 15, servings_per_container: 74.7, price_total_cents: 938, price_per_serving_cents: 13, date_purchased: '2024-12-13' },
      { name: 'Black Pepper', category: 'Condiments', net_weight_g: 595, serving_size_g: 5, servings_per_container: 119.0, price_total_cents: 459, price_per_serving_cents: 4, date_purchased: '2024-12-14' },
      { name: 'Soy Sauce', category: 'Condiments', net_weight_g: 2000, serving_size_g: 15, servings_per_container: 133.3, price_total_cents: 919, price_per_serving_cents: 7, date_purchased: '2024-12-15' },
      { name: 'Paprika', category: 'Condiments', store: 'Sam\'s Club', net_weight_g: 504, price_per_pound: 8.48, serving_size_g: 5, servings_per_container: 100.8, price_total_cents: 674, price_per_serving_cents: 7, date_purchased: '2024-12-16' },
      { name: 'Onion Powder', category: 'Condiments', store: 'Sam\'s Club', net_weight_g: 560, price_per_pound: 8.24, serving_size_g: 5, servings_per_container: 112.0, price_total_cents: 824, price_per_serving_cents: 7, date_purchased: '2024-12-17' },
      { name: 'Thyme', category: 'Condiments', store: 'Sam\'s Club', net_weight_g: 231, price_per_pound: 6.98, serving_size_g: 5, servings_per_container: 46.2, price_total_cents: 698, price_per_serving_cents: 15, date_purchased: '2024-12-18' },
      { name: 'Chili Powder', category: 'Condiments', store: 'Sam\'s Club', net_weight_g: 560, price_per_pound: 9.98, serving_size_g: 5, servings_per_container: 112.0, price_total_cents: 998, price_per_serving_cents: 9, date_purchased: '2024-12-19' },
      { name: 'Garlic Powder', category: 'Condiments', store: 'Sams Club', net_weight_g: 728, price_per_pound: 8.77, serving_size_g: 5, servings_per_container: 145.6, price_total_cents: 877, price_per_serving_cents: 6, date_purchased: '2024-12-20' },
      { name: 'Pink Salt', category: 'Condiments', store: 'Sams Club', net_weight_g: 784, price_per_pound: 6.98, serving_size_g: 5, servings_per_container: 156.8, price_total_cents: 698, price_per_serving_cents: 4, date_purchased: '2024-12-21' },
      { name: 'Peeled Garlic', category: 'Condiments', store: 'Sam\'s Club', net_weight_g: 1361, price_per_pound: 9.98, serving_size_g: 15, servings_per_container: 90.7, price_total_cents: 998, price_per_serving_cents: 11, date_purchased: '2024-12-23' },
      { name: 'Ground Ginger', category: 'Condiments', store: 'Sams Club', net_weight_g: 196, price_per_pound: 5.58, serving_size_g: 5, servings_per_container: 39.2, price_total_cents: 558, price_per_serving_cents: 14, date_purchased: '2024-12-22' },
      { name: 'Lemons', category: 'Condiments', store: 'Sams Club', net_weight_g: 1361, price_per_pound: 1.28, serving_size_g: 70, servings_per_container: 19.4, price_total_cents: 384, price_per_serving_cents: 20, date_purchased: '2024-04-25' },
      { name: 'Limes', category: 'Condiments', store: 'Sams Club', net_weight_g: 1082, price_per_pound: 1.66, serving_size_g: 90, servings_per_container: 12.0, price_total_cents: 396, price_per_serving_cents: 33, date_purchased: '2024-04-25' },
      { name: 'Olive Oil', category: 'Condiments', store: 'Sams Club', grade: 'Organic', net_weight_g: 2000, price_per_pound: 22.64, serving_size_g: 15, servings_per_container: 133.3, price_total_cents: 2264, price_per_serving_cents: 17 },
      { name: 'Coriander', category: 'Condiments', grade: 'Organic', net_weight_g: 43, serving_size_g: 5, servings_per_container: 8.6, price_total_cents: 436, price_per_serving_cents: 51, date_purchased: '2025-05-13' },
      { name: 'Cumin', category: 'Condiments', store: 'Sam\'s Club', net_weight_g: 448, price_per_pound: 9.58, serving_size_g: 5, servings_per_container: 89.6, price_total_cents: 958, price_per_serving_cents: 11 },

      // PACKAGING
      { name: '32 OZ Fiber To-Go Boxes', category: 'Packaging', store: 'Good Start Packaging', serving_size_g: 1, servings_per_container: 400, price_total_cents: 14030, price_per_serving_cents: 35 },
      { name: '32 OZ Fiber to-Go PLA Lids', category: 'Packaging', store: 'Good Start Packaging', serving_size_g: 1, servings_per_container: 400, price_total_cents: 14350, price_per_serving_cents: 36 },
      { name: 'Paper Bags 10x6.75x12', category: 'Packaging', serving_size_g: 1, servings_per_container: 250, price_total_cents: 9280, price_per_serving_cents: 37 },
      { name: 'Paper Bags 14x10x16', category: 'Packaging', serving_size_g: 1, servings_per_container: 200, price_total_cents: 11490, price_per_serving_cents: 57 },
      { name: 'Salad Bowl PLA 32 Oz', category: 'Packaging', serving_size_g: 1, servings_per_container: 600, price_total_cents: 18420, price_per_serving_cents: 31 },
      { name: 'Square 32 Oz Fiber Bowl', category: 'Packaging', serving_size_g: 1, servings_per_container: 400, price_total_cents: 10930, price_per_serving_cents: 27 },
      { name: '20Oz Fiber Box (Breakfast)', category: 'Packaging', serving_size_g: 1, servings_per_container: 400, price_total_cents: 11780, price_per_serving_cents: 29 },
      { name: 'Round 48Oz Fiber Bowl (Salad)', category: 'Packaging', serving_size_g: 1, servings_per_container: 300, price_total_cents: 10500, price_per_serving_cents: 35 },
      { name: 'Round 48Oz PLA Lid (Salad)', category: 'Packaging', serving_size_g: 1, servings_per_container: 300, price_total_cents: 13170, price_per_serving_cents: 44 },
    ];

    for (const item of inventoryData) {
      await db.query(
        `INSERT INTO inventory (name, category, store, grade, net_weight_g, price_per_pound, serving_size_g, servings_per_container, price_total_cents, price_per_serving_cents, date_purchased)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          item.name,
          item.category,
          item.store || null,
          item.grade || null,
          item.net_weight_g || null,
          item.price_per_pound || null,
          item.serving_size_g,
          item.servings_per_container || null,
          item.price_total_cents || 0,
          item.price_per_serving_cents,
          item.date_purchased || null,
        ]
      );
    }

    console.log(`✅ Imported ${inventoryData.length} ingredients!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

rebuildInventory();
