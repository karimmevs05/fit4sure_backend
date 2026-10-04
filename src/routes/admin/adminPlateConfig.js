// Admin control panel for customer-facing plate pricing and portion sizes --
// the live source orderingService.js, adminMenuPlanner.js, and (via a
// fetch, not a hardcoded copy) the frontend's Recipes/Orders pages all read
// from. See migrations/create_plate_config.sql and
// src/services/plateConfig.js for the schema/read-side. This file is the
// write side: staff edit real prices/portions here, scoped to the existing
// known set of formats/categories/addon types -- not free-form creation of
// new ones, since RECIPE_FORMATS-style consumers elsewhere expect this
// specific set of labels.

const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const plateConfig = require('../../services/plateConfig');

// GET /api/admin/plate-config -- everything the editor needs in one call.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const formatsResult = await db.query(
      `SELECT id, key, label, protein_oz, carbs_g, veggies_g, price_cents, is_recipe_format, sort_order, active
       FROM plate_formats ORDER BY sort_order`
    );
    const byThePoundResult = await db.query('SELECT id, category, price_cents FROM by_the_pound_prices ORDER BY category');
    const addonsResult = await db.query('SELECT id, key, label, free_count, extra_price_cents FROM addon_rules ORDER BY key');

    res.json({
      data: {
        formats: formatsResult.rows,
        byThePound: byThePoundResult.rows,
        addons: addonsResult.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching plate config:', error);
    res.status(500).json({ error: 'Failed to fetch plate config' });
  }
});

// PUT /formats -- bulk update. Body: { formats: [{ key, protein_oz, carbs_g, veggies_g, price_cents, is_recipe_format, active }] }
// Edits existing rows only (matched by key) -- never creates a new format
// row, since every consumer (RECIPE_FORMATS-equivalent lookups, the public
// order page's format whitelist) expects this specific known set of keys.
router.put('/formats', requireAuth, requireRole('admin'), async (req, res) => {
  const { formats } = req.body;
  if (!Array.isArray(formats) || formats.length === 0) {
    return res.status(400).json({ error: 'formats array is required' });
  }
  for (const f of formats) {
    if (typeof f.key !== 'string' || !f.key) {
      return res.status(400).json({ error: 'Each format needs a key' });
    }
    if (!Number.isInteger(f.price_cents) || f.price_cents <= 0) {
      return res.status(400).json({ error: `${f.key}: price_cents must be a positive integer (cents, not dollars)` });
    }
    for (const field of ['protein_oz', 'carbs_g', 'veggies_g']) {
      if (typeof f[field] !== 'number' || f[field] < 0) {
        return res.status(400).json({ error: `${f.key}: ${field} must be a non-negative number` });
      }
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const f of formats) {
      const result = await client.query(
        `UPDATE plate_formats
         SET protein_oz = $1, carbs_g = $2, veggies_g = $3, price_cents = $4,
             is_recipe_format = $5, active = $6, updated_at = NOW()
         WHERE key = $7`,
        [f.protein_oz, f.carbs_g, f.veggies_g, f.price_cents, !!f.is_recipe_format, f.active !== false, f.key]
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Unknown format key: ${f.key}` });
      }
    }
    await client.query('COMMIT');
    res.json({ data: { updated: formats.length } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating plate formats:', error);
    res.status(500).json({ error: 'Failed to update plate formats' });
  } finally {
    client.release();
  }
});

// PUT /by-the-pound -- bulk update. Body: { prices: [{ category, price_cents }] }
router.put('/by-the-pound', requireAuth, requireRole('admin'), async (req, res) => {
  const { prices } = req.body;
  if (!Array.isArray(prices) || prices.length === 0) {
    return res.status(400).json({ error: 'prices array is required' });
  }
  for (const p of prices) {
    if (!Number.isInteger(p.price_cents) || p.price_cents <= 0) {
      return res.status(400).json({ error: `${p.category}: price_cents must be a positive integer` });
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const p of prices) {
      const result = await client.query(
        `UPDATE by_the_pound_prices SET price_cents = $1, updated_at = NOW() WHERE category = $2`,
        [p.price_cents, p.category]
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Unknown category: ${p.category}` });
      }
    }
    await client.query('COMMIT');
    res.json({ data: { updated: prices.length } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating by-the-pound prices:', error);
    res.status(500).json({ error: 'Failed to update by-the-pound prices' });
  } finally {
    client.release();
  }
});

