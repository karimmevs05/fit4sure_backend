const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

// ============================================================================
// HOUSEHOLDS -- consolidates family/roommate customers so they read as one
// unit: shared delivery address (the primary contact's customer_addresses,
// see resolveAddressOwner in adminCustomers.js), combined order history/LTV
// for reporting, and one designated primary contact who's actually billed/
// contacted. Each member is still a real, independent customer row with
// their own orders, dietary profile, and pipeline stage -- a household is a
// grouping layer on top, not a merge.
// ============================================================================

async function fetchHousehold(id) {
  const householdResult = await db.query(`SELECT * FROM households WHERE id = $1`, [id]);
  if (householdResult.rows.length === 0) return null;
  const household = householdResult.rows[0];

  const membersResult = await db.query(
    `SELECT c.id, c.name, c.email, c.phone, c.sales_pipeline_stage,
            COALESCE(SUM(o.quantity), 0) AS total_meals_ordered,
            COALESCE(SUM(o.total_price), 0) * 100 AS lifetime_value_cents,
            (c.id = $2) AS is_primary
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
     WHERE c.household_id = $1
     GROUP BY c.id
     ORDER BY is_primary DESC, c.name`,
    [id, household.primary_customer_id]
  );

  const combined = membersResult.rows.reduce(
    (acc, m) => ({
      total_meals_ordered: acc.total_meals_ordered + Number(m.total_meals_ordered),
      lifetime_value_cents: acc.lifetime_value_cents + Number(m.lifetime_value_cents),
    }),
    { total_meals_ordered: 0, lifetime_value_cents: 0 }
  );

  return { ...household, members: membersResult.rows, combined };
}

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const ids = await db.query(`SELECT id FROM households ORDER BY name`);
    const data = await Promise.all(ids.rows.map((r) => fetchHousehold(r.id)));
    res.json({ data });
  } catch (error) {
    console.error('Error fetching households:', error);
    res.status(500).json({ error: 'Failed to fetch households' });
  }
});

router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const household = await fetchHousehold(req.params.id);
    if (!household) return res.status(404).json({ error: 'Household not found' });
    res.json({ data: household });
  } catch (error) {
    console.error('Error fetching household:', error);
    res.status(500).json({ error: 'Failed to fetch household' });
  }
});

