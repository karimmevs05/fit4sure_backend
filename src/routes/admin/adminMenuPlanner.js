const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { computeYieldCorrectedRecipe } = require('./adminCookingMethods');
const { getReceiptFallbackPriceCents } = require('../../utils/recipeCost');

const CATEGORY_PRICES = { Regular: 13.79, Large: 16.79 };

async function getNextWeekDates() {
  const result = await db.query(`
    SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day' + interval '7 days')::date AS sunday
  `);
  const sunday = result.rows[0].sunday;
  const sundayDate = new Date(sunday);
  const monday = new Date(sundayDate); monday.setDate(sundayDate.getDate() + 1);
  const thursday = new Date(sundayDate); thursday.setDate(sundayDate.getDate() + 4);
  return { sunday: sundayDate, monday, thursday };
}

// Same Sunday-anchored boundary as getNextWeekDates, minus the +7 days --
// this is the week actually live right now (what's on the plate today),
// not the one currently being drafted for next week.
async function getCurrentWeekDates() {
  const result = await db.query(`
    SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day')::date AS sunday
  `);
  const sunday = result.rows[0].sunday;
  const sundayDate = new Date(sunday);
  const monday = new Date(sundayDate); monday.setDate(sundayDate.getDate() + 1);
  const thursday = new Date(sundayDate); thursday.setDate(sundayDate.getDate() + 4);
  return { sunday: sundayDate, monday, thursday };
}

// Whether next week's plan has been explicitly published yet -- drives the
// "Submit Menu" button's label/state on the Menu Planner page.
router.get('/publish-status', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();
    const weekStart = sunday.toISOString().slice(0, 10);
    const result = await db.query(
      'SELECT published_at FROM weekly_menu_publish_state WHERE planned_week_start = $1',
      [weekStart]
    );
    res.json({
      data: {
        weekStart,
        published: result.rows.length > 0,
        publishedAt: result.rows[0]?.published_at || null,
      },
    });
  } catch (error) {
    console.error('Error fetching publish status:', error);
    res.status(500).json({ error: 'Failed to fetch publish status' });
  }
});

// Go-live for next week's plan -- until this is called, getWeeklyMenu()
// (the real customer ordering page's data source) reports menuReady:false
// regardless of what's saved in either block, so drafting/rearranging a
// week never briefly exposes a half-built menu to real customers.
router.post('/publish', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();
    const weekStart = sunday.toISOString().slice(0, 10);
    const result = await db.query(
      `INSERT INTO weekly_menu_publish_state (planned_week_start)
       VALUES ($1)
       ON CONFLICT (planned_week_start) DO UPDATE SET published_at = NOW()
       RETURNING published_at`,
      [weekStart]
    );
    res.json({ data: { weekStart, published: true, publishedAt: result.rows[0].published_at } });
  } catch (error) {
    console.error('Error publishing menu:', error);
    res.status(500).json({ error: 'Failed to publish menu' });
  }
});

router.get('/next-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    res.json({ data: await getNextWeekDates() });
  } catch (error) {
    console.error('Error getting next week dates:', error);
    res.status(500).json({ error: 'Failed to get next week dates' });
  }
});

