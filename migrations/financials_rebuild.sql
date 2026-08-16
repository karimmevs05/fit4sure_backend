-- Orders: track how/whether each order was actually paid. Revenue methods
-- here are mixed (bank transfer, Stripe, cash, Venmo, etc.), not Stripe-only,
-- so this is a manual/free-text method field staff set per order rather than
-- a payment-processor status. Existing orders default to 'paid' since every
-- report in this app already treats orders.total_price as realized revenue --
-- this only starts distinguishing pending balances for orders going forward.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending')),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

UPDATE orders SET paid_at = created_at WHERE payment_status = 'paid' AND paid_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Expenses: track how an entry was captured and who approved/rejected it
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'manual' CHECK (source_type IN ('manual', 'scan', 'gdrive')),
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Backfill source_type from how the row actually got here: anything tied to
-- a receipt_scan_id came through the scan/import flow, not manual typing.
UPDATE expenses SET source_type = 'scan' WHERE receipt_scan_id IS NOT NULL AND source_type = 'manual';

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);

-- Semi-monthly report snapshots -- a generated report shouldn't silently
-- change if later data corrections land, so this stores the computed
-- payload at generation time rather than being re-derived on every view.
CREATE TABLE IF NOT EXISTS financial_reports (
  id SERIAL PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_revenue_cents INTEGER NOT NULL,
  total_expenses_cents INTEGER NOT NULL,
  net_profit_cents INTEGER NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot_json JSONB,
  UNIQUE (period_start, period_end)
);
