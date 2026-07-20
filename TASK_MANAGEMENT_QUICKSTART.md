# Task Management System - Quick Start Guide

Your production planning system is fully integrated and ready to use. Follow these steps to get it running with real data.

## Prerequisites
- PostgreSQL running locally
- Node.js installed
- Backend and frontend folders cloned/setup

## Step 1: Create Database Tables
Run the migration to create all production tables:

```bash
cd /Users/karimmevs/Documents/fit4sure_backend
psql fit4sure < task_migration.sql
```

Expected output:
```
CREATE TABLE
CREATE TABLE
...
CREATE INDEX
✅ Tables created successfully
```

## Step 2: Load Meal Count Data
Populate the database with real customer orders from your meal count sheets:

```bash
node load-meal-data.js
```

Expected output:
```
📋 Loading meal count data...

👥 Creating/verifying customers...
  ✓ Alejandro
  ✓ Drew
  ... (11 customers total)

📅 Processing Week of 1.18...
  ✓ Menu created/updated (ID: 1)
  ✓ 5 recipes added
  ✓ Orders created: 9 customers, 45 total meals

📅 Processing Week of 1.25...
  ✓ Menu created/updated (ID: 2)
  ✓ 5 recipes added
  ✓ Orders created: 10 customers, 43 total meals

... (5 weeks total)

✅ Meal data loaded successfully!

📊 Summary:
  • 5 weeks loaded
  • 11 customers created
  • Ready for auto-generation
```

## Step 3: Start Backend Server
```bash
npm start
```

Expected output:
```
Fit4Sure server running on port 3000
```

## Step 4: Start Frontend Development Server
In a new terminal:

```bash
cd /Users/karimmevs/Documents/fit4sure-admin-dashboard
npm run dev
```

## Step 5: Access Task Management Dashboard
Open your browser and go to:
```
http://localhost:5173/task-management
```

You should see:
- ✅ Production plan auto-generated
- ✅ 7-day operational calendar
- ✅ Procurement orders by supplier
- ✅ Labor forecast by role
- ✅ Real-time Kanban task board

## How It Works

### Auto-Generation Workflow
1. **Menu Submitted** → Latest menu week is detected from database
2. **Recipes Loaded** → All recipes for that week are fetched
3. **Customer Orders** → Order totals summed by customer
4. **Production Plan Created** → Mapped to 7-day operational calendar:
   - **Saturday**: Vegetable prep (25% of meals)
   - **Sunday**: Cooking & assembly (35% of meals)
   - **Monday**: Delivery
   - **Tuesday**: Admin & shopping
   - **Wednesday**: Mid-week prep/cook (20% of meals)
   - **Thursday**: Delivery
   - **Friday**: Finalization (20% of meals)

5. **Procurement Auto-Calculated** → Ingredients grouped by supplier
6. **Labor Forecast Generated** → Hours by role (HEAD_CHEF, LINE_COOK, PREP_STAFF, PACKAGING)

### Dashboard Tabs

**Timeline (7-Day Calendar)**
- Shows production activities per day
- Lists recipes to prepare
- Displays procurement needs
- Shows labor allocation

**Procurement**
- Supplier orders with quantities
- Cost projection by supplier
- Delivery dates
- Status tracking

**Labor & Costs**
- Role-based labor forecast
- Hourly breakdown
- Budget cost projection
- Actual vs planned variance

**Daily Board (Kanban)**
- Real-time task tracking
- Columns: TODO → IN_PROGRESS → DONE → PACKAGING
- Drag-drop task management
- Station assignment per task

## API Endpoints

### Auto-Generate Production Plan
```bash
POST http://localhost:3000/api/admin/task-management-auto/auto-generate-plan

# Auto-detects latest menu week
Body: {}

# Or specify week manually
Body: {
  "week_start": "2026-08-03",
  "week_end": "2026-08-09"
}

Response:
{
  "success": true,
  "plan": {
    "id": 1,
    "week_start": "2026-08-03",
    "week_end": "2026-08-09",
    "status": "PENDING"
  },
  "summary": {
    "active_customers": 11,
    "estimated_meals": 258,
    "menu": "Week of 5.31",
    "recipes": 15,
    "ingredients": 15
  },
  "recipes": [...],
  "ingredients": [...],
  "schedule": [...],
  "procurement": {...}
}
```

