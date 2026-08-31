const express = require('express');
const router = express.Router();
const db = require('../config/db');

const EXPIRED_PAGE = '<!doctype html><html><body style="font-family: sans-serif; text-align: center; padding: 4rem;"><h2>This link has expired.</h2></body></html>';

// Registered before the /:token catch-all so a literal /s/expired doesn't
// get swallowed as a (nonexistent) token lookup.
router.get('/expired', (req, res) => {
  res.status(410).send(EXPIRED_PAGE);
});

// GET /s/:token - what a prospect actually clicks. Public, no auth by
// design (this is a link handed to someone who isn't a dashboard user).
// Logs the open, then redirects straight to the real asset -- an expired/
// unknown token renders the page above directly instead of redirecting
// again (which would loop, since /expired doesn't exist as a real token).
router.get('/:token', async (req, res) => {
  try {
    const share = await db.query('SELECT id, asset_id FROM asset_shares WHERE share_token = $1', [req.params.token]);
    if (share.rows.length === 0) {
      return res.status(410).send(EXPIRED_PAGE);
    }

    const asset = await db.query('SELECT source_url FROM sales_assets WHERE id = $1', [share.rows[0].asset_id]);
    if (asset.rows.length === 0) {
      return res.status(410).send(EXPIRED_PAGE);
    }

    await db.query('INSERT INTO asset_open_events (share_id) VALUES ($1)', [share.rows[0].id]);
    res.redirect(asset.rows[0].source_url);
  } catch (error) {
    console.error('Error resolving asset share:', error);
    res.status(500).send(EXPIRED_PAGE);
  }
});

module.exports = router;
