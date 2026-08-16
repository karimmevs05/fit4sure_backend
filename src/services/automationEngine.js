// Core automation logic. Three entry points:
//   - enrollCustomers(ruleId, customerIds, source) -- put customers into a
//     rule, starting at step 1. Used both by manual "trigger this sequence
//     on this list" and by automatic trigger checks below.
//   - runDueSteps() -- the scheduler tick. Finds every enrollment whose
//     next_run_at has passed, executes that step (send message or create a
//     task), advances to the next step or marks the enrollment complete.
//   - checkTimeTriggers() / checkStageTrigger(customerId, newStage) -- find
//     customers who should be auto-enrolled based on a rule's trigger.
//
// The human-task side writes to `crm_tasks`, not `tasks` -- the real,
// already-live Operations Hub owns the `tasks` table (owner_id, priority,
// status, due_date, ...), which is a completely different schema.

const db = require('../config/db')
const { sendEmail, sendSms, mergeTags } = require('./communicationService')

async function enrollCustomers(ruleId, customerIds, source) {
  const stepsResult = await db.query(
    'SELECT delay_days FROM automation_steps WHERE rule_id = $1 ORDER BY step_order LIMIT 1',
    [ruleId]
  )
  const firstDelay = stepsResult.rows[0]?.delay_days ?? 0
  const nextRunAt = new Date(Date.now() + firstDelay * 24 * 60 * 60 * 1000)

  let enrolled = 0
  for (const customerId of customerIds) {
    try {
      await db.query(
        `INSERT INTO automation_enrollments (rule_id, customer_id, current_step, status, source, next_run_at)
         VALUES ($1, $2, 0, 'active', $3, $4)
         ON CONFLICT (rule_id, customer_id) DO NOTHING`,
        [ruleId, customerId, source, nextRunAt]
      )
      enrolled++
    } catch (err) {
      console.error(`Error enrolling customer ${customerId} in rule ${ruleId}:`, err)
    }
  }
  return enrolled
}

async function executeStep(enrollment, step, customer) {
  if (step.action_type === 'create_task') {
    await db.query(
      `INSERT INTO crm_tasks (customer_id, title, description, due_at, source_automation_rule_id)
       VALUES ($1, $2, $3, NOW(), $4)`,
      [customer.id, mergeTags(step.task_title, customer), mergeTags(step.task_description, customer), enrollment.rule_id]
    )
    return
  }

  // send_email / send_sms -- pull the linked template, send, log to customer_activities exactly like a manual send
  const templateResult = await db.query('SELECT * FROM communication_templates WHERE id = $1', [step.template_id])
  const template = templateResult.rows[0]
  if (!template) return

  const body = mergeTags(template.body, customer)
  const subject = mergeTags(template.subject, customer)
  let status = 'logged'
  let metadata = null

  if (step.action_type === 'send_email' && customer.email) {
    const result = await sendEmail({ to: customer.email, subject: subject || '(no subject)', body })
    status = result.success ? 'sent' : 'failed'
    if (!result.success) metadata = { error: result.error }
  } else if (step.action_type === 'send_sms' && customer.phone) {
    const result = await sendSms({ to: customer.phone, body })
    status = result.success ? 'sent' : 'failed'
    if (!result.success) metadata = { error: result.error }
  } else {
    status = 'failed'
    metadata = { error: `Customer has no ${step.action_type === 'send_email' ? 'email' : 'phone'} on file` }
  }

  await db.query(
    `INSERT INTO customer_activities (customer_id, type, direction, subject, body, status, metadata)
     VALUES ($1, $2, 'outbound', $3, $4, $5, $6)`,
    [customer.id, step.action_type === 'send_email' ? 'email' : 'sms', subject || null, body, status, metadata]
  )
}

async function runDueSteps() {
  const dueResult = await db.query(
    `SELECT ae.*, c.id AS c_id, c.name AS c_name, c.email AS c_email, c.phone AS c_phone
     FROM automation_enrollments ae
     JOIN customers c ON c.id = ae.customer_id
     WHERE ae.status = 'active' AND ae.next_run_at <= NOW()`
  )

  let executed = 0
  for (const row of dueResult.rows) {
    const stepsResult = await db.query(
      'SELECT * FROM automation_steps WHERE rule_id = $1 ORDER BY step_order',
      [row.rule_id]
    )
    const steps = stepsResult.rows
    const stepToRun = steps[row.current_step] // current_step is 0-indexed position of the NEXT step to run
    if (!stepToRun) {
      await db.query(`UPDATE automation_enrollments SET status = 'completed' WHERE id = $1`, [row.id])
      continue
    }

    const customer = { id: row.c_id, name: row.c_name, email: row.c_email, phone: row.c_phone }
    try {
      await executeStep(row, stepToRun, customer)
      executed++
    } catch (err) {
      console.error(`Error executing automation step for enrollment ${row.id}:`, err)
    }

    const nextStep = steps[row.current_step + 1]
    if (nextStep) {
      const nextRunAt = new Date(Date.now() + nextStep.delay_days * 24 * 60 * 60 * 1000)
      await db.query(
        `UPDATE automation_enrollments SET current_step = current_step + 1, next_run_at = $1 WHERE id = $2`,
        [nextRunAt, row.id]
      )
    } else {
      await db.query(
        `UPDATE automation_enrollments SET current_step = current_step + 1, status = 'completed' WHERE id = $1`,
        [row.id]
      )
    }
  }
  return executed
}

// Time-based triggers: e.g. "no order in 14 days". Scans active rules of
// this type and enrolls any matching customer not already actively
// enrolled in that specific rule (so it only fires once per customer per
// rule until they complete or get cancelled and re-qualify).
async function checkTimeTriggers() {
  const rulesResult = await db.query(
    `SELECT * FROM automation_rules WHERE trigger_type = 'time_since_last_order' AND is_active = true`
  )

  let totalEnrolled = 0
  for (const rule of rulesResult.rows) {
    const days = rule.trigger_config?.days
    if (!days) continue

    const candidatesResult = await db.query(
      `SELECT c.id
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
       LEFT JOIN automation_enrollments ae ON ae.customer_id = c.id AND ae.rule_id = $1 AND ae.status = 'active'
       WHERE ae.id IS NULL
       GROUP BY c.id
       HAVING MAX(o.created_at) IS NOT NULL
          AND EXTRACT(DAY FROM NOW() - MAX(o.created_at)) >= $2`,
      [rule.id, days]
    )
    const ids = candidatesResult.rows.map((r) => r.id)
    if (ids.length > 0) totalEnrolled += await enrollCustomers(rule.id, ids, 'trigger')
  }
  return totalEnrolled
}

// Stage-based trigger: called from adminCustomers.js right after a
// customer's sales_pipeline_stage actually changes.
async function checkStageTrigger(customerId, newStage) {
  const rulesResult = await db.query(
    `SELECT * FROM automation_rules
     WHERE trigger_type = 'stage_enter' AND is_active = true AND trigger_config->>'stage' = $1`,
    [newStage]
  )
  for (const rule of rulesResult.rows) {
    await enrollCustomers(rule.id, [customerId], 'trigger')
  }
}

module.exports = { enrollCustomers, runDueSteps, checkTimeTriggers, checkStageTrigger }
