// Resolves a weekly_plate_options.extra_ingredients JSONB array
// ([{ inventoryId, grams }]) against live `inventory` rows, used by both
// the admin plate-options routes (adminMenuPlanner.js) and the customer-
// facing weekly menu (orderingService.js) -- one place computing name/
// macros/cost at the saved gram amount so the two surfaces can't disagree.
//
// Same cost-per-pound convention used everywhere else in this app:
// inventory.unit_price_cents is price per LB (453.592g), independent of
// serving_size_g.
const db = require('../config/db');

const GRAMS_PER_POUND = 453.592;

async function resolveExtraIngredients(rawExtraIngredients) {
  const items = Array.isArray(rawExtraIngredients) ? rawExtraIngredients : [];
  if (items.length === 0) return [];

  const ids = items.map((i) => i.inventoryId).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return [];

  const result = await db.query(
    `SELECT id, name, unit_price_cents, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g
     FROM inventory WHERE id = ANY($1::int[])`,
    [ids]
  );
  const byId = Object.fromEntries(result.rows.map((r) => [r.id, r]));

  return items
    .map((item) => {
      const inv = byId[item.inventoryId];
      if (!inv) return null; // ingredient deleted since this plate was saved -- drop silently rather than error
      const grams = Number(item.grams) || 0;
      const frac = grams / 100;
      return {
        inventoryId: inv.id,
        name: inv.name,
        grams,
        costCents: inv.unit_price_cents ? (inv.unit_price_cents / GRAMS_PER_POUND) * grams : null,
        calories: inv.calories_per_100g != null ? Math.round(inv.calories_per_100g * frac) : 0,
        protein_g: inv.protein_per_100g != null ? Number((inv.protein_per_100g * frac).toFixed(1)) : 0,
        carbs_g: inv.carbs_per_100g != null ? Number((inv.carbs_per_100g * frac).toFixed(1)) : 0,
        fat_g: inv.fat_per_100g != null ? Number((inv.fat_per_100g * frac).toFixed(1)) : 0,
      };
    })
    .filter((x) => x !== null);
}

module.exports = { resolveExtraIngredients };
