// Shared between the authenticated admin order picker (adminOrders.js) and
// the public customer-facing ordering page (publicOrdering.js) -- both need
// the exact same "what's live this week, at what price" answer, and the
// exact same customer/menu resolution logic when a real order gets saved.
// Keeping it in one place means updating a price or the weekly-menu query
// can't accidentally leave the two pickers disagreeing with each other.

const db = require('../config/db');

// Known price tiers (fit4sure.net). Placeholder figures for the three
// recipe-plan formats (High Protein / Low Carb / 1 Pound) -- swap for real
// numbers once confirmed; nothing else needs to change since every caller
// reads this table directly rather than hardcoding prices of its own.
// Not a real customer-facing "format" -- carb/veggie sides added under a
// selected protein format are free, since the plate-structure serving
// sizes table means that format's price already covers this serving. This
// is just the price-tier key a side order line resolves to.
const SIDE_FORMAT = 'Included Side';

const CATEGORY_PRICES = {
  Regular: 13.79,
  Large: 16.79,
  'High Protein': 17.79,
  'Low Carb': 13.79,
  '1 Pound': 19.79,
  Breakfast: 11.30,
  [SIDE_FORMAT]: 0,
};

// The five formats offered per live recipe, sourced from the Weekly Recipe
// Plan.
const RECIPE_FORMATS = ['Regular', 'Large', 'High Protein', 'Low Carb', '1 Pound'];

// "By The LB" isn't one flat price -- it's always exactly 1lb of a single
// chosen item, priced by what type of item it is (fit4sure.net/category/all-products).
const BY_THE_LB_PRICES = {
  Protein: 20.0,
  Vegetable: 10.0,
  Carbohydrate: 5.0,
};

function guessByTheLbType(name) {
  const lower = (name || '').toLowerCase();
  if (/chicken|beef|pork|turkey|fish|shrimp|salmon|steak|meat|egg|tofu/.test(lower)) return 'Protein';
  if (/rice|potato|pasta|bread|oat|quinoa|bean|corn|tortilla|sweet potato/.test(lower)) return 'Carbohydrate';
  return 'Vegetable';
}

