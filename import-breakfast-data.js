require('dotenv').config();
const db = require('./src/config/db');

// Breakfast data extracted from your spreadsheet
// Each week has a breakfast section at the bottom
const breakfastData = {
  'Week of 1.18': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 1.25': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 2.1': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 2.8': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 2.15': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 2.22': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 3.1': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 3.8': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 3.22': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 3.29': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 4.5': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 4.12': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 4.19': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 1 },
  ],
  'Week of 4.26': [
    { name: 'Joe', meals: 2 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 5.3': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 5.10': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 5.17': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 5.24': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 5.31': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 6.7': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 6.14': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 6.21': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 3 },
  ],
  'Week of 7.5': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
  'Week of 7.12': [
    { name: 'Felicia - Normal', meals: 4 },
    { name: 'Drew', meals: 3 },
    { name: 'Daniel K', meals: 2 },
  ],
};

async function importBreakfastData() {
  try {
    console.log('🍳 Importing breakfast data...\n');

    let updated = 0;

    for (const [weekLabel, breakfasts] of Object.entries(breakfastData)) {
      console.log(`Processing ${weekLabel}...`);

      try {
        // Get menu ID for this week
        const menuResult = await db.query(
          'SELECT id FROM menus WHERE week_label = $1',
          [weekLabel]
        );

        if (menuResult.rows.length === 0) {
          console.log(`  ⚠️  Week not found in database`);
          continue;
        }

        const menuId = menuResult.rows[0].id;

        // Update breakfast meals for each customer
        for (const breakfast of breakfasts) {
          // Find customer
          const customerResult = await db.query(
            'SELECT id FROM customers WHERE LOWER(name) = LOWER($1)',
            [breakfast.name]
          );

          if (customerResult.rows.length === 0) {
            console.log(`  ⚠️  Customer "${breakfast.name}" not found`);
            continue;
          }

          const customerId = customerResult.rows[0].id;

          // Update breakfast meals
          await db.query(
            'UPDATE order_totals SET breakfast_meals = $1 WHERE menu_id = $2 AND customer_id = $3',
            [breakfast.meals, menuId, customerId]
          );

          updated++;
        }

        console.log(`  ✅ Updated ${breakfasts.length} breakfast orders`);
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
      }
    }

    console.log(`\n✅ Breakfast data imported! Updated ${updated} records.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

importBreakfastData();
