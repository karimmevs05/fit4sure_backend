-- Fix customer pipeline tags based on 2026 ordering history
-- Only Week of 7.12 customers = ACTIVE
-- All others with orders = PROSPECT_LOST
-- Never ordered = PROSPECT

-- First, reset all to prospect
UPDATE customers SET sales_pipeline_stage = 'prospect', conversion_probability = 0, engagement_score = 0;

-- Mark customers with ANY 2026 orders as prospect_lost (they'll be corrected if they're in week 7.12)
UPDATE customers c
SET sales_pipeline_stage = 'prospect_lost',
    conversion_probability = CASE
      WHEN total_meals > 50 THEN 40
      WHEN total_meals > 30 THEN 25
      ELSE 15
    END,
    engagement_score = CASE
      WHEN total_meals > 50 THEN 60
      WHEN total_meals > 30 THEN 40
      ELSE 20
    END,
    lifetime_value_cents = COALESCE(total_meals * 1500, 0)
FROM (
  SELECT customer_id, SUM(quantity) as total_meals
  FROM orders
  GROUP BY customer_id
) o
WHERE c.id = o.customer_id;

-- Now mark ONLY Week of 7.12 customers as ACTIVE
UPDATE customers c
SET sales_pipeline_stage = 'active',
    conversion_probability = 100,
    engagement_score = 95,
    days_since_last_contact = 0
WHERE c.id IN (
  SELECT DISTINCT o.customer_id
  FROM orders o
  JOIN menus m ON o.menu_id = m.id
  WHERE m.week_label = 'Week of 7.12'
);

-- Verify the changes
SELECT name, sales_pipeline_stage, conversion_probability, engagement_score, days_since_last_contact,
       (SELECT SUM(quantity) FROM orders WHERE customer_id = c.id) as total_meals
FROM customers c
ORDER BY sales_pipeline_stage DESC, total_meals DESC;
