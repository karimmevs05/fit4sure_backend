// Real Win Probability scoring -- replaces the old flat per-stage constants
// (active->100, at_risk->40, prospect->30, churned->5) with a weighted
// computation from four live signals. Shared between the GET /customers
// route (live, computed on every read so the score never disagrees with its
// own breakdown) and POST /recompute-pipeline (which snapshots it into
// conversion_probability_prev/conversion_probability so the cron's
// win-probability-drop check has a real baseline to diff against).
//
// Honest caveat: these weights are a reasonable starting point, not
// calibrated against real close/loss outcomes yet. Revisit once there's a
// few months of real data to check them against -- same caveat that applies
// to the Financials anomaly detection.

const STAGE_TYPICAL_DAYS = {
  prospect: 14,
  engaged: 10,
  trial: 7,
  active: 30,
  at_risk: 14,
  churned: 30,
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// customer: { sales_pipeline_stage, days_in_current_stage, days_since_last_contact,
//             primary_goal, protein_preference, dietary_preference, biggest_hurdle }
function computeWinProbability(customer, stageTypicalDays = STAGE_TYPICAL_DAYS) {
  // Stage momentum: how fast they moved into this stage vs. the typical
  // pace for it. Faster than typical = positive, slower = negative.
  const daysInStage = customer.days_in_current_stage ?? 0
  const typical = stageTypicalDays[customer.sales_pipeline_stage] ?? 14
  const momentum = clamp(30 - (daysInStage / typical) * 30, -10, 30)

  // Engagement recency: decays the longer since last contact.
  const daysQuiet = customer.days_since_last_contact ?? 999
  const recency = clamp(30 - daysQuiet * 2, -30, 30)

  // Profile completeness: dietary prefs + goal + hurdle filled in.
  const fields = [customer.primary_goal, customer.protein_preference, customer.dietary_preference]
  const completeness = fields.filter(Boolean).length * 6 // up to 18

  // Objection logged: having a NAMED objection is worth more than having
  // none logged at all -- an unlogged objection is the bigger unknown.
  const objection = customer.biggest_hurdle ? 18 : 0

  const total = 50 + momentum + recency + completeness + objection // baseline 50
  return {
    score: clamp(Math.round(total), 0, 100),
    momentum: Math.round(momentum),
    recency: Math.round(recency),
    completeness,
    objection,
  }
}

function daysBetween(from, to = new Date()) {
  if (!from) return null
  return Math.floor((to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24))
}

module.exports = { computeWinProbability, daysBetween, STAGE_TYPICAL_DAYS, clamp }
