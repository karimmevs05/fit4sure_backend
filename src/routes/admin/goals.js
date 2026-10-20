const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');

const STATUSES = ['not_started', 'in_progress', 'done'];

function withSteps(goals, steps) {
  const stepsByGoal = {};
  for (const s of steps) {
    (stepsByGoal[s.goal_id] = stepsByGoal[s.goal_id] || []).push(s);
  }
  return goals.map((g) => {
    const goalSteps = stepsByGoal[g.id] || [];
    const stepsDone = goalSteps.filter((s) => s.done).length;
    return {
      ...g,
      steps: goalSteps,
      stepsTotal: goalSteps.length,
      stepsDone,
      progressPct: goalSteps.length > 0 ? Math.round((stepsDone / goalSteps.length) * 100) : 0,
    };
  });
}

// Every goal with its steps nested, for the Timeline page's launch
// timeline -- progress is always derived live from step completion here,
// never stored on the goal itself, so a newly added/checked step is
// reflected on the very next load.
router.get('/', requireAuth, async (req, res) => {
  try {
    const goalsResult = await db.query(
      `SELECT id, name, target_date, main_focus, status, sort_order, created_at, updated_at
       FROM goals ORDER BY sort_order, id`
    );
    const stepsResult = await db.query(
      `SELECT id, goal_id, text, done, sort_order FROM goal_steps ORDER BY goal_id, sort_order, id`
    );
    res.json({ data: withSteps(goalsResult.rows, stepsResult.rows) });
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// Creates a goal and (optionally) its initial steps in one call --
// { name, target_date?, main_focus?, steps?: [{ text, done? }] }.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, target_date, main_focus, steps } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (steps !== undefined && !Array.isArray(steps)) {
      return res.status(400).json({ error: 'steps must be an array' });
    }

    const sortResult = await db.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM goals');
    const goalResult = await db.query(
      `INSERT INTO goals (name, target_date, main_focus, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
      [name.trim(), target_date || null, main_focus || null, sortResult.rows[0].next]
    );
    const goal = goalResult.rows[0];

    const createdSteps = [];
    if (Array.isArray(steps)) {
      let i = 0;
      for (const step of steps) {
        const text = (step.text || '').trim();
        if (!text) continue;
        const stepResult = await db.query(
          `INSERT INTO goal_steps (goal_id, text, done, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
          [goal.id, text, !!step.done, i++]
        );
        createdSteps.push(stepResult.rows[0]);
      }
    }

    res.status(201).json({ data: withSteps([goal], createdSteps)[0] });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// Updates a goal's own fields -- name/date/focus, or status (the "mark
// goal complete" action marking it 'done' outright, independent of
// whether every step is checked off, same as launch_phases' status).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, target_date, main_focus, status } = req.body;
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    const sets = [];
    const values = [];
    let n = 1;
    if (name !== undefined) { sets.push(`name = $${n++}`); values.push(name); }
    if (target_date !== undefined) { sets.push(`target_date = $${n++}`); values.push(target_date); }
    if (main_focus !== undefined) { sets.push(`main_focus = $${n++}`); values.push(main_focus); }
    if (status !== undefined) { sets.push(`status = $${n++}`); values.push(status); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    values.push(req.params.id);

    const result = await db.query(`UPDATE goals SET ${sets.join(', ')} WHERE id = $${n} RETURNING *`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Goal not found' });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM goals WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Goal not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// Adds one actionable step to an existing goal.
router.post('/:id/steps', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });
    const sortResult = await db.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM goal_steps WHERE goal_id = $1',
      [req.params.id]
    );
    const result = await db.query(
      `INSERT INTO goal_steps (goal_id, text, done, sort_order, created_at, updated_at)
       VALUES ($1, $2, false, $3, NOW(), NOW()) RETURNING *`,
      [req.params.id, text.trim(), sortResult.rows[0].next]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if (error.code === '23503') return res.status(404).json({ error: 'Goal not found' });
    console.error('Error adding step:', error);
    res.status(500).json({ error: 'Failed to add step' });
  }
});

// Toggles or edits one step -- this is what a goal's progressPct is
// derived from on every GET, so checking a step off here immediately
// moves the goal's progress bar on next load.
router.patch('/steps/:stepId', requireAuth, async (req, res) => {
  try {
    const { text, done } = req.body;
    const sets = [];
    const values = [];
    let n = 1;
    if (text !== undefined) { sets.push(`text = $${n++}`); values.push(text); }
    if (done !== undefined) { sets.push(`done = $${n++}`); values.push(!!done); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    values.push(req.params.stepId);

    const result = await db.query(`UPDATE goal_steps SET ${sets.join(', ')} WHERE id = $${n} RETURNING *`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Step not found' });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error updating step:', error);
    res.status(500).json({ error: 'Failed to update step' });
  }
});

router.delete('/steps/:stepId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM goal_steps WHERE id = $1 RETURNING id', [req.params.stepId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Step not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting step:', error);
    res.status(500).json({ error: 'Failed to delete step' });
  }
});

module.exports = router;
