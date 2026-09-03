const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { checkStageTrigger } = require('../../services/automationEngine');
const { computeWinProbability, daysBetween, clamp } = require('../../services/winProbability');

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
//
// conversion_probability in the response is likewise computed live (via
// computeWinProbability) rather than read straight from the stored column --
// that guarantees the headline score always agrees with its own breakdown
// (momentum/recency/completeness/objection), which a snapshot taken at the
// last recompute-pipeline run couldn't promise if inputs like
// days_since_last_contact have moved since. conversion_probability_prev is
// still the raw stored snapshot, so the frontend's trend arrow is comparing
// live-now against a real historical baseline, not against itself.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        c.id, c.name, c.email, c.phone, c.status, c.sales_pipeline_stage,
        c.address, c.apt_gate_code, c.payment_mode, c.household_size, c.occupation,
        c.primary_goal, c.biggest_hurdle, c.protein_preference, c.dietary_preference,
        c.foods_to_avoid, c.notes, c.dietary_restrictions,
        c.engagement_score, c.conversion_probability_prev,
        c.stage_entered_at,
        c.created_at, c.updated_at,
        COALESCE(COUNT(DISTINCT date_trunc('week', o.created_at)), 0) AS weeks_active,
        COALESCE(SUM(o.quantity), 0) AS total_meals_ordered,
        MAX(o.created_at) AS last_order_date,
        COALESCE(SUM(o.total_price), 0) * 100 AS lifetime_value_cents,
        GREATEST(MAX(o.created_at), ca.last_activity_at) AS last_contact_at,
        CASE WHEN GREATEST(MAX(o.created_at), ca.last_activity_at) IS NOT NULL
          THEN EXTRACT(DAY FROM NOW() - GREATEST(MAX(o.created_at), ca.last_activity_at))::int
          ELSE NULL
        END AS days_since_last_contact,
        COALESCE(addr.address_count, 0) AS address_count
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT MAX(created_at) AS last_activity_at
        FROM customer_activities
        WHERE customer_id = c.id
      ) ca ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS address_count
        FROM customer_addresses
        WHERE customer_id = c.id
      ) addr ON true
      GROUP BY c.id, ca.last_activity_at, addr.address_count
      ORDER BY
        CASE WHEN c.sales_pipeline_stage = 'active' THEN 0 ELSE 1 END,
        total_meals_ordered DESC
    `);

    const data = result.rows.map((c) => {
      const breakdown = computeWinProbability({
        sales_pipeline_stage: c.sales_pipeline_stage,
        days_in_current_stage: daysBetween(c.stage_entered_at) ?? 0,
        days_since_last_contact: c.days_since_last_contact,
        primary_goal: c.primary_goal,
        protein_preference: c.protein_preference,
        dietary_preference: c.dietary_preference,
        biggest_hurdle: c.biggest_hurdle,
      });
      return {
        ...c,
        conversion_probability: breakdown.score,
        win_probability_momentum: breakdown.momentum,
        win_probability_recency: breakdown.recency,
        win_probability_completeness: breakdown.completeness,
        win_probability_objection: breakdown.objection,
      };
    });

    res.json({ data });
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
      SELECT c.id, c.name, c.sales_pipeline_stage, c.primary_goal,
        c.protein_preference, c.dietary_preference, c.biggest_hurdle,
        COALESCE(SUM(o.quantity), 0) AS total_meals_ordered,
        MAX(o.created_at) AS last_order_date,
        CASE WHEN MAX(o.created_at) IS NOT NULL
          THEN EXTRACT(DAY FROM NOW() - MAX(o.created_at))::int
          ELSE NULL
        END AS days_since_order,
        GREATEST(MAX(o.created_at), ca.last_activity_at) AS last_contact_at,
        CASE WHEN GREATEST(MAX(o.created_at), ca.last_activity_at) IS NOT NULL
          THEN EXTRACT(DAY FROM NOW() - GREATEST(MAX(o.created_at), ca.last_activity_at))::int
          ELSE NULL
        END AS days_since_last_contact
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT MAX(created_at) AS last_activity_at
        FROM customer_activities WHERE customer_id = c.id
      ) ca ON true
      GROUP BY c.id, ca.last_activity_at
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

      // This IS a stage transition happening right now, so days_in_current_stage
      // is 0 for the purposes of this score -- momentum becomes meaningful on
      // the next recompute after they've actually sat in the new stage a while.
      const { score, momentum, recency, completeness, objection } = computeWinProbability({
        sales_pipeline_stage: newStage,
        days_in_current_stage: 0,
        days_since_last_contact: customer.days_since_last_contact,
        primary_goal: customer.primary_goal,
        protein_preference: customer.protein_preference,
        dietary_preference: customer.dietary_preference,
        biggest_hurdle: customer.biggest_hurdle,
      });
      // Engagement score isn't part of the Win Probability spec -- kept as a
      // simpler proxy (recency + completeness only, no momentum/objection)
      // until it has its own real definition.
      const engagementScore = clamp(Math.round(50 + recency + completeness), 0, 100);

      await db.query(
        `UPDATE customers SET
           sales_pipeline_stage = $1,
           conversion_probability_prev = conversion_probability,
           conversion_probability = $2,
           conversion_probability_updated_at = NOW(),
           engagement_score = $3,
           stage_entered_at = NOW(),
           updated_at = NOW()
         WHERE id = $4`,
        [newStage, score, engagementScore, customer.id]
      );

      updatedCount++;
      updates.push({ name: customer.name, meals: totalMeals, from_stage: currentStage, to_stage: newStage, days_since_order: daysSinceOrder, win_probability: score });
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

      // Stamped here too, not just in recompute-pipeline's own auto-managed
      // transitions -- this is the far more common path (a rep dragging a
      // card, or the board's stage arrows), and Win Probability's momentum
      // component needs to know how long they've actually been in the
      // stage regardless of which path moved them into it.
      await db.query('UPDATE customers SET stage_entered_at = NOW() WHERE id = $1', [id]);

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

// ----------------------------------------------------------------------------
// DELIVERY ADDRESSES -- a customer can have more than one (e.g. home +
// office); customers.address/apt_gate_code stay a denormalized mirror of
// whichever row here is_primary, since orders.js and orderingService.js's
// auto-fill-on-first-order already read those two columns directly and
// don't need to change. Every write goes through customer_addresses; the
// two columns on customers are never written to directly anywhere else
// from this point on.
// ----------------------------------------------------------------------------

async function syncPrimaryAddressToCustomer(customerId) {
  const primary = await db.query(
    `SELECT address, apt_gate_code FROM customer_addresses WHERE customer_id = $1 AND is_primary`,
    [customerId]
  );
  const row = primary.rows[0] || { address: null, apt_gate_code: null };
  await db.query(
    `UPDATE customers SET address = $1, apt_gate_code = $2, updated_at = NOW() WHERE id = $3`,
    [row.address, row.apt_gate_code, customerId]
  );
}

router.get('/:id/addresses', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_primary DESC, created_at ASC`,
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching customer addresses:', error);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

