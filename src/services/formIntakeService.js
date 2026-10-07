// Backend half of the flyer/QR outreach campaign's Google Form intake (see
// fit4sure_flyer_outreach_campaign in project memory, and the design notes
// in migrations/create_form_intakes.sql). Apps Script's onFormSubmit
// trigger POSTs the raw e.namedValues here; this is where that becomes a
// real sales-pipeline lead instead of just a spreadsheet row.
//
// Three different sales treatments, driven by "What brings you here?":
//   - weekly_meal_prep / help_me_choose -> a real inquiry: match-or-create
//     a Prospect, add to the working pipeline, log the intake, and create a
//     follow-up task.
//   - grab_and_go (with phone or email) -> a marketing-interest contact
//     only. Still matched/created so consent is recorded against a real
//     customer row, but explicitly NOT treated as a weekly-plan request --
//     no task, no working-set add.
//   - grab_and_go with no phone/email -> kept for aggregate reporting only;
//     no customer row is ever invented for an anonymous submission.
//
// Critical invariant: this never writes customers.sales_pipeline_stage on
// an existing customer, and the only place a *new* customer's stage gets
// set is findOrCreateCustomerByContact's own INSERT (always 'prospect').
// Neither path goes through PUT /api/admin/customers/:id, so
// automationEngine.checkStageTrigger is never invoked here -- importing a
// form lead must never silently auto-enroll someone in an SMS/email
// sequence meant for a human-reviewed stage change.
const db = require('../config/db');
const { matchCustomerByContact, findOrCreateCustomerByContact } = require('./orderingService');

const BRINGS_YOU_HERE = 'What brings you here?';
const Q = {
  marketingSmsConsent: 'Want deals and new menu drops by text?',
  firstName: 'First name',
  phone: 'Mobile number',
  email: 'Email',
  leadSource: 'Where did you hear about us?',
  referralCode: 'Referral or promo code',
  primaryGoal: "What's your main goal right now?",
  biggestHurdle: 'What makes eating well hardest for you right now?',
  mealsPerWeek: 'How many Fit4Sure meals per week?',
  portion: 'Portion size',
  startTiming: 'When would you like to start?',
  allergies: 'Food allergies',
  foodsToAvoid: 'Foods you prefer to avoid',
  dietaryPreference: 'Any eating style we should follow?',
  proteinPreference: 'Proteins you like',
  fulfillment: 'How would you like to get your meals?',
  sourceLocation: 'Which partner location?',
  deliveryZip: 'Delivery ZIP code',
  planSmsConsent: 'OK to text you your recommended plan?',
};

function clean(value) {
  const trimmed = (value || '').trim();
  return trimmed || null;
}

function isYes(value) {
  return /^(yes|y|true)$/i.test((value || '').trim());
}

function classifySubmissionType(bringsYouHere) {
  const v = (bringsYouHere || '').trim().toLowerCase();
  if (v.startsWith('start weekly')) return 'weekly_meal_prep';
  if (v.startsWith('help me choose')) return 'help_me_choose';
  if (v.startsWith('order grab')) return 'grab_and_go';
  return null;
}

// Fetches the customer row, then builds an UPDATE that only touches
// columns currently NULL/empty -- an earlier answer never gets silently
// erased by a later, possibly-partial submission. Returns true if any of
// the submitted answers actually disagree with a non-empty existing value
// (surfaced via needs_review rather than applied).
async function fillBlankProfileFields(customerId, answers) {
  const current = await db.query(
    `SELECT primary_goal, biggest_hurdle, protein_preference, dietary_preference, foods_to_avoid
     FROM customers WHERE id = $1`,
    [customerId]
  );
  const row = current.rows[0];
  if (!row) return false;

  const candidates = {
    primary_goal: answers.primaryGoal,
    biggest_hurdle: answers.biggestHurdle,
    protein_preference: answers.proteinPreference,
    dietary_preference: answers.dietaryPreference,
    foods_to_avoid: answers.foodsToAvoid,
  };

  const sets = [];
  const values = [];
  let n = 1;
  let disagrees = false;

  for (const [field, newValue] of Object.entries(candidates)) {
    if (!newValue) continue;
    const existingValue = row[field];
    if (!existingValue) {
      sets.push(`${field} = $${n++}`);
      values.push(newValue);
    } else if (existingValue.trim().toLowerCase() !== newValue.trim().toLowerCase()) {
      disagrees = true;
    }
  }

  if (sets.length > 0) {
    sets.push('updated_at = NOW()');
    values.push(customerId);
    await db.query(`UPDATE customers SET ${sets.join(', ')} WHERE id = $${n}`, values);
  }

  return disagrees;
}

