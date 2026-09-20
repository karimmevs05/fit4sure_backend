const express = require('express')
const router = express.Router()
const db = require('../../config/db')
const { requireAuth, requireRole } = require('../../middleware/auth')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { calculateRecipeMacros } = require('./adminRecipes')
const { renderCarouselCard, renderStoryCard } = require('../../services/contentImageRenderer')
const { listImagesInFolder, downloadImageBuffer } = require('../../services/googleDriveSync')
const { editFoodPhoto } = require('../../services/photoEditor')

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
// Carousel/story images are rendered server-side (satori + resvg, see
// services/contentImageRenderer.js) rather than through Canva -- no Connect
// API app or paid plan required, and it's built specifically to match
// Fit4Sure's own brand colors/category tags rather than a generic template.
//
// Real product photos, not the recipe database's reference photo: content
// built from an actual shot of what's actually being sold is what's
// expected to perform, so the renderer prefers a matching photo from
// MARKETING_PHOTOS_FOLDER_ID (a Drive folder shared with this backend's
// existing service account -- fit4sure-drive-access@fit4sure.iam.gserviceaccount.com,
// same one already used for receipt scanning) over recipes.image, falling
// back to recipes.image only when no upload matches.
// ============================================================================

const PROTEIN_CATEGORIES = ['beef', 'chicken', 'turkey', 'pork']
const MARKETING_PHOTOS_FOLDER_ID = process.env.MARKETING_PHOTOS_FOLDER_ID || null

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function listMarketingPhotos() {
  if (!MARKETING_PHOTOS_FOLDER_ID) return []
  try {
    return await listImagesInFolder(MARKETING_PHOTOS_FOLDER_ID)
  } catch (error) {
    console.error('Error listing marketing photos from Drive:', error.message)
    return []
  }
}

// Matched by filename against the recipe's own name (e.g. "Greek Chicken
// Marinade" matches "greek-chicken-marinade-1.jpg" or
// "GreekChickenMarinade_final.png") -- most-recently-uploaded match wins
// when a recipe has more than one candidate photo (driveFiles is already
// createdTime desc from listImagesInFolder).
function findDrivePhotoForRecipe(recipeName, driveFiles) {
  const recipeSlug = slugify(recipeName)
  if (!recipeSlug) return null
  return driveFiles.find((f) => slugify(f.name.replace(/\.[a-z0-9]+$/i, '')).startsWith(recipeSlug)) || null
}

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

// These are real served plates (a protein plus whatever sides landed on it
// that day), not single-dish recipe photos -- a recipe name picked to link
// macros often doesn't describe what's actually plated. So the name shown
// in the rendered image, and the caption's framing, come from looking at
// the photo itself rather than trusting the linked recipe's name.
async function getVisionDetails(buffer, mimeType) {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })
  const response = await model.generateContent([
    { inlineData: { data: buffer.toString('base64'), mimeType } },
    `Look at this photo of a real prepared meal from Fit4Sure, a high-protein meal prep company. Respond with ONLY a JSON object, no markdown fences: {"name": "...", "description": "..."}.
"name" is a short, punchy dish name (2-5 words, Title Case, no quotes) describing exactly what's visibly on the plate -- the protein and how it looks prepared, plus a standout side if there's room. Write it the way a real meal-prep menu names dishes (e.g. "Garlic Herb Chicken", "Braised Beef Rice Bowl", "Sweet Potato Steak"). Only name what you can actually see -- don't guess a specific recipe or invent ingredients not visible.
"description" is one sentence describing what's actually on the plate (protein, sides, any visible prep/garnish) for someone writing marketing copy about it.`,
  ])
  const text = response.response.text()
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/)
  return JSON.parse(jsonMatch ? jsonMatch[1] : text)
}

