// Extracts a structured recipe (name, category guess, servings, prep time,
// steps, ingredients) from either:
//   - a recipe URL (tries schema.org Recipe JSON-LD first -- free and exact
//     -- and only falls back to Gemini if the page has none)
//   - a screenshot (straight to Gemini vision, no JSON-LD path exists)
//
// Then fuzzy-matches every extracted ingredient name against the real
// `inventory` table so the caller knows which ones can auto-fill and which
// ones need a human to resolve via the existing IngredientPicker flow.
//
// Uses Gemini (same GOOGLE_GEMINI_API_KEY already configured for the receipt
// scanner) rather than Claude -- no separate paid API/billing setup needed.

const { GoogleGenerativeAI } = require('@google/generative-ai')
const pool = require('../config/db')

const getGeminiClient = () => {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY not configured in .env')
  }
  return new GoogleGenerativeAI(apiKey)
}

// Gemini occasionally 503s ("currently experiencing high demand") or 429s
// (rate limit) under load -- both transient and worth a short retry before
// giving up, same as the receipt scanner's retry logic.
function isRetryableGeminiError(error) {
  return /\b(503|429)\b/.test(error.message || '')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withGeminiRetry(fn) {
  const MAX_ATTEMPTS = 3
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isLastAttempt = attempt === MAX_ATTEMPTS
      if (!isRetryableGeminiError(error) || isLastAttempt) throw error
      const delayMs = attempt * 2000
      console.warn(`Gemini transient error on recipe extraction attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${delayMs}ms: ${error.message}`)
      await sleep(delayMs)
    }
  }
}

// Same conversion table as adminRecipes.js convertToGrams -- kept local so
// this service has no dependency on that route file. Mass units (g/kg/oz/lb)
// and countable "each" convert the same regardless of wet/dry. ml/l are
// liquid-only by definition, so no ambiguity there either. cup/tbsp/tsp are
// the ambiguous ones -- "1 cup" of water and "1 cup" of flour are roughly
// half the weight apart -- so those get a separate wet vs dry table below.
const UNIT_TO_GRAMS = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  ml: 1,
  l: 1000,
  each: 100, // countable items (e.g. "2 eggs") with no weight given -- rough placeholder, always flagged low-confidence
}

// Water-density volume conversion, for liquids/pourables (milk, oil, honey,
// broth, sauce).
const WET_VOLUME_TO_GRAMS = { cup: 240, tbsp: 15, tsp: 5 }

// Flour-density approximation, for dry/scoopable goods (flour, sugar, rice,
// oats, spices). No single number is exact across every dry ingredient, but
// this is far closer than assuming water density for something you scoop
// instead of pour.
const DRY_VOLUME_TO_GRAMS = { cup: 120, tbsp: 7.5, tsp: 2.5 }

function toGrams(quantity, unit, isLiquid = true) {
  const q = Number(quantity) || 0
  const normalizedUnit = (unit || 'g').toLowerCase()
  const volumeTable = isLiquid ? WET_VOLUME_TO_GRAMS : DRY_VOLUME_TO_GRAMS
  const factor = UNIT_TO_GRAMS[normalizedUnit] ?? volumeTable[normalizedUnit] ?? 1
  return Math.round(q * factor)
}

const EXTRACTION_SYSTEM_PROMPT = `You extract recipes into strict JSON. Respond with ONLY a JSON object, no markdown fences, no preamble, no commentary.

Schema:
{
  "name": string,
  "category_guess": one of "beef","chicken","turkey","carbohydrates","vegetables","sauces","beverage","breakfast",
  "servings": number,
  "prep_time_minutes": number or null,
  "steps": [
    { "title": string (short, 2-5 words, e.g. "Brown the turkey" -- can be empty string if the source has no natural step titles), "description": string (what to do, in your own words -- do not copy the source text verbatim), "time_estimate_minutes": number or null (only set this if the source gives or clearly implies a duration for this specific step, e.g. "simmer 20 minutes" -- otherwise null, do not guess), "step_type": one of "prep","cook" (prep = anything before real heat is applied to the food: measuring, seasoning, marinating, chopping, mixing, resting, chilling, staging; cook = the step actually applies heat or is a direct continuation of an already-cooking process: grilling, baking, sautéing, simmering, roasting, basting, flipping, checking doneness. A step with no heat verb but that only makes sense once cooking has started -- e.g. "flip and cook 3 more minutes", "let rest 5 minutes off the heat" -- is still "cook") }
  ],
  "ingredients": [
    { "raw_text": string (the original ingredient line), "name": string (just the ingredient, no quantity/notes), "quantity": number, "unit": one of "g","kg","oz","lb","cup","tbsp","tsp","ml","l","each", "is_liquid": boolean (only matters for cup/tbsp/tsp, where the same volume weighs very differently poured vs scooped -- true for something poured/liquid at room temp: milk, oil, honey, broth, sauce, water, juice, melted butter; false for something scooped/dry: flour, sugar, rice, oats, spices, shredded cheese, chopped vegetables. For g/kg/oz/lb/ml/l/each this doesn't change the conversion, but still set it accurately), "low_confidence": boolean (true if the quantity or unit was ambiguous in the source and you had to guess) }
  ]
}

Split instructions into one step per distinct action (don't merge multiple actions into one step, don't split a single action across two). Be conservative on ingredient quantities: if unclear ("a handful", "to taste", a range like "1-2 tsp"), pick your best single estimate and set low_confidence true rather than leaving it blank.`

