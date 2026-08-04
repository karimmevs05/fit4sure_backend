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

function significantWords(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w))
  );
}

// How many words in the candidate description aren't in the query -- e.g.
// for query "chicken breast", "Chicken, breast, boneless, skinless, raw"
// scores 1 ("boneless"/"skinless" both count) while "Chicken breast tenders,
// breaded, uncooked" scores 3. Lower is a plainer, more representative match.
function embellishmentScore(query, description) {
  const queryWords = significantWords(query);
  const descWords = significantWords(description);
  let extra = 0;
  for (const w of descWords) if (!queryWords.has(w)) extra++;
  return extra;
}

// Runs one USDA search and, among up to `pageSize` results, picks the one
// with a complete macro set that's the plainest match for the query (fewest
// extra descriptive words) -- the top hit by USDA's own relevance ranking is
// sometimes a specific preparation (breaded, pickled, deli-sliced) even
// though a same-relevance plain/raw version is a few rows down.
async function searchOnce(query, dataType) {
  const params = { query, api_key: USDA_API_KEY, pageSize: 5 };
  if (dataType) params.dataType = dataType;

  const response = await axios.get(USDA_BASE_URL, { params, timeout: 5000 });

  const foods = response.data.foods || [];
  let best = null;
  let bestScore = Infinity;
  for (const food of foods) {
    const nutrients = extractNutrients(food.foodNutrients);
    if (!nutrients) continue;
    const score = embellishmentScore(query, food.description);
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

    let match = null;
    for (const attempt of attempts) {
      match = await attempt();
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
