const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { saveReceiptItemsToDatabase } = require('../../services/receiptProcessorFree');

/**
 * GET /api/admin/receipt-review/pending
 * Returns list of pending receipts for manual review
 */
router.get('/pending', requireAuth, requireRole('admin'), (req, res) => {
  try {
    // For now, return empty - will populate from manual entry
    res.json({
      success: true,
      data: {
        pendingReceipts: [],
        message: 'Upload receipts to Google Drive folder "Fit4Sure Receipts" or enter items manually'
      }
    });
  } catch (error) {
    console.error('Error fetching pending receipts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/receipt-review/approve
 * Save approved receipt items to database
 */
router.post('/approve', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { items, vendor, date } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    if (!vendor) {
      return res.status(400).json({ error: 'Vendor name required' });
    }

    // Save to database
    const result = await saveReceiptItemsToDatabase(items, vendor, date || new Date().toISOString().split('T')[0]);

    res.json({
      success: true,
      message: `Saved ${result.productsAdded} products and created ${result.expensesCreated} expenses`,
      data: result
    });
  } catch (error) {
    console.error('Error approving receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