router.get('/previous-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT m.name, o.day_of_week
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE (date_trunc('week', o.created_at + interval '1 day') - interval '1 day')
          = (date_trunc('week', NOW() + interval '1 day') - interval '1 day' - interval '7 days')
      ORDER BY o.day_of_week, m.name
    `);
    res.json({
      data: {
        monday: result.rows.filter(r => r.day_of_week === 'monday').map(r => r.name),
        thursday: result.rows.filter(r => r.day_of_week === 'thursday').map(r => r.name),
      },
    });
  } catch (error) {
    console.error('Error fetching previous week menu:', error);
    res.status(500).json({ error: 'Failed to fetch previous week menu' });
  }
});

// What's actually live on the menu this week -- sourced from
// weekly_recipe_plan (the real published plan for this week), not from
// orders. Unlike /previous-week (a retrospective of what people actually
// bought), this is available in full on day one of the week regardless of
// order volume, which is what makes it useful as a "what's the menu right
// now" reference next to Weekly Prep.
router.get('/current-week', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getCurrentWeekDates();
    const result = await db.query(
      `SELECT wrp.block, COALESCE(r.name, wrp.custom_name) AS name
       FROM weekly_recipe_plan wrp
       LEFT JOIN recipes r ON r.recipe_id = wrp.recipe_id
       WHERE wrp.planned_week_start = $1
       ORDER BY wrp.block, name`,
      [sunday]
    );
    res.json({
      data: {
        weekStart: sunday.toISOString().slice(0, 10),
        monday: result.rows.filter(r => r.block === 'monday').map(r => r.name),
        thursday: result.rows.filter(r => r.block === 'thursday').map(r => r.name),
      },
    });
  } catch (error) {
    console.error('Error fetching current week menu:', error);
    res.status(500).json({ error: 'Failed to fetch current week menu' });
  }
});

// Returns every published recipe for next week's planned window, joined
// against whatever's already been selected for each block -- so the UI can
// render the full recipe list with each one's checked/unchecked state and
// expected volume in a single call.
router.get('/recipe-plan', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();

    const recipesResult = await db.query(`
      SELECT recipe_id, name, category
      FROM recipes
      WHERE category != 'prepared_meal'
      ORDER BY category, name
    `);

    const planResult = await db.query(
      `SELECT id, recipe_id, block, expected_volume, custom_name, custom_calories,
              custom_protein_g, custom_carbs_g, custom_fat_g, custom_cost_per_pound_cents
       FROM weekly_recipe_plan
       WHERE planned_week_start = $1`,
      [sunday]
    );

    const planByKey = {};
    const customByBlock = { monday: [], thursday: [] };
    for (const row of planResult.rows) {
      if (row.recipe_id == null) {
        // A one-off custom meal -- never in the `recipes` table, so it can't
        // be merged into the catalog list below like a real recipe. Kept in
        // its own bucket and appended per block instead.
        customByBlock[row.block].push({
          id: row.id,
          recipe_id: null,
          isCustom: true,
          name: row.custom_name,
          category: 'custom',
          selected: true,
          expected_volume: row.expected_volume,
          calories: parseFloat(row.custom_calories) || 0,
          protein_g: parseFloat(row.custom_protein_g) || 0,
          carbs_g: parseFloat(row.custom_carbs_g) || 0,
          fat_g: parseFloat(row.custom_fat_g) || 0,
          costPerPoundCents: row.custom_cost_per_pound_cents || 0,
        });
      } else {
        planByKey[`${row.recipe_id}:${row.block}`] = { id: row.id, expected_volume: row.expected_volume };
      }
    }

    const withPlan = (block) => {
      const catalog = recipesResult.rows.map((r) => {
        const key = `${r.recipe_id}:${block}`;
        const selected = Object.prototype.hasOwnProperty.call(planByKey, key);
        return {
          recipe_id: r.recipe_id,
          name: r.name,
          category: r.category,
          selected,
          expected_volume: selected ? planByKey[key].expected_volume : 0,
        };
      });
      return [...catalog, ...customByBlock[block]];
    };

    res.json({
      data: {
        weekStart: sunday,
        monday: withPlan('monday'),
        thursday: withPlan('thursday'),
      },
    });
  } catch (error) {
    console.error('Error fetching recipe plan:', error);
    res.status(500).json({ error: 'Failed to fetch recipe plan' });
  }
});

// Saves the full recipe selection + expected volume for one block in a
// single call -- replace-all semantics, same pattern the plate builder uses
// for its recipe list. Body: { block: 'monday'|'thursday', selections: [{
// recipe_id, expected_volume } | { custom_name, expected_volume, custom_calories?,
// custom_protein_g?, custom_carbs_g?, custom_fat_g?, custom_cost_per_pound_cents? }] }.
// A selection is a custom meal when it has no recipe_id -- it's identified
// by custom_name instead, and was never in (and never gets added to) the
// Recipes catalog. Recipes/custom meals left out of `selections` are simply
// not live for that block; they aren't deleted anywhere else.
router.post('/recipe-plan', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { block, selections } = req.body;

    if (!['monday', 'thursday'].includes(block)) {
      return res.status(400).json({ error: "block must be 'monday' or 'thursday'" });
    }
    if (!Array.isArray(selections)) {
      return res.status(400).json({ error: 'selections must be an array' });
    }

    const { sunday } = await getNextWeekDates();

    await db.query(
      `DELETE FROM weekly_recipe_plan WHERE block = $1 AND planned_week_start = $2`,
      [block, sunday]
    );

    for (const s of selections) {
      if (s.recipe_id) {
        await db.query(
          `INSERT INTO weekly_recipe_plan (recipe_id, block, planned_week_start, expected_volume, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [s.recipe_id, block, sunday, s.expected_volume || 0]
        );
      } else if (s.custom_name) {
        await db.query(
          `INSERT INTO weekly_recipe_plan
             (recipe_id, block, planned_week_start, expected_volume, custom_name,
              custom_calories, custom_protein_g, custom_carbs_g, custom_fat_g, custom_cost_per_pound_cents,
              created_at, updated_at)
           VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
          [
            block,
            sunday,
            s.expected_volume || 0,
            s.custom_name,
            s.custom_calories || null,
            s.custom_protein_g || null,
            s.custom_carbs_g || null,
            s.custom_fat_g || null,
            s.custom_cost_per_pound_cents || null,
          ]
        );
      }
    }

    const { recipes, ingredientsByStore } = await computeBlockPrepPlan(block, sunday);
    await syncKitchenPrepTasks(block, sunday, recipes);
    await syncProcurementTask(block, sunday, ingredientsByStore);

    res.json({ success: true, message: 'Recipe plan saved' });
  } catch (error) {
    console.error('Error saving recipe plan:', error);
    res.status(500).json({ error: 'Failed to save recipe plan' });
  }
});

const GRAMS_PER_POUND = 455; // matches this app's stated "1 lb (455g)" convention

const PREP_DAY_FOR_BLOCK = { monday: 'saturday', thursday: 'wednesday' }; // prep happens the operational day before each block's first delivery
const OPERATIONAL_DAYS_ORDER = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const OPERATIONAL_DAY_OFFSET = { saturday: -1, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };

function truncateLabel(text, max = 255) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const CATEGORY_LABELS = {
  beef: 'Beef', chicken: 'Chicken', turkey: 'Turkey', carbohydrates: 'Carbs',
  vegetables: 'Vegetables', sauces: 'Sauces', beverage: 'Beverage', breakfast: 'Breakfast', custom: 'Custom',
};

// Normalizes any day offset relative to `sunday` (including ones outside
// this week's own -1..+5 range, e.g. "1 day before Saturday") to the actual
// (week_start, operational_day, due_date) that offset really falls on --
// Saturday's shopping day is the *previous* operational week's Friday, not a
// day inside the week being viewed.
function resolveOperationalDay(sunday, offset) {
  const weekStart = new Date(sunday);
  let normOffset = offset;
  while (normOffset < -1) { weekStart.setDate(weekStart.getDate() - 7); normOffset += 7; }
  while (normOffset > 5) { weekStart.setDate(weekStart.getDate() + 7); normOffset -= 7; }
  const day = OPERATIONAL_DAYS_ORDER.find((d) => OPERATIONAL_DAY_OFFSET[d] === normOffset);
  const dueDate = new Date(weekStart);
  dueDate.setDate(dueDate.getDate() + normOffset);
  return { weekStart: weekStart.toISOString().slice(0, 10), day, dueDateStr: dueDate.toISOString().slice(0, 10) };
}

// Everything needed to both batch-prep and shop for one block's live plan,
// computed once per save: each recipe's real cost + steps at its forecasted
// volume, and every ingredient it needs aggregated by supplier so "how much
// chicken breast to buy" has one answer instead of one per recipe.
async function computeBlockPrepPlan(block, sunday) {
  const planResult = await db.query(
    `SELECT wrp.recipe_id, wrp.expected_volume, wrp.custom_name, wrp.custom_cost_per_pound_cents,
            r.name AS recipe_name, r.category AS recipe_category
     FROM weekly_recipe_plan wrp
     LEFT JOIN recipes r ON r.recipe_id = wrp.recipe_id
     WHERE wrp.block = $1 AND wrp.planned_week_start = $2`,
    [block, sunday]
  );

  const recipes = [];
  const ingredientsByStore = {}; // store -> inventory_id -> { name, neededG, unitPriceCents, currentStockG }

  for (const row of planResult.rows) {
    const volume = parseFloat(row.expected_volume) || 0;
    const name = row.recipe_id ? row.recipe_name : row.custom_name;
    if (!name || volume <= 0) continue;

    let costCents = 0;
    let steps = [];

    if (row.recipe_id) {
      const ingResult = await db.query(
        `SELECT ri.quantity_g, i.id AS inventory_id, i.name, i.unit_price_cents, i.store, i.current_stock_g
         FROM recipe_ingredients ri
         LEFT JOIN inventory i ON ri.inventory_id = i.id
         WHERE ri.recipe_id = $1`,
        [row.recipe_id]
      );
      const totalRecipeWeightG = ingResult.rows.reduce((sum, r) => sum + (parseFloat(r.quantity_g) || 0), 0);
      const forecastedG = volume * GRAMS_PER_POUND;
      const scale = totalRecipeWeightG > 0 ? forecastedG / totalRecipeWeightG : 0;
      const scaledIngredients = [];

      for (const ing of ingResult.rows) {
        const neededG = (parseFloat(ing.quantity_g) || 0) * scale;
        const unitPriceCents = ing.unit_price_cents ?? (ing.name ? await getReceiptFallbackPriceCents(ing.name) : null);
        if (unitPriceCents) costCents += (unitPriceCents / 453.592) * neededG;
        if (ing.name) scaledIngredients.push({ name: ing.name, neededG });

        if (ing.inventory_id) {
          const store = ing.store || 'Unspecified supplier';
          if (!ingredientsByStore[store]) ingredientsByStore[store] = {};
          if (!ingredientsByStore[store][ing.inventory_id]) {
            ingredientsByStore[store][ing.inventory_id] = {
              name: ing.name,
              neededG: 0,
              unitPriceCents,
              currentStockG: parseFloat(ing.current_stock_g) || 0,
            };
          }
          ingredientsByStore[store][ing.inventory_id].neededG += neededG;
        }
      }
      costCents = Math.round(costCents);

      const stepsResult = await db.query(
        `SELECT step_number, title, description, time_estimate_minutes FROM recipe_steps WHERE recipe_id = $1 ORDER BY step_number`,
        [row.recipe_id]
      );
      steps = stepsResult.rows;

      recipes.push({ recipeId: row.recipe_id, name, category: row.recipe_category || 'custom', volume, costCents, steps, ingredients: scaledIngredients });
      continue;
    } else {
      costCents = Math.round((row.custom_cost_per_pound_cents || 0) * volume);
    }

    recipes.push({ recipeId: row.recipe_id, name, category: 'custom', volume, costCents, steps, ingredients: [] });
  }

  return { recipes, ingredientsByStore };
}

// Only the Monday block has prep (Saturday) and production (Sunday) as two
// separate operational days -- the Thursday block's prep day is already
// labeled "Prep + Production" (one combined day), so it gets the full
// execution format directly on Wednesday instead of a second task on Thursday.
const PRODUCTION_DAY_FOR_BLOCK = { monday: 'sunday' };

// US customary first (what the kitchen already measures in), metric right
// next to it -- a simple always-on conversion rather than a separate tool,
// since the exact gram figure is already known precisely (it's the number
// this was scaled from), not re-derived from an approximate density.
function formatWeight(g) {
  const lb = g / 453.592;
  const primary = lb >= 0.2 ? `${lb.toFixed(2)} lb` : `${(g / 28.3495).toFixed(1)} oz`;
  const metric = g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
  return `${primary} (${metric})`;
}

// Real USDA minimum safe internal temperatures -- only for categories where
// a doneness temperature actually means something (proteins). Left out of
// vegetables/carbs/sauces/custom entirely rather than attaching a made-up or
// irrelevant number to them.
const SAFE_TEMP_GUIDANCE = {
  chicken: '165°F',
  turkey: '165°F',
  beef: '145°F for whole cuts, 160°F if ground',
};

// Standard pre-work hygiene/safety gate on every batch sheet, before any
// per-recipe content -- the same real commercial-kitchen checks regardless
// of what's being prepped.
const EMPLOYEE_CHECKLIST = [
  'Hands washed and gloves on before touching any food',
  'Workstation, cutting boards, and tools sanitized before starting',
  'Ingredients checked for freshness and correct use-by dates',
  'Allergen cross-contact check — station and tools clear of undeclared allergens',
];

// This kitchen's own equipment -- the small-tools list plus the large/fixed
// equipment from its CAD floor plan (Grill, Griddle, Stove, Fridge/Freezer,
// 3-Compartment Sink). Matched against what a recipe's steps actually
// mention, not assumed present on every sheet.
const EQUIPMENT_KEYWORDS = [
  { name: 'Grill', pattern: /\bgrill/i },
  { name: 'Griddle', pattern: /\bgriddle/i },
  { name: 'Stove burner', pattern: /\b(stovetop|burner|simmer|boil)\b/i },
  { name: 'Cast iron skillet / frying pan', pattern: /\b(skillet|frying pan)\b/i },
  { name: 'Sauté pan', pattern: /\bsaut[ée]/i },
  { name: 'Stockpot / saucepan', pattern: /\b(stockpot|saucepan|large pot|pot over)\b/i },
  { name: 'Baking sheet', pattern: /\b(baking sheet|sheet pan)\b/i },
  { name: 'Blender / food processor', pattern: /\b(blender|food processor)\b/i },
  { name: 'Mixing bowl', pattern: /\bbowl\b/i },
  { name: 'Fine-mesh sieve', pattern: /\bsieve\b/i },
  { name: 'Whisk', pattern: /\bwhisk/i },
  { name: 'Tongs', pattern: /\btongs\b/i },
  { name: "Chef's knife", pattern: /\b(chop|dice|mince|slice|julienne)/i },
  { name: 'Digital scale', pattern: /\bweigh/i },
  { name: 'Fridge (chill/marinate)', pattern: /\b(refrigerat|fridge|chill)/i },
];

function deriveEquipment(steps) {
  const text = steps.map((s) => s.description).join(' ');
  return [...new Set(EQUIPMENT_KEYWORDS.filter((eq) => eq.pattern.test(text)).map((eq) => eq.name))];
}

// HACCP color-coding this kitchen actually uses (per its own equipment
// list) -- only the two colors it defines. No claim made for categories it
// doesn't cover (carbs, sauces, custom) rather than guessing a color.
const CUTTING_BOARD_COLOR = {
  beef: 'Red (raw meat)',
  chicken: 'Red (raw meat)',
  turkey: 'Red (raw meat)',
  vegetables: 'Green (vegetables)',
};

// Heat-application verbs -- a step mentioning one of these is actual
// cooking; anything else in a recipe's step list (seasoning, marinating,
// resting, mixing, chilling) is prep, not cooking, even though both come
// from the same recipe_steps rows. Inferred from the step's own text, not a
// separate authored field, so it's a heuristic split, not ground truth.
const COOK_STEP_PATTERN = /\b(grill|bake|cook|sauté|saute|fry|boil|simmer|roast|broil|sear|steam|poach)|heat\b.*\b(oven|grill|skillet|pan|stove)/i;

function classifyStep(description) {
  return COOK_STEP_PATTERN.test(description) ? 'cook_step' : 'prep_step';
}

function estimateTimeMinutes(steps) {
  const known = steps.filter((s) => s.time_estimate_minutes != null);
  return { totalMinutes: known.reduce((sum, s) => sum + (s.time_estimate_minutes || 0), 0), knownSteps: known.length };
}

// Same standardized skeleton every recipe gets, regardless of category or
// how much (or how little) is written for it yet -- real scaled ingredients,
// then the recipe's own prep steps (seasoning, marinating, resting) on the
// Prep day, then its cook steps (actual heat application) plus quality
// check / portion / label on the Production day. `phase` decides which half
// shows: 'prep' gets ingredients + prep steps only (cooking hasn't started);
// 'production' gets cook steps + finishing checkpoints only (prep already
// happened the day before, on its own sheet); 'combined' gets everything,
// for the single-day block that has no separate prep day at all. Nothing
// here is invented: the checkpoints are a real kitchen-ops standard (USDA
// temps where they apply), and a recipe with no steps on file says so
// plainly instead of pretending to have instructions.
function buildExecutionLines(item, phase) {
  const lines = [];
  const volumeText = formatWeight(item.volume * GRAMS_PER_POUND);
  const prepSteps = item.steps.filter((s) => classifyStep(s.description) === 'prep_step');
  const cookSteps = item.steps.filter((s) => classifyStep(s.description) === 'cook_step');
  const board = CUTTING_BOARD_COLOR[item.category];
  const tempGuidance = SAFE_TEMP_GUIDANCE[item.category];

  const showPrep = phase === 'prep' || phase === 'combined';
  const showCook = phase === 'production' || phase === 'combined';
  // Only this phase's own steps count toward its time/equipment info line --
  // a prep sheet shouldn't claim credit for the grill time it never touches.
  const infoSteps = phase === 'prep' ? prepSteps : phase === 'production' ? cookSteps : item.steps;

  if (showPrep) {
    for (const ing of item.ingredients) {
      lines.push({ text: `${ing.name} — ${formatWeight(ing.neededG)}`, kind: 'ingredient' });
    }
  }

  const equipment = deriveEquipment(infoSteps);
  if (showCook && tempGuidance) equipment.push('Probe thermometer');
  const { totalMinutes, knownSteps } = estimateTimeMinutes(infoSteps);
  const infoParts = [];
  if (knownSteps > 0) {
    // Sums whatever's on file per step -- includes passive time (a 4-hour
    // marinade counts same as 4 min of active stirring), so this is total
    // elapsed time, not hands-on labor. Said plainly, not relabeled as
    // "active" to sound more precise than it is.
    infoParts.push(`Est. time: ${totalMinutes} min${knownSteps < infoSteps.length ? ` (${knownSteps}/${infoSteps.length} steps timed)` : ''}`);
  }
  if (equipment.length > 0) infoParts.push(`Equipment: ${[...new Set(equipment)].join(', ')}`);
  if (board) infoParts.push(`Cutting board: ${board}`);
  if (infoParts.length > 0) lines.push({ text: infoParts.join(' • '), kind: 'info' });

  if (showPrep) {
    lines.push({
      text: `Mise en place: confirm every ingredient above is measured, portioned, and staged at your station (${volumeText} total) -- nothing missing or unweighed.`,
      kind: 'mise_en_place',
    });
    if (prepSteps.length > 0) {
      for (const step of prepSteps) lines.push({ text: step.description, kind: 'prep_step' });
    } else if (phase === 'prep') {
      lines.push({ text: 'No separate prep steps on file for this recipe -- ready to hand off for production.', kind: 'prep_step' });
    }
  }

  if (showCook) {
    if (phase === 'production') {
      lines.push({
        text: `Confirm prep handoff: ${volumeText} measured and portioned${prepSteps.length > 0 ? ', prep steps completed' : ''} yesterday -- verify before cooking.`,
        kind: 'mise_en_place',
      });
    }
    if (cookSteps.length > 0) {
      for (const step of cookSteps) lines.push({ text: step.description, kind: 'cook_step' });
    } else {
      lines.push({ text: 'Cook to standard method — no written cook steps on file yet for this recipe.', kind: 'cook_step' });
    }
    lines.push({
      text: tempGuidance
        ? `Quality check: appearance, aroma, and taste match the standard; confirm internal temperature reaches ${tempGuidance} (probe thermometer) before pulling from heat.`
        : 'Quality check: appearance, texture, and taste match the standard before portioning.',
      kind: 'qc',
    });
    lines.push({
      text: `Portion into containers: divide the finished ${volumeText} evenly into GN pans or airtight polypropylene containers with lids, filled to the marked line -- don't eyeball it.`,
      kind: 'portion',
    });
    lines.push({
      text: "Label & date: recipe name, today's prep date, and use-by date on a dissolvable HACCP day-of-week label, on every container before it goes in the cooler.",
      kind: 'label',
    });
  }
  return lines;
}