### Get Production Plan Timeline
```bash
GET http://localhost:3000/api/admin/task-management-auto/production-plan/1/full-timeline

Response:
{
  "plan": {...},
  "timeline": [
    {
      "day": "Saturday",
      "date": "2026-08-03",
      "activity_type": "PREP",
      "production": [...],
      "procurement": [...],
      "notes": "Vegetable prep, portioning, component prep"
    },
    ...
  ],
  "labor_plan": [...],
  "total_procurement_cost": 1200.00
}
```

### Get Procurement Plan
```bash
GET http://localhost:3000/api/admin/task-management-auto/procurement-plan/1

Response:
[
  {
    "id": 1,
    "supplier_name": "Organic Farm",
    "order_date": "2026-08-04",
    "delivery_date": "2026-08-08",
    "total_cost": 250.00,
    "status": "PENDING",
    "items_json": "[{\"ingredient\": \"Broccoli\", \"quantity\": 50, \"unit\": \"lbs\", ...}]"
  },
  ...
]
```

## Updating the Data

### Add New Customer
```sql
INSERT INTO customers (name, sales_pipeline_stage, created_at)
VALUES ('New Customer Name', 'active', NOW());
```

### Update for New Week
Edit `load-meal-data.js` and add a new week object, then re-run:
```bash
node load-meal-data.js
```

### Change Supplier Mapping
Edit the `supplierMap` object in `taskManagementAuto.js` (line ~241):
```javascript
const supplierMap = {
  'Chicken': { supplier: 'FreshMeat Co', cost: 2.45, unit: 'lbs' },
  'Potatoes': { supplier: 'Organic Farm', cost: 0.80, unit: 'lbs' },
  // Add or modify suppliers here
}
```

### Change Labor Rates
Edit `createLaborPlan()` function in `taskManagementAuto.js` (line ~154):
```javascript
const laborRoles = [
  { role: 'HEAD_CHEF', target_hours: Math.ceil(totalMeals / 11), hourly_rate: 28 },
  { role: 'LINE_COOK', target_hours: Math.ceil(totalMeals / 22), hourly_rate: 18 },
  // Adjust rates and ratios here
]
```

## Troubleshooting

**"No menus found in database"**
- Run `node load-meal-data.js` to populate menus

**"column ... does not exist"**
- Run `psql fit4sure < task_migration.sql` to create tables

**Cannot connect to localhost:3000**
- Make sure PostgreSQL is running
- Check that backend is started with `npm start`

**Cannot load http://localhost:5173/task-management**
- Make sure frontend is running with `npm run dev`
- Clear browser cache and refresh

**No data showing on dashboard**
- Check browser console (F12) for API errors
- Verify meal data was loaded: `node load-meal-data.js`
- Test endpoint directly: `curl http://localhost:3000/api/admin/task-management-auto/auto-generate-plan`

## Architecture

```
Meal Count Sheet (Your spreadsheet)
         ↓
    load-meal-data.js (parser)
         ↓
Database (menus, menu_recipes, order_totals, customers)
         ↓
POST /auto-generate-plan (Express backend)
         ↓
Auto-generates:
  • production_plans
  • production_schedule
  • procurement_plan
  • labor_plan
         ↓
GET /production-plan/:id/full-timeline
         ↓
React Dashboard (TaskManagementPage.tsx)
         ↓
Display: Timeline | Procurement | Labor | Kanban Board
```

## Next Steps

1. ✅ Run migration
2. ✅ Load meal data
3. ✅ Start servers
4. ✅ Access dashboard
5. **Track execution** → Use Kanban board to mark tasks TODO → IN_PROGRESS → DONE
6. **Log actuals** → Record actual labor hours, waste, issues
7. **Review week** → View weekly analytics and variance reports
8. **Plan next week** → Submit new menu, auto-generate new production plan

## Support

For issues or feature requests related to the Task Management system:
- Check the code comments in `taskManagementAuto.js`
- Review error stack traces in terminal
- Test endpoints with curl before using dashboard
