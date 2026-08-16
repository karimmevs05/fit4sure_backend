const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

// Revenue here is booked from orders.total_price the same way Reports/Insights
// already treat it -- not gated on payment_status, since most historical
// orders never had a distinct payment event recorded. payment_status only
// distinguishes real outstanding balances (see /pending-balances) going
// forward, not whether a past order counts as revenue.

function monthRange(monthStr) {
  // monthStr like "2026-08" -> [start, end) as Date-safe ISO strings
  const [y, m] = monthStr.split('-').map((n) => parseInt(n, 10));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function revenueAndExpensesForMonth(monthStr) {
  const { start, end } = monthRange(monthStr);
  const [revResult, expResult] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(total_price), 0) AS total FROM orders WHERE created_at >= $1 AND created_at < $2`, [start, end]),
    db.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= $1 AND date < $2 AND status != 'rejected'`, [start, end]),
  ]);
  const grossRevenue = parseFloat(revResult.rows[0].total) || 0;
  const totalExpenses = parseFloat(expResult.rows[0].total) || 0;
  return { grossRevenue, totalExpenses, netOperatingProfit: grossRevenue - totalExpenses };
}

function pctDelta(current, prior) {
  if (!prior) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

// GET /api/admin/financials/overview?month=2026-08
router.get('/overview', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const priorMonth = shiftMonth(month, -1);
    const [y, m] = month.split('-').map((n) => parseInt(n, 10));
    const lastYearMonth = `${y - 1}-${String(m).padStart(2, '0')}`;

    const [current, prior, lastYear] = await Promise.all([
      revenueAndExpensesForMonth(month),
      revenueAndExpensesForMonth(priorMonth),
      revenueAndExpensesForMonth(lastYearMonth),
    ]);

    const outstandingResult = await db.query(
      `SELECT COALESCE(SUM(total_price), 0) AS total, COUNT(*) AS count FROM orders WHERE payment_status = 'pending'`
    );
    const outstandingBalance = parseFloat(outstandingResult.rows[0].total) || 0;
    const outstandingCount = parseInt(outstandingResult.rows[0].count, 10) || 0;

    const margin = current.grossRevenue > 0 ? Math.round((current.netOperatingProfit / current.grossRevenue) * 1000) / 10 : 0;

    res.json({
      data: {
        month,
        grossRevenue: current.grossRevenue,
        totalExpenses: current.totalExpenses,
        netOperatingProfit: current.netOperatingProfit,
        marginPct: margin,
        outstandingBalance,
        outstandingCount,
        compare: {
          mom: {
            grossRevenuePct: pctDelta(current.grossRevenue, prior.grossRevenue),
            totalExpensesPct: pctDelta(current.totalExpenses, prior.totalExpenses),
            label: 'vs. last month',
          },
          yoy: {
            grossRevenuePct: pctDelta(current.grossRevenue, lastYear.grossRevenue),
            totalExpensesPct: pctDelta(current.totalExpenses, lastYear.totalExpenses),
            label: 'vs. same month last year',
          },
        },
      },
    });
  } catch (error) {
    console.error('Error computing financials overview:', error);
    res.status(500).json({ error: 'Failed to compute financials overview' });
  }
});

// GET /api/admin/financials/trend?months=6
router.get('/trend', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const months = Math.min(parseInt(req.query.months, 10) || 6, 24);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const series = [];
    for (let i = months - 1; i >= 0; i--) {
      const month = shiftMonth(currentMonth, -i);
      const { grossRevenue, totalExpenses } = await revenueAndExpensesForMonth(month);
      series.push({ month, revenue: grossRevenue, expenses: totalExpenses });
    }
    res.json({ data: series });
  } catch (error) {
    console.error('Error computing financials trend:', error);
    res.status(500).json({ error: 'Failed to compute financials trend' });
  }
});