function groupByCategory(recipes) {
  const byCategory = {};
  for (const r of recipes) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  return byCategory;
}

// Proteins first, then carbs/veg/sauces -- purely cosmetic ordering so the
// SOP page's columns cluster same-category recipes together left-to-right
// even though they're all one task now.
const CATEGORY_ORDER = ['beef', 'chicken', 'turkey', 'carbohydrates', 'vegetables', 'sauces', 'beverage', 'breakfast', 'custom'];

// One Kitchen task per operational day/phase for the whole block -- every
// category combined into a single section (still individually color-coded
// per recipe on the SOP page) instead of a separate task per category, so
// Operations Hub shows one card for "today's prep" rather than one per
// protein. `phase` controls the checklist format: 'prep' is portioning only
// (Saturday, before cooking has actually started); 'production' and
// 'combined' get the full standardized execution format from
// buildExecutionLines. Re-derived in full on every block save, scoped by
// (department, source_type, week_start, operational_day) so manually-added
// Kitchen tasks are never touched.
async function createPhaseTask({ sunday, operationalDay, dueDateStr, items, phase, titleVerb, sourceType }) {
  if (items.length === 0) return;
  const byCategory = groupByCategory(items);
  const orderedCategories = Object.keys(byCategory).sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  );

  const totalVolume = items.reduce((sum, i) => sum + i.volume, 0);
  const totalCostCents = items.reduce((sum, i) => sum + i.costCents, 0);

  const title = `${titleVerb} — ${totalVolume} lb (${items.length} recipe${items.length === 1 ? '' : 's'})`;
  const descriptionLines = orderedCategories.map((category) => {
    const catItems = byCategory[category];
    const catVolume = catItems.reduce((sum, i) => sum + i.volume, 0);
    return `${CATEGORY_LABELS[category] || category}: ${catItems.map((i) => i.name).join(', ')} — ${catVolume} lb`;
  });
  if (totalCostCents > 0) descriptionLines.push(`Total est. cost: $${(totalCostCents / 100).toFixed(2)}`);

  const taskResult = await db.query(
    `INSERT INTO tasks (title, description, department, priority, status, due_date, operational_day, week_start, source_type, source_id, created_at, updated_at)
     VALUES ($1, $2, 'Kitchen', 'high', 'not_started', $3, $4, $5, $6, NULL, NOW(), NOW())
     RETURNING id`,
    [title, descriptionLines.join('\n'), dueDateStr, operationalDay, sunday, sourceType]
  );
  const taskId = taskResult.rows[0].id;

  let sortOrder = 0;
  // Standard hygiene/safety gate before any food gets touched -- real
  // commercial-kitchen SOP practice, not recipe-specific, so it's the same
  // on every batch sheet regardless of what's being prepped. Who actually
  // did this and when is tracked via the task's existing Owner assignment
  // and comment thread in Operations Hub, not a new field here.
  for (const text of EMPLOYEE_CHECKLIST) {
    await db.query(
      `INSERT INTO task_checklist_items (task_id, label, group_label, line_kind, category, sort_order) VALUES ($1, $2, NULL, 'employee', NULL, $3)`,
      [taskId, text, sortOrder++]
    );
  }

  for (const category of orderedCategories) {
    for (const item of byCategory[category]) {
      const lines = buildExecutionLines(item, phase);
      for (const line of lines) {
        // task_checklist_items.label is varchar(255) -- a full step
        // description can run longer, so truncate rather than let the whole
        // block save fail on one long recipe step.
        await db.query(
          `INSERT INTO task_checklist_items (task_id, label, group_label, line_kind, category, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`,
          [taskId, truncateLabel(line.text), item.name, line.kind, category, sortOrder++]
        );
      }
    }
    const label = CATEGORY_LABELS[category] || category;
    await db.query(
      `INSERT INTO task_checklist_items (task_id, label, group_label, line_kind, category, sort_order) VALUES ($1, $2, NULL, 'cleanup', $3, $4)`,
      [taskId, `Clean & sanitize ${label} station`, category, sortOrder++]
    );
  }
}

