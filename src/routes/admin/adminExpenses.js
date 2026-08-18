const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { syncInventoryFromReceiptItem, convertToGrams } = require('../../services/inventorySync');
const { processReceiptWithAI } = require('../../services/receiptProcessor');

// POST /api/admin/expenses/save-receipt-items - Save scanned receipt items to database
router.post('/save-receipt-items', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { items, vendor } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const savedProducts = [];
    const createdExpenses = [];

    // One row per receipt so this entry shows up alongside Drive-scanned
    // and manually-typed receipts in the expense summary (no Drive file
    // here, so drive_file_id/drive_view_link stay null).
    const itemsTotalCents = Math.round(items.reduce((sum, item) => sum + (item.amount || 0), 0) * 100);
    let receiptScanId = null;
    try {
      const receiptScanResult = await db.query(`
        INSERT INTO receipt_scans (vendor, receipt_date, total_amount_cents)
        VALUES ($1, NOW(), $2)
        RETURNING id
      `, [vendor || 'Unknown', itemsTotalCents]);
      receiptScanId = receiptScanResult.rows[0].id;
    } catch (receiptScanError) {
      console.error('Error creating receipt scan record:', receiptScanError);
    }

    // Process each item
    for (const item of items) {
      const { productName, description, amount, category, unit, quantity } = item;

      // Product name defaults to description if not provided
      const finalProductName = productName || description;

      if (!finalProductName || !category || amount <= 0) {
        console.warn('Skipping invalid item:', item);
        continue;
      }

      // Save product to database. quantity+unit here (e.g. "2.5 lb") is
      // converted to grams up front so it lands in the same
      // last_purchase_weight_g column the AI photo scanner populates --
      // one consistent field for recipe costing to derive a real $/lb from,
      // regardless of which entry path the purchase came from.
      const weightG = quantity ? convertToGrams(parseFloat(quantity), unit) : null;
      try {
        const productResult = await db.query(`
          INSERT INTO receipt_products (name, category, unit, store, last_purchase_price_cents, last_purchase_weight_g)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (LOWER(name), store)
          DO UPDATE SET
            last_purchase_price_cents = EXCLUDED.last_purchase_price_cents,
            last_purchase_weight_g = COALESCE(EXCLUDED.last_purchase_weight_g, receipt_products.last_purchase_weight_g),
            last_purchase_date = NOW(),
            purchase_count = receipt_products.purchase_count + 1
          RETURNING id, name, unit, store
        `, [
          finalProductName,
          category,
          unit || 'g',
          vendor || 'Unknown',
          Math.round(amount * 100), // Convert to cents
          weightG,
        ]);

        savedProducts.push(productResult.rows[0]);
      } catch (productError) {
        console.error('Error saving product:', productError);
      }

      // Create expense entry
      try {
        const expenseResult = await db.query(`
          INSERT INTO expenses (date, vendor, category, description, amount, status, receipt_scan_id, source_type)
          VALUES (NOW(), $1, $2, $3, $4, 'pending', $5, 'scan')
          RETURNING id, date, vendor, category, description, amount, status
        `, [
          vendor || 'Receipt',
          category,
          finalProductName + (quantity && unit ? ` (${quantity}${unit})` : ''),
          amount, // expenses.amount stores plain dollars, not cents
          receiptScanId,
        ]);

        createdExpenses.push(expenseResult.rows[0]);
      } catch (expenseError) {
        console.error('Error creating expense:', expenseError);
      }

      // Keep Inventory in sync for food items (skips non-food automatically)
      try {
        await syncInventoryFromReceiptItem(
          { name: finalProductName, category, amount, quantity, unit },
          vendor
        );
      } catch (inventoryError) {
        console.error('Error syncing inventory:', inventoryError);
      }
    }

    res.json({
      success: true,
      data: {
        productsAdded: savedProducts.length,
        expensesCreated: createdExpenses.length,
        products: savedProducts,
        expenses: createdExpenses
      }
    });

  } catch (error) {
    console.error('Error saving receipt items:', error);
    res.status(500).json({ error: error.message || 'Failed to save receipt items' });
  }
});

// POST /api/admin/expenses/scan-receipt - Scan receipt with Tesseract OCR
// POST /api/admin/expenses/scan-receipt - Parse an uploaded receipt photo
// with the same Gemini-based parser Google Drive sync already uses (see
// services/receiptProcessor.js) -- one AI parser for every receipt path,
// not a separate OCR.space+regex guess for manually-uploaded photos.
router.post('/scan-receipt', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 required' });
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    if (!cleanBase64 || cleanBase64.length < 1000) {
      return res.status(400).json({ error: 'Image data appears corrupted or too small' });
    }

    const receiptData = await processReceiptWithAI(cleanBase64, 'manual-upload', mimeType || 'image/jpeg');

    res.json({
      success: true,
      data: {
        vendor: receiptData.vendor,
        total: receiptData.receiptTotal,
        lowConfidence: receiptData.lowConfidence,
        items: receiptData.items,
      },
    });
  } catch (error) {
    console.error('Receipt scan error:', error);
    res.status(500).json({ error: error.message || 'Failed to scan receipt' });
  }
});

