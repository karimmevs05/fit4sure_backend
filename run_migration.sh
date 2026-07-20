#!/bin/bash

# Task Management Migration Script
# Run this to set up all tables for the production planning system

echo "🚀 Fit4Sure Task Management Migration"
echo "======================================"

# Check if PostgreSQL is running
if ! psql --version > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not installed or not in PATH"
    exit 1
fi

# Try to connect with the DATABASE_URL from .env
# Extract credentials from DATABASE_URL=postgresql://localhost/fit4sure
DATABASE_URL="postgresql://localhost/fit4sure"

echo "Connecting to database: $DATABASE_URL"
echo ""

# Run the migration using psql with default connection
# psql will use your local user account (no need for postgres role)
psql "$DATABASE_URL" << EOF

-- ============================================================================
-- Production Plans (Weekly production cycles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS production_plans (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Production Schedule (What to prep each day)
-- ============================================================================
CREATE TABLE IF NOT EXISTS production_schedule (
  id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  meal_id INT REFERENCES menus(id),
  target_quantity INT NOT NULL,
  assigned_staff_id INT,
  target_time_minutes INT NOT NULL,
  notes TEXT,
  created_date DATE NOT NULL
);

-- ============================================================================
-- Production Tasks (Real-time tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS production_tasks (
  id SERIAL PRIMARY KEY,
  schedule_id INT REFERENCES production_schedule(id) ON DELETE CASCADE,
  station VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'TODO',
  actual_quantity INT,
  actual_time_minutes INT,
  assigned_staff_id INT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  logged_by INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Production Issues (Problem logging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS production_issues (
  id SERIAL PRIMARY KEY,
  task_id INT REFERENCES production_tasks(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  description TEXT NOT NULL,
  resolution TEXT,
  logged_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Waste Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS waste_log (
  id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  waste_type VARCHAR(50) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20),
  estimated_cost DECIMAL(10, 2) DEFAULT 0,
  root_cause TEXT,
  logged_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Labor Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS labor_log (
  id SERIAL PRIMARY KEY,
  staff_id INT,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  hours_worked DECIMAL(10, 2) NOT NULL,
  cost DECIMAL(10, 2) NOT NULL,
  logged_date DATE NOT NULL
);

-- ============================================================================
-- Labor Plan (Forecast/allocation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS labor_plan (
  id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  target_hours DECIMAL(10, 2),
  budget_cost DECIMAL(10, 2),
  assigned_staff_ids TEXT
);

-- ============================================================================
-- Procurement Plan (Auto-generated ingredient orders)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurement_plan (
  id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  supplier_id INT,
  supplier_name VARCHAR(100),
  order_date DATE NOT NULL,
  delivery_date DATE NOT NULL,
  total_cost DECIMAL(10, 2) DEFAULT 0,
  items_json TEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Ingredient Prices (for procurement calculations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ingredient_prices (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  cost_per_unit DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20),
  supplier_id INT,
  supplier_name VARCHAR(100),
  last_price_update DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- ============================================================================
-- Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_production_plans_dates ON production_plans(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_production_schedule_plan ON production_schedule(plan_id);
CREATE INDEX IF NOT EXISTS idx_production_schedule_date ON production_schedule(created_date);
CREATE INDEX IF NOT EXISTS idx_production_tasks_schedule ON production_tasks(schedule_id);
CREATE INDEX IF NOT EXISTS idx_production_tasks_status ON production_tasks(status);
CREATE INDEX IF NOT EXISTS idx_production_issues_plan ON production_issues(task_id);
CREATE INDEX IF NOT EXISTS idx_waste_log_plan ON waste_log(plan_id);
CREATE INDEX IF NOT EXISTS idx_labor_log_plan ON labor_log(plan_id);
CREATE INDEX IF NOT EXISTS idx_procurement_plan ON procurement_plan(plan_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_prices ON ingredient_prices(name, supplier_name);

EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "Tables created:"
    echo "  ✓ production_plans"
    echo "  ✓ production_schedule"
    echo "  ✓ production_tasks"
    echo "  ✓ production_issues"
    echo "  ✓ waste_log"
    echo "  ✓ labor_log"
    echo "  ✓ labor_plan"
    echo "  ✓ procurement_plan"
    echo "  ✓ ingredient_prices"
    echo ""
    echo "Next steps:"
    echo "  1. Restart your backend: npm start"
    echo "  2. Access /task-management from admin dashboard"
    echo "  3. Test with GET /api/admin/task-management-test/check-tables"
else
    echo ""
    echo "❌ Migration failed. Check the error above."
    exit 1
fi
