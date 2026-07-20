const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const { searchUSDANutrition } = require('../../services/usdaNutrition');

// GET all inventory items with macro data
router.get('/', async (req, res) => {
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
      })),
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET single inventory item
router.get('/:id', async (req, res) => {
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

// POST create new inventory item with USDA macro lookup
router.post('/', requireRole('admin'), async (req, res) => {
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

    const result = await db.query(
      `INSERT INTO inventory (name, category, unit_price_cents, serving_size_g, current_stock_g, store, grade, protein_per_100g, carbs_per_100g, fat_per_100g, calories_per_100g, usda_fdc_id, macros_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [name, category, unit_price_cents, serving_size_g, current_stock_g || 0, store || '', grade || '', macrosData.protein_per_100g, macrosData.carbs_per_100g, macrosData.fat_per_100g, macrosData.calories_per_100g, macrosData.usda_fdc_id, macrosData.macros_source]
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
    });
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create ingredient' });
  }
});

// PUT update inventory item with macro override support
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, unit_price_cents, serving_size_g, current_stock_g, store, grade, protein_per_100g, carbs_per_100g, fat_per_100g, calories_per_100g } = req.body;

    const result = await db.query(
      `UPDATE inventory
       SET name = $1, category = $2, unit_price_cents = $3, serving_size_g = $4, current_stock_g = $5, store = $6, grade = $7, protein_per_100g = $8, carbs_per_100g = $9, fat_per_100g = $10, calories_per_100g = $11, macros_source = $12
       WHERE id = $13
       RETURNING *`,
      [name, category, unit_price_cents, serving_size_g, current_stock_g || 0, store || '', grade || '', protein_per_100g || null, carbs_per_100g || null, fat_per_100g || null, calories_per_100g || null, protein_per_100g ? 'manual' : 'usda', id]
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

// DELETE inventory item
router.delete('/:id', requireRole('admin'), async (req, res) => {
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

module.exports = router;
