const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

// GET /api/admin/customers - Get all customers with pipeline data
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        c.id, c.name, c.notes, c.dietary_restrictions, c.created_at,
        COALESCE(COUNT(DISTINCT o.id), 0) as weeks_active,
        COALESCE(SUM(o.quantity), 0) as total_meals_ordered,
        MAX(m.created_at) as last_order_date,
        c.lifetime_value_cents,
        c.sales_pipeline_stage,
        c.conversion_probability,
        c.engagement_score,
        c.days_since_last_contact,
        CASE WHEN c.sales_pipeline_stage = 'active' THEN true ELSE false END as active
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      LEFT JOIN menus m ON o.menu_id = m.id
      GROUP BY c.id, c.name, c.notes, c.dietary_restrictions, c.created_at,
               c.lifetime_value_cents, c.sales_pipeline_stage, c.conversion_probability,
               c.engagement_score, c.days_since_last_contact
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

// POST /api/admin/customers/import-from-orders - Import customers from order history
router.post('/import-from-orders', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Get all unique customers from order_totals
    const customersResult = await db.query(`
      SELECT
        c.id, c.name,
        COUNT(DISTINCT ot.menu_id) as weeks_active,
        SUM(ot.total_meals) as total_meals_ordered,
        MAX(m.created_at) as last_order_date
      FROM customers c
      LEFT JOIN order_totals ot ON c.id = ot.customer_id
      LEFT JOIN menus m ON ot.menu_id = m.id
      WHERE c.name IS NOT NULL AND c.name != ''
      GROUP BY c.id, c.name
      ORDER BY total_meals_ordered DESC NULLS LAST
    `);

    let importedCount = 0;
    const customerUpdates = [];

    for (const customer of customersResult.rows) {
      const totalMeals = customer.total_meals_ordered || 0;
      const weeksActive = customer.weeks_active || 0;
      const ltv = Math.floor((totalMeals * 15) * 100); // ~$15 per meal average

      // Determine pipeline stage and conversion probability
      let stage = 'prospect';
      let conversionProb = 30;
      let engagementScore = 0;

      if (totalMeals > 150) {
        stage = 'active';
        conversionProb = 100;
        engagementScore = 95;
      } else if (totalMeals > 80) {
        stage = 'trial';
        conversionProb = 80;
        engagementScore = 70;
      } else if (totalMeals > 40) {
        stage = 'engaged';
        conversionProb = 65;
        engagementScore = 55;
      } else if (totalMeals > 0) {
        stage = 'engaged';
        conversionProb = 50;
        engagementScore = 40;
      }

      // Update customer with pipeline data
      await db.query(`
        UPDATE customers
        SET
          total_meals_ordered = $1,
          weeks_active = $2,
          last_order_date = $3,
          lifetime_value_cents = $4,
          sales_pipeline_stage = $5,
          conversion_probability = $6,
          engagement_score = $7,
          days_since_last_contact = $8
        WHERE id = $9
      `, [
        totalMeals,
        weeksActive,
        customer.last_order_date,
        ltv,
        stage,
        conversionProb,
        engagementScore,
        Math.floor(Math.random() * 30),
        customer.id
      ]);

      importedCount++;
      customerUpdates.push({
        name: customer.name,
        meals: totalMeals,
        weeks: weeksActive,
        stage: stage,
        conversion: conversionProb
      });
    }

    // Get summary
    const summary = await db.query(`
      SELECT
        sales_pipeline_stage,
        COUNT(*) as count,
        ROUND(AVG(conversion_probability)::numeric, 0) as avg_conversion,
        ROUND(AVG(total_meals_ordered)::numeric, 0) as avg_meals,
        SUM(lifetime_value_cents) as total_ltv
      FROM customers
      WHERE total_meals_ordered > 0
      GROUP BY sales_pipeline_stage
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      imported: importedCount,
      summary: summary.rows,
      topCustomers: customerUpdates.slice(0, 10)
    });
  } catch (error) {
    console.error('Error importing customers:', error);
    res.status(500).json({ error: 'Failed to import customers from orders' });
  }
});

// PUT /api/admin/customers/:id - Update customer pipeline stage
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      sales_pipeline_stage,
      conversion_probability,
      engagement_score,
      days_since_last_contact,
      dietary_restrictions,
      notes
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (sales_pipeline_stage !== undefined) {
      updates.push(`sales_pipeline_stage = $${paramCount}`);
      values.push(sales_pipeline_stage);
      paramCount++;
    }
    if (conversion_probability !== undefined) {
      updates.push(`conversion_probability = $${paramCount}`);
      values.push(conversion_probability);
      paramCount++;
    }
    if (engagement_score !== undefined) {
      updates.push(`engagement_score = $${paramCount}`);
      values.push(engagement_score);
      paramCount++;
    }
    if (days_since_last_contact !== undefined) {
      updates.push(`days_since_last_contact = $${paramCount}`);
      values.push(days_since_last_contact);
      paramCount++;
    }
    if (dietary_restrictions !== undefined) {
      updates.push(`dietary_restrictions = $${paramCount}`);
      values.push(dietary_restrictions);
      paramCount++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount}`);
      values.push(notes);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

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

module.exports = router;
