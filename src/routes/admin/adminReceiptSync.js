const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { parseReceiptsFromDrive, confirmAndSaveReceipts } = require('../../services/googleDriveSync');

/**
 * POST /api/admin/receipt-sync/process - Parse receipts from Google Drive
 * for review. Nothing is saved to inventory/expenses and no file is
 * archived yet -- the frontend shows each item's AI-suggested display name
 * for an admin to confirm/edit, then calls /confirm with the (possibly
 * edited) result.
 */
router.post('/process', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    console.log('Manual receipt parse triggered');
    const result = await parseReceiptsFromDrive();

    let message = `Parsed ${result.parsed.length} receipt(s) for review (${result.failed.length} failed)`;
    if (result.failed.length > 0) {
      const reasons = result.failed.map(e => `${e.filename}: ${e.error}`).join('; ');
      message += ` — Reasons: ${reasons}`;
    }

    res.json({
      success: true,
      message,
      data: result,
    });
  } catch (error) {
    console.error('Receipt parse error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse receipts',
    });
  }
});

/**
 * POST /api/admin/receipt-sync/confirm - Save a batch of previously-parsed,
 * admin-reviewed receipts and archive their Drive files.
 * Body: { receipts: [{ driveFileId, fileName, vendor, receiptTotal, items }] }
 */
router.post('/confirm', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { receipts } = req.body;
    if (!Array.isArray(receipts) || receipts.length === 0) {
      return res.status(400).json({ success: false, error: 'No receipts to save' });
    }

    const result = await confirmAndSaveReceipts(receipts);

    let message = `Saved ${result.processed} receipt(s), ${result.productsAdded} product(s) and ${result.expensesCreated} expense(s) (${result.failed} failed)`;
    if (result.failed > 0 && result.errors?.length) {
      const reasons = result.errors.map(e => `${e.filename}: ${e.error}`).join('; ');
      message += ` — Reasons: ${reasons}`;
    }

    res.json({
      success: true,
      message,
      data: result,
    });
  } catch (error) {
    console.error('Receipt confirm error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save receipts',
    });
  }
});

/**
 * GET /api/admin/receipt-sync/status - Check sync status
 */
router.get('/status', requireAuth, requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    message: 'Receipt parsing is manual with a review step',
    note: 'Use "Sync Google Drive Now" to parse new receipts, then confirm display names before they save to inventory.',
  });
});

module.exports = router;