async function syncKitchenPrepTasks(block, sunday, recipes) {
  const prepDay = PREP_DAY_FOR_BLOCK[block];
  if (!prepDay) return;
  const productionDay = PRODUCTION_DAY_FOR_BLOCK[block] || null;

  const daysToClear = productionDay ? [prepDay, productionDay] : [prepDay];
  // 'weekly_recipe_plan' (singular, one-task-per-recipe) and
  // 'weekly_recipe_plan_production' are older/adjacent formats this
  // supersedes -- clear all of them so a week saved under prior code doesn't
  // show duplicate instructions next to the current ones.
  await db.query(
    `DELETE FROM tasks WHERE department = 'Kitchen'
       AND source_type IN ('weekly_recipe_plan_batch', 'weekly_recipe_plan_production', 'weekly_recipe_plan')
       AND week_start = $1 AND operational_day = ANY($2::text[])`,
    [sunday, daysToClear]
  );

  const { dueDateStr: prepDueDateStr } = resolveOperationalDay(sunday, OPERATIONAL_DAY_OFFSET[prepDay]);

  if (productionDay) {
    // Two real phases: Saturday is portioning only (cooking hasn't started
    // yet), Sunday is the actual cook -- full standardized execution format.
    await createPhaseTask({
      sunday, operationalDay: prepDay, dueDateStr: prepDueDateStr, items: recipes,
      phase: 'prep', titleVerb: 'Prep', sourceType: 'weekly_recipe_plan_batch',
    });
    const { dueDateStr: prodDueDateStr } = resolveOperationalDay(sunday, OPERATIONAL_DAY_OFFSET[productionDay]);
    await createPhaseTask({
      sunday, operationalDay: productionDay, dueDateStr: prodDueDateStr, items: recipes,
      phase: 'production', titleVerb: 'Produce', sourceType: 'weekly_recipe_plan_production',
    });
  } else {
    // One combined day: prep and production happen the same day, so go
    // straight to the full standardized execution format.
    await createPhaseTask({
      sunday, operationalDay: prepDay, dueDateStr: prepDueDateStr, items: recipes,
      phase: 'combined', titleVerb: 'Prep + Produce', sourceType: 'weekly_recipe_plan_batch',
    });
  }
}

