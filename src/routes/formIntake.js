// Receiving end of the flyer/QR outreach campaign's Google Form -- Apps
// Script's onFormSubmit trigger POSTs here directly, no staff login
// involved, so this can't reuse requireAuth. Instead it's gated by a
// shared secret only this backend and that one Apps Script project know,
// checked with a timing-safe comparison so response time can't leak how
// much of the secret a guess got right.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const formIntakeService = require('../services/formIntakeService');

function requireFormIntakeSecret(req, res, next) {
  const expected = process.env.FORM_INTAKE_SECRET;
  const provided = req.headers['x-form-intake-secret'];
  if (!expected) {
    console.error('FORM_INTAKE_SECRET is not set -- refusing all form-intake submissions');
    return res.status(503).json({ error: 'Form intake is not configured' });
  }
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided || '');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /api/integrations/form-intake { responseId, namedValues }
router.post('/', requireFormIntakeSecret, async (req, res) => {
  try {
    const { responseId, namedValues } = req.body;
    const { intake, duplicate } = await formIntakeService.processSubmission({ responseId, namedValues });
    res.status(duplicate ? 200 : 201).json({ data: intake, duplicate });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error processing form intake:', error);
    res.status(500).json({ error: 'Failed to process form intake' });
  }
});

module.exports = router;