async function getRecipeMacros(recipeId) {
  if (!recipeId) return null
  const recipeResult = await db.query('SELECT recipe_id, servings FROM recipes WHERE recipe_id = $1', [recipeId])
  const recipe = recipeResult.rows[0]
  if (!recipe) return null
  return calculateRecipeMacros(recipeId, recipe.servings)
}

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

    const driveFiles = await listMarketingPhotos()

    const proteins = await Promise.all(
      planResult.rows.map(async (r) => {
        const macros = await calculateRecipeMacros(r.recipe_id, r.servings)
        const topIngredients = await getTopIngredients(r.recipe_id)
        const drivePhoto = findDrivePhotoForRecipe(r.name, driveFiles)
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
          has_drive_photo: !!drivePhoto,
        }
      })
    )

    res.json({
      success: true,
      data: {
        week_start: weekStart,
        proteins,
        drive_configured: !!MARKETING_PHOTOS_FOLDER_ID,
      },
    })
  } catch (error) {
    console.error('Error fetching featured proteins:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/admin/marketing/uploaded-photos -- the real driver: whatever's
// actually sitting in the Drive photos folder right now, each matched to a
// real recipe by filename. This is the primary flow (not featured-proteins
// above) -- content gets built from what was actually shot, not worked
// backwards from the sales menu, since a real product photo is what's
// expected to perform, not a lookup against this week's plan.
router.get('/uploaded-photos', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!MARKETING_PHOTOS_FOLDER_ID) {
      return res.json({ success: true, data: { configured: false, photos: [] } })
    }

    const driveFiles = await listImagesInFolder(MARKETING_PHOTOS_FOLDER_ID)
    const recipesResult = await db.query('SELECT recipe_id, name, category, servings FROM recipes')
    const recipes = recipesResult.rows

    const photos = await Promise.all(
      driveFiles.map(async (f) => {
        const filenameSlug = slugify(f.name.replace(/\.[a-z0-9]+$/i, ''))
        const matchedRecipe = recipes.find((r) => filenameSlug.startsWith(slugify(r.name))) || null

        if (!matchedRecipe) {
          return { file_id: f.id, filename: f.name, created_time: f.createdTime, matched: false }
        }

        const [macros, topIngredients] = await Promise.all([
          calculateRecipeMacros(matchedRecipe.recipe_id, matchedRecipe.servings),
          getTopIngredients(matchedRecipe.recipe_id),
        ])

        return {
          file_id: f.id,
          filename: f.name,
          created_time: f.createdTime,
          matched: true,
          recipe_id: matchedRecipe.recipe_id,
          name: matchedRecipe.name,
          category: matchedRecipe.category,
          calories: macros.calories,
          protein_g: macros.protein_g,
          carbs_g: macros.carbs_g,
          fat_g: macros.fat_g,
          top_ingredients: topIngredients,
        }
      })
    )

    res.json({ success: true, data: { configured: true, photos } })
  } catch (error) {
    console.error('Error listing uploaded photos:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/admin/marketing/photo/:file_id/thumbnail.jpg -- lets the
// frontend show what was actually uploaded (an <img> tag can't carry the
// Authorization header this route needs, so the frontend fetches it as an
// authenticated blob, same pattern as the carousel/story renders below).
router.get('/photo/:file_id/thumbnail.jpg', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { buffer, mimeType } = await downloadImageBuffer(req.params.file_id)
    res.set('Content-Type', mimeType)
    res.send(buffer)
  } catch (error) {
    console.error('Error fetching photo thumbnail:', error)
    res.status(500).json({ error: error.message || 'Failed to fetch photo' })
  }
})

// GET /api/admin/marketing/photo/:file_id/assign?recipe_id=123 -- manual
// fallback for photos whose raw camera filename doesn't match any recipe
// (the common case right now -- see uploaded-photos above). Returns the
// same shape as a filename-matched entry so the frontend can promote it
// into the matched grid the same way.
router.get('/photo/:file_id/assign', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { recipe_id } = req.query
    if (!recipe_id) return res.status(400).json({ error: 'recipe_id query param is required' })

    const recipeResult = await db.query('SELECT recipe_id, name, category, servings FROM recipes WHERE recipe_id = $1', [recipe_id])
    const recipe = recipeResult.rows[0]
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' })

    const [macros, topIngredients] = await Promise.all([
      calculateRecipeMacros(recipe.recipe_id, recipe.servings),
      getTopIngredients(recipe.recipe_id),
    ])

    res.json({
      success: true,
      data: {
        file_id: req.params.file_id,
        matched: true,
        recipe_id: recipe.recipe_id,
        name: recipe.name,
        category: recipe.category,
        calories: macros.calories,
        protein_g: macros.protein_g,
        carbs_g: macros.carbs_g,
        fat_g: macros.fat_g,
        top_ingredients: topIngredients,
      },
    })
  } catch (error) {
    console.error('Error assigning photo to recipe:', error)
    res.status(500).json({ error: error.message || 'Failed to assign photo' })
  }
})