// Real, non-fabricated planning heuristic for a shopping trip's time cost --
// same honest-estimate convention as the old production-plan labor formula
// (documented there as "not derived from stored historical data"). No store
// address/location data exists anywhere in this system, so an actual
// logistics/route plan (drive time between stores, visit order) can't be
// computed without inventing coordinates -- this covers time-per-trip only.
const MINUTES_BASE_PER_STORE = 15; // travel + parking + checkout overhead
const MINUTES_PER_ITEM = 2; // find it, grab it, check it off

// Shopping list for the block, one task per store (so a run to Costco and a
// run to Sprouts are separately assignable/trackable), scheduled on the
// operational day that's actually one day before its prep day -- for the
// Wednesday-prep block that's this week's own Tuesday (already labeled
// "Procurement"); for the Saturday-prep block that's the *previous*
// operational week's Friday, which resolveOperationalDay resolves to the
// right week automatically. Only items with a real shortfall (need > current
// stock) make the list -- what's already on the shelf doesn't need buying
// again, and the stock-coverage line + checklist-progress-on-the-card give
// the chef an at-a-glance read on how much shopping is actually left to do.
async function syncProcurementTask(block, sunday, ingredientsByStore) {
  const prepDay = PREP_DAY_FOR_BLOCK[block];
  if (!prepDay) return;
  const { weekStart: shopWeekStart, day: shopDay, dueDateStr } = resolveOperationalDay(sunday, OPERATIONAL_DAY_OFFSET[prepDay] - 1);
  if (!shopDay) return;
  const sourceId = block === 'monday' ? 1 : 2;

  await db.query(
    `DELETE FROM tasks WHERE department = 'Procurement' AND source_type = 'weekly_recipe_plan_shopping' AND week_start = $1 AND operational_day = $2 AND source_id = $3`,
    [shopWeekStart, shopDay, sourceId]
  );

  const blockLabel = block === 'monday' ? 'Block 1 (Mon-Wed)' : 'Block 2 (Thu-Sun)';

  for (const [store, items] of Object.entries(ingredientsByStore)) {
    const allItems = Object.values(items);
    const totalNeededG = allItems.reduce((sum, i) => sum + i.neededG, 0);
    const totalCoveredG = allItems.reduce((sum, i) => sum + Math.min(i.neededG, i.currentStockG), 0);
    const toBuy = allItems
      .map((i) => ({ ...i, shortfallG: Math.max(0, i.neededG - i.currentStockG) }))
      .filter((i) => i.shortfallG > 45) // ~0.1 lb -- below that it isn't a real grocery-list item, just rounds to "0.0 lb"
      .sort((a, b) => b.shortfallG - a.shortfallG);

    if (toBuy.length === 0) continue; // fully stocked at this store -- nothing to buy, no task needed

    const coveragePct = totalNeededG > 0 ? Math.round((totalCoveredG / totalNeededG) * 100) : 0;
    const estimatedMinutes = MINUTES_BASE_PER_STORE + MINUTES_PER_ITEM * toBuy.length;

    const title = `Shop ${store} for ${blockLabel} prep — ${toBuy.length} item${toBuy.length === 1 ? '' : 's'}`;
    const description = [
      `Stock coverage: ${coveragePct}% of this store's ingredient needs already on hand — ${toBuy.length} item${toBuy.length === 1 ? '' : 's'} short.`,
      `Est. shopping time: ~${estimatedMinutes} min (planning estimate: ${MINUTES_BASE_PER_STORE} min base + ${MINUTES_PER_ITEM} min/item, not historical data).`,
      'No route/drive-time plan: no store address is on file in this system, so multi-store logistics can\'t be computed for real -- add store addresses to enable it.',
    ].join('\n');

    const taskResult = await db.query(
      `INSERT INTO tasks (title, description, department, priority, status, due_date, operational_day, week_start, estimated_minutes, source_type, source_id, created_at, updated_at)
       VALUES ($1, $2, 'Procurement', 'high', 'not_started', $3, $4, $5, $6, 'weekly_recipe_plan_shopping', $7, NOW(), NOW())
       RETURNING id`,
      [title, description, dueDateStr, shopDay, shopWeekStart, estimatedMinutes, sourceId]
    );
    const taskId = taskResult.rows[0].id;

    let sortOrder = 0;
    for (const item of toBuy) {
      const buyLb = (item.shortfallG / 453.592).toFixed(1);
      const haveLb = (item.currentStockG / 453.592).toFixed(1);
      const label = item.currentStockG > 0
        ? `${item.name} — buy ${buyLb} lb (have ${haveLb} lb, need ${((item.neededG) / 453.592).toFixed(1)} lb total)`
        : `${item.name} — buy ${buyLb} lb`;
      await db.query(
        `INSERT INTO task_checklist_items (task_id, label, sort_order) VALUES ($1, $2, $3)`,
        [taskId, truncateLabel(label), sortOrder++]
      );
    }
  }
}

