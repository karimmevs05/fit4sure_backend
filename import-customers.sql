-- One-time customer import from order history
-- Segmentation logic:
-- Active: ordered in week of 7.12 (July 15-18, 2026)
-- Lead: never ordered

-- Update all customers with their real order history data
UPDATE customers
SET
  total_meals_ordered = (
    SELECT COALESCE(SUM(ot.total_meals), 0)
    FROM order_totals ot
    WHERE ot.customer_id = customers.id
  ),
  weeks_active = (
    SELECT COALESCE(COUNT(DISTINCT ot.menu_id), 0)
    FROM order_totals ot
    WHERE ot.customer_id = customers.id
  ),
  last_order_date = (
    SELECT MAX(m.created_at)
    FROM order_totals ot
    JOIN menus m ON ot.menu_id = m.id
    WHERE ot.customer_id = customers.id
  ),
  lifetime_value_cents = (
    SELECT CAST(COALESCE(SUM(ot.total_meals), 0) * 15 * 100 AS INTEGER)
    FROM order_totals ot
    WHERE ot.customer_id = customers.id
  ),
  sales_pipeline_stage = CASE
    WHEN EXISTS (
      SELECT 1 FROM order_totals ot
      JOIN menus m ON ot.menu_id = m.id
      WHERE ot.customer_id = customers.id
      AND m.created_at::date BETWEEN '2026-07-15' AND '2026-07-18'
    ) THEN 'active'
    ELSE 'lead'
  END,
  conversion_probability = CASE
    WHEN EXISTS (
      SELECT 1 FROM order_totals ot
      JOIN menus m ON ot.menu_id = m.id
      WHERE ot.customer_id = customers.id
      AND m.created_at::date BETWEEN '2026-07-15' AND '2026-07-18'
    ) THEN 95
    ELSE 20
  END,
  engagement_score = CASE
    WHEN EXISTS (
      SELECT 1 FROM order_totals ot
      JOIN menus m ON ot.menu_id = m.id
      WHERE ot.customer_id = customers.id
      AND m.created_at::date BETWEEN '2026-07-15' AND '2026-07-18'
    ) THEN 90
    ELSE 0
  END,
  days_since_last_contact = 0;

-- Verify the import
SELECT
  sales_pipeline_stage,
  COUNT(*) as count,
  ROUND(AVG(conversion_probability), 0) as avg_conversion,
  ROUND(AVG(total_meals_ordered), 0) as avg_meals,
  SUM(lifetime_value_cents) as total_ltv
FROM customers
GROUP BY sales_pipeline_stage
ORDER BY
  CASE
    WHEN sales_pipeline_stage = 'active' THEN 1
    WHEN sales_pipeline_stage = 'inactive' THEN 2
    ELSE 3
  END;