// Find an existing menu matching (name, category), or create one.
async function findOrCreateMenu(name, category) {
  const cleanName = (name || '').trim();
  const cleanCategory = (category || '').trim();
  if (!cleanName) return null;

  const existing = await db.query(
    `SELECT id FROM menus WHERE LOWER(name) = LOWER($1) AND LOWER(COALESCE(category, '')) = LOWER($2) LIMIT 1`,
    [cleanName, cleanCategory]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const price = cleanCategory === 'By The LB' ? BY_THE_LB_PRICES[guessByTheLbType(cleanName)] : CATEGORY_PRICES[cleanCategory] ?? null;

  const created = await db.query(
    `INSERT INTO menus (name, category, price, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
    [cleanName, cleanCategory || null, price]
  );
  return created.rows[0].id;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits || null;
}

// Find an existing customer by phone (most reliable for repeat orders on a
// public form -- names collide, phone numbers don't), falling back to exact
// name. Fills in phone/email if the matched record is missing them, same
// never-overwrite rule used everywhere else in this app. Creates a new
// prospect if nothing matches.
async function findOrCreateCustomerByContact({ name, phone, email, address }) {
  const cleanName = (name || '').trim();
  if (!cleanName) return null;
  const normalizedPhone = normalizePhone(phone);
  const cleanEmail = (email || '').trim() || null;
  const cleanAddress = (address || '').trim() || null;

  let existing = null;
  if (normalizedPhone) {
    // Compare the last 10 digits only, so "8137777369" and "+1 813-777-7369"
    // (stored inconsistently across manual entry / imports) still match.
    const byPhone = await db.query(
      `SELECT id, phone, email, address FROM customers
       WHERE phone IS NOT NULL
         AND RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = RIGHT($1, 10)
       LIMIT 1`,
      [normalizedPhone]
    );
    if (byPhone.rows.length > 0) existing = byPhone.rows[0];
  }
  if (!existing) {
    const byName = await db.query(`SELECT id, phone, email, address FROM customers WHERE LOWER(name) = LOWER($1) LIMIT 1`, [cleanName]);
    if (byName.rows.length > 0) existing = byName.rows[0];
  }

  if (existing) {
    const sets = [];
    const values = [];
    let n = 1;
    if (!existing.phone && phone) { sets.push(`phone = $${n++}`); values.push(phone); }
    if (!existing.email && cleanEmail) { sets.push(`email = $${n++}`); values.push(cleanEmail); }
    if (!existing.address && cleanAddress) { sets.push(`address = $${n++}`); values.push(cleanAddress); }
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      values.push(existing.id);
      await db.query(`UPDATE customers SET ${sets.join(', ')} WHERE id = $${n}`, values);
    }
    return existing.id;
  }

  const created = await db.query(
    `INSERT INTO customers (name, phone, email, address, status, sales_pipeline_stage, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'prospect', 'prospect', NOW(), NOW()) RETURNING id`,
    [cleanName, phone || null, cleanEmail, cleanAddress]
  );
  return created.rows[0].id;
}

// The real menu clients are ordering from THIS delivery week: every recipe
// the chef marked live per block in the Weekly Recipe Plan, each offered in
// all 5 standing formats, priced from CATEGORY_PRICES -- plus standing
// Breakfast items that have actually been ordered before (keeps stale/test
// menu entries with no real order history out of the Breakfast list).
//
// Sourced from `weekly_recipe_plan`, not the old plate-builder `menus`
// table -- same planned_week_start formula Menu Planner itself uses, so
// this always reflects whatever the chef most recently marked live there.
const GRAMS_PER_POUND = 455; // matches this app's stated "1 lb (455g)" convention everywhere else

// One aggregate query for every recipe on the plan at once, rather than one
// query per recipe -- same N+1 lesson learned earlier this session in
// /menu-planner/plates. Returns real per-pound macros, not a fabricated
// per-format estimate; there's no established weight-per-format mapping to
// scale against, so this is shown as one reference figure per recipe.
async function getPerPoundMacrosByRecipe(recipeIds) {
  if (recipeIds.length === 0) return {};
  const result = await db.query(
    `SELECT ri.recipe_id,
       SUM(COALESCE(ri.quantity_g, 0)) AS total_weight_g,
       SUM(COALESCE(ri.quantity_g, 0) * COALESCE(i.calories_per_100g, 0) / 100) AS total_calories,
       SUM(COALESCE(ri.quantity_g, 0) * COALESCE(i.protein_per_100g, 0) / 100) AS total_protein,
       SUM(COALESCE(ri.quantity_g, 0) * COALESCE(i.fat_per_100g, 0) / 100) AS total_fat
     FROM recipe_ingredients ri
     LEFT JOIN inventory i ON ri.inventory_id = i.id
     WHERE ri.recipe_id = ANY($1)
     GROUP BY ri.recipe_id`,
    [recipeIds]
  );
  const byRecipe = {};
  for (const row of result.rows) {
    const totalWeightG = parseFloat(row.total_weight_g) || 0;
    byRecipe[row.recipe_id] = totalWeightG > 0
      ? {
          calories: Math.round((parseFloat(row.total_calories) * GRAMS_PER_POUND) / totalWeightG),
          protein_g: ((parseFloat(row.total_protein) * GRAMS_PER_POUND) / totalWeightG).toFixed(1),
          fat_g: ((parseFloat(row.total_fat) * GRAMS_PER_POUND) / totalWeightG).toFixed(1),
        }
      : null;
  }
  return byRecipe;
}

async function getWeeklyMenu() {
  const weekResult = await db.query(`
    SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day' + interval '7 days')::date AS sunday
  `);
  const weekStart = weekResult.rows[0].sunday.toISOString().slice(0, 10);

  const planResult = await db.query(
    `SELECT wrp.block, r.recipe_id, r.name, r.category
     FROM weekly_recipe_plan wrp
     JOIN recipes r ON r.recipe_id = wrp.recipe_id
     WHERE wrp.planned_week_start = $1
     ORDER BY r.name`,
    [weekStart]
  );

  const breakfastResult = await db.query(`
    SELECT DISTINCT m.id, m.name, m.price
    FROM menus m
    JOIN orders o ON o.menu_id = m.id
    WHERE m.category = 'Breakfast'
    ORDER BY m.name
  `);

  const macrosByRecipe = await getPerPoundMacrosByRecipe(planResult.rows.map((r) => r.recipe_id));

  const buildBlock = (block) =>
    planResult.rows
      .filter((r) => r.block === block)
      .map((r) => ({
        recipeId: r.recipe_id,
        name: r.name,
        category: r.category,
        perPound: macrosByRecipe[r.recipe_id] || null,
        formats: RECIPE_FORMATS.map((label) => ({
          id: label.toLowerCase().replace(/\s+/g, ''),
          label,
          price: CATEGORY_PRICES[label],
        })),
      }));

  const monday = buildBlock('monday');
  const thursday = buildBlock('thursday');

  return {
    weekStart,
    monday,
    thursday,
    breakfast: breakfastResult.rows,
    menuReady: monday.length > 0 || thursday.length > 0,
  };
}

module.exports = {
  CATEGORY_PRICES,
  RECIPE_FORMATS,
  SIDE_FORMAT,
  BY_THE_LB_PRICES,
  guessByTheLbType,
  findOrCreateMenu,
  findOrCreateCustomerByContact,
  getWeeklyMenu,
};