// Everything the chef needs to actually shop and prep for the week, derived
// from the Weekly Recipe Plan: scale each selected recipe's ingredient list
// up to its forecasted lb, then aggregate by real inventory ingredient
// across every selected recipe in both blocks -- so "how much chicken
// breast do I need this week" has one answer, not one per recipe. Cost is
// computed the same way and rolled up per block for the financials view.
router.get('/prep-and-financials', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();

    const planResult = await db.query(
      `SELECT wrp.recipe_id, wrp.block, wrp.expected_volume, r.name AS recipe_name
       FROM weekly_recipe_plan wrp
       JOIN recipes r ON r.recipe_id = wrp.recipe_id
       WHERE wrp.planned_week_start = $1`,
      [sunday]
    );

    const financials = {
      monday: { costCents: 0, lb: 0, recipeCount: 0 },
      thursday: { costCents: 0, lb: 0, recipeCount: 0 },
    };
    const ingredientTotals = {}; // inventory_id -> aggregated row

    // Each plan row's ingredient lookup is independent -- run them
    // concurrently rather than one at a time (learned from the same N+1
    // pattern in /plates earlier: sequential was 13.5s for a comparable
    // per-plate loop, parallel was ~1.1s).
    const perRecipe = await Promise.all(planResult.rows.map(async (planRow) => {
      const ingResult = await db.query(
        `SELECT ri.quantity_g, i.id AS inventory_id, i.name, i.category,
                i.unit_price_cents, i.current_stock_g, i.store
         FROM recipe_ingredients ri
         LEFT JOIN inventory i ON ri.inventory_id = i.id
         WHERE ri.recipe_id = $1`,
        [planRow.recipe_id]
      );

      const totalRecipeWeightG = ingResult.rows.reduce((sum, r) => sum + (parseFloat(r.quantity_g) || 0), 0);
      const forecastedG = (planRow.expected_volume || 0) * GRAMS_PER_POUND;
      const scale = totalRecipeWeightG > 0 ? forecastedG / totalRecipeWeightG : 0;

      let recipeCostCents = 0;
      const ingredientNeeds = [];
      for (const ing of ingResult.rows) {
        const neededG = (parseFloat(ing.quantity_g) || 0) * scale;
        // No price on file -- use the real price last actually paid on a
        // receipt rather than treating the ingredient as free.
        const unitPriceCents = ing.unit_price_cents ?? (ing.name ? await getReceiptFallbackPriceCents(ing.name) : null);
        const costCents = unitPriceCents ? (unitPriceCents / 453.592) * neededG : 0;
        recipeCostCents += costCents;
        if (ing.inventory_id) {
          ingredientNeeds.push({
            inventoryId: ing.inventory_id,
            name: ing.name,
            category: ing.category,
            unitPriceCents,
            currentStockG: parseFloat(ing.current_stock_g) || 0,
            neededG,
            store: ing.store || null,
          });
        }
      }
      return { block: planRow.block, expectedVolume: planRow.expected_volume || 0, recipeCostCents, ingredientNeeds };
    }));

    for (const r of perRecipe) {
      financials[r.block].costCents += r.recipeCostCents;
      financials[r.block].lb += r.expectedVolume;
      financials[r.block].recipeCount += 1;

      for (const ing of r.ingredientNeeds) {
        if (!ingredientTotals[ing.inventoryId]) {
          ingredientTotals[ing.inventoryId] = {
            inventoryId: ing.inventoryId,
            name: ing.name,
            category: ing.category,
            neededG: 0,
            unitPriceCents: ing.unitPriceCents,
            currentStockG: ing.currentStockG,
            store: ing.store,
          };
        }
        ingredientTotals[ing.inventoryId].neededG += ing.neededG;
      }
    }

    // Custom meals have no recipe_id and therefore no ingredients to derive
    // a shopping-list contribution from -- but their flat per-lb cost still
    // belongs in the block's cost/lb/count rollup, or the numbers shown here
    // would silently disagree with what the block itself displays.
    const customPlanResult = await db.query(
      `SELECT block, expected_volume, custom_cost_per_pound_cents
       FROM weekly_recipe_plan
       WHERE planned_week_start = $1 AND recipe_id IS NULL`,
      [sunday]
    );
    for (const row of customPlanResult.rows) {
      const lb = row.expected_volume || 0;
      const costCents = (row.custom_cost_per_pound_cents || 0) * lb;
      financials[row.block].costCents += costCents;
      financials[row.block].lb += lb;
      financials[row.block].recipeCount += 1;
    }

    const ingredients = Object.values(ingredientTotals)
      .map((i) => ({
        ...i,
        neededG: Math.round(i.neededG),
        shortfallG: Math.max(0, Math.round(i.neededG - i.currentStockG)),
      }))
      .sort((a, b) => b.neededG - a.neededG);

    financials.combined = {
      costCents: financials.monday.costCents + financials.thursday.costCents,
      lb: financials.monday.lb + financials.thursday.lb,
      recipeCount: financials.monday.recipeCount + financials.thursday.recipeCount,
    };
    financials.monday.costCents = Math.round(financials.monday.costCents);
    financials.thursday.costCents = Math.round(financials.thursday.costCents);
    financials.combined.costCents = Math.round(financials.combined.costCents);

    res.json({ data: { weekStart: sunday, ingredients, financials } });
  } catch (error) {
    console.error('Error fetching prep and financials:', error);
    res.status(500).json({ error: 'Failed to fetch prep and financials' });
  }
});

