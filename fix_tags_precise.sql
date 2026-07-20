-- Precise fix for customer pipeline tags
-- Week of 7.12 ONLY = ACTIVE
-- Everyone else with orders = PROSPECT_LOST
-- Never ordered = PROSPECT

BEGIN;

-- Step 1: Reset all to prospect baseline
UPDATE customers SET
  sales_pipeline_stage = 'prospect',
  conversion_probability = 0,
  engagement_score = 0,
  days_since_last_contact = 365;

-- Step 2: Calculate total meals for each customer
WITH customer_totals AS (
  SELECT customer_id, SUM(quantity) as total_meals
  FROM orders
  GROUP BY customer_id
)
UPDATE customers c
SET
  sales_pipeline_stage = CASE
    -- Check if customer has ANY orders in Week of 7.12
    WHEN c.id IN (
      SELECT DISTINCT o.customer_id
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE m.week_label = 'Week of 7.12'
    ) THEN 'active'
    -- Has orders but NOT in Week of 7.12
    WHEN c.id IN (SELECT customer_id FROM customer_totals) THEN 'prospect_lost'
    -- No orders at all
    ELSE 'prospect'
  END,
  conversion_probability = CASE
    -- Active (Week 7.12)
    WHEN c.id IN (
      SELECT DISTINCT o.customer_id
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE m.week_label = 'Week of 7.12'
    ) THEN 100
    -- Past customers (prospect_lost)
    WHEN c.id IN (SELECT customer_id FROM customer_totals) THEN
      CASE
        WHEN (SELECT total_meals FROM customer_totals WHERE customer_id = c.id) > 50 THEN 35
        WHEN (SELECT total_meals FROM customer_totals WHERE customer_id = c.id) > 30 THEN 20
        ELSE 10
      END
    -- Never ordered
    ELSE 5
  END,
  engagement_score = CASE
    -- Active (Week 7.12)
    WHEN c.id IN (
      SELECT DISTINCT o.customer_id
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE m.week_label = 'Week of 7.12'
    ) THEN 95
    -- Past customers (prospect_lost)
    WHEN c.id IN (SELECT customer_id FROM customer_totals) THEN
      CASE
        WHEN (SELECT total_meals FROM customer_totals WHERE customer_id = c.id) > 50 THEN 65
        WHEN (SELECT total_meals FROM customer_totals WHERE customer_id = c.id) > 30 THEN 40
        ELSE 20
      END
    -- Never ordered
    ELSE 0
  END,
  days_since_last_contact = CASE
    -- Active (Week 7.12)
    WHEN c.id IN (
      SELECT DISTINCT o.customer_id
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE m.week_label = 'Week of 7.12'
    ) THEN 0
    -- Has orders (but not active)
    WHEN c.id IN (SELECT customer_id FROM customer_totals) THEN
      EXTRACT(DAY FROM (NOW() - MAX((SELECT MAX(m.created_at)
        FROM orders o2
        JOIN menus m ON o2.menu_id = m.id
        WHERE o2.customer_id = c.id))))::integer
    -- Never ordered
    ELSE 365
  END,
  lifetime_value_cents = COALESCE((SELECT total_meals * 1500 FROM customer_totals WHERE customer_id = c.id), 0);

COMMIT;

-- Verify the results
SELECT
  sales_pipeline_stage,
  COUNT(*) as count,
  ROUND(AVG(conversion_probability)::numeric, 0) as avg_conversion,
  ROUND(AVG(engagement_score)::numeric, 0) as avg_engagement,
  SUM(lifetime_value_cents) / 100 as total_ltv_dollars
FROM customers
GROUP BY sales_pipeline_stage
ORDER BY CASE WHEN sales_pipeline_stage = 'active' THEN 0 ELSE 1 END;

-- Show active customers
SELECT '--- ACTIVE CUSTOMERS (Week of 7.12) ---' as info;
SELECT name, (SELECT SUM(quantity) FROM orders WHERE customer_id = c.id) as total_meals
FROM customers c
WHERE sales_pipeline_stage = 'active'
ORDER BY name;
