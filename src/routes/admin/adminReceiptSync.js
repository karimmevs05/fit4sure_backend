const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { processReceiptsFromDrive } = require('../../services/googleDriveSync');

/**
 * POST /api/admin/receipt-sync - Manually trigger receipt sync from Google Drive
 */
router.post('/process', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    console.log('Manual receipt sync triggered');
    const result = await processReceiptsFromDrive();

    res.json({
      success: true,
      message: `Processed ${result.processed} receipts (${result.failed} failed)`,
      data: result,
    });
  } catch (error) {
    console.error('Receipt sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process receipts',
    });
  }
});

/**
 * GET /api/admin/receipt-sync/status - Check sync status
 */
router.get('/status', requireAuth, requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    message: 'Auto receipt sync is active',
    note: 'Receipts in Google Drive folder are automatically processed every 5 minutes',
  });
});

module.exports = router;