// POST /api/admin/expenses - Create a single manual expense
// (distinct from /save-receipt-items, which is for multi-item receipt batches
// and always forces status='pending' + date=NOW())
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { date, vendor, category, description, amount, status, sourceType } = req.body;
    const validStatuses = ['pending', 'approved', 'reconciled', 'rejected'];
    const validSourceTypes = ['manual', 'scan', 'gdrive'];

    if (!vendor || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'vendor and amount are required' });
    }

    const finalStatus = validStatuses.includes(status) ? status : 'pending';
    const finalSourceType = validSourceTypes.includes(sourceType) ? sourceType : 'manual';

    const result = await db.query(
      `INSERT INTO expenses (date, vendor, category, description, amount, status, source_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, date, vendor, category, description, amount, status, source_type`,
      [date || new Date().toISOString().split('T')[0], vendor, category || 'other', description || '', amount, finalStatus, finalSourceType]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: error.message || 'Failed to create expense' });
  }
});
// GET /api/admin/expenses - List real expenses from the database
// Supports optional filters: ?status=pending, ?category=food_cogs, ?vendor=Costco
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { status, category, vendor, limit } = req.query;

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (vendor) {
      params.push(`%${vendor}%`);
      conditions.push(`vendor ILIKE $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10) || 100}` : 'LIMIT 500';

    const result = await db.query(
      `SELECT e.id, e.date, e.vendor, e.category, e.description, e.amount, e.status, e.created_at,
              e.source_type, e.approved_by, e.approved_at, e.receipt_scan_id, u.display_name AS approved_by_name
       FROM expenses e
       LEFT JOIN users u ON u.user_id = e.approved_by
       ${whereClause.replace(/(^|\s)(status|category|vendor)(\s*=|\s+ILIKE)/g, '$1e.$2$3')}
       ORDER BY e.date DESC, e.id DESC
       ${limitClause}`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch expenses' });
  }
});

// GET /api/admin/expenses/receipts - One row per receipt (Drive scan, or a
// single manual/screenshot entry) with a direct link back to the source
// image, instead of a flat line-item list -- "what did we spend at each
// receipt, and can I see it."
router.get('/receipts', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 200;
    const result = await db.query(
      `SELECT rs.id, rs.vendor, rs.receipt_date, rs.total_amount_cents, rs.drive_view_link,
              rs.low_confidence, rs.created_at,
              COUNT(e.id) AS item_count,
              COALESCE(SUM(e.amount), 0) AS items_total
       FROM receipt_scans rs
       LEFT JOIN expenses e ON e.receipt_scan_id = rs.id
       GROUP BY rs.id
       ORDER BY rs.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching receipt summary:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch receipts' });
  }
});

// PATCH /api/admin/expenses/:id/approve and /reject - thin wrappers around
// the generic PATCH below that also stamp who approved/rejected it and
// when, so the audit trail doesn't depend on the frontend remembering to
// pass those fields itself.
router.patch('/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE expenses SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE id = $2
       RETURNING id, date, vendor, category, description, amount, status, approved_by, approved_at`,
      [req.userId, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error approving expense:', error);
    res.status(500).json({ error: 'Failed to approve expense' });
  }
});

router.patch('/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE expenses SET status = 'rejected', approved_by = $1, approved_at = NOW() WHERE id = $2
       RETURNING id, date, vendor, category, description, amount, status, approved_by, approved_at`,
      [req.userId, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error rejecting expense:', error);
    res.status(500).json({ error: 'Failed to reject expense' });
  }
});

// POST /api/admin/expenses/bulk-approve { ids: number[] }
router.post('/bulk-approve', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const result = await db.query(
      `UPDATE expenses SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE id = ANY($2::int[])
       RETURNING id`,
      [req.userId, ids]
    );
    res.json({ success: true, data: { approvedCount: result.rows.length } });
  } catch (error) {
    console.error('Error bulk-approving expenses:', error);
    res.status(500).json({ error: 'Failed to bulk-approve expenses' });
  }
});

// POST /api/admin/expenses/bulk-reject { ids: number[] } -- mirrors
// bulk-approve, used for the "reject this whole receipt" linked action.
router.post('/bulk-reject', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const result = await db.query(
      `UPDATE expenses SET status = 'rejected', approved_by = $1, approved_at = NOW() WHERE id = ANY($2::int[])
       RETURNING id`,
      [req.userId, ids]
    );
    res.json({ success: true, data: { rejectedCount: result.rows.length } });
  } catch (error) {
    console.error('Error bulk-rejecting expenses:', error);
    res.status(500).json({ error: 'Failed to bulk-reject expenses' });
  }
});

// PATCH /api/admin/expenses/:id - Update any combination of fields
// (vendor, category, description, amount, date, status)
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { vendor, category, description, amount, date, status } = req.body;
    const validStatuses = ['pending', 'approved', 'reconciled', 'rejected'];

    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const fields = [];
    const params = [];

    if (vendor !== undefined) { params.push(vendor); fields.push(`vendor = $${params.length}`); }
    if (category !== undefined) { params.push(category); fields.push(`category = $${params.length}`); }
    if (description !== undefined) { params.push(description); fields.push(`description = $${params.length}`); }
    if (amount !== undefined) { params.push(amount); fields.push(`amount = $${params.length}`); }
    if (date !== undefined) { params.push(date); fields.push(`date = $${params.length}`); }
    if (status !== undefined) { params.push(status); fields.push(`status = $${params.length}`); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);

    const result = await db.query(
      `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${params.length}
       RETURNING id, date, vendor, category, description, amount, status`,
      params
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: error.message || 'Failed to update expense' });
  }
});

// DELETE /api/admin/expenses/:id - Delete an expense
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM expenses WHERE id = $1 RETURNING id`,
      [req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: error.message || 'Failed to delete expense' });
  }
});

module.exports = router;
// GET
