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

const CAPTION_SYSTEM_PROMPT = `You are a senior social media content strategist who has run Instagram growth for high-performing
food and fitness brands for years -- you know how the app actually behaves, not just how to write nice sentences.
You've been brought on to write for Fit4Sure, a high-protein, seed-oil-free meal prep business in the Tampa Bay
area on a build-your-plate model with rotating weekly proteins.

How you actually think about a caption, in order:
1. THE HOOK. Instagram truncates captions after ~125 characters behind a "more" tap, and the feed algorithm
   weighs watch-time/read-time before it weighs anything else -- if the first line doesn't stop the scroll or
   earn the tap, nothing after it matters. Open with something concrete and specific (a real detail, a bold
   claim, a question, a number) -- never a throat-clearing greeting or a generic statement about health.
2. THE BODY. Short lines. Real line breaks, not a wall of text -- this is a phone screen, not an essay. Write
   like a person who actually knows this food, not a brand account reciting a press release. Work the real
   macro numbers in naturally where they earn their place, don't just list them.
3. THE ENGAGEMENT LEVER. Every post should give the algorithm a reason to push it: something worth saving
   (real, useful info), sharing (an opinion worth agreeing with), or replying to (when it fits naturally --
   don't force a question onto every single caption).
4. THE CTA. End with one direct, specific action -- not a vague "check it out."

Voice: direct, conviction-driven, real standard -- sounds like the owner wrote it himself, not a marketing
agency, and never like a caption a burnt-out intern churned out to hit a quota.
NEVER use: "unlock", "elevate", "game-changer", "seamless", "revolutionize", emoji strings as filler, or
hedging language ("we try to", "we aim to").

Write exactly 3 distinct caption variations for the meal below -- three genuinely different hooks and angles
(not the same caption reworded three times), so there's a real choice to make, not three near-duplicates.
Each ends with 2-3 relevant hashtags: always include #Fit4Sure #TampaBay #HighProteinMeals, and rotate in 1-2 of
#FreshPrep #ProteinPacked #NoSeedOil #LocalProduce depending which fits the variation.

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
    `You are an experienced menu copywriter and food photographer's eye rolled into one -- you name dishes for a
living and you're good at it: names that sound appetizing and specific, never generic or clinical.

