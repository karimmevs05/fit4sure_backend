// Auto-flagging for the Pipeline Intelligence build: stale deals and
// Win Probability drops each get one open task per customer per reason,
// created automatically on the existing 15-minute cron tick (see
// src/index.js) rather than needing new scheduling infrastructure.
//
// The NOT EXISTS guard on each query matters -- without it, every tick would
// create a duplicate task for the same still-quiet customer. One open task
// per customer per reason at a time; a new one can only be created after the
// existing one is marked done.

const db = require('../config/db')

async function checkStaleDeals() {
  const stale = await db.query(`
    SELECT c.id, c.name, c.sales_pipeline_stage,
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
    WHERE c.sales_pipeline_stage NOT IN ('active', 'churned')
    GROUP BY c.id, ca.last_activity_at
    HAVING CASE WHEN GREATEST(MAX(o.created_at), ca.last_activity_at) IS NOT NULL
        THEN EXTRACT(DAY FROM NOW() - GREATEST(MAX(o.created_at), ca.last_activity_at))::int
        ELSE NULL
      END >= 7
  `)

  let created = 0
  for (const c of stale.rows) {
    const existing = await db.query(
      `SELECT 1 FROM crm_tasks WHERE customer_id = $1 AND system_source = 'stale_flag' AND completed_at IS NULL`,
      [c.id]
    )
    if (existing.rows.length > 0) continue

    await db.query(
      `INSERT INTO crm_tasks (customer_id, title, description, system_source)
       VALUES ($1, $2, $3, 'stale_flag')`,
      [c.id, `Follow up with ${c.name}`, `${c.sales_pipeline_stage} stage — quiet ${c.days_since_last_contact} days`]
    )
    created++
  }
  return created
}

async function checkWinProbabilityDrops() {
  const dropped = await db.query(`
    SELECT id, name, sales_pipeline_stage, conversion_probability, conversion_probability_prev
    FROM customers
    WHERE conversion_probability_prev IS NOT NULL
      AND (conversion_probability_prev - conversion_probability) >= 15
  `)

  let created = 0
  for (const c of dropped.rows) {
    const existing = await db.query(
      `SELECT 1 FROM crm_tasks WHERE customer_id = $1 AND system_source = 'win_probability_drop' AND completed_at IS NULL`,
      [c.id]
    )
    if (existing.rows.length > 0) continue

    const drop = c.conversion_probability_prev - c.conversion_probability
    await db.query(
      `INSERT INTO crm_tasks (customer_id, title, description, system_source)
       VALUES ($1, $2, $3, 'win_probability_drop')`,
      [c.id, `Check in with ${c.name}`, `Win Probability dropped ${drop}pts this week`]
    )
    created++
  }
  return created
}

module.exports = { checkStaleDeals, checkWinProbabilityDrops }
