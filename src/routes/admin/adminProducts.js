const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

// GET all products with purchase history
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, category, unit, item_code, store, last_purchase_price_cents, last_purchase_date, purchase_count, inventory_item_id, created_at
      FROM receipt_products
      ORDER BY name
    `);
    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        unit: row.unit,
        itemCode: row.item_code,
        store: row.store,
        lastPurchasePrice: row.last_purchase_price_cents / 100,
        lastPurchaseDate: row.last_purchase_date,
        purchaseCount: row.purchase_count,
        inventoryItemId: row.inventory_item_id,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET products by name (search/autocomplete)
router.get('/search/:name', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;
    const result = await db.query(`
      SELECT id, name, category, unit, item_code, store, last_purchase_price_cents, inventory_item_id
      FROM receipt_products
      WHERE LOWER(name) LIKE LOWER($1)
      ORDER BY purchase_count DESC
      LIMIT 10
    `, [`%${name}%`]);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        unit: row.unit,
        itemCode: row.item_code,
        store: row.store,
        lastPurchasePrice: row.last_purchase_price_cents / 100,
        inventoryItemId: row.inventory_item_id,
      })),
    });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// POST create or update product from receipt
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, category, unit, itemCode, store, price, inventoryItemId } = req.body;

    if (!name || !category || !unit) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if product already exists
    const existingResult = await db.query(
      'SELECT id FROM receipt_products WHERE LOWER(name) = LOWER($1) AND store = $2',
      [name, store || '']
    );

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing product
      result = await db.query(`
        UPDATE receipt_products
        SET last_purchase_price_cents = $1, last_purchase_date = NOW(), purchase_count = purchase_count + 1, inventory_item_id = $2
        WHERE id = $3
        RETURNING id, name, category, unit, item_code, store, last_purchase_price_cents, purchase_count, inventory_item_id
      `, [Math.round((price || 0) * 100), inventoryItemId || null, existingResult.rows[0].id]);
    } else {
      // Create new product
      result = await db.query(`
        INSERT INTO receipt_products (name, category, unit, item_code, store, last_purchase_price_cents, inventory_item_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, category, unit, item_code, store, last_purchase_price_cents, purchase_count, inventory_item_id
      `, [name, category, unit, itemCode || null, store || '', Math.round((price || 0) * 100), inventoryItemId || null]);
    }

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        category: result.rows[0].category,
        unit: result.rows[0].unit,
        itemCode: result.rows[0].item_code,
        store: result.rows[0].store,
        lastPurchasePrice: result.rows[0].last_purchase_price_cents / 100,
        purchaseCount: result.rows[0].purchase_count,
        inventoryItemId: result.rows[0].inventory_item_id,
      }
    });
  } catch (error) {
    console.error('Error creating/updating product:', error);
    res.status(500).json({ error: 'Failed to save product' });
  }
});

// POST link receipt item to inventory item
router.post('/:productId/link-inventory', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { productId } = req.params;
    const { inventoryItemId } = req.body;

    const result = await db.query(
      'UPDATE receipt_products SET inventory_item_id = $1 WHERE id = $2 RETURNING *',
      [inventoryItemId, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error linking product to inventory:', error);
    res.status(500).json({ error: 'Failed to link product' });
  }
});

module.exports = router;
