// The Meal Plans page's backend: a real standing "what plan is this
// customer on" record (see migrations/create_customer_plans.sql -- this
// didn't exist before, only inferable after the fact from order history),
// plus turning a form_intakes lead's answers into a draft plan a staffer
// reviews before activating. Activating never touches
// customers.sales_pipeline_stage -- that stays a deliberate human action
// via the existing Edit Customer flow, same boundary already drawn for
// form intake itself (see formIntakeService.js).
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const plateConfig = require('../../services/plateConfig');

const EDITABLE_FIELDS = [
  'meals_per_week', 'portion', 'dietary_preference', 'protein_preference',
  'fulfillment_method', 'delivery_zip', 'price_cents',
];

// GET / -- roster: every customer, with their current plan if they have
// one. Customers with no plan yet still show up (null plan fields) so
// staff can see the gap, not just the ones already on a recorded plan.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        c.id AS customer_id, c.name, c.phone, c.email, c.sales_pipeline_stage,
        p.id AS plan_id, p.meals_per_week, p.portion, p.dietary_preference,
        p.protein_preference, p.fulfillment_method, p.delivery_zip,
        p.price_cents, p.status, p.source, p.activated_at, p.updated_at
      FROM customers c
      LEFT JOIN customer_plans p ON p.customer_id = c.id AND p.is_current = true
      ORDER BY (p.id IS NOT NULL) DESC, c.name ASC
    `);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching customer plans roster:', error);
    res.status(500).json({ error: 'Failed to fetch customer plans' });
  }
});

// GET /campaign-stats -- real KPIs for the flyer/QR outreach campaign
// (see fit4sure_flyer_outreach_campaign in project memory), computed live
// from form_intakes/customer_plans/orders rather than hand-maintained
// spreadsheet formulas that can drift from what actually happened. Tracks
// the funnel the original campaign plan specified: submissions ->
// contactable leads -> plans built -> plans activated -> first paid
// orders, both overall and broken out per partner QR location.
router.get('/campaign-stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const overall = await db.query(`
      SELECT
        COUNT(*) AS total_submissions,
        COUNT(*) FILTER (WHERE submission_type = 'weekly_meal_prep') AS weekly_meal_prep,
        COUNT(*) FILTER (WHERE submission_type = 'help_me_choose') AS help_me_choose,
        COUNT(*) FILTER (WHERE submission_type = 'grab_and_go') AS grab_and_go,
        COUNT(*) FILTER (WHERE customer_action != 'no_contact') AS contactable,
        COUNT(*) FILTER (WHERE needs_review) AS needs_review
      FROM form_intakes
    `);

    const funnel = await db.query(`
      SELECT
        COUNT(DISTINCT cp.source_form_intake_id) AS plans_built,
        COUNT(DISTINCT cp.source_form_intake_id) FILTER (WHERE cp.activated_at IS NOT NULL) AS plans_activated
      FROM customer_plans cp
      WHERE cp.source_form_intake_id IS NOT NULL
    `);

    // A "first order" credits the campaign only for an order placed on or
    // after this customer's intake -- any earlier order means they were
    // already ordering before this submission, not a result of it.
    const firstOrders = await db.query(`
      SELECT COUNT(DISTINCT fi.customer_id) AS first_orders
      FROM form_intakes fi
      JOIN orders o ON o.customer_id = fi.customer_id AND o.created_at >= fi.created_at
      WHERE fi.customer_id IS NOT NULL
    `);

    const byLocation = await db.query(`
      SELECT
        COALESCE(fi.source_location, 'Unknown') AS source_location,
        COUNT(*) AS submissions,
        COUNT(*) FILTER (WHERE fi.customer_action != 'no_contact') AS contactable,
        COUNT(DISTINCT cp.source_form_intake_id) AS plans_built,
        COUNT(DISTINCT cp.source_form_intake_id) FILTER (WHERE cp.activated_at IS NOT NULL) AS plans_activated,
        COUNT(DISTINCT o.customer_id) AS first_orders
      FROM form_intakes fi
      LEFT JOIN customer_plans cp ON cp.source_form_intake_id = fi.id
      LEFT JOIN orders o ON o.customer_id = fi.customer_id AND o.created_at >= fi.created_at
      GROUP BY COALESCE(fi.source_location, 'Unknown')
      ORDER BY submissions DESC
    `);

    const byDay = await db.query(`
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS count
      FROM form_intakes
      GROUP BY 1
      ORDER BY 1
    `);

    res.json({
      data: {
        ...overall.rows[0],
        ...funnel.rows[0],
        ...firstOrders.rows[0],
        byLocation: byLocation.rows,
        byDay: byDay.rows,
      },
    });
  } catch (error) {
    console.error('Error computing campaign stats:', error);
    res.status(500).json({ error: 'Failed to compute campaign stats' });
  }
});

// GET /intake-customer-ids -- every customer who has ever submitted the
// flyer/QR form, regardless of submission type or plan status. Backs the
// frontend's "QR / Forms" lead-source badge -- a real, backend-driven
// default (unlike every other lead_source value, which is a manual
// localStorage-only tag, see the PROPOSAL-ONLY ADDITIONS comment block in
// Customers.tsx) since this one has actual evidence behind it.
router.get('/intake-customer-ids', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`SELECT DISTINCT customer_id FROM form_intakes WHERE customer_id IS NOT NULL`);
    res.json({ data: result.rows.map((r) => r.customer_id) });
  } catch (error) {
    console.error('Error fetching intake customer ids:', error);
    res.status(500).json({ error: 'Failed to fetch intake customer ids' });
  }
});

// GET /leads-needing-plans -- the most recent full-inquiry form_intakes
// row per customer who doesn't already have a current plan. "Full inquiry"
// excludes grab_and_go on purpose, same distinction formIntakeService.js
// already draws -- a text-club signup was never a weekly-plan request.
router.get('/leads-needing-plans', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT ON (fi.customer_id)
        fi.id AS form_intake_id, fi.customer_id, fi.submission_type, fi.source_location,
        fi.requested_meals_per_week, fi.requested_portion,
        fi.fulfillment_method, fi.delivery_zip, fi.needs_review, fi.created_at,
        c.name, c.phone, c.primary_goal, c.protein_preference, c.dietary_preference
      FROM form_intakes fi
      JOIN customers c ON c.id = fi.customer_id
      WHERE fi.customer_id IS NOT NULL
        AND fi.submission_type IN ('weekly_meal_prep', 'help_me_choose')
        AND NOT EXISTS (
          SELECT 1 FROM customer_plans cp WHERE cp.customer_id = fi.customer_id AND cp.is_current = true
        )
      ORDER BY fi.customer_id, fi.created_at DESC
    `);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching leads needing plans:', error);
    res.status(500).json({ error: 'Failed to fetch leads needing plans' });
  }
});

