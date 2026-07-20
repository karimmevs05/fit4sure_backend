const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireRole } = require('../../middleware/auth');

// POST create receipt and update inventory
router.post('/', requireRole('admin'), async (req, res) => {
  const client = await db.connect();

  try {
    const { date, store, total_amount_cents, items } = req.body;

    if (!date || !items || items.length === 0) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: date, items' });
    }

    await client.query('BEGIN');

    // 1. Create receipt
    const receiptResult = await client.query(
      `INSERT INTO receipts (date, store, total_amount_cents)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [date, store || null, total_amount_cents]
    );

    const receiptId = receiptResult.rows[0].id;

    // 2. Process each item
    for (const item of items) {
      // Create receipt line item
      await client.query(
        `INSERT INTO receipt_items (receipt_id, inventory_id, inventory_name, quantity_grams, unit, quantity, unit_price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          receiptId,
          item.inventory_id || null,
          item.inventory_name,
          item.quantity_grams,
          item.unit || null,
          item.quantity || null,
          item.unit_price_cents,
        ]
      );

      // Update inventory quantities (if we matched to an inventory item)
      if (item.inventory_id) {
        await client.query(
          `UPDATE inventory
           SET current_stock_g = current_stock_g + $1, updated_at = NOW()
           WHERE id = $2`,
          [item.quantity_grams, item.inventory_id]
        );
      }

      // Create financial entry
      await client.query(
        `INSERT INTO financial_entries (entry_type, description, receipt_id, inventory_id, quantity_grams, amount_cents, entry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'purchase',
          `Receipt #${receiptId} - ${item.inventory_name}`,
          receiptId,
          item.inventory_id || null,
          item.quantity_grams,
          item.unit_price_cents,
          date,
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        receipt_id: receiptId,
        items_count: items.length,
        total_amount: total_amount_cents / 100,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating receipt:', error);
    res.status(500).json({ error: 'Failed to create receipt' });
  } finally {
    client.release();
  }
});

// GET all receipts
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*, COUNT(ri.id) as item_count
       FROM receipts r
       LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
       GROUP BY r.id
       ORDER BY r.date DESC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching receipts:', error);
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
});

// GET receipt with items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const receiptResult = await db.query(
      'SELECT * FROM receipts WHERE id = $1',
      [id]
    );

    if (receiptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const itemsResult = await db.query(
      'SELECT * FROM receipt_items WHERE receipt_id = $1 ORDER BY id',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...receiptResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching receipt:', error);
    res.status(500).json({ error: 'Failed to fetch receipt' });
  }
});

module.exports = router;