router.post('/:id/addresses', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { label, address, apt_gate_code, is_primary } = req.body;
    if (!address || !address.trim()) return res.status(400).json({ error: 'address is required' });

    const existingCount = await db.query('SELECT COUNT(*) FROM customer_addresses WHERE customer_id = $1', [id]);
    // The first address for a customer is always primary, whether or not
    // is_primary was explicitly passed -- there's never a legitimate state
    // where a customer has exactly one address and it isn't the primary one.
    const makePrimary = is_primary === true || existingCount.rows[0].count === '0';

    if (makePrimary) {
      await db.query('UPDATE customer_addresses SET is_primary = false WHERE customer_id = $1', [id]);
    }

    const result = await db.query(
      `INSERT INTO customer_addresses (customer_id, label, address, apt_gate_code, is_primary)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, label || null, address.trim(), apt_gate_code || null, makePrimary]
    );

    if (makePrimary) await syncPrimaryAddressToCustomer(id);

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error creating customer address:', error);
    res.status(500).json({ error: 'Failed to create address' });
  }
});

router.put('/:id/addresses/:addressId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id, addressId } = req.params;
    const { label, address, apt_gate_code, is_primary } = req.body;

    const fields = [];
    const values = [];
    let n = 1;
    if (label !== undefined) { fields.push(`label = $${n++}`); values.push(label); }
    if (address !== undefined) { fields.push(`address = $${n++}`); values.push(address); }
    if (apt_gate_code !== undefined) { fields.push(`apt_gate_code = $${n++}`); values.push(apt_gate_code); }
    if (fields.length === 0 && is_primary === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Unset any other primary first -- required so the partial unique index
    // (one primary per customer) never sees two primary rows at once.
    if (is_primary === true) {
      await db.query('UPDATE customer_addresses SET is_primary = false WHERE customer_id = $1', [id]);
      fields.push(`is_primary = true`);
    } else if (is_primary === false) {
      fields.push(`is_primary = false`);
    }

    fields.push(`updated_at = NOW()`);
    values.push(addressId, id);
    const result = await db.query(
      `UPDATE customer_addresses SET ${fields.join(', ')} WHERE id = $${n++} AND customer_id = $${n} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Address not found' });

    if (is_primary === true || address !== undefined || apt_gate_code !== undefined) {
      await syncPrimaryAddressToCustomer(id);
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error updating customer address:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

router.delete('/:id/addresses/:addressId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id, addressId } = req.params;
    const deleted = await db.query(
      `DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2 RETURNING is_primary`,
      [addressId, id]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Address not found' });

    // Deleting the primary leaves nobody in charge -- hand it to whichever
    // address is left standing longest (oldest), same as "the original one
    // on file", so there's always a sane primary unless the customer has
    // zero addresses left.
    if (deleted.rows[0].is_primary) {
      const next = await db.query(
        `SELECT id FROM customer_addresses WHERE customer_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [id]
      );
      if (next.rows.length > 0) {
        await db.query('UPDATE customer_addresses SET is_primary = true WHERE id = $1', [next.rows[0].id]);
      }
      await syncPrimaryAddressToCustomer(id);
    }

    res.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    console.error('Error deleting customer address:', error);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

module.exports = router;