async function createFollowUpTask(customerId, { name, submissionType, answers, needsReview }) {
  const isUrgent = (answers.startTiming || '').toLowerCase().includes('this week');
  const title = submissionType === 'grab_and_go'
    ? `Returning lead resubmitted the form -- ${name}`
    : `New meal-prep inquiry -- ${name}`;

  const summaryLines = [
    `Source: ${answers.sourceLocation || 'unknown location'}`,
    `Goal: ${answers.primaryGoal || 'not given'}`,
    `Requested plan: ${answers.mealsPerWeek || '?'} meals/week, ${answers.portion || '?'} portion`,
    `Fulfillment: ${answers.fulfillment || 'not given'}${answers.deliveryZip ? ` (ZIP ${answers.deliveryZip})` : ''}`,
    `Start: ${answers.startTiming || 'not given'}`,
    needsReview || answers.allergies ? 'Needs review: ' + [answers.allergies ? 'allergies' : null, needsReview ? 'preferences changed since last submission' : null].filter(Boolean).join(', ') : null,
    'Next action: prepare and review recommendation',
  ].filter(Boolean);

  const result = await db.query(
    `INSERT INTO tasks (title, description, department, priority, status, due_date, source_type, source_id, system_source, is_ops_task)
     VALUES ($1, $2, 'Customer Success', $3, 'not_started', (CURRENT_DATE + INTERVAL '1 day'), 'customer', $4, 'form_intake', false)
     RETURNING id`,
    [title, summaryLines.join('\n'), isUrgent ? 'high' : 'medium', customerId]
  );
  return result.rows[0].id;
}

async function processSubmission({ responseId, namedValues }) {
  if (!responseId) {
    const err = new Error('responseId is required');
    err.status = 400;
    throw err;
  }
  if (!namedValues || typeof namedValues !== 'object') {
    const err = new Error('namedValues is required');
    err.status = 400;
    throw err;
  }

  // Idempotency: Apps Script retrying a failed POST (or a double-fired
  // trigger) must never create a second lead for the same response.
  const existingIntake = await db.query('SELECT * FROM form_intakes WHERE google_response_id = $1', [responseId]);
  if (existingIntake.rows.length > 0) {
    return { intake: existingIntake.rows[0], duplicate: true };
  }

  // Google Forms' namedValues gives every answer as a 1-element array.
  const get = (title) => clean(Array.isArray(namedValues[title]) ? namedValues[title][0] : namedValues[title]);

  const submissionType = classifySubmissionType(get(BRINGS_YOU_HERE));
  if (!submissionType) {
    const err = new Error(`Unrecognized "${BRINGS_YOU_HERE}" answer: ${get(BRINGS_YOU_HERE)}`);
    err.status = 422;
    throw err;
  }

  const name = get(Q.firstName);
  const phone = get(Q.phone);
  const email = get(Q.email);
  const hasContact = Boolean(phone || email);

  const answers = {
    leadSource: get(Q.leadSource),
    referralCode: get(Q.referralCode),
    primaryGoal: get(Q.primaryGoal),
    biggestHurdle: get(Q.biggestHurdle),
    mealsPerWeek: get(Q.mealsPerWeek),
    portion: get(Q.portion),
    startTiming: get(Q.startTiming),
    allergies: get(Q.allergies),
    foodsToAvoid: get(Q.foodsToAvoid),
    dietaryPreference: get(Q.dietaryPreference),
    proteinPreference: get(Q.proteinPreference),
    fulfillment: get(Q.fulfillment),
    sourceLocation: get(Q.sourceLocation),
    deliveryZip: get(Q.deliveryZip),
  };
  const marketingSmsConsent = isYes(get(Q.marketingSmsConsent));
  const planSmsConsent = isYes(get(Q.planSmsConsent));

  let customerId = null;
  let customerAction = 'no_contact';
  let needsReview = Boolean(answers.allergies);

  if (hasContact && name) {
    const existing = await matchCustomerByContact({ name, phone });
    customerAction = existing ? 'matched_existing' : 'created';
    customerId = await findOrCreateCustomerByContact({ name, phone, email, address: null, smsConsent: marketingSmsConsent });

    if (customerAction === 'matched_existing') {
      const disagrees = await fillBlankProfileFields(customerId, answers);
      needsReview = needsReview || disagrees;
    }

    await db.query(
      `INSERT INTO customer_activities (customer_id, type, status, body, metadata)
       VALUES ($1, 'note', 'logged', $2, $3)`,
      [
        customerId,
        `Form intake (${submissionType}) via ${answers.sourceLocation || 'unknown location'}`,
        JSON.stringify({ submission_type: submissionType, ...answers, marketing_sms_consent: marketingSmsConsent, plan_sms_consent: planSmsConsent }),
      ]
    );

    // Only a real inquiry (or a returning lead re-engaging) goes into the
    // active working pipeline and gets a follow-up task -- a grab-and-go
    // text-club signup is a marketing contact, not a weekly-plan request.
    if (submissionType !== 'grab_and_go') {
      await db.query(
        `INSERT INTO pipeline_working_set (customer_id) VALUES ($1) ON CONFLICT (customer_id) DO NOTHING`,
        [customerId]
      );
      await createFollowUpTask(customerId, { name, submissionType, answers, needsReview });
    }
  }

  const intakeResult = await db.query(
    `INSERT INTO form_intakes (
       google_response_id, customer_id, submission_type, source_location, lead_source,
       referral_code, requested_meals_per_week, requested_portion, start_timing,
       fulfillment_method, delivery_zip, allergies_raw, marketing_sms_consent,
       plan_sms_consent, needs_review, customer_action, raw_answers
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      responseId, customerId, submissionType, answers.sourceLocation, answers.leadSource,
      answers.referralCode, answers.mealsPerWeek, answers.portion, answers.startTiming,
      answers.fulfillment, answers.deliveryZip, answers.allergies, marketingSmsConsent,
      planSmsConsent, needsReview, customerAction, JSON.stringify(namedValues),
    ]
  );

  return { intake: intakeResult.rows[0], duplicate: false };
}

module.exports = { processSubmission, classifySubmissionType };