async function extractFromText(sourceText) {
  return withGeminiRetry(async () => {
    const genAI = getGeminiClient()
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })
    const response = await model.generateContent([
      `${EXTRACTION_SYSTEM_PROMPT}\n\nExtract the recipe from this page content:\n\n${sourceText.slice(0, 15000)}`,
    ])
    return parseGeminiJson(response)
  })
}

async function extractFromImage(base64Data, mimeType) {
  return withGeminiRetry(async () => {
    const genAI = getGeminiClient()
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })
    const response = await model.generateContent([
      { inlineData: { data: base64Data, mimeType: mimeType || 'image/jpeg' } },
      `${EXTRACTION_SYSTEM_PROMPT}\n\nExtract the recipe shown in this screenshot.`,
    ])
    return parseGeminiJson(response)
  })
}

function parseGeminiJson(response) {
  const text = response.response.text()
  let jsonStr = text
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/)
  if (jsonMatch) jsonStr = jsonMatch[1]
  return JSON.parse(jsonStr)
}

// Look for schema.org Recipe JSON-LD in a fetched page's HTML. Handles the
// common shapes: a single Recipe object, an array of objects, or a
// @graph-wrapped object (all seen in the wild across recipe blogs).
function findRecipeJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1].trim())
      const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed]
      const recipe = candidates.find((c) => {
        const type = c['@type']
        return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))
      })
      if (recipe) return recipe
    } catch {
      // malformed JSON-LD block -- skip and keep looking
      continue
    }
  }
  return null
}

// Pull a real photo URL for the recipe, cheaply and without an AI call --
// prefer the JSON-LD `image` field (schema.org allows a plain string, an
// array of strings, or an ImageObject/array of ImageObject with a `url`),
// falling back to the page's og:image meta tag when there's no JSON-LD (or
// it didn't include one). Returns null rather than guessing if neither is
// present.
function findImageUrl(html, jsonLdRecipe) {
  const fromJsonLd = jsonLdRecipe?.image
  if (fromJsonLd) {
    const candidate = Array.isArray(fromJsonLd) ? fromJsonLd[0] : fromJsonLd
    const url = typeof candidate === 'string' ? candidate : candidate?.url
    if (url) return url
  }

  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (ogMatch) return ogMatch[1]
  // Some pages order the attributes the other way around (content before property)
  const ogMatchReversed = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  if (ogMatchReversed) return ogMatchReversed[1]

  return null
}

// A JSON-LD ingredient/instruction line is free text -- still needs the same
// splitting the vision path does for screenshots, so route it through the
// same text extractor rather than writing a second regex parser to maintain.
async function normalizeJsonLdRecipe(recipe) {
  const ingredientLines = (recipe.recipeIngredient || []).join('\n')
  const instructionLines = Array.isArray(recipe.recipeInstructions)
    ? recipe.recipeInstructions.map((s) => (typeof s === 'string' ? s : s.text)).join('\n')
    : recipe.recipeInstructions || ''

  return withGeminiRetry(async () => {
    const genAI = getGeminiClient()
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })
    const response = await model.generateContent([
      `${EXTRACTION_SYSTEM_PROMPT}\n\nStructure this already-extracted recipe data:\n\nName: ${recipe.name || ''}\nServings: ${recipe.recipeYield || ''}\nIngredients:\n${ingredientLines}\n\nInstructions:\n${instructionLines}`,
    ])
    return parseGeminiJson(response)
  })
}

// Words that change what a food fundamentally IS, not just its quality or
// prep state -- if only one of the two names being compared has one of
// these, they're different products no matter how much of the rest
// overlaps ("avocado" is not "avocado oil"; "coconut" is not "coconut
// milk"). Plain substring containment used to treat "avocado" ⊂ "avocado
// oil" as a strong match for exactly this reason -- this list is what
// stops that.
const FORM_WORDS = new Set([
  'oil', 'sauce', 'juice', 'powder', 'extract', 'milk', 'butter', 'flour',
  'vinegar', 'syrup', 'paste', 'puree', 'broth', 'stock', 'wine', 'seed',
  'seeds', 'flake', 'flakes', 'chip', 'chips', 'meal', 'cream', 'yogurt',
  'cheese', 'bread', 'jam', 'jelly', 'sausage', 'jerky', 'crumb', 'crumbs',
])

