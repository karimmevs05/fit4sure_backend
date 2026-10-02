// Single source of truth for customer-facing plate pricing and portion
// sizes -- replaces what used to be hardcoded constants duplicated across
// three places: src/services/orderingService.js's CATEGORY_PRICES/
// ADD_ON_FREE_PRICE/ADD_ON_EXTRA_PRICE/BY_THE_LB_PRICES/RECIPE_FORMATS,
// src/routes/admin/adminMenuPlanner.js's OWN separate copy of
// CATEGORY_PRICES (silently out of sync with orderingService.js's), and the
// frontend's src/utils/plateStructure.ts + src/pages/Orders.tsx (which
// duplicated the add-on pricing numbers a second time, cross-repo).
//
// Backed by plate_formats / by_the_pound_prices / addon_rules
// (migrations/create_plate_config.sql). Every function here queries live --
// matches this codebase's existing convention for small reference tables
// (cooking_methods, automation_steps, etc.), no caching layer.

const db = require('../config/db');

// Raw rows, ordered for display -- the shape the admin editor and the
// frontend's live-portion-size fetch both want directly.
async function getPlateFormats() {
  const result = await db.query(
    `SELECT id, key, label, protein_oz, carbs_g, veggies_g, price_cents, is_recipe_format, sort_order, active
     FROM plate_formats ORDER BY sort_order`
  );
  return result.rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    proteinOz: parseFloat(r.protein_oz),
    carbsG: parseFloat(r.carbs_g),
    veggiesG: parseFloat(r.veggies_g),
    priceCents: r.price_cents,
    isRecipeFormat: r.is_recipe_format,
    sortOrder: r.sort_order,
    active: r.active,
  }));
}

// { Regular: 13.79, Large: 16.79, ... } -- dollars, matching the
// menus.price column's existing numeric(10,2) convention and the exact
// shape the old CATEGORY_PRICES constant had, so callers need the fewest
// possible changes. Includes the two add-on format placeholders at $0,
// same as the original (their real price is resolved separately, see
// getAddonRules below).
async function getCategoryPrices() {
  const formats = await getPlateFormats();
  const prices = {};
  for (const f of formats) {
    if (!f.active) continue;
    prices[f.label] = f.priceCents / 100;
  }
  prices['Included Side'] = 0;
  prices['Sauce Add-On'] = 0;
  return prices;
}

// ['Regular', 'Large', 'High Protein', 'Low Carb', '1 Pound'] -- the
// formats offered per live Monday/Thursday recipe. Formerly a fixed array;
// now derived from is_recipe_format + active so adding/retiring a format
// doesn't need a code change.
async function getRecipeFormatLabels() {
  const formats = await getPlateFormats();
  return formats.filter((f) => f.isRecipeFormat && f.active).map((f) => f.label);
}

// { Protein: 20.0, Vegetable: 10.0, Carbohydrate: 5.0 } -- dollars.
async function getByThePoundPrices() {
  const result = await db.query('SELECT category, price_cents FROM by_the_pound_prices');
  const prices = {};
  for (const row of result.rows) prices[row.category] = row.price_cents / 100;
  return prices;
}

// { included_side: { label, freeCount, extraPrice }, sauce_addon: { ... } }
// -- dollars for extraPrice, matching the free-count-then-flat-extra model
// (first N free, every one after costs extraPrice). Side and sauce can now
// have genuinely different extra prices (the old single shared
// ADD_ON_EXTRA_PRICE constant couldn't express that) -- callers that
// validate a submitted add-on price must look up by the specific addon key,
// not assume one shared number.
async function getAddonRules() {
  const result = await db.query('SELECT key, label, free_count, extra_price_cents FROM addon_rules');
  const rules = {};
  for (const row of result.rows) {
    rules[row.key] = { label: row.label, freeCount: row.free_count, extraPrice: row.extra_price_cents / 100 };
  }
  return rules;
}

module.exports = { getPlateFormats, getCategoryPrices, getRecipeFormatLabels, getByThePoundPrices, getAddonRules };
