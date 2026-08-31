const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { searchUSDANutrition } = require('../../services/usdaNutrition');
const { detectAllergens } = require('../../utils/allergenTagger');

// GET all inventory items with macro data
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM inventory ORDER BY category, name'
    );
    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        unit_price_cents: row.unit_price_cents,
        serving_size_g: row.serving_size_g,
        current_stock_g: row.current_stock_g,
        store: row.store,
        grade: row.grade,
        protein_per_100g: row.protein_per_100g,
        carbs_per_100g: row.carbs_per_100g,
        fat_per_100g: row.fat_per_100g,
        calories_per_100g: row.calories_per_100g,
        usda_fdc_id: row.usda_fdc_id,
        macros_source: row.macros_source,
        allergens: row.allergens || [],
      })),
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET single inventory item
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM inventory WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch ingredient' });
  }
});

// POST create new inventory item with USDA macro lookup + auto allergen tagging
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, category, unit_price_cents, serving_size_g, current_stock_g, store, grade, protein_per_100g, carbs_per_100g, fat_per_100g, calories_per_100g } = req.body;

    if (!name || !category || unit_price_cents === undefined || !serving_size_g) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let macrosData = {
      protein_per_100g: protein_per_100g || null,
      carbs_per_100g: carbs_per_100g || null,
      fat_per_100g: fat_per_100g || null,
      calories_per_100g: calories_per_100g || null,
      usda_fdc_id: null,
      macros_source: 'manual',
    };

    // If macros not provided, try USDA lookup
    if (!macrosData.protein_per_100g) {
      console.log(`🔍 Attempting USDA lookup for: ${name}`);
      const usdaData = await searchUSDANutrition(name);
      if (usdaData) {
        macrosData = {
          protein_per_100g: usdaData.protein_per_100g,
          carbs_per_100g: usdaData.carbs_per_100g,
          fat_per_100g: usdaData.fat_per_100g,
          calories_per_100g: usdaData.calories_per_100g,
          usda_fdc_id: usdaData.fdcId,
          macros_source: 'usda',
        };
      }
    }

    const allergens = detectAllergens(name);

    const result = await db.query(
      `INSERT INTO inventory (name, category, unit_price_cents, serving_size_g, current_stock_g, store, grade, protein_per_100g, carbs_per_100g, fat_per_100g, calories_per_100g, usda_fdc_id, macros_source, allergens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [name, category, unit_price_cents, serving_size_g, current_stock_g || 0, store || '', grade || '', macrosData.protein_per_100g, macrosData.carbs_per_100g, macrosData.fat_per_100g, macrosData.calories_per_100g, macrosData.usda_fdc_id, macrosData.macros_source, allergens]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      macros: {
        source: macrosData.macros_source,
        protein_per_100g: macrosData.protein_per_100g,
        carbs_per_100g: macrosData.carbs_per_100g,
        fat_per_100g: macrosData.fat_per_100g,
        calories_per_100g: macrosData.calories_per_100g,
      },
      allergens,
    });
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create ingredient' });
  }
});

// PUT update inventory item with macro override support + re-tag allergens
// on every save, so a name correction (e.g. "chix" -> "chicken breast")
// keeps allergen tags accurate automatically.
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, unit_price_cents, serving_size_g, current_stock_g, store, grade, protein_per_100g, carbs_per_100g, fat_per_100g, calories_per_100g } = req.body;

    const allergens = detectAllergens(name);

    let macrosData = {
      protein_per_100g: protein_per_100g || null,
      carbs_per_100g: carbs_per_100g || null,
      fat_per_100g: fat_per_100g || null,
      calories_per_100g: calories_per_100g || null,
      usda_fdc_id: null,
      macros_source: 'manual',
    };

    // Macros left blank (e.g. this item never had any, or they were
    // cleared to force a re-lookup) -- try USDA instead of silently
    // nulling them out, same fallback as item creation.
    if (!macrosData.protein_per_100g) {
      const usdaData = await searchUSDANutrition(name);
      if (usdaData) {
        macrosData = {
          protein_per_100g: usdaData.protein_per_100g,
          carbs_per_100g: usdaData.carbs_per_100g,
          fat_per_100g: usdaData.fat_per_100g,
          calories_per_100g: usdaData.calories_per_100g,
          usda_fdc_id: usdaData.fdcId,
          macros_source: 'usda',
        };
      } else {
        macrosData.macros_source = null;
      }
    }

    const result = await db.query(
      `UPDATE inventory
       SET name = $1, category = $2, unit_price_cents = $3, serving_size_g = $4, current_stock_g = $5, store = $6, grade = $7, protein_per_100g = $8, carbs_per_100g = $9, fat_per_100g = $10, calories_per_100g = $11, macros_source = $12, allergens = $13, usda_fdc_id = COALESCE($15, usda_fdc_id)
       WHERE id = $14
       RETURNING *`,
      [name, category, unit_price_cents, serving_size_g, current_stock_g || 0, store || '', grade || '', macrosData.protein_per_100g, macrosData.carbs_per_100g, macrosData.fat_per_100g, macrosData.calories_per_100g, macrosData.macros_source, allergens, id, macrosData.usda_fdc_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update ingredient' });
  }
});

// PATCH just the store -- unlike PUT above, doesn't touch macros/allergens/
// price, so the Shopping List can assign/correct where an ingredient is
// bought without re-running USDA lookup or re-tagging allergens.
router.patch('/:id/store', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { store } = req.body;

    const result = await db.query(
      'UPDATE inventory SET store = $1 WHERE id = $2 RETURNING id, name, store',
      [store || '', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating ingredient store:', error);
    res.status(500).json({ error: 'Failed to update store' });
  }
});

// DELETE inventory item
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM inventory WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }

    res.json({ success: true, message: 'Ingredient deleted' });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Failed to delete ingredient' });
  }
});

// POST one-time backfill - re-scans every existing ingredient's name and
// tags allergens. Safe to run more than once (idempotent).
router.post('/backfill-allergens', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const items = await db.query('SELECT id, name FROM inventory');
    let updated = 0;
    for (const item of items.rows) {
      const allergens = detectAllergens(item.name);
      await db.query('UPDATE inventory SET allergens = $1 WHERE id = $2', [allergens, item.id]);
      updated++;
    }
    res.json({ success: true, updated });
  } catch (error) {
    console.error('Error backfilling allergens:', error);
    res.status(500).json({ error: 'Failed to backfill allergens' });
  }
});

// POST one-time (re-runnable) backfill - retries the USDA lookup for every
// ingredient still missing macros, e.g. because the original search failed
// before the cleaned-name/multi-result fallback existed. Safe to run more
// than once -- only touches rows where protein_per_100g is still null.
router.post('/backfill-macros', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const items = await db.query('SELECT id, name FROM inventory WHERE protein_per_100g IS NULL');
    let updated = 0;
    const stillMissing = [];
    for (const item of items.rows) {
      const usdaData = await searchUSDANutrition(item.name);
      if (usdaData) {
        await db.query(
          `UPDATE inventory SET protein_per_100g = $1, carbs_per_100g = $2, fat_per_100g = $3, calories_per_100g = $4, usda_fdc_id = $5, macros_source = 'usda' WHERE id = $6`,
          [usdaData.protein_per_100g, usdaData.carbs_per_100g, usdaData.fat_per_100g, usdaData.calories_per_100g, usdaData.fdcId, item.id]
        );
        updated++;
      } else {
        stillMissing.push({ id: item.id, name: item.name });
      }
    }
    res.json({ success: true, checked: items.rows.length, updated, stillMissing });
  } catch (error) {
    console.error('Error backfilling macros:', error);
    res.status(500).json({ error: 'Failed to backfill macros' });
  }
});

module.exports = router;
