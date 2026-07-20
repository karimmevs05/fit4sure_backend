const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Read the uploaded meal count files
const mealCountDir = path.join(__dirname, '../fit4sure-admin-dashboard/uploads');
const mealCountFiles = [
  'Meal Count - 2026',
  'Meal Count - 2025',
  'Meal Count - 2024'
];

const customers = new Map();

// Parse meal count files to extract customer data
mealCountFiles.forEach(filename => {
  const filePath = path.join(mealCountDir, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filename}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let currentSheet = '';

  lines.forEach(line => {
    // Track sheet name for context
    if (line.startsWith('## Sheet name:')) {
      currentSheet = line.replace('## Sheet name:', '').trim();
    }

    // Match customer lines: ,Name,Meals,Notes
    const match = line.match(/^,([A-Za-z\s\-\.LARGE()]+),(\d+),(.*)$/);

    if (match) {
      const name = match[1].trim();
      const meals = parseInt(match[2]);
      const notes = match[3].trim();

      // Filter out headers and totals
      if (
        name &&
        meals > 0 &&
        !name.match(/^(Notes|Check|Total|Meal|Breakfast|Item|Amount|Raw|Cooked|Monday|Wednesday|Thursday|Friday|Saturday|Sunday|Oz|Grams|Unit|Link|Week|Groceries|Status|Price|lbs|Per|Plates|Grassfed|Plantains|Ground|Parmesan|Gruyere|Maple|Plastic|Sheet|Taylor|Krishna|Christine|Billy|Jacqui|Becky|Dr|Luzette|Denisa|Jenn|Caro|Joel|Claudia|Alex|Aixa|Brandon|Meghan|Mr|Mrs|M\.|Karim|Sira|Emily|Emily|Jasmine|Cecily|Tim|CC|CC|Phillipe|Daniel|Daniel M|Tonya|Karim|Papa|Jason|Ray|Thomas|Henning|Brooke|Zoey|Airea|Robert|Sydney|Chris|Kelly|Andy|Felicia|Daniel|Joe|Ann|Drew|Bruce|Nick|Becky|Meghan|Andy|Robert|Brooke|Zoey|Airea|Daniel|Chris|Sydney|Andy|Henning|Zoey|Kelly|Mr|Alejandro|Alejandro|Alejandro|Alejandro|Alejandro|Alejandro)/i)
      ) {
        if (!customers.has(name)) {
          customers.set(name, {
            name,
            totalMeals: meals,
            occurrences: 1,
            notes: notes || '',
            sheets: [currentSheet],
            lastSeen: currentSheet
          });
        } else {
          const existing = customers.get(name);
          existing.totalMeals += meals;
          existing.occurrences += 1;
          existing.sheets.push(currentSheet);
          existing.lastSeen = currentSheet;
          if (notes) existing.notes = notes;
        }
      }
    }
  });
});

// Sort by total meals
const sortedCustomers = Array.from(customers.values())
  .sort((a, b) => b.totalMeals - a.totalMeals);

console.log(`\n📊 Found ${sortedCustomers.length} unique customers from order history\n`);
console.log('Customer Export:');
console.log('================\n');

sortedCustomers.forEach((c, i) => {
  console.log(`${i + 1}. ${c.name.padEnd(25)} | ${String(c.totalMeals).padStart(3)} meals | ${c.occurrences} order weeks | Notes: ${c.notes}`);
});

// Generate SQL INSERT statements
console.log('\n\n📝 SQL INSERT Statements:\n');
console.log('-- Import customers from meal order history\n');

sortedCustomers.forEach((c, i) => {
  const weeksActive = Math.ceil(c.occurrences);
  const ltv = Math.floor((c.totalMeals * 15) * 100); // ~$15 per meal

  let stage = 'prospect';
  let probability = 30;

  if (c.totalMeals > 150) {
    stage = 'active';
    probability = 100;
  } else if (c.totalMeals > 80) {
    stage = 'trial';
    probability = 80;
  } else if (c.totalMeals > 40) {
    stage = 'engaged';
    probability = 65;
  }

  const engagement = Math.floor((c.totalMeals / sortedCustomers[0].totalMeals) * 100);
  const email = `${c.name.toLowerCase().replace(/\s+/g, '.')}@customer.fit4sure.com`;
  const phone = `555-${String(1000 + i).slice(-4)}`;

  console.log(`INSERT INTO customers (name, email, phone, sales_pipeline_stage, conversion_probability, engagement_score, days_since_last_contact, total_meals_ordered, weeks_active, lifetime_value_cents, notes) VALUES ('${c.name.replace(/'/g, "''")}', '${email}', '${phone}', '${stage}', ${probability}, ${engagement}, ${Math.floor(Math.random() * 30)}, ${c.totalMeals}, ${weeksActive}, ${ltv}, '${c.notes.replace(/'/g, "''")}');`);
});

console.log('\n\n✅ Copy the SQL statements above to insert into database');
