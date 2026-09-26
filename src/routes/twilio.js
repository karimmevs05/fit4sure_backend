// Twilio's inbound-message webhook -- point a Messaging Service/phone
// number's "A message comes in" webhook at POST /api/twilio/inbound.
//
// Twilio's own carrier-level Advanced Opt-Out already blocks delivery and
// sends the required auto-confirmation for STOP/START/HELP before this
// route ever sees the message (on by default for new numbers) -- but our
// own send paths (communicationService.sendSms via adminCommunications.js
// and automationEngine.js) don't know that happened unless we record it
// ourselves, so this is what keeps customers.sms_opt_out in sync with
// reality and stops us from even attempting a send.
const express = require('express');
const router = express.Router();
const db = require('../config/db');

const STOP_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];
const START_KEYWORDS = ['start', 'unstop', 'yes'];

function normalizeLast10(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

router.post('/inbound', express.urlencoded({ extended: false }), async (req, res) => {
  const from = req.body.From || '';
  const body = (req.body.Body || '').trim().toLowerCase();
  const last10 = normalizeLast10(from);

  try {
    if (last10) {
      const customerResult = await db.query(
        `SELECT id FROM customers WHERE phone IS NOT NULL AND RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`,
        [last10]
      );
      const customer = customerResult.rows[0];

      if (customer) {
        if (STOP_KEYWORDS.includes(body)) {
          await db.query('UPDATE customers SET sms_opt_out = true, updated_at = NOW() WHERE id = $1', [customer.id]);
        } else if (START_KEYWORDS.includes(body)) {
          await db.query('UPDATE customers SET sms_opt_out = false, updated_at = NOW() WHERE id = $1', [customer.id]);
        }

        await db.query(
          `INSERT INTO customer_activities (customer_id, type, direction, body, status)
           VALUES ($1, 'sms', 'inbound', $2, 'logged')`,
          [customer.id, req.body.Body || '']
        );
      }
    }
  } catch (err) {
    console.error('Error processing inbound Twilio SMS:', err);
    // Still ack Twilio below -- a DB hiccup on our side shouldn't make
    // Twilio retry-storm an inbound message we already have in hand.
  }

  // Empty TwiML -- no auto-reply from us; Twilio's own opt-out/help
  // confirmations (if Advanced Opt-Out is on) are separate from this.
  res.set('Content-Type', 'text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

module.exports = router;
