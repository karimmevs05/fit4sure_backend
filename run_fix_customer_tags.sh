#!/bin/bash

# Fix customer pipeline tags - run this locally on your machine
# Requires: psql, DATABASE_URL environment variable (or fit4sure database access)

echo "🔄 Fixing customer pipeline tags..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Reset all to prospect
psql "$DATABASE_URL" -c "UPDATE customers SET sales_pipeline_stage = 'prospect', conversion_probability = 0, engagement_score = 0, days_since_last_contact = 0;" 2>/dev/null || psql fit4sure -c "UPDATE customers SET sales_pipeline_stage = 'prospect', conversion_probability = 0, engagement_score = 0, days_since_last_contact = 0;"
echo "✅ Reset all customers to prospect"

# Mark customers with ANY orders as prospect_lost
psql "$DATABASE_URL" << 'ENDSQL' 2>/dev/null || psql fit4sure << 'ENDSQL'
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
ENDSQL
echo "✅ Marked customers with past orders as prospect_lost"

# Mark ONLY Week of 7.12 customers as ACTIVE
psql "$DATABASE_URL" << 'ENDSQL' 2>/dev/null || psql fit4sure << 'ENDSQL'
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
ENDSQL
echo "✅ Marked Week of 7.12 customers as ACTIVE"

# Show results
echo ""
echo "📊 FINAL STATUS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

psql "$DATABASE_URL" << 'ENDSQL' 2>/dev/null || psql fit4sure << 'ENDSQL'
SELECT
  sales_pipeline_stage,
  COUNT(*) as count,
  ROUND(SUM(COALESCE((SELECT SUM(quantity) FROM orders WHERE customer_id = c.id), 0))::numeric, 0) as total_meals
FROM customers c
GROUP BY sales_pipeline_stage
ORDER BY CASE WHEN sales_pipeline_stage = 'active' THEN 0 ELSE 1 END;

-- Show active customers
SELECT '🟢 ACTIVE CUSTOMERS:' as status;
SELECT name FROM customers WHERE sales_pipeline_stage = 'active' ORDER BY name;
ENDSQL

echo ""
echo "✅ Pipeline tags fixed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
