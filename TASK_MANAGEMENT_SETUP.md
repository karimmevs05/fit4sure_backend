# Task Management System - Integration Guide

## Overview
The Task Management system auto-generates production plans from customer orders, maps to an operational calendar (Sat prep → Sun cook → Mon deliver), calculates procurement needs, and provides real-time task tracking.

## Backend Integration

### 1. Database Setup
Run the migration to create all necessary tables:

```bash
psql -U postgres -d fit4sure -f migrations/create_task_management_tables.sql
```

Tables created:
- `production_plans` - Weekly production cycles
- `production_schedule` - Daily task breakdown
- `production_tasks` - Real-time task tracking
- `production_issues` - Problem logging
- `waste_log` - Waste tracking
- `labor_log` - Hours worked
- `labor_plan` - Labor forecasting
- `procurement_plan` - Supplier orders
- `ingredient_prices` - Ingredient costs

### 2. API Endpoints

**Auto-Generate Production Plan:**
```
POST /api/admin/task-management-auto/auto-generate-plan
Body: {
  "week_start": "2025-08-03",
  "week_end": "2025-08-09",
  "menu_ids": [1, 2, 3, 4, 5]
}
```

Response includes:
- Production plan with summary
- Schedule breakdown by day/station
- Procurement orders grouped by supplier
- Labor plan by role

**Get Full Timeline:**
```
GET /api/admin/task-management-auto/production-plan/:id/full-timeline
```

**Get Procurement Plan:**
```
GET /api/admin/task-management-auto/procurement-plan/:plan_id
```

**Update Procurement Status:**
```
PUT /api/admin/task-management-auto/procurement-plan/:id/status
Body: { "status": "ORDERED" | "DELIVERED" | "CANCELLED" }
```

**Production Tasks (Real-time):**
```
POST /api/admin/task-management/production-tasks
PUT /api/admin/task-management/production-tasks/:id
GET /api/admin/task-management/production-tasks/date/:date
```

**Daily Summary:**
```
GET /api/admin/task-management/daily-summary/:plan_id/:date
```

**Weekly Review:**
```
GET /api/admin/task-management/weekly-review/:plan_id
```

### 3. Test Endpoints

Check if tables exist:
```
GET /api/admin/task-management-test/check-tables
```

Get sample data:
```
GET /api/admin/task-management-test/test-data
```

## Frontend Integration

### 1. Access Task Management
Navigate to `/task-management` in the admin dashboard.

### 2. Workflow

**Tab 1: Weekly Timeline**
- Displays 7-day operational calendar
- Shows production tasks scheduled for each day
- Shows procurement orders with supplier info
- Shows labor hours allocated

**Tab 2: Procurement**
- View all supplier orders for the week
- See order dates, delivery dates, costs
- Update order status (Pending → Ordered → Delivered)

**Tab 3: Labor & Costs**
- Weekly labor cost forecast
- Breakdown by role (Head Chef, Line Cook, Prep Staff, Packaging)
- Daily cost average
- Total COGS projection (Food + Labor)

**Tab 4: Daily Board**
- Kanban board with task columns (TODO → In Progress → Done)
- Real-time task tracking
- Start/stop timers
- Quick issue logging

## Data Flow

```
Week 0: Menu Selected
  ↓ POST /auto-generate-plan
System analyzes:
  - Active customers (58)
  - Recent orders (count from past 7 days)
  - Selected menus (5 items)
  ↓
Auto-calculates:
  - Total expected meals
  - Production schedule (Sat prep 25%, Sun cook 35%, Wed prep/cook 20%, Fri packaging 20%)
  - Ingredient requirements
  - Supplier orders & costs
  - Labor needs by role
  ↓
Stores in database & returns full plan
  ↓
Frontend displays timeline with all production + procurement + labor
  ↓
Team executes from daily board
  ↓
Real-time data flows back (tasks, waste, issues, actual hours)
  ↓
Dashboard KPIs & Weekly Review update automatically
```

## Configuration

### Ingredient Supplier Mapping
Edit `taskManagementAuto.js` `supplierMap` object to match your suppliers:

```javascript
const supplierMap = {
  'Chicken': { supplier: 'FreshMeat Co', cost: 2.45, unit: 'lbs' },
  'Ground Beef': { supplier: 'Premium Proteins', cost: 3.65, unit: 'lbs' },
  // ... add all your ingredients
}
```

### Labor Rates
Edit `createLaborPlan()` function to set your hourly rates:

```javascript
const laborRoles = [
  { role: 'HEAD_CHEF', target_hours: Math.ceil(totalMeals / 11), hourly_rate: 28 },
  { role: 'LINE_COOK', target_hours: Math.ceil(totalMeals / 22), hourly_rate: 18 },
  // ... edit rates as needed
]
```

## Operational Calendar (Fixed)

The system maps production to a repeating weekly cycle:

- **Saturday** (PREP): Vegetable prep, portioning
- **Sunday** (COOK): Cook proteins, assemble meals
- **Monday** (DELIVERY): Pack & deliver main order
- **Tuesday** (ADMIN/SHOPPING): Shopping, restocking, admin
- **Wednesday** (PREP_COOK): Mid-week prep/cook
- **Thursday** (DELIVERY): Mid-week delivery
- **Friday** (ADMIN): Weekly wrap-up, planning

Adjust dates in `generateOperationalSchedule()` function if your cycle differs.

## Real-time Data Sync

Production data automatically flows to:
- **Dashboard** - Updated KPIs (Gross Margin, Food Cost %, Weekly COGS, Active Components, Ingredient Overlap)
- **Operational Optimization** - Station Efficiency, Labor Cost %, Throughput, Waste Rate
- **Weekly Review** - Station performance, waste breakdown, labor summary, issues

## Troubleshooting

**Tables don't exist:**
```bash
psql -U postgres -d fit4sure -f migrations/create_task_management_tables.sql
```

**API returns 500 errors:**
- Check backend logs for SQL errors
- Run `GET /api/admin/task-management-test/check-tables` to verify tables exist

**Frontend shows loading spinner forever:**
- Check browser console for network errors
- Verify backend is running: `curl http://localhost:3000/health`
- Check CORS is enabled in app.js

**No data appears:**
- Make sure you have active customers in the database
- Verify menu IDs exist in `menus` table
- Run `GET /api/admin/task-management-test/test-data` to see sample data

## Next Steps

1. ✅ Run migration to create tables
2. ✅ Configure supplier mapping (taskManagementAuto.js)
3. ✅ Set labor rates (taskManagementAuto.js)
4. ✅ Test endpoints with Postman
5. ✅ Access /task-management from admin dashboard
6. ✅ Submit first menu to auto-generate plan
7. ✅ Execute from daily board
8. ✅ Watch KPIs update in Dashboard & Operational Optimization

## API Request Examples

### Generate Plan
```bash
curl -X POST http://localhost:3000/api/admin/task-management-auto/auto-generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "week_start": "2025-08-03",
    "week_end": "2025-08-09",
    "menu_ids": [1, 2, 3, 4, 5]
  }'
```

### Get Timeline
```bash
curl http://localhost:3000/api/admin/task-management-auto/production-plan/1/full-timeline
```

### Update Procurement Status
```bash
curl -X PUT http://localhost:3000/api/admin/task-management-auto/procurement-plan/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "ORDERED"}'
```

### Get Daily Summary
```bash
curl http://localhost:3000/api/admin/task-management/daily-summary/1/2025-08-03
```
