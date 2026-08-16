// ============================================================================
// NEW FILE: src/services/communicationService.js
// ============================================================================
//
// Sends real email (SendGrid) and SMS (Twilio) via their REST APIs directly
// with fetch -- no new SDK dependencies to install. Both are wrapped so a
// failed send still returns a normal result object (never throws) so the
// caller can log the attempt either way.
//
// Setup required before this works -- add to Railway env vars:
//   SENDGRID_API_KEY   -- from app.sendgrid.com (Settings -> API Keys)
//   FROM_EMAIL          -- a verified sender in SendGrid (Settings -> Sender Authentication)
//   TWILIO_ACCOUNT_SID  -- from the Twilio console
//   TWILIO_AUTH_TOKEN   -- from the Twilio console
//   TWILIO_PHONE_NUMBER -- your Twilio number, e.g. +18135551234
//
// If you don't have SendGrid/Twilio accounts yet: both have free tiers
// (SendGrid: 100 emails/day free; Twilio: pay-as-you-go, no monthly fee,
// a phone number runs ~$1.15/mo + per-message cost). Sign up, verify a
// sender/number, drop the keys into Railway, done.

function mergeTags(text, customer) {
  if (!text) return text
  const firstName = (customer.name || '').split(' ')[0] || customer.name || 'there'
  return text.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{name\}\}/g, customer.name || '')
}

async function sendEmail({ to, subject, body }) {
  if (!process.env.SENDGRID_API_KEY || !process.env.FROM_EMAIL) {
    return { success: false, error: 'SENDGRID_API_KEY or FROM_EMAIL not configured' }
  }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.FROM_EMAIL, name: 'Fit4Sure' },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `SendGrid ${res.status}: ${errText.slice(0, 300)}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function sendSms({ to, body }) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return { success: false, error: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER not configured' }
  }
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_PHONE_NUMBER, Body: body }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: `Twilio ${res.status}: ${data.message || 'unknown error'}` }
    }
    return { success: true, providerId: data.sid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { sendEmail, sendSms, mergeTags }