// Body: { name, primary_customer_id, member_customer_ids: number[] } --
// primary_customer_id must be included in member_customer_ids. Every
// non-primary member's own address rows are cleared (they now share the
// primary's), and everyone's customers.address is synced to the primary's
// current primary address in one pass.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, primary_customer_id, member_customer_ids } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!primary_customer_id) return res.status(400).json({ error: 'primary_customer_id is required' });
    const memberIds = Array.from(new Set([...(member_customer_ids || []), primary_customer_id]));

    const alreadyInHousehold = await db.query(
      `SELECT id, name, household_id FROM customers WHERE id = ANY($1::int[]) AND household_id IS NOT NULL`,
      [memberIds]
    );
    if (alreadyInHousehold.rows.length > 0) {
      return res.status(400).json({
        error: `Already in another household: ${alreadyInHousehold.rows.map((c) => c.name).join(', ')}`,
      });
    }

    const householdResult = await db.query(
      `INSERT INTO households (name, primary_customer_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), primary_customer_id]
    );
    const household = householdResult.rows[0];

    await db.query(`UPDATE customers SET household_id = $1, updated_at = NOW() WHERE id = ANY($2::int[])`, [household.id, memberIds]);

    // Non-primary members' own address rows are no longer the source of
    // truth -- drop them so nothing stale lingers, then fan the primary's
    // real address out to the whole household in one call.
    const nonPrimaryIds = memberIds.filter((id) => id !== primary_customer_id);
    if (nonPrimaryIds.length > 0) {
      await db.query(`DELETE FROM customer_addresses WHERE customer_id = ANY($1::int[])`, [nonPrimaryIds]);
    }
    const primaryAddr = await db.query(`SELECT address, apt_gate_code FROM customer_addresses WHERE customer_id = $1 AND is_primary`, [primary_customer_id]);
    const addr = primaryAddr.rows[0] || { address: null, apt_gate_code: null };
    await db.query(`UPDATE customers SET address = $1, apt_gate_code = $2, updated_at = NOW() WHERE household_id = $3`, [addr.address, addr.apt_gate_code, household.id]);

    res.status(201).json({ data: await fetchHousehold(household.id) });
  } catch (error) {
    console.error('Error creating household:', error);
    res.status(500).json({ error: 'Failed to create household' });
  }
});

// Rename and/or reassign the primary contact. Changing primary moves the
// actual customer_addresses rows to the new primary's customer_id (so the
// real address history travels with the "primary contact" role, not a
// specific person) and re-syncs everyone.
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, primary_customer_id } = req.body;

    const current = await db.query(`SELECT * FROM households WHERE id = $1`, [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Household not found' });

    if (primary_customer_id !== undefined && primary_customer_id !== current.rows[0].primary_customer_id) {
      const member = await db.query(`SELECT id FROM customers WHERE id = $1 AND household_id = $2`, [primary_customer_id, id]);
      if (member.rows.length === 0) return res.status(400).json({ error: 'primary_customer_id must be an existing member of this household' });

      const oldPrimaryId = current.rows[0].primary_customer_id;
      if (oldPrimaryId) {
        await db.query(`UPDATE customer_addresses SET customer_id = $1 WHERE customer_id = $2`, [primary_customer_id, oldPrimaryId]);
      }
      await db.query(`UPDATE households SET primary_customer_id = $1, updated_at = NOW() WHERE id = $2`, [primary_customer_id, id]);

      const primaryAddr = await db.query(`SELECT address, apt_gate_code FROM customer_addresses WHERE customer_id = $1 AND is_primary`, [primary_customer_id]);
      const addr = primaryAddr.rows[0] || { address: null, apt_gate_code: null };
      await db.query(`UPDATE customers SET address = $1, apt_gate_code = $2, updated_at = NOW() WHERE household_id = $3`, [addr.address, addr.apt_gate_code, id]);
    }

    if (name !== undefined && name.trim()) {
      await db.query(`UPDATE households SET name = $1, updated_at = NOW() WHERE id = $2`, [name.trim(), id]);
    }

    res.json({ data: await fetchHousehold(id) });
  } catch (error) {
    console.error('Error updating household:', error);
    res.status(500).json({ error: 'Failed to update household' });
  }
});

// Dissolve the household entirely -- every member goes back to being an
// independent customer. Non-primary members get their own copy of the
// household's current address (a real customer_addresses row, not just the
// customers.address mirror) so nobody ends up with an address shown on
// their profile that doesn't actually exist as an editable row anymore.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const household = await db.query(`SELECT * FROM households WHERE id = $1`, [id]);
    if (household.rows.length === 0) return res.status(404).json({ error: 'Household not found' });

    const members = await db.query(`SELECT id, address, apt_gate_code FROM customers WHERE household_id = $1`, [id]);
    for (const m of members.rows) {
      if (m.id === household.rows[0].primary_customer_id) continue;
      if (m.address) {
        await db.query(
          `INSERT INTO customer_addresses (customer_id, address, apt_gate_code, is_primary) VALUES ($1, $2, $3, true)`,
          [m.id, m.address, m.apt_gate_code]
        );
      }
    }

    await db.query(`UPDATE customers SET household_id = NULL, updated_at = NOW() WHERE household_id = $1`, [id]);
    await db.query(`DELETE FROM households WHERE id = $1`, [id]);

    res.json({ success: true, message: 'Household dissolved' });
  } catch (error) {
    console.error('Error dissolving household:', error);
    res.status(500).json({ error: 'Failed to dissolve household' });
  }
});

// Add one customer to an existing household -- same address-sharing setup
// as household creation (drop their own address rows, adopt the primary's).
router.post('/:id/members', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });

    const household = await db.query(`SELECT * FROM households WHERE id = $1`, [id]);
    if (household.rows.length === 0) return res.status(404).json({ error: 'Household not found' });

    const target = await db.query(`SELECT id, name, household_id FROM customers WHERE id = $1`, [customer_id]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    if (target.rows[0].household_id) return res.status(400).json({ error: `${target.rows[0].name} is already in a household` });

    await db.query(`UPDATE customers SET household_id = $1, updated_at = NOW() WHERE id = $2`, [id, customer_id]);
    await db.query(`DELETE FROM customer_addresses WHERE customer_id = $1`, [customer_id]);

    const primaryAddr = await db.query(
      `SELECT address, apt_gate_code FROM customer_addresses WHERE customer_id = $1 AND is_primary`,
      [household.rows[0].primary_customer_id]
    );
    const addr = primaryAddr.rows[0] || { address: null, apt_gate_code: null };
    await db.query(`UPDATE customers SET address = $1, apt_gate_code = $2, updated_at = NOW() WHERE id = $3`, [addr.address, addr.apt_gate_code, customer_id]);

    res.status(201).json({ data: await fetchHousehold(id) });
  } catch (error) {
    console.error('Error adding household member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove one member -- the primary contact can't be removed this way (a
// household always needs a primary); reassign primary first via PUT, or
// dissolve the whole household with DELETE /:id. The departing member keeps
// a real address of their own (whatever the shared one currently reads),
// same reasoning as dissolving the whole household.
router.delete('/:id/members/:customerId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id, customerId } = req.params;
    const household = await db.query(`SELECT * FROM households WHERE id = $1`, [id]);
    if (household.rows.length === 0) return res.status(404).json({ error: 'Household not found' });

    if (Number(customerId) === household.rows[0].primary_customer_id) {
      return res.status(400).json({ error: 'Reassign the primary contact before removing them, or dissolve the household instead' });
    }

    const member = await db.query(`SELECT address, apt_gate_code FROM customers WHERE id = $1 AND household_id = $2`, [customerId, id]);
    if (member.rows.length === 0) return res.status(404).json({ error: 'Not a member of this household' });

    await db.query(`UPDATE customers SET household_id = NULL, updated_at = NOW() WHERE id = $1`, [customerId]);
    if (member.rows[0].address) {
      await db.query(
        `INSERT INTO customer_addresses (customer_id, address, apt_gate_code, is_primary) VALUES ($1, $2, $3, true)`,
        [customerId, member.rows[0].address, member.rows[0].apt_gate_code]
      );
    }

    res.json({ data: await fetchHousehold(id) });
  } catch (error) {
    console.error('Error removing household member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
