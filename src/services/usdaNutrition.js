const axios = require('axios');

const USDA_API_KEY = process.env.USDA_API_KEY;
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// Strips packaging/count/size noise that hurts USDA search relevance --
// e.g. "Multi Bell Sweet Peppers, 6 ct." -> "Multi Bell Sweet Peppers".
// Keeps the actual food words untouched, so the result is still a real
// USDA-sourced match for (a cleaner version of) the same product name.
function cleanFoodName(name) {
  return name
    .replace(/\([^)]*\)/g, ' ') // parenthetical asides
    .replace(/,?\s*\d+(\.\d+)?\s*(ct|count|pk|pack|pcs?|pieces?)\.?\b/gi, ' ') // pack/count
    .replace(/,?\s*\d+(\.\d+)?\s*(fl\s?oz|oz|lbs?|kg|g|ml|l)\.?\b/gi, ' ') // weight/volume
    .replace(/\//g, ' ') // slash-joined alternatives (e.g. "Pork Shoulder/Butt") 400 the USDA search API
    .replace(/,+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Foundation/SR Legacy are USDA's canonical reference data (e.g. "Peppers,
// bell, red, raw") -- the most representative per-100g macros for a plain
// ingredient. Branded/Survey entries are real products but can skew toward
// one specific preparation (e.g. "pickled"), so they're only used as a
// last resort, not preferred just because they complete the result set.
const CANONICAL_DATA_TYPES = 'Foundation,SR Legacy';

const STOPWORDS = new Set(['a', 'an', 'and', 'or', 'the', 'of', 'with', 'raw']);

// Lightweight singularization so "Chicken Thighs" (a typical inventory/
// receipt name) matches "chicken thigh, meat and skin" (USDA's own entries
// are almost always singular) on equal footing. Without this, the plain
// correct match scored *worse* than a "Chicken, skin (drumsticks and
// thighs), raw" entry -- literally just skin -- purely because that
// pathological description happened to contain the exact plural "thighs"
// while the correct one used singular "thigh". Real production bug: an
// inventory item ended up with 9.58g protein / 44.2g fat per 100g (a skin
// profile) instead of ~17g protein / 13g fat (real chicken thigh).
function singularize(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2)
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

// Words indicating the food has been transformed into a fundamentally
// different product form -- a single one of these buried among otherwise
// few "extra" words was enough to make a wrong match look "plainer" than
// the real one (real bug: query "Tomatoes" ranked "Tomato powder" above
// "Tomatoes, red, ripe, raw" purely on extra-word count, since "powder" is
// only 1 extra word vs "red, ripe" being 2). Heavily penalized unless the
// query itself asked for that form.
const FORM_PENALTY_WORDS = new Set([
  'powder', 'flour', 'extract', 'juice', 'sauce', 'oil', 'dried', 'dehydrated',
  'concentrate', 'syrup', 'paste', 'chip', 'flake', 'bagel', 'chip', 'cracker',
])

function significantWordList(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .map(singularize)
}

// USDA descriptions always lead with the base food identity, in order
// ("Chicken, thigh, meat and skin, raw" / "Egg, whole, raw"), so whether
// the query's words line up with the description's words *in the same
// position* is a far stronger signal of "is this actually the same food"
// than just counting extra words. Real bug this fixes: "Chicken Thighs"
// matched "Chicken, skin (drumsticks and thighs), raw" -- chicken SKIN,
// not chicken thigh meat -- because that description happened to be
// shorter (fewer "extra" words) even though its own primary identity
// (skin) isn't what was asked for; "Eggs" matched "Bagels, egg" the same
// way. Lower score is a better match.
function matchScore(query, description) {
  const queryWords = significantWordList(query)
  const descWords = significantWordList(description)
  const queryWordSet = new Set(queryWords)
  const descWordSet = new Set(descWords)

  let positionMismatch = 0
  for (let i = 0; i < queryWords.length; i++) {
    if (descWords[i] !== queryWords[i]) positionMismatch++
  }
  const missing = queryWords.filter((w) => !descWordSet.has(w)).length
  const extra = descWords.filter((w) => !queryWordSet.has(w)).length
  const formPenalty = descWords.filter((w) => FORM_PENALTY_WORDS.has(w) && !queryWordSet.has(w)).length

  return positionMismatch * 1000 + missing * 200 + formPenalty * 100 + extra
}

// Runs one USDA search and, among up to `pageSize` results, picks the one
// with a complete macro set that's the plainest match for the query (fewest
// extra descriptive words) -- the top hit by USDA's own relevance ranking is
// sometimes a specific preparation (breaded, pickled, deli-sliced) even
// though a same-relevance plain/raw version is a few rows down.
async function searchOnce(query, dataType) {
  const params = { query, api_key: USDA_API_KEY, pageSize: 15 };
  if (dataType) params.dataType = dataType;

  const response = await axios.get(USDA_BASE_URL, { params, timeout: 5000 });

  const foods = response.data.foods || [];
  let best = null;
  let bestScore = Infinity;
  for (const food of foods) {
    const nutrients = extractNutrients(food.foodNutrients);
    if (!nutrients) continue;
    // Some branded entries report all four macros as exactly 0 -- a data
    // gap in USDA's branded dataset, not a real zero-calorie/zero-everything
    // food. Treat as incomplete so a real candidate (or a later fallback
    // attempt) gets picked instead of silently storing broken data.
    if (nutrients.protein === 0 && nutrients.carbs === 0 && nutrients.fat === 0 && nutrients.calories === 0) continue;
    const score = matchScore(query, food.description);
    if (score < bestScore) {
      bestScore = score;
      best = { food, nutrients };
    }
  }

  if (!best) return null;
  return {
    fdcId: best.food.fdcId,
    name: best.food.description,
    protein_per_100g: best.nutrients.protein,
    carbs_per_100g: best.nutrients.carbs,
    fat_per_100g: best.nutrients.fat,
    calories_per_100g: best.nutrients.calories,
  };
}

/**
 * Search USDA FoodData Central for ingredient nutrition info.
 * Returns protein, carbs, fat, calories per 100g, all sourced from USDA.
 * Falls back through, in order: canonical data restricted to the original
 * name, any data type on the original name, canonical data on a cleaned-up
 * name, then any data type on the cleaned name -- so a messy receipt-derived
 * name still lands on the most representative match available before
 * settling for a noisier one, rather than giving up.
 */
async function searchUSDANutrition(ingredientName) {
  try {
    if (!USDA_API_KEY) {
      console.warn('⚠️  USDA_API_KEY not set. Get one free at https://fdc.nal.usda.gov/api-key-signup.html');
      return null;
    }

    console.log(`🔍 Searching USDA for: ${ingredientName}`);
    const cleaned = cleanFoodName(ingredientName);
    const hasCleaned = cleaned && cleaned.toLowerCase() !== ingredientName.trim().toLowerCase();

    const attempts = [
      () => searchOnce(ingredientName, CANONICAL_DATA_TYPES),
      () => searchOnce(ingredientName),
      ...(hasCleaned
        ? [
            () => searchOnce(cleaned, CANONICAL_DATA_TYPES),
            () => searchOnce(cleaned),
          ]
        : []),
    ];

    // Each attempt is tried independently -- a request error (e.g. USDA's
    // search API 400ing on a raw "/" before the cleaned-name fallback strips
    // it) must not abort the remaining, potentially-working attempts.
    let match = null;
    for (const attempt of attempts) {
      try {
        match = await attempt();
      } catch (err) {
        console.warn(`   USDA search attempt failed (${err.message}), trying next fallback...`);
        match = null;
      }
      if (match) break;
    }

    if (!match) {
      console.log(`❌ No USDA match with complete macros for: ${ingredientName}`);
      return null;
    }

    console.log(`✅ Found USDA match: ${match.name}`);
    return match;
  } catch (error) {
    console.error('Error searching USDA:', error.message);
    return null;
  }
}

/**
 * Extract macros from USDA nutrient array
 */
function extractNutrients(foodNutrients) {
  if (!Array.isArray(foodNutrients)) return null;

  const nutrients = {};

  // USDA nutrient IDs:
  // 1003 = protein (g)
  // 1005 = carbs (g)
  // 1004 = fat (g)
  // 1008 = energy (kcal) -- the usual id, but some Foundation-dataset foods
  //   omit it and only report the calculated Atwater energy values instead:
  //   2047 = Energy, Atwater General Factors (standard 4-4-9 label formula)
  //   2048 = Energy, Atwater Specific Factors (food-specific coefficients)
  let calories2047, calories2048;

  for (const nutrient of foodNutrients) {
    const value = nutrient.value;

    if (nutrient.nutrientId === 1003) {
      nutrients.protein = parseFloat(value);
    } else if (nutrient.nutrientId === 1005) {
      nutrients.carbs = parseFloat(value);
    } else if (nutrient.nutrientId === 1004) {
      nutrients.fat = parseFloat(value);
    } else if (nutrient.nutrientId === 1008) {
      nutrients.calories = parseFloat(value);
    } else if (nutrient.nutrientId === 2047) {
      calories2047 = parseFloat(value);
    } else if (nutrient.nutrientId === 2048) {
      calories2048 = parseFloat(value);
    }
  }

  if (nutrients.calories === undefined) {
    nutrients.calories = calories2047 !== undefined ? calories2047 : calories2048;
  }

  // Verify we got all macros
  if (
    nutrients.protein !== undefined &&
    nutrients.carbs !== undefined &&
    nutrients.fat !== undefined &&
    nutrients.calories !== undefined
  ) {
    return nutrients;
  }

  return null;
}

module.exports = {
  searchUSDANutrition,
};
