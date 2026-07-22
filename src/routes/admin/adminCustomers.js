const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

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
        CASE WHEN MAX(o.created_at) IS NOT NULL
          THEN EXTRACT(DAY FROM NOW() - MAX(o.created_at))::int
          ELSE NULL
        END AS days_since_last_contact
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      GROUP BY c.id
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
router.post('/recompute-pipeline', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const customersResult = await db.query(`
      SELECT c.id, c.name, c.sales_pipeline_stage,
        COALESCE(SUM(o.quantity), 0) AS total_meals_ordered,
        MAX(o.created_at) AS last_order_date
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      GROUP BY c.id
    `);

    let updatedCount = 0;
    const updates = [];

    for (const customer of customersResult.rows) {
      const totalMeals = Number(customer.total_meals_ordered) || 0;

      // Don't override an already-set terminal stage (active/churned) from
      // the historical migration -- only recompute for stages that are
      // meant to move through the funnel based on activity.
      if (['active', 'churned'].includes(customer.sales_pipeline_stage)) continue;

      let stage = 'prospect';
      let conversionProb = 30;
      let engagementScore = 0;

      if (totalMeals > 150) {
        stage = 'active'; conversionProb = 100; engagementScore = 95;
      } else if (totalMeals > 80) {
        stage = 'trial'; conversionProb = 80; engagementScore = 70;
      } else if (totalMeals > 40) {
        stage = 'engaged'; conversionProb = 65; engagementScore = 55;
      } else if (totalMeals > 0) {
        stage = 'engaged'; conversionProb = 50; engagementScore = 40;
      }

      await db.query(
        `UPDATE customers SET sales_pipeline_stage = $1, conversion_probability = $2, engagement_score = $3, updated_at = NOW() WHERE id = $4`,
        [stage, conversionProb, engagementScore, customer.id]
      );

      updatedCount++;
      updates.push({ name: customer.name, meals: totalMeals, stage, conversion: conversionProb });
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