// PUT /addons -- bulk update. Body: { rules: [{ key, free_count, extra_price_cents }] }
router.put('/addons', requireAuth, requireRole('admin'), async (req, res) => {
  const { rules } = req.body;
  if (!Array.isArray(rules) || rules.length === 0) {
    return res.status(400).json({ error: 'rules array is required' });
  }
  for (const r of rules) {
    if (!Number.isInteger(r.free_count) || r.free_count < 0) {
      return res.status(400).json({ error: `${r.key}: free_count must be a non-negative integer` });
    }
    if (!Number.isInteger(r.extra_price_cents) || r.extra_price_cents < 0) {
      return res.status(400).json({ error: `${r.key}: extra_price_cents must be a non-negative integer` });
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const r of rules) {
      const result = await client.query(
        `UPDATE addon_rules SET free_count = $1, extra_price_cents = $2, updated_at = NOW() WHERE key = $3`,
        [r.free_count, r.extra_price_cents, r.key]
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Unknown addon key: ${r.key}` });
      }
    }
    await client.query('COMMIT');
    res.json({ data: { updated: rules.length } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating addon rules:', error);
    res.status(500).json({ error: 'Failed to update addon rules' });
  } finally {
    client.release();
  }
});

// GET /recipe-overrides/:recipeId -- every format for one recipe, each
// merged with the shared standard (so the UI can show "standard" as a
// placeholder/fallback and whether a custom value is currently active).
// "Mostly comes as standard unless checked and changed" -- a recipe with no
// override rows at all just returns active: null for every format.
router.get('/recipe-overrides/:recipeId', requireAuth, requireRole('admin'), async (req, res) => {
  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'recipeId must be an integer' });
  }
  try {
    const overrides = await plateConfig.getRecipeOverrides(recipeId);
    res.json({ data: overrides });
  } catch (error) {
    console.error('Error fetching recipe overrides:', error);
    res.status(500).json({ error: 'Failed to fetch recipe overrides' });
  }
});

// PUT /recipe-overrides/:recipeId -- bulk upsert every format's override
// state for one recipe. Body: { overrides: [{ format_key, protein_oz,
// carbs_g, veggies_g, price_cents, active }] }. `active: false` keeps the
// row (not deleted) so unchecking then rechecking later restores the last
// custom value instead of losing it -- only rows with active = true are
// ever honored by real pricing (getWeeklyMenu, findOrCreateMenu).
router.put('/recipe-overrides/:recipeId', requireAuth, requireRole('admin'), async (req, res) => {
  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'recipeId must be an integer' });
  }
  const { overrides } = req.body;
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return res.status(400).json({ error: 'overrides array is required' });
  }
  for (const o of overrides) {
    if (typeof o.format_key !== 'string' || !o.format_key) {
      return res.status(400).json({ error: 'Each override needs a format_key' });
    }
    if (!Number.isInteger(o.price_cents) || o.price_cents <= 0) {
      return res.status(400).json({ error: `${o.format_key}: price_cents must be a positive integer (cents, not dollars)` });
    }
    for (const field of ['protein_oz', 'carbs_g', 'veggies_g']) {
      if (typeof o[field] !== 'number' || o[field] < 0) {
        return res.status(400).json({ error: `${o.format_key}: ${field} must be a non-negative number` });
      }
    }
  }

  try {
    await plateConfig.upsertRecipeOverrides(
      recipeId,
      overrides.map((o) => ({
        formatKey: o.format_key,
        proteinOz: o.protein_oz,
        carbsG: o.carbs_g,
        veggiesG: o.veggies_g,
        priceCents: o.price_cents,
        active: !!o.active,
      }))
    );
    const updated = await plateConfig.getRecipeOverrides(recipeId);
    res.json({ data: updated });
  } catch (error) {
    console.error('Error updating recipe overrides:', error);
    res.status(500).json({ error: 'Failed to update recipe overrides' });
  }
});

module.exports = router;
