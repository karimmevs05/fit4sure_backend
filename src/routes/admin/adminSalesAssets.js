const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

// POST /api/admin/sales-assets - add an asset to the library. source_url
// points at wherever the actual file lives (a Google Drive share link by
// default -- see the build spec's open question) -- this table is just the
// catalog + tracking layer on top of it, not a file store of its own.
router.post('/sales-assets', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { title, category, asset_type, source_url, credit } = req.body;
    if (!title || !category || !asset_type || !source_url) {
      return res.status(400).json({ error: 'title, category, asset_type, and source_url are required' });
    }
    const result = await db.query(
      `INSERT INTO sales_assets (title, category, asset_type, source_url, credit, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, category, asset_type, source_url, credit || null, req.userId || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error creating sales asset:', error);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// GET /api/admin/sales-assets - list with rolled-up engagement per asset.
// sent_count/scan_count come from asset_shares (split by channel since a
// sent link and a scanned QR mean different things), opened_count from the
// actual redirect hits in asset_open_events.
router.get('/sales-assets', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT a.*,
        COUNT(DISTINCT s.id) FILTER (WHERE s.channel = 'link') AS sent_count,
        COUNT(DISTINCT s.id) FILTER (WHERE s.channel = 'qr') AS scan_count,
        COUNT(DISTINCT o.id) AS opened_count
      FROM sales_assets a
      LEFT JOIN asset_shares s ON s.asset_id = a.id
      LEFT JOIN asset_open_events o ON o.share_id = s.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching sales assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// POST /api/admin/sales-assets/:id/share - mint a trackable link. channel
// 'qr' is for a code that gets scanned in person (not tied to one customer,
// can't be "opened/closed" the same way a sent link's single recipient can);
// 'link' is a real link handed to one specific lead.
router.post('/sales-assets/:id/share', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_id, channel } = req.body;
    const resolvedChannel = channel === 'qr' ? 'qr' : 'link';

    const asset = await db.query('SELECT id FROM sales_assets WHERE id = $1', [id]);
    if (asset.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });

    const shareToken = crypto.randomBytes(12).toString('hex'); // 24 chars, fits VARCHAR(32)
    const result = await db.query(
      `INSERT INTO asset_shares (asset_id, customer_id, shared_by_user_id, channel, share_token)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, customer_id || null, req.userId || null, resolvedChannel, shareToken]
    );

    const appDomain = process.env.APP_DOMAIN || `${req.protocol}://${req.get('host')}`;
    res.status(201).json({ data: result.rows[0], share_url: `${appDomain}/s/${shareToken}` });
  } catch (error) {
    console.error('Error sharing sales asset:', error);
    res.status(500).json({ error: 'Failed to share asset' });
  }
});

module.exports = router;