// GET /:customerId/intake -- this customer's most recent form submission,
// full detail (every mapped field plus the raw answers), for the "resume"
// section of their profile. Not scoped to full-inquiry/no-current-plan
// like leads-needing-plans above -- this is "did they ever submit the
// form at all", regardless of what's happened with their plan since.
router.get('/:customerId/intake', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM form_intakes WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.customerId]
    );
    res.json({ data: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching customer intake:', error);
    res.status(500).json({ error: 'Failed to fetch customer intake' });
  }
});

// POST /from-intake/:formIntakeId -- pre-fills a draft plan from that
// submission's answers. Always inserts a NEW draft row (never overwrites
// an existing plan in place) so a bad pre-fill is just discarded, not a
// destructive edit -- activation is the only thing that supersedes a prior
// current plan, see POST /:id/activate below.
router.post('/from-intake/:formIntakeId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const intake = await db.query('SELECT * FROM form_intakes WHERE id = $1', [req.params.formIntakeId]);
    const row = intake.rows[0];
    if (!row) return res.status(404).json({ error: 'Form intake not found' });
    if (!row.customer_id) return res.status(400).json({ error: 'This submission has no linked customer to build a plan for' });

    // Dietary/protein preference live on the customer row (written there by
    // formIntakeService's fillBlankProfileFields at intake time, and
    // possibly edited since) rather than on this historical intake
    // snapshot -- pull the current value, not a stale copy.
    const customerResult = await db.query('SELECT dietary_preference, protein_preference FROM customers WHERE id = $1', [row.customer_id]);
    const customer = customerResult.rows[0] || {};

    const categoryPrices = await plateConfig.getCategoryPrices();
    const priceCents = row.requested_portion && categoryPrices[row.requested_portion] != null
      ? Math.round(categoryPrices[row.requested_portion] * 100)
      : null;

    const result = await db.query(
      `INSERT INTO customer_plans (
         customer_id, meals_per_week, portion, dietary_preference, protein_preference,
         fulfillment_method, delivery_zip, price_cents, status, source, source_form_intake_id,
         created_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft','form_intake',$9,$10)
       RETURNING *`,
      [
        row.customer_id, row.requested_meals_per_week, row.requested_portion,
        customer.dietary_preference, customer.protein_preference, row.fulfillment_method, row.delivery_zip,
        priceCents, row.id, req.userId,
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error building draft plan from intake:', error);
    res.status(500).json({ error: 'Failed to build draft plan' });
  }
});

// POST / -- manual draft, no underlying submission (e.g. staff setting up
// a plan for a walk-in or phone order).
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });

    const columns = ['customer_id', 'created_by_user_id'];
    const placeholders = ['$1', '$2'];
    const values = [customer_id, req.userId];
    let n = 3;
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        columns.push(field);
        placeholders.push(`$${n++}`);
        values.push(req.body[field]);
      }
    }

    const result = await db.query(
      `INSERT INTO customer_plans (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error creating customer plan:', error);
    res.status(500).json({ error: 'Failed to create customer plan' });
  }
});

// PUT /:id -- edit a plan's descriptive fields. Status/is_current only
// change via /activate below, kept deliberately separate from a freeform
// field edit.
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sets = [];
    const values = [];
    let n = 1;
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${n++}`);
        values.push(req.body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    sets.push('updated_at = NOW()');
    values.push(req.params.id);
    const result = await db.query(
      `UPDATE customer_plans SET ${sets.join(', ')} WHERE id = $${n} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error updating customer plan:', error);
    res.status(500).json({ error: 'Failed to update customer plan' });
  }
});

// POST /:id/activate -- makes this plan the customer's current one.
// Supersedes (not deletes) whatever was current before, same
// never-delete-history rule used throughout this app.
router.post('/:id/activate', requireAuth, requireRole('admin'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const planResult = await client.query('SELECT customer_id FROM customer_plans WHERE id = $1', [req.params.id]);
    const plan = planResult.rows[0];
    if (!plan) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Plan not found' });
    }

    await client.query(
      `UPDATE customer_plans SET is_current = false, status = 'superseded', updated_at = NOW()
       WHERE customer_id = $1 AND is_current = true AND id != $2`,
      [plan.customer_id, req.params.id]
    );
    const activated = await client.query(
      `UPDATE customer_plans SET is_current = true, status = 'active', activated_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    await client.query('COMMIT');
    res.json({ data: activated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error activating customer plan:', error);
    res.status(500).json({ error: 'Failed to activate customer plan' });
  } finally {
    client.release();
  }
});

module.exports = router;