Look at this photo of a real prepared meal from Fit4Sure, a high-protein meal prep company. Respond with ONLY a
JSON object, no markdown fences: {"name": "...", "description": "..."}.
"name" is a short, punchy dish name (2-5 words, Title Case, no quotes) describing exactly what's visibly on the
plate -- the protein and how it looks prepared, plus a standout side if there's room. Write it the way a real
meal-prep menu names dishes (e.g. "Garlic Herb Chicken", "Braised Beef Rice Bowl", "Sweet Potato Steak") --
appetizing and specific, not a flat inventory of ingredients. Only name what you can actually see -- don't guess
a specific recipe or invent ingredients not visible.
"description" is one sentence describing what's actually on the plate (protein, sides, any visible prep/garnish)
for someone writing marketing copy about it.`,
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

// ============================================================================
// PROJECTS -- a named grouping of content pieces ("This Week's Breakfast
// Push", etc). One tab per project, each holding multiple content pieces
// (an uploaded photo + optional recipe link), instead of one flat grid of
// every photo in the Drive folder.
// ============================================================================

// GET /api/admin/marketing/projects
router.get('/projects', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.id, p.name, p.created_at, COUNT(i.id)::int AS item_count
      FROM marketing_projects p
      LEFT JOIN marketing_project_items i ON i.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `)
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Error listing marketing projects:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/admin/marketing/projects { name }
router.post('/projects', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })
    const result = await db.query(
      `INSERT INTO marketing_projects (name, created_by_user_id) VALUES ($1, $2) RETURNING id, name, created_at`,
      [name.trim(), req.userId]
    )
    res.json({ success: true, data: { ...result.rows[0], item_count: 0 } })
  } catch (error) {
    console.error('Error creating marketing project:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/admin/marketing/projects/:id
router.delete('/projects/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await db.query(
      `DELETE FROM tasks WHERE id IN (SELECT task_id FROM marketing_project_items WHERE project_id = $1 AND task_id IS NOT NULL)`,
      [req.params.id]
    )
    await db.query('DELETE FROM marketing_projects WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting marketing project:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/admin/marketing/projects/:id/items -- each item is one uploaded
// Drive photo (optionally recipe-linked for macros), same shape as
// /uploaded-photos entries so the frontend can reuse the same photo card.
router.get('/projects/:id/items', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const itemsResult = await db.query(
      `SELECT id, drive_file_id, recipe_id, format, size, template_link, status, price_cents, scheduled_date, notes, task_id, added_at
       FROM marketing_project_items WHERE project_id = $1 ORDER BY added_at`,
      [req.params.id]
    )
    const items = await Promise.all(
      itemsResult.rows.map(async (item) => {
        let recipeName = null
        if (item.recipe_id) {
          const r = await db.query('SELECT name FROM recipes WHERE recipe_id = $1', [item.recipe_id])
          recipeName = r.rows[0]?.name || null
        }
        return {
          item_id: item.id,
          file_id: item.drive_file_id,
          recipe_id: item.recipe_id,
          recipe_name: recipeName,
          format: item.format,
          size: item.size,
          template_link: item.template_link,
          status: item.status,
          price_cents: item.price_cents,
          scheduled_date: item.scheduled_date,
          notes: item.notes,
          task_id: item.task_id,
        }
      })
    )
    res.json({ success: true, data: items })
  } catch (error) {
    console.error('Error listing project items:', error)
    res.status(500).json({ error: error.message })
  }
})

const PIECE_FORMATS = ['flyer', 'business_card', 'promo_card', 'billboard', 'static_post', 'promo_video', 'reel', 'story']
const PIECE_STATUSES = ['idea', 'in_progress', 'review', 'approved', 'scheduled', 'published']

// PATCH /api/admin/marketing/projects/:id/items/:itemId -- the "template"
// details for a piece: format, size, a reference link, its status in the
// flow, a price, and an optional schedule date. Setting/clearing
// scheduled_date creates/updates/removes a real row in the unified `tasks`
// table (department='Marketing') so a scheduled piece actually shows up on
// the existing Operations Hub dashboard -- not a separate, disconnected
// calendar.
router.patch('/projects/:id/items/:itemId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { format, size, template_link, status, price_cents, scheduled_date, notes } = req.body
    if (format !== undefined && format !== null && !PIECE_FORMATS.includes(format)) {
      return res.status(400).json({ error: `format must be one of: ${PIECE_FORMATS.join(', ')}` })
    }
    if (status !== undefined && status !== null && !PIECE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${PIECE_STATUSES.join(', ')}` })
    }

    const fields = { format, size, template_link, status, price_cents, scheduled_date, notes }
    const setClauses = []
    const values = []
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue
      values.push(value)
      setClauses.push(`${key} = $${values.length}`)
    }
    if (setClauses.length === 0) return res.status(400).json({ error: 'no fields to update' })

    values.push(req.params.itemId, req.params.id)
    const result = await db.query(
      `UPDATE marketing_project_items SET ${setClauses.join(', ')} WHERE id = $${values.length - 1} AND project_id = $${values.length} RETURNING *`,
      values
    )
    const item = result.rows[0]
    if (!item) return res.status(404).json({ error: 'Item not found' })

    if (scheduled_date !== undefined) {
      if (scheduled_date) {
        const projectResult = await db.query('SELECT name FROM marketing_projects WHERE id = $1', [req.params.id])
        const projectName = projectResult.rows[0]?.name || 'Marketing'
        const title = `${(item.format || 'Content piece').replace(/_/g, ' ')} -- ${projectName}`.replace(/^\w/, (c) => c.toUpperCase())
        const taskStatus = item.status === 'published' ? 'completed' : 'not_started'

        if (item.task_id) {
          await db.query('UPDATE tasks SET title = $1, due_date = $2, status = $3, updated_at = NOW() WHERE id = $4', [title, scheduled_date, taskStatus, item.task_id])
        } else {
          const taskResult = await db.query(
            `INSERT INTO tasks (title, department, due_date, status, source_type, source_id, is_ops_task)
             VALUES ($1, 'Marketing', $2, $3, 'marketing_piece', $4, true) RETURNING id`,
            [title, scheduled_date, taskStatus, item.id]
          )
          await db.query('UPDATE marketing_project_items SET task_id = $1 WHERE id = $2', [taskResult.rows[0].id, item.id])
          item.task_id = taskResult.rows[0].id
        }
      } else if (item.task_id) {
        await db.query('DELETE FROM tasks WHERE id = $1', [item.task_id])
        await db.query('UPDATE marketing_project_items SET task_id = NULL WHERE id = $1', [item.id])
        item.task_id = null
      }
    }

    res.json({ success: true, data: { item_id: item.id, task_id: item.task_id } })
  } catch (error) {
    console.error('Error updating project item:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/admin/marketing/projects/:id/items { drive_file_id, recipe_id? }
router.post('/projects/:id/items', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { drive_file_id, recipe_id } = req.body
    if (!drive_file_id) return res.status(400).json({ error: 'drive_file_id is required' })
    const result = await db.query(
      `INSERT INTO marketing_project_items (project_id, drive_file_id, recipe_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, drive_file_id) DO UPDATE SET recipe_id = EXCLUDED.recipe_id
       RETURNING id`,
      [req.params.id, drive_file_id, recipe_id || null]
    )
    res.json({ success: true, data: { item_id: result.rows[0].id } })
  } catch (error) {
    console.error('Error adding project item:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/admin/marketing/projects/:id/items/:itemId
router.delete('/projects/:id/items/:itemId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const existing = await db.query('SELECT task_id FROM marketing_project_items WHERE id = $1 AND project_id = $2', [req.params.itemId, req.params.id])
    if (existing.rows[0]?.task_id) await db.query('DELETE FROM tasks WHERE id = $1', [existing.rows[0].task_id])
    await db.query('DELETE FROM marketing_project_items WHERE id = $1 AND project_id = $2', [req.params.itemId, req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error removing project item:', error)
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

// Builds the render payload from a real uploaded Drive photo. recipe_id is
// optional and, when given, only supplies real protein-gram macros for the
// headline -- the dish name itself always comes from Gemini looking at the
// actual photo (see getVisionDetails above), since these are real served
// plates rather than single-recipe photos and the linked recipe's name
// frequently doesn't match what's actually plated. The subject-aware crop
// and title autofit happen inside the renderer itself (contentImageRenderer.js)
// since the target box is a layout concern it already owns.
async function getRenderablePhoto(fileId, recipeId) {
  const { buffer, mimeType } = await downloadImageBuffer(fileId)
  const [vision, macros, edited] = await Promise.all([
    getVisionDetails(buffer, mimeType),
    getRecipeMacros(recipeId),
    editFoodPhoto(buffer, mimeType).catch((error) => {
      console.error('Photo edit failed, falling back to the raw upload:', error.message)
      return { buffer, mimeType }
    }),
  ])
  return {
    name: vision.name,
    photoBuffer: edited.buffer,
    photoMimeType: edited.mimeType || 'image/png',
    protein_g: macros ? macros.protein_g : null,
  }
}

// Pre-publish validation (spec item 5): a card only gets served as a PNG
// when the title actually fit within its box AND the branded tag is
// visible in the source photo. Otherwise the card is flagged for manual
// review (422 + reason) instead of auto-serving a broken or incomplete
// result.
function respondWithCard(res, result) {
  if (!result.fits || !result.tagVisible) {
    const reasons = []
    if (!result.fits) reasons.push('dish name did not fit within 2 lines at the minimum font size')
    if (!result.tagVisible) reasons.push('branded tag was not visible in the source photo')
    return res.status(422).json({ success: false, needs_review: true, reason: reasons.join('; ') })
  }
  res.set('Content-Type', 'image/png')
  res.send(result.png)
}

// GET /api/admin/marketing/photo/:file_id/carousel.png?recipe_id=123 --
// recipe_id is optional (adds real protein macros to the headline if given).
router.get('/photo/:file_id/carousel.png', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const protein = await getRenderablePhoto(req.params.file_id, req.query.recipe_id)
    respondWithCard(res, await renderCarouselCard(protein))
  } catch (error) {
    console.error('Error rendering carousel card from photo:', error)
    res.status(500).json({ error: error.message || 'Failed to render image' })
  }
})

// GET /api/admin/marketing/photo/:file_id/story.png?recipe_id=123 -- see note above.
router.get('/photo/:file_id/story.png', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const protein = await getRenderablePhoto(req.params.file_id, req.query.recipe_id)
    respondWithCard(res, await renderStoryCard(protein))
  } catch (error) {
    console.error('Error rendering story card from photo:', error)
    res.status(500).json({ error: error.message || 'Failed to render image' })
  }
})

module.exports = router
