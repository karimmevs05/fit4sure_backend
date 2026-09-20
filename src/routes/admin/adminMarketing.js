const express = require('express')
const router = express.Router()
const db = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { calculateRecipeMacros } = require('./adminRecipes')

// ============================================================================
// MARKETING -- content generation for this week's featured proteins.
//
// "This week" reuses the exact same source of truth as Menu Planner/Weekly
// Prep (weekly_recipe_plan, Sunday-anchored planned_week_start) rather than
// a separate content calendar, so this always reflects the real published
// menu. "Proteins" = the same beef/chicken/turkey/pork grouping already
// used for Menu Planner's own "This Week" section (see
// utils/categoryGroups.ts on the frontend).
//
// Caption generation uses the same Gemini setup already wired up for recipe
// import and receipt scanning (GOOGLE_GEMINI_API_KEY) -- no new API/billing
// setup needed.
//
// Image generation (carousel/story cards) is NOT built yet -- deliberately
// deferred until there's a real Canva Connect API app + Brand Template IDs
// to build against, rather than faking it with a throwaway renderer. See
// the "Image export" card on the Marketing page.
// ============================================================================

const PROTEIN_CATEGORIES = ['beef', 'chicken', 'turkey', 'pork']

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY not configured in .env')
  return new GoogleGenerativeAI(apiKey)
}

const CAPTION_SYSTEM_PROMPT = `You write Instagram captions for Fit4Sure, a high-protein, seed-oil-free meal prep
business in the Tampa Bay area on a build-your-plate model with rotating weekly proteins.

Voice: direct, conviction-driven, real standard -- sounds like the owner wrote it himself, not a marketing agency.
- Lead with a specific, real detail (an ingredient, a technique, a standard) -- never a generic benefit
- Work the actual macro numbers in naturally, don't just list them
- Casual, authentic, no fluff
- End with a direct call to action
- NEVER use: "unlock", "elevate", "game-changer", "seamless", "revolutionize", or hedging language ("we try to", "we aim to")

Write exactly 3 distinct caption variations for the recipe below -- vary the angle (one can lead with the
ingredient/technique, one with the macros, one with the build-your-plate standard). Each ends with 2-3 relevant
hashtags: always include #Fit4Sure #TampaBay #HighProteinMeals, and rotate in 1-2 of #FreshPrep #ProteinPacked
#NoSeedOil #LocalProduce depending which fits the variation.

Respond with ONLY a JSON array of exactly 3 strings, no markdown fences, no commentary.`

async function getCurrentWeekStart() {
  const result = await db.query(`SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day')::date AS sunday`)
  return result.rows[0].sunday
}

async function getTopIngredients(recipeId, limit = 3) {
  const result = await db.query(
    `SELECT i.name FROM recipe_ingredients ri JOIN inventory i ON i.id = ri.inventory_id
     WHERE ri.recipe_id = $1 ORDER BY ri.quantity_g DESC LIMIT $2`,
    [recipeId, limit]
  )
  return result.rows.map((r) => r.name)
}

// GET /api/admin/marketing/featured-proteins -- this week's protein recipes
// (beef/chicken/turkey/pork) from the published weekly plan, with photo and
// live macros, ready to build content from.
router.get('/featured-proteins', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const weekStart = await getCurrentWeekStart()

    const planResult = await db.query(
      `SELECT DISTINCT r.recipe_id, r.name, r.category, r.image, r.servings
       FROM weekly_recipe_plan wrp
       JOIN recipes r ON r.recipe_id = wrp.recipe_id
       WHERE wrp.planned_week_start = $1 AND r.category = ANY($2::text[])
       ORDER BY r.name`,
      [weekStart, PROTEIN_CATEGORIES]
    )

    const proteins = await Promise.all(
      planResult.rows.map(async (r) => {
        const macros = await calculateRecipeMacros(r.recipe_id, r.servings)
        const topIngredients = await getTopIngredients(r.recipe_id)
        return {
          recipe_id: r.recipe_id,
          name: r.name,
          category: r.category,
          image: r.image,
          calories: macros.calories,
          protein_g: macros.protein_g,
          carbs_g: macros.carbs_g,
          fat_g: macros.fat_g,
          top_ingredients: topIngredients,
        }
      })
    )

    res.json({ success: true, data: { week_start: weekStart, proteins } })
  } catch (error) {
    console.error('Error fetching featured proteins:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/admin/marketing/generate-captions { recipe_id }
router.post('/generate-captions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { recipe_id } = req.body
    if (!recipe_id) return res.status(400).json({ error: 'recipe_id is required' })

    const recipeResult = await db.query('SELECT recipe_id, name, category, servings FROM recipes WHERE recipe_id = $1', [recipe_id])
    if (!recipeResult.rows[0]) return res.status(404).json({ error: 'Recipe not found' })
    const recipe = recipeResult.rows[0]

    const [macros, topIngredients] = await Promise.all([
      calculateRecipeMacros(recipe_id, recipe.servings),
      getTopIngredients(recipe_id),
    ])

    const genAI = getGeminiClient()
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })
    const response = await model.generateContent([
      `${CAPTION_SYSTEM_PROMPT}\n\nRecipe: ${recipe.name}\nCategory: ${recipe.category}\nTop ingredients: ${topIngredients.join(', ') || 'not listed'}\nMacros per serving: ${macros.calories} cal, ${macros.protein_g}g protein, ${macros.carbs_g}g carbs, ${macros.fat_g}g fat`,
    ])

    const text = response.response.text()
    let jsonStr = text
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) jsonStr = jsonMatch[1]
    const captions = JSON.parse(jsonStr)

    res.json({ success: true, data: { recipe_id, recipe_name: recipe.name, captions } })
  } catch (error) {
    console.error('Error generating captions:', error)
    res.status(500).json({ error: error.message || 'Failed to generate captions' })
  }
})

module.exports = router
