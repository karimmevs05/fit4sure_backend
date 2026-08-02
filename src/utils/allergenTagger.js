// Keyword-based allergen detection. Scans an ingredient name for known
// trigger words and returns the matching allergen tags. Not a substitute
// for a real label review on packaged goods, but reliable for whole-food
// kitchen inventory.

const ALLERGEN_KEYWORDS = {
  dairy: ['milk', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'butter', 'cream', 'yogurt', 'yoghurt', 'ghee', 'whey', 'casein', 'ricotta', 'feta'],
  gluten: ['wheat', 'flour', 'bread', 'pasta', 'noodle', 'barley', 'rye', 'couscous', 'soy sauce', 'teriyaki', 'panko', 'breadcrumb', 'tortilla', 'bun'],
  soy: ['soy', 'tofu', 'edamame', 'tempeh', 'miso'],
  egg: ['egg', 'mayonnaise', 'mayo'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster'],
  fish: ['salmon', 'tuna', 'tilapia', 'cod', 'anchovy', 'anchovies', 'fish sauce', 'halibut', 'mahi', 'trout'],
  tree_nuts: ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'pine nut'],
  peanuts: ['peanut'],
  sesame: ['sesame', 'tahini'],
};

function detectAllergens(ingredientName) {
  if (!ingredientName) return [];
  const nameLower = ingredientName.toLowerCase();
  const matches = [];
  for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (keywords.some(kw => nameLower.includes(kw))) {
      matches.push(allergen);
    }
  }
  return matches;
}

module.exports = { detectAllergens, ALLERGEN_KEYWORDS };