// Words that describe quality, cut, or prep state without changing what
// the food fundamentally is -- safe to ignore when comparing two names
// ("ground coriander" and "coriander" are the same ingredient).
const DESCRIPTOR_WORDS = new Set([
  'fresh', 'organic', 'raw', 'whole', 'ground', 'chopped', 'diced', 'sliced',
  'minced', 'large', 'small', 'medium', 'boneless', 'skinless', 'lean',
  'extra', 'virgin', 'cold', 'pressed', 'ripe', 'dried', 'frozen', 'canned',
  'unsalted', 'salted', 'low', 'fat', 'free', 'wild', 'caught', 'grass',
  'fed', 'range', 'cage', 'baby', 'young', 'kosher', 'sea', 'table',
  'iodized', 'himalayan', 'pink',
])

function normalize(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
}

// Tokenize + de-pluralize + drop pure descriptor words, keeping only the
// tokens that actually identify what the ingredient is.
function coreTokens(name) {
  return normalize(name)
    .split(' ')
    .filter(Boolean)
    .map((t) => t.replace(/s$/, ''))
    .filter((t) => !DESCRIPTOR_WORDS.has(t))
}

// 3 = exact (same core tokens), 2 = high (one name's core tokens are fully
// contained in the other's, with no conflicting form word), 1 = low
// (meaningful partial overlap), 0 = no real match.
function matchScore(targetTokens, candidateTokens) {
  if (targetTokens.length === 0 || candidateTokens.length === 0) return 0

  const targetSet = new Set(targetTokens)
  const candidateSet = new Set(candidateTokens)

  const targetForms = targetTokens.filter((t) => FORM_WORDS.has(t))
  const candidateForms = candidateTokens.filter((t) => FORM_WORDS.has(t))
  const formsConflict =
    targetForms.some((f) => !candidateSet.has(f)) || candidateForms.some((f) => !targetSet.has(f))
  if (formsConflict) return 0

  const intersection = targetTokens.filter((t) => candidateSet.has(t)).length
  const union = new Set([...targetTokens, ...candidateTokens]).size
  const jaccard = intersection / union

  if (jaccard === 1) return 3
  const isSubset = targetTokens.every((t) => candidateSet.has(t)) || candidateTokens.every((t) => targetSet.has(t))
  if (isSubset) return 2
  if (jaccard >= 0.34) return 1
  return 0
}

async function matchIngredientsToInventory(extractedIngredients) {
  const { rows: inventory } = await pool.query(
    `SELECT id, name, category, unit_price_cents, protein_per_100g, carbs_per_100g, fat_per_100g, calories_per_100g
     FROM inventory`
  )

  return extractedIngredients.map((ing) => {
    const targetTokens = coreTokens(ing.name)

    let best = null
    let bestScore = 0

    for (const item of inventory) {
      const candidateTokens = coreTokens(item.name)
      const score = matchScore(targetTokens, candidateTokens)
      if (score > bestScore) {
        bestScore = score
        best = item
      }
    }

    const confidence = bestScore === 3 ? 'exact' : bestScore === 2 ? 'high' : bestScore === 1 ? 'low' : 'none'

    return {
      raw_text: ing.raw_text,
      name: ing.name,
      quantity_g: toGrams(ing.quantity, ing.unit, ing.is_liquid !== false),
      is_liquid: ing.is_liquid !== false,
      low_confidence: !!ing.low_confidence,
      match:
        confidence === 'none'
          ? null
          : {
              inventory_id: best.id,
              name: best.name,
              category: best.category,
              confidence,
              unit_price_cents: best.unit_price_cents,
              protein_per_100g: best.protein_per_100g,
              carbs_per_100g: best.carbs_per_100g,
              fat_per_100g: best.fat_per_100g,
              calories_per_100g: best.calories_per_100g,
            },
    }
  })
}

// Sequential id per step for the frontend list -- the value doesn't need to
// be globally unique, just unique within this one extraction response.
function withStepIds(steps) {
  return (steps || []).map((s, i) => ({
    id: `import-${i}`,
    title: s.title || '',
    description: s.description,
    time_estimate_minutes: s.time_estimate_minutes ?? null,
    step_type: s.step_type === 'cook' ? 'cook' : 'prep',
  }))
}

async function importFromUrl(url) {
  const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Fit4SureRecipeImport/1.0)' } })
  if (!pageRes.ok) throw new Error(`Could not fetch page (status ${pageRes.status})`)
  const html = await pageRes.text()

  const jsonLd = findRecipeJsonLd(html)
  const extracted = jsonLd
    ? await normalizeJsonLdRecipe(jsonLd)
    : await extractFromText(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))

  const ingredients = await matchIngredientsToInventory(extracted.ingredients || [])
  const image = findImageUrl(html, jsonLd)
  return { ...extracted, steps: withStepIds(extracted.steps), ingredients, image, source: jsonLd ? 'jsonld' : 'text-fallback' }
}

async function importFromImage(base64Data, mimeType) {
  const extracted = await extractFromImage(base64Data, mimeType)
  const ingredients = await matchIngredientsToInventory(extracted.ingredients || [])
  // The input here IS a screenshot (often a Pinterest pin or social share),
  // not a real recipe photo -- showing it back as "the recipe's image"
  // would be misleading, so this path never sets one.
  return { ...extracted, steps: withStepIds(extracted.steps), ingredients, image: null, source: 'vision' }
}

module.exports = { importFromUrl, importFromImage, matchIngredientsToInventory }
