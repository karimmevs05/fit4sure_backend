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

// Per-recipe overrides on top of the shared standard above
// (migrations/create_recipe_format_overrides.sql) -- "mostly comes as
// standard unless checked and changed" per the business requirement this
// was built for. A recipe defaults to the shared plate_formats price/
// portion sizes everywhere unless an active override row exists for that
// (recipe_id, format) pair.

// Bulk lookup for getWeeklyMenu() -- { "<recipeId>:<formatLabel>": {...} }
// for every ACTIVE override among the given recipe ids. Keyed by format
// LABEL (not the DB's format_key slug) since that's what callers building
// a recipe's formats[] array already have on hand.
async function getOverridesForRecipes(recipeIds) {
  if (!recipeIds || recipeIds.length === 0) return {};
  const formats = await getPlateFormats();
  const labelByKey = Object.fromEntries(formats.map((f) => [f.key, f.label]));
  const result = await db.query(
    `SELECT recipe_id, format_key, protein_oz, carbs_g, veggies_g, price_cents
     FROM recipe_format_overrides WHERE recipe_id = ANY($1) AND active = true`,
    [recipeIds]
  );
  const map = {};
  for (const row of result.rows) {
    const label = labelByKey[row.format_key];
    if (!label) continue;
    map[`${row.recipe_id}:${label}`] = {
      proteinOz: parseFloat(row.protein_oz),
      carbsG: parseFloat(row.carbs_g),
      veggiesG: parseFloat(row.veggies_g),
      priceCents: row.price_cents,
    };
  }
  return map;
}

// For the admin panel: every format for ONE recipe, each merged with the
// shared standard so the UI can show what "standard" means here and
// whether a custom value is currently active -- one row per format,
// always present even if no override has ever been saved for it.
async function getRecipeOverrides(recipeId) {
  const formats = await getPlateFormats();
  const result = await db.query(
    `SELECT format_key, protein_oz, carbs_g, veggies_g, price_cents, active
     FROM recipe_format_overrides WHERE recipe_id = $1`,
    [recipeId]
  );
  const overrideByKey = Object.fromEntries(result.rows.map((r) => [r.format_key, r]));
  return formats.map((f) => {
    const o = overrideByKey[f.key];
    return {
      formatKey: f.key,
      formatLabel: f.label,
      standard: { proteinOz: f.proteinOz, carbsG: f.carbsG, veggiesG: f.veggiesG, priceCents: f.priceCents },
      override: o
        ? {
            proteinOz: parseFloat(o.protein_oz),
            carbsG: parseFloat(o.carbs_g),
            veggiesG: parseFloat(o.veggies_g),
            priceCents: o.price_cents,
            active: o.active,
          }
        : null,
    };
  });
}

// Upsert every format's override state for one recipe in one transaction.
// `active: false` still keeps the row (rather than deleting it) so a
// previously-entered custom value isn't lost if staff uncheck then recheck
// later -- every consumer (getOverridesForRecipes, findOrCreateMenu) only
// ever honors rows where active = true.
async function upsertRecipeOverrides(recipeId, overrides) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const o of overrides) {
      await client.query(
        `INSERT INTO recipe_format_overrides (recipe_id, format_key, protein_oz, carbs_g, veggies_g, price_cents, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (recipe_id, format_key)
         DO UPDATE SET protein_oz = $3, carbs_g = $4, veggies_g = $5, price_cents = $6, active = $7, updated_at = NOW()`,
        [recipeId, o.formatKey, o.proteinOz, o.carbsG, o.veggiesG, o.priceCents, o.active]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Single-recipe-format lookup for findOrCreateMenu (the point a real
// `menus.price` row actually gets set) -- returns the override price in
// dollars if an active one exists for this exact recipe+format label,
// otherwise null so the caller falls back to the shared standard.
async function getOverridePriceForRecipe(recipeId, formatLabel) {
  if (recipeId == null) return null;
  const formats = await getPlateFormats();
  const format = formats.find((f) => f.label === formatLabel);
  if (!format) return null;
  const result = await db.query(
    `SELECT price_cents FROM recipe_format_overrides WHERE recipe_id = $1 AND format_key = $2 AND active = true`,
    [recipeId, format.key]
  );
  return result.rows[0] ? result.rows[0].price_cents / 100 : null;
}

module.exports = {
  getPlateFormats,
  getCategoryPrices,
  getRecipeFormatLabels,
  getByThePoundPrices,
  getAddonRules,
  getOverridesForRecipes,
  getRecipeOverrides,
  upsertRecipeOverrides,
  getOverridePriceForRecipe,
};
