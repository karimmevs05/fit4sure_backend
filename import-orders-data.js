require('dotenv').config();
const db = require('./src/config/db');
const fs = require('fs');
const path = require('path');

// Raw data from your spreadsheet - extracted from the CSV
const orderData = {
  'Week of 1.18': {
    recipes: [
      { name: 'Chicken Kefta Pita and Mixed Vaggies', day: 'Monday' },
      { name: 'Carnitas Pork, Corn and Potatoes', day: 'Monday' },
      { name: 'Ground Beef Gochujang White Rice Vaggies', day: 'Monday' },
      { name: 'Pesto Chicken, Potatoes, Veggies', day: 'Thursday' },
      { name: 'Steak, Potatoes, asparagus', day: 'Thursday' },
    ],
    customers: [
      { name: 'Alejandro', monday: 0, thursday: 0, notes: '3 lbs of Chicken only' },
      { name: 'Drew', monday: 0, thursday: 0, notes: 'No Quinoa' },
      { name: 'Bruce', monday: 2, thursday: 2, notes: 'No Quinoa, broccoli, tomatoes, corn, no porc, no turkey' },
      { name: 'Joe', monday: 4, thursday: 4, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Andy', monday: 3, thursday: 3, notes: '' },
      { name: 'Robert', monday: 3, thursday: 1, notes: 'Trying to eat more proteine' },
      { name: 'Brooke', monday: 2, thursday: 2, notes: 'No beef no pork' },
      { name: 'Zoey', monday: 3, thursday: 2, notes: 'High protein non allergies' },
      { name: 'Airea', monday: 3, thursday: 1, notes: 'High protein non allergies' },
    ],
  },
  'Week of 1.25': {
    recipes: [
      { name: 'Chicken Quinoa Sweet Potato Bowl', day: 'Monday' },
      { name: 'BBQ pulled Porc, Potatoes, Green Beans', day: 'Monday' },
      { name: 'Ground Turkey, Rice, Peppers', day: 'Monday' },
      { name: 'Chicken fried Rice', day: 'Thursday' },
      { name: 'Steak, Potatoes, mixed veggies', day: 'Thursday' },
    ],
    customers: [
      { name: 'Alejandro', monday: 0, thursday: 0, notes: '3 lbs of Chicken only' },
      { name: 'Drew', monday: 2, thursday: 1, notes: 'No Quinoa' },
      { name: 'Bruce', monday: 2, thursday: 0, notes: 'No Quinoa, broccoli, tomatoes, corn, no porc, no turkey' },
      { name: 'Joe', monday: 4, thursday: 4, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Andy', monday: 3, thursday: 0, notes: '' },
      { name: 'Robert', monday: 3, thursday: 1, notes: 'Trying to eat more proteine' },
      { name: 'Brooke', monday: 2, thursday: 2, notes: 'No beef no pork' },
      { name: 'Zoey', monday: 3, thursday: 2, notes: 'High protein non allergies' },
      { name: 'Airea', monday: 3, thursday: 1, notes: 'High protein non allergies' },
    ],
  },
  'Week of 7.12': {
    recipes: [
      { name: 'Chicken Kefta Parsley Rice', day: 'Monday' },
      { name: 'Turkey Meatballs Potatoes Zuccini', day: 'Monday' },
      { name: 'Orzo salad chicken', day: 'Thursday' },
      { name: 'Braised beef & rice', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 1, thursday: 2, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 1, thursday: 3, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 1, thursday: 3, notes: '' },
      { name: 'Ann', monday: 2, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Andy', monday: 0, thursday: 4, notes: 'High Protein no carbs' },
      { name: 'Daniel K', monday: 2, thursday: 4, notes: 'no broccoli' },
      { name: 'Felicia - Normal', monday: 4, thursday: 2, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2, notes: '4oz' },
      { name: 'Henning', monday: 6, thursday: 6, notes: 'Trying to eat more proteine' },
    ],
  },
};

async function importOrdersData() {
  try {
    console.log('📥 Importing orders data...\n');

    for (const [weekLabel, weekData] of Object.entries(orderData)) {
      console.log(`Processing ${weekLabel}...`);

      // Create menu
      const menuResult = await db.query(
        'INSERT INTO menus (week_label) VALUES ($1) ON CONFLICT (week_label) DO UPDATE SET week_label = $1 RETURNING id',
        [weekLabel]
      );
      const menuId = menuResult.rows[0].id;

      // Insert recipes for this menu
      const recipeMap = {};
      for (const recipe of weekData.recipes) {
        const recipeResult = await db.query(
          'INSERT INTO menu_recipes (menu_id, recipe_name, day_of_week) VALUES ($1, $2, $3) RETURNING id',
          [menuId, recipe.name, recipe.day]
        );
        recipeMap[recipe.name] = recipeResult.rows[0].id;
      }

      // Insert customers and their orders
      for (const customer of weekData.customers) {
        // Upsert customer
        const customerResult = await db.query(
          'INSERT INTO customers (name, notes) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING id',
          [customer.name, customer.notes || null]
        );
        const customerId = customerResult.rows[0].id;

        // Calculate totals
        const totalMeals = customer.monday + customer.thursday;

        // Insert order total
        await db.query(
          `INSERT INTO order_totals (menu_id, customer_id, total_meals_monday, total_meals_thursday, total_meals)
           VALUES ($1, $2, $3, $4, $5)`,
          [menuId, customerId, customer.monday, customer.thursday, totalMeals]
        );
      }

      console.log(`  ✅ ${weekLabel}: Menu created with ${weekData.customers.length} customers`);
    }

    console.log('\n✅ Orders data imported successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing data:', error.message);
    process.exit(1);
  }
}

importOrdersData();
