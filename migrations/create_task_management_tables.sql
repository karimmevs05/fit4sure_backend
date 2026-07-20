-- Production Plans (Weekly planning)
CREATE TABLE IF NOT EXISTS production_plans (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PUBLISHED, IN_PROGRESS, COMPLETE
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Production Schedule (What to prep each day)
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

-- Production Tasks (Real-time tracking)
CREATE TABLE IF NOT EXISTS production_tasks (
  id SERIAL PRIMARY KEY,
  schedule_id INT REFERENCES production_schedule(id) ON DELETE CASCADE,
  station VARCHAR(50) NOT NULL, -- PROTEIN_PREP, VEG_PREP, COOKING, PACKAGING
  status VARCHAR(20) DEFAULT 'TODO', -- TODO, IN_PROGRESS, DONE
  actual_quantity INT,
  actual_time_minutes INT,
  assigned_staff_id INT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  logged_by INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Production Issues (Problem logging)
CREATE TABLE IF NOT EXISTS production_issues (
  id SERIAL PRIMARY KEY,
  task_id INT REFERENCES production_tasks(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL, -- EQUIPMENT, QUALITY, WASTE, LABOR, OTHER
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH
  description TEXT NOT NULL,
  resolution TEXT,
  logged_at TIMESTAMP DEFAULT NOW()
);

-- Waste Tracking
CREATE TABLE IF NOT EXISTS waste_log (
  id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  waste_type VARCHAR(50) NOT NULL, -- BREAKAGE, SPOILAGE, PORTIONING, OVER_PREP
  quantity DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20), -- lbs, units, etc
  estimated_cost DECIMAL(10, 2) DEFAULT 0,
  root_cause TEXT,
  logged_at TIMESTAMP DEFAULT NOW()
);

-- Labor Tracking
CREATE TABLE IF NOT EXISTS labor_log (
  id SERIAL PRIMARY KEY,
  staff_id INT,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- HEAD_CHEF, LINE_COOK, PREP_STAFF, PACKAGING
  hours_worked DECIMAL(10, 2) NOT NULL,
  cost DECIMAL(10, 2) NOT NULL,
  logged_date DATE NOT NULL
);

-- Labor Plan (Forecast/allocation)
CREATE TABLE IF NOT EXISTS labor_plan (
  id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  target_hours DECIMAL(10, 2),
  budget_cost DECIMAL(10, 2),
  assigned_staff_ids TEXT -- JSON array of staff IDs
);

-- Procurement Plan (Auto-generated ingredient orders)
CREATE TABLE IF NOT EXISTS procurement_plan (
  id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES production_plans(id) ON DELETE CASCADE,
  supplier_id INT,
  supplier_name VARCHAR(100),
  order_date DATE NOT NULL,
  delivery_date DATE NOT NULL,
  total_cost DECIMAL(10, 2) DEFAULT 0,
  items_json TEXT, -- JSON array of {ingredient, quantity, unit, cost}
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ORDERED, DELIVERED, CANCELLED
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ingredient Prices (for procurement calculations)
CREATE TABLE IF NOT EXISTS ingredient_prices (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  cost_per_unit DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20), -- lbs, units, oz, etc
  supplier_id INT,
  supplier_name VARCHAR(100),
  last_price_update DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- Create indexes for performance
CREATE INDEX idx_production_plans_dates ON production_plans(week_start, week_end);
CREATE INDEX idx_production_schedule_plan ON production_schedule(plan_id);
CREATE INDEX idx_production_schedule_date ON production_schedule(created_date);
CREATE INDEX idx_production_tasks_schedule ON production_tasks(schedule_id);
CREATE INDEX idx_production_tasks_status ON production_tasks(status);
CREATE INDEX idx_production_issues_plan ON production_issues(task_id);
CREATE INDEX idx_waste_log_plan ON waste_log(plan_id);
CREATE INDEX idx_labor_log_plan ON labor_log(plan_id);
CREATE INDEX idx_procurement_plan ON procurement_plan(plan_id);
CREATE INDEX idx_ingredient_prices ON ingredient_prices(name, supplier_name);
