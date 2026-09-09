-- Structured allergen tags per customer, using the same controlled
-- vocabulary as inventory.allergens (see allergenTagger.js: dairy, gluten,
-- soy, egg, shellfish, fish, tree_nuts, peanuts, sesame) -- separate from
-- the existing free-text dietary_restrictions field, so a customer's
-- allergies can eventually be matched exactly against a recipe's own
-- derived allergen tags instead of relying on free-text string matching.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS allergens TEXT[];
