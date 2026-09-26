-- A2P 10DLC compliance: every customer we text needs a recorded consent
-- event (when/how they opted in -- the order page's required checkbox),
-- and sms_opt_out must be checked before any automated or staff-triggered
-- send so a STOP reply (see the Twilio inbound webhook) actually stops
-- future messages from this app, not just at the carrier level.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT false;