// Real allergens used across a recipe's ingredients (deduplicated)
async function getRecipeAllergens(recipeId) {
  const result = await db.query(
    `SELECT DISTINCT unnest(i.allergens) AS allergen
     FROM recipe_ingredients ri JOIN inventory i ON ri.inventory_id = i.id
     WHERE ri.recipe_id = $1 AND i.allergens IS NOT NULL`,
    [recipeId]
  );
  return result.rows.map(r => r.allergen);
}

// Ingredients below a safe threshold relative to what this recipe needs,
// so Menu Planner can warn you before you commit to a plate, not after.
async function getLowStockWarnings(recipeId, servings) {
  const result = await db.query(
    `SELECT i.name, i.current_stock_g, ri.quantity_g * $2 AS needed_g
     FROM recipe_ingredients ri JOIN inventory i ON ri.inventory_id = i.id
     WHERE ri.recipe_id = $1`,
    [recipeId, servings]
  );
  return result.rows
    .filter(r => parseFloat(r.current_stock_g) < parseFloat(r.needed_g))
    .map(r => ({ name: r.name, have_g: parseFloat(r.current_stock_g), need_g: parseFloat(r.needed_g) }));
}

router.get('/plates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { sunday } = await getNextWeekDates();

    const platesResult = await db.query(`
      SELECT id, name, category, delivery_day, large_variant_of, price
      FROM menus WHERE planned_week_start = $1
      ORDER BY delivery_day, large_variant_of NULLS FIRST, name
    `, [sunday]);

    // Each plate's recipe rows are independent reads (yield-corrected macros,
    // allergens, low-stock) that were previously awaited one at a time in a
    // nested loop -- ~4 sequential DB round-trips per recipe, serialized
    // across every plate and recipe (this endpoint was taking 13+ seconds
    // with a full week's worth of plates). Running them concurrently instead
    // cuts it to roughly the time of the single slowest query.
    const plates = await Promise.all(platesResult.rows.map(async (plate) => {
      const recipesResult = await db.query(
        `SELECT recipe_id, servings FROM menu_plan_recipes WHERE menu_id = $1`,
        [plate.id]
      );

      const perRecipe = await Promise.all(recipesResult.rows.map(async (r) => {
        const servings = parseFloat(r.servings);
        const [detail, allergens, warnings] = await Promise.all([
          computeYieldCorrectedRecipe(r.recipe_id, servings),
          getRecipeAllergens(r.recipe_id),
          getLowStockWarnings(r.recipe_id, servings),
        ]);
        return { detail, allergens, warnings };
      }));

      let totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cost_cents: 0, raw_weight_g: 0, cooked_weight_g: 0 };
      const allergenSet = new Set();
      const lowStockWarnings = [];
      const recipeDetails = [];

      for (const { detail, allergens, warnings } of perRecipe) {
        if (detail) {
          recipeDetails.push(detail);
          totals.calories += detail.calories;
          totals.protein_g += detail.protein_g;
          totals.carbs_g += detail.carbs_g;
          totals.fat_g += detail.fat_g;
          totals.cost_cents += detail.cost_cents;
          totals.raw_weight_g += detail.raw_weight_g;
          totals.cooked_weight_g += detail.cooked_weight_g;
        }
        allergens.forEach(a => allergenSet.add(a));
        lowStockWarnings.push(...warnings);
      }

      totals.protein_g = +totals.protein_g.toFixed(1);
      totals.carbs_g = +totals.carbs_g.toFixed(1);
      totals.fat_g = +totals.fat_g.toFixed(1);
      totals.raw_weight_g = +totals.raw_weight_g.toFixed(1);
      totals.cooked_weight_g = +totals.cooked_weight_g.toFixed(1);

      const priceCents = Math.round(parseFloat(plate.price) * 100);
      const profitCents = priceCents - totals.cost_cents;
      const marginPct = priceCents > 0 ? +((profitCents / priceCents) * 100).toFixed(1) : 0;

      return {
        ...plate,
        recipes: recipeDetails,
        totals,
        allergens: Array.from(allergenSet),
        lowStockWarnings,
        profit: { price_cents: priceCents, cost_cents: totals.cost_cents, profit_cents: profitCents, margin_pct: marginPct },
      };
    }));

    res.json({ data: { weekStart: sunday, plates } });
  } catch (error) {
    console.error('Error fetching plates:', error);
    res.status(500).json({ error: 'Failed to fetch plates' });
  }
});