// POST /api/admin/marketing/generate-captions { file_id?, recipe_id? } --
// at least one is required. file_id (a real uploaded plate photo) is the
// primary path: Gemini looks at the actual photo rather than trusting a
// linked recipe's name/ingredient list, which often doesn't match what's
// really plated. recipe_id is optional and only adds real macro numbers
// into the prompt when a recipe has been linked for that purpose.
router.post('/generate-captions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { file_id, recipe_id } = req.body
    if (!file_id && !recipe_id) return res.status(400).json({ error: 'file_id or recipe_id is required' })

    let dishName = null
    let macrosLine = 'not available -- do not state specific numbers, speak generally about being high-protein'
    const visionParts = []

    if (file_id) {
      const { buffer, mimeType } = await downloadImageBuffer(file_id)
      const vision = await getVisionDetails(buffer, mimeType)
      dishName = vision.name
      visionParts.push({ inlineData: { data: buffer.toString('base64'), mimeType } })
    }

    if (recipe_id) {
      const macros = await getRecipeMacros(recipe_id)
      if (macros) macrosLine = `${macros.calories} cal, ${macros.protein_g}g protein, ${macros.carbs_g}g carbs, ${macros.fat_g}g fat`
    }

    const prompt = file_id
      ? `${CAPTION_SYSTEM_PROMPT}\n\nWrite about the actual plate in the attached photo${dishName ? ` (it's a ${dishName})` : ''}. Macros per serving: ${macrosLine}`
      : `${CAPTION_SYSTEM_PROMPT}\n\nMacros per serving: ${macrosLine}`

    const genAI = getGeminiClient()
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })
    const response = await model.generateContent([...visionParts, prompt])

    const text = response.response.text()
    let jsonStr = text
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) jsonStr = jsonMatch[1]
    const captions = JSON.parse(jsonStr)

    res.json({ success: true, data: { recipe_id: recipe_id || null, dish_name: dishName, captions } })
  } catch (error) {
    console.error('Error generating captions:', error)
    res.status(500).json({ error: error.message || 'Failed to generate captions' })
  }
})

async function getRenderableProtein(recipeId) {
  const recipeResult = await db.query('SELECT recipe_id, name, category, image, servings FROM recipes WHERE recipe_id = $1', [recipeId])
  const recipe = recipeResult.rows[0]
  if (!recipe) return null
  if (!recipe.image) throw new Error('This recipe has no photo set yet')

  const macros = await calculateRecipeMacros(recipeId, recipe.servings)
  return { name: recipe.name, category: recipe.category, photoSource: { url: recipe.image }, calories: macros.calories, protein_g: macros.protein_g, carbs_g: macros.carbs_g, fat_g: macros.fat_g }
}

// GET /api/admin/marketing/:recipe_id/carousel.png -- fallback path, builds
// from the recipe database's own reference photo. Prefer the /photo/...
// routes below (a real uploaded product photo) whenever one exists.
router.get('/:recipe_id/carousel.png', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const protein = await getRenderableProtein(req.params.recipe_id)
    if (!protein) return res.status(404).json({ error: 'Recipe not found' })
    const png = await renderCarouselCard(protein)
    res.set('Content-Type', 'image/png')
    res.send(png)
  } catch (error) {
    console.error('Error rendering carousel card:', error)
    res.status(500).json({ error: error.message || 'Failed to render image' })
  }
})

// GET /api/admin/marketing/:recipe_id/story.png -- see note above.
router.get('/:recipe_id/story.png', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const protein = await getRenderableProtein(req.params.recipe_id)
    if (!protein) return res.status(404).json({ error: 'Recipe not found' })
    const png = await renderStoryCard(protein)
    res.set('Content-Type', 'image/png')
    res.send(png)
  } catch (error) {
    console.error('Error rendering story card:', error)
    res.status(500).json({ error: error.message || 'Failed to render image' })
  }
})

// Builds the render payload from a real uploaded Drive photo. recipe_id is
// optional and, when given, only supplies real protein-gram macros for the
// headline -- the dish name itself always comes from Gemini looking at the
// actual photo (see getVisionDetails above), since these are real served
// plates rather than single-recipe photos and the linked recipe's name
// frequently doesn't match what's actually plated.
async function getRenderablePhoto(fileId, recipeId) {
  const { buffer, mimeType } = await downloadImageBuffer(fileId)
  const [vision, macros, edited] = await Promise.all([
    getVisionDetails(buffer, mimeType),
    getRecipeMacros(recipeId),
    editFoodPhoto(buffer, mimeType).catch((error) => {
      console.error('Photo edit failed, falling back to the raw upload:', error.message)
      return { buffer }
    }),
  ])
  return { name: vision.name, photoSource: { buffer: edited.buffer }, protein_g: macros ? macros.protein_g : null }
}

// GET /api/admin/marketing/photo/:file_id/carousel.png?recipe_id=123 --
// recipe_id is optional (adds real protein macros to the headline if given).
router.get('/photo/:file_id/carousel.png', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const protein = await getRenderablePhoto(req.params.file_id, req.query.recipe_id)
    const png = await renderCarouselCard(protein)
    res.set('Content-Type', 'image/png')
    res.send(png)
  } catch (error) {
    console.error('Error rendering carousel card from photo:', error)
    res.status(500).json({ error: error.message || 'Failed to render image' })
  }
})

// GET /api/admin/marketing/photo/:file_id/story.png?recipe_id=123 -- see note above.
router.get('/photo/:file_id/story.png', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const protein = await getRenderablePhoto(req.params.file_id, req.query.recipe_id)
    const png = await renderStoryCard(protein)
    res.set('Content-Type', 'image/png')
    res.send(png)
  } catch (error) {
    console.error('Error rendering story card from photo:', error)
    res.status(500).json({ error: error.message || 'Failed to render image' })
  }
})

module.exports = router
