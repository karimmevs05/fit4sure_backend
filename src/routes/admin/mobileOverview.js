const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');

// Everything the mobile tool's Home tab needs in one call -- real counts
// off the same `tasks`/`expenses` tables Operations Hub and Financials
// already read (no separate mobile-only data), plus the goals list for
// the launch timeline strip. Every owner name is resolved through the
// real `users` table via tasks.owner_id -- the same account identity the
// rest of the app uses, not a separate mobile-only roster. Nothing here
// is cached: every field is a live query, so a task completed or a goal
// edited a moment ago is already reflected on the next load.
router.get('/', requireAuth, async (req, res) => {
  try {
    const [openResult, overdueResult, spentResult, dueWeekResult, recentDoneResult, goalsResult, stepsResult] =
      await Promise.all([
        db.query(`SELECT COUNT(*) FROM tasks WHERE status != 'completed'`),
        db.query(`SELECT COUNT(*) FROM tasks WHERE status != 'completed' AND due_date < CURRENT_DATE`),
        // "Spent" means actually confirmed spend -- approved or reconciled,
        // same as the "paid and justified" rule Financials already applies;
        // a still-pending expense isn't money spent yet.
        db.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
           WHERE status IN ('approved', 'reconciled') AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)`
        ),
        db.query(
          `SELECT t.id, t.title, t.due_date, t.status, u.display_name AS owner_name
           FROM tasks t LEFT JOIN users u ON u.user_id = t.owner_id
           WHERE t.status != 'completed' AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
           ORDER BY t.due_date ASC LIMIT 15`
        ),
        db.query(
          `SELECT t.id, t.title, t.completed_at, u.display_name AS owner_name
           FROM tasks t LEFT JOIN users u ON u.user_id = t.owner_id
           WHERE t.status = 'completed'
           ORDER BY t.completed_at DESC LIMIT 5`
        ),
        db.query(`SELECT id, name, target_date, main_focus, status, sort_order FROM goals ORDER BY sort_order, id`),
        db.query(`SELECT id, goal_id, text, done, sort_order FROM goal_steps ORDER BY goal_id, sort_order, id`),
      ]);

    const stepsByGoal = {};
    for (const s of stepsResult.rows) {
      (stepsByGoal[s.goal_id] = stepsByGoal[s.goal_id] || []).push(s);
    }
    const goals = goalsResult.rows.map((g) => {
      const steps = stepsByGoal[g.id] || [];
      const stepsDone = steps.filter((s) => s.done).length;
      return {
        ...g,
        stepsTotal: steps.length,
        stepsDone,
        progressPct: steps.length > 0 ? Math.round((stepsDone / steps.length) * 100) : 0,
      };
    });

    res.json({
      data: {
        openTasks: parseInt(openResult.rows[0].count, 10),
        overdue: parseInt(overdueResult.rows[0].count, 10),
        spentThisMonthCents: Math.round(parseFloat(spentResult.rows[0].total) * 100),
        dueThisWeek: dueWeekResult.rows,
        recentlyCompleted: recentDoneResult.rows,
        goals,
      },
    });
  } catch (error) {
    console.error('Error fetching mobile overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

module.exports = router;