router.post('/plates', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, day, recipes, makeLarge } = req.body;

    if (!name || !day || !Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: 'name, day, and at least one recipe are required' });
    }
    if (!['monday', 'thursday'].includes(day)) {
      return res.status(400).json({ error: "day must be 'monday' or 'thursday'" });
    }

    const { sunday } = await getNextWeekDates();

    const regularMenu = await db.query(
      `INSERT INTO menus (name, category, price, planned_week_start, delivery_day, created_at, updated_at)
       VALUES ($1, 'Regular', $2, $3, $4, NOW(), NOW()) RETURNING id`,
      [name, CATEGORY_PRICES.Regular, sunday, day]
    );
    const regularMenuId = regularMenu.rows[0].id;

    for (const r of recipes) {
      await db.query(
        `INSERT INTO menu_plan_recipes (menu_id, recipe_id, servings) VALUES ($1, $2, $3)`,
        [regularMenuId, r.recipe_id, r.servings]
      );
    }

    let largeMenuId = null;
    if (makeLarge) {
      const largeMenu = await db.query(
        `INSERT INTO menus (name, category, price, planned_week_start, delivery_day, large_variant_of, created_at, updated_at)
         VALUES ($1, 'Large', $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
        [name, CATEGORY_PRICES.Large, sunday, day, regularMenuId]
      );
      largeMenuId = largeMenu.rows[0].id;

      for (const r of recipes) {
        await db.query(
          `INSERT INTO menu_plan_recipes (menu_id, recipe_id, servings) VALUES ($1, $2, $3)`,
          [largeMenuId, r.recipe_id, r.servings * 1.5]
        );
      }
    }

    res.status(201).json({ data: { regularMenuId, largeMenuId } });
  } catch (error) {
    console.error('Error creating plate:', error);
    res.status(500).json({ error: 'Failed to create plate' });
  }
});

// Updates an existing plate's name and recipe list (with per-recipe
// servings) in place, instead of the only previous option -- delete and
// recreate from scratch. Always operates on the Regular plate's id; its
// Large twin (1.5x servings), if any, is created/updated/removed to match.
router.put('/plates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, recipes, makeLarge } = req.body;

    if (!name || !Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: 'name and at least one recipe are required' });
    }

    const menuResult = await db.query('SELECT id, delivery_day, large_variant_of FROM menus WHERE id = $1', [id]);
    if (menuResult.rows.length === 0) return res.status(404).json({ error: 'Plate not found' });
    if (menuResult.rows[0].large_variant_of) {
      return res.status(400).json({ error: 'Edit the Regular plate, not its Large version -- the Large version updates automatically' });
    }

    await db.query(`UPDATE menus SET name = $1, updated_at = NOW() WHERE id = $2`, [name, id]);

    await db.query(`DELETE FROM menu_plan_recipes WHERE menu_id = $1`, [id]);
    for (const r of recipes) {
      await db.query(
        `INSERT INTO menu_plan_recipes (menu_id, recipe_id, servings) VALUES ($1, $2, $3)`,
        [id, r.recipe_id, r.servings]
      );
    }

    const existingLarge = await db.query('SELECT id FROM menus WHERE large_variant_of = $1', [id]);
    const largeId = existingLarge.rows[0]?.id || null;

    if (makeLarge) {
      let targetLargeId = largeId;
      if (!targetLargeId) {
        const delivery_day = menuResult.rows[0].delivery_day;
        const { sunday } = await getNextWeekDates();
        const largeMenu = await db.query(
          `INSERT INTO menus (name, category, price, planned_week_start, delivery_day, large_variant_of, created_at, updated_at)
           VALUES ($1, 'Large', $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
          [name, CATEGORY_PRICES.Large, sunday, delivery_day, id]
        );
        targetLargeId = largeMenu.rows[0].id;
      } else {
        await db.query(`UPDATE menus SET name = $1, updated_at = NOW() WHERE id = $2`, [name, targetLargeId]);
      }

      await db.query(`DELETE FROM menu_plan_recipes WHERE menu_id = $1`, [targetLargeId]);
      for (const r of recipes) {
        await db.query(
          `INSERT INTO menu_plan_recipes (menu_id, recipe_id, servings) VALUES ($1, $2, $3)`,
          [targetLargeId, r.recipe_id, r.servings * 1.5]
        );
      }
    } else if (largeId) {
      await db.query('DELETE FROM menus WHERE id = $1', [largeId]);
    }

    res.json({ success: true, message: 'Plate updated' });
  } catch (error) {
    console.error('Error updating plate:', error);
    res.status(500).json({ error: 'Failed to update plate' });
  }
});

router.delete('/plates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const menuResult = await db.query('SELECT id, large_variant_of FROM menus WHERE id = $1', [id]);
    if (menuResult.rows.length === 0) return res.status(404).json({ error: 'Plate not found' });
    await db.query('DELETE FROM menus WHERE id = $1 OR large_variant_of = $1', [id]);
    res.json({ success: true, message: 'Plate deleted' });
  } catch (error) {
    console.error('Error deleting plate:', error);
    res.status(500).json({ error: 'Failed to delete plate' });
  }
});

module.exports = router;
