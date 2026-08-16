const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { checkStageTrigger } = require('../../services/automationEngine');

// Fields shared by POST (create) and PUT (update) -- the full CRM profile
const PROFILE_FIELDS = [
  'name', 'email', 'phone', 'status', 'sales_pipeline_stage',
  'address', 'apt_gate_code', 'payment_mode', 'household_size', 'occupation',
  'primary_goal', 'biggest_hurdle', 'protein_preference', 'dietary_preference',
  'foods_to_avoid', 'notes', 'dietary_restrictions',
  'engagement_score', 'conversion_probability',
];

// GET /api/admin/customers - Get all customers with pipeline data.
// weeks_active, total_meals_ordered, last_order_date, lifetime_value_cents,
// and days_since_last_contact are all computed live from real order history
// -- not stored columns -- so they're never stale.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        c.id, c.name, c.email, c.phone, c.status, c.sales_pipeline_stage,
        c.address, c.apt_gate_code, c.payment_mode, c.household_size, c.occupation,
        c.primary_goal, c.biggest_hurdle, c.protein_preference, c.dietary_preference,
        c.foods_to_avoid, c.notes, c.dietary_restrictions,
        c.engagement_score, c.conversion_probability,
        c.created_at, c.updated_at,
        COALESCE(COUNT(DISTINCT date_trunc('week', o.created_at)), 0) AS weeks_active,
        COALESCE(SUM(o.quantity), 0) AS total_meals_ordered,
        MAX(o.created_at) AS last_order_date,
        COALESCE(SUM(o.total_price), 0) * 100 AS lifetime_value_cents,
        GREATEST(MAX(o.created_at), ca.last_activity_at) AS last_contact_at,
        CASE WHEN GREATEST(MAX(o.created_at), ca.last_activity_at) IS NOT NULL
          THEN EXTRACT(DAY FROM NOW() - GREATEST(MAX(o.created_at), ca.last_activity_at))::int
          ELSE NULL
        END AS days_since_last_contact
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT MAX(created_at) AS last_activity_at
        FROM customer_activities
        WHERE customer_id = c.id
      ) ca ON true
      GROUP BY c.id, ca.last_activity_at
      ORDER BY
        CASE WHEN c.sales_pipeline_stage = 'active' THEN 0 ELSE 1 END,
        total_meals_ordered DESC
    `);

    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// POST /api/admin/customers - Create a new customer
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const columns = ['name'];
    const placeholders = ['$1'];
    const values = [name];
    let paramCount = 2;

    for (const field of PROFILE_FIELDS) {
      if (field === 'name') continue;
      if (req.body[field] !== undefined) {
        columns.push(field);
        placeholders.push(`$${paramCount}`);
        values.push(req.body[field]);
        paramCount++;
      }
    }

    const result = await db.query(
      `INSERT INTO customers (${columns.join(', ')}, created_at, updated_at)
       VALUES (${placeholders.join(', ')}, NOW(), NOW())
       RETURNING *`,
      values
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// POST /api/admin/customers/recompute-pipeline - Recompute pipeline stage,
// conversion probability, and engagement score for every customer based on
// real order history (replaces the old /import-from-orders, which relied
// on a table that never existed).
//
// "Active" is a claim about the present ("are they currently ordering"),
// not a lifetime achievement -- so unlike the rest of the funnel, it has to
// be re-evaluated every run in both directions: a customer with a recent
// order should be (re)marked active even if they'd drifted to churned/
// prospect earlier, and a customer marked active who's gone quiet needs to
// actually lose that label, not keep it forever just because they crossed
// a lifetime meal-count threshold once. Delivery is 2x/week (Mon/Thu), so
// 14 days covers about two missed cycles before calling it at-risk, and 30
// days of silence before calling it churned.
//
// A manually-set 'engaged' or 'trial' stage (via Edit Profile) is a human
// judgment call this endpoint won't second-guess -- unless a real recent
// order contradicts it, in which case the order wins and they become
// active. Every other stage (prospect/active/at_risk/churned) is fair game
// to move automatically based on order recency in either direction.
router.post('/recompute-pipeline', requireAuth, requireRole('admin'), async (req, res) => {
  const ACTIVE_WITHIN_DAYS = 14;
  const AT_RISK_WITHIN_DAYS = 30;

  try {
    const customersResult = await db.query(`
      SELECT c.id, c.name, c.sales_pipeline_stage,
        COALESCE(SUM(o.quantity), 0) AS total_meals_ordered,
        MAX(o.created_at) AS last_order_date,
        CASE WHEN MAX(o.created_at) IS NOT NULL
          THEN EXTRACT(DAY FROM NOW() - MAX(o.created_at))::int
          ELSE NULL
        END AS days_since_order
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      GROUP BY c.id
    `);

    // Stages this endpoint is allowed to move a customer into/out of based
    // on order recency. 'prospect' is included because that's the default
    // every new customer starts at (including ones auto-created by the
    // order sync) -- it's not a protected human judgment call the way
    // 'engaged'/'trial' are, so a prospect who's actually ordering should
    // graduate out of it automatically rather than staying stuck there.
    const AUTO_MANAGED_STAGES = new Set(['prospect', 'active', 'at_risk', 'churned']);

    let updatedCount = 0;
    const updates = [];

    for (const customer of customersResult.rows) {
      const totalMeals = Number(customer.total_meals_ordered) || 0;
      const daysSinceOrder = customer.days_since_order;
      const currentStage = customer.sales_pipeline_stage;
      const recentOrder = daysSinceOrder != null && daysSinceOrder <= ACTIVE_WITHIN_DAYS;

      // Manually-set funnel stages (engaged/trial) are a human's judgment
      // call and stay untouched here unless a real recent order contradicts
      // them -- an actual order is stronger evidence than a funnel guess
      // made before it happened.
      if (!AUTO_MANAGED_STAGES.has(currentStage) && !recentOrder) continue;

      let newStage;
      if (recentOrder) newStage = 'active';
      else if (daysSinceOrder == null) newStage = 'prospect'; // never ordered
      else newStage = daysSinceOrder <= AT_RISK_WITHIN_DAYS ? 'at_risk' : 'churned';

      // No real change to make -- leave conversion/engagement untouched.
      if (newStage === currentStage) continue;

      const conversionProb = newStage === 'active' ? 100 : newStage === 'at_risk' ? 40 : newStage === 'prospect' ? 30 : 5;
      const engagementScore = newStage === 'active' ? 95 : newStage === 'at_risk' ? 30 : newStage === 'prospect' ? 20 : 10;

      await db.query(
        `UPDATE customers SET sales_pipeline_stage = $1, conversion_probability = $2, engagement_score = $3, updated_at = NOW() WHERE id = $4`,
        [newStage, conversionProb, engagementScore, customer.id]
      );

      updatedCount++;
      updates.push({ name: customer.name, meals: totalMeals, from_stage: currentStage, to_stage: newStage, days_since_order: daysSinceOrder });
    }

    res.json({ success: true, updated: updatedCount, updates });
  } catch (error) {
    console.error('Error recomputing pipeline:', error);
    res.status(500).json({ error: 'Failed to recompute pipeline' });
  }
});

// PUT /api/admin/customers/:id - Update any combination of profile fields
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the current stage first so we can tell whether this update is
    // actually a stage change worth logging.
    let previousStage = null;
    if (req.body.sales_pipeline_stage !== undefined) {
      const current = await db.query('SELECT sales_pipeline_stage FROM customers WHERE id = $1', [id]);
      previousStage = current.rows[0]?.sales_pipeline_stage ?? null;
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    for (const field of PROFILE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(req.body[field]);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);
    const query = `UPDATE customers SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const newStage = req.body.sales_pipeline_stage;
    if (newStage !== undefined && newStage !== previousStage) {
      await db.query(
        `INSERT INTO customer_activities (customer_id, type, status, metadata, created_by_user_id)
         VALUES ($1, 'stage_change', 'logged', $2, $3)`,
        [id, JSON.stringify({ from_stage: previousStage, to_stage: newStage }), req.userId]
      );

      // Auto-enroll into any automation whose trigger is "enters this stage"
      await checkStageTrigger(id, newStage);
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// DELETE /api/admin/customers/:id - Delete a customer
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM customers WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ success: true, message: 'Customer deleted' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

module.exports = router;