// GET /api/admin/financials/transactions?month=2026-08 - Real order-based
// ledger for the Revenue & Payments tab. There's no Stripe pipeline wired
// to real orders, so this is payment_method/payment_status as staff record
// it (bank transfer, cash, Stripe, etc.), not a processor transaction feed.
router.get('/transactions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);

    const txResult = await db.query(
      `SELECT o.id, c.id AS customer_id, c.name AS customer_name, o.created_at, o.total_price, o.payment_method, o.payment_status, o.source
       FROM orders o JOIN customers c ON o.customer_id = c.id
       WHERE o.created_at >= $1 AND o.created_at < $2
       ORDER BY o.created_at DESC`,
      [start, end]
    );

    const paidResult = await db.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_price), 0) AS total FROM orders WHERE created_at >= $1 AND created_at < $2 AND payment_status = 'paid'`,
      [start, end]
    );
    const outstandingResult = await db.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_price), 0) AS total FROM orders WHERE payment_status = 'pending'`
    );
    const byMethodResult = await db.query(
      `SELECT COALESCE(payment_method, 'unspecified') AS method, COUNT(*) AS count, COALESCE(SUM(total_price), 0) AS total
       FROM orders WHERE created_at >= $1 AND created_at < $2 AND payment_status = 'paid'
       GROUP BY COALESCE(payment_method, 'unspecified') ORDER BY total DESC`,
      [start, end]
    );

    res.json({
      data: {
        month,
        transactions: txResult.rows,
        summary: {
          paidCount: parseInt(paidResult.rows[0].count, 10) || 0,
          paidTotal: parseFloat(paidResult.rows[0].total) || 0,
          outstandingCount: parseInt(outstandingResult.rows[0].count, 10) || 0,
          outstandingTotal: parseFloat(outstandingResult.rows[0].total) || 0,
          byMethod: byMethodResult.rows.map((r) => ({ method: r.method, count: parseInt(r.count, 10), total: parseFloat(r.total) })),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /api/admin/financials/pending-balances - orders staff haven't marked
// paid yet. Real payment_status data, not fabricated processor failures.
router.get('/pending-balances', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT o.id AS order_id, c.id AS customer_id, c.name AS customer_name,
             o.total_price, o.created_at,
             EXTRACT(DAY FROM NOW() - o.created_at)::int AS days_outstanding
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.payment_status = 'pending'
      ORDER BY o.created_at ASC
    `);
    const total = result.rows.reduce((sum, r) => sum + parseFloat(r.total_price || 0), 0);
    res.json({ data: { balances: result.rows, total, count: result.rows.length } });
  } catch (error) {
    console.error('Error fetching pending balances:', error);
    res.status(500).json({ error: 'Failed to fetch pending balances' });
  }
});

// GET /api/admin/financials/reports - list snapshots, newest first
router.get('/reports', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, period_start, period_end, gross_revenue_cents, total_expenses_cents, net_profit_cents, generated_at, snapshot_json
       FROM financial_reports ORDER BY period_start DESC LIMIT 50`
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching financial reports:', error);
    res.status(500).json({ error: 'Failed to fetch financial reports' });
  }
});

// Shared by the POST endpoint and the daily scheduler in index.js
async function generateReportForMostRecentPeriod() {
  const now = new Date();
  const day = now.getUTCDate();
  let periodStart, periodEnd;
  if (day >= 16) {
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
  } else {
    const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 16));
    const lastDayPrevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    periodStart = prevMonth;
    periodEnd = lastDayPrevMonth;
  }

  const startIso = periodStart.toISOString();
  const endIso = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000).toISOString(); // inclusive end-of-day

  const existing = await db.query(
    `SELECT id FROM financial_reports WHERE period_start = $1 AND period_end = $2`,
    [periodStart.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10)]
  );
  if (existing.rows.length > 0) return { alreadyExists: true, id: existing.rows[0].id };

  const [revResult, expResult, categoryResult] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(total_price), 0) AS total FROM orders WHERE created_at >= $1 AND created_at < $2`, [startIso, endIso]),
    db.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= $1 AND date < $2 AND status != 'rejected'`, [startIso, endIso]),
    db.query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= $1 AND date < $2 AND status != 'rejected' GROUP BY category ORDER BY total DESC`,
      [startIso, endIso]
    ),
  ]);

  const grossRevenueCents = Math.round(parseFloat(revResult.rows[0].total) * 100);
  const totalExpensesCents = Math.round(parseFloat(expResult.rows[0].total) * 100);
  const netProfitCents = grossRevenueCents - totalExpensesCents;

  const snapshot = {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    grossRevenueCents,
    totalExpensesCents,
    netProfitCents,
    expensesByCategory: categoryResult.rows.map((r) => ({ category: r.category, amountCents: Math.round(parseFloat(r.total) * 100) })),
  };

  const inserted = await db.query(
    `INSERT INTO financial_reports (period_start, period_end, gross_revenue_cents, total_expenses_cents, net_profit_cents, snapshot_json)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [snapshot.periodStart, snapshot.periodEnd, grossRevenueCents, totalExpensesCents, netProfitCents, JSON.stringify(snapshot)]
  );

  return { alreadyExists: false, id: inserted.rows[0].id };
}

// POST /api/admin/financials/reports/generate
router.post('/reports/generate', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await generateReportForMostRecentPeriod();
    res.status(result.alreadyExists ? 200 : 201).json({ data: result });
  } catch (error) {
    console.error('Error generating financial report:', error);
    res.status(500).json({ error: 'Failed to generate financial report' });
  }
});

module.exports = router;
module.exports.generateReportForMostRecentPeriod = generateReportForMostRecentPeriod;
