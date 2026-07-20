# Fit4Sure Admin Dashboard - Complete System Summary

## Overview
A comprehensive operational admin dashboard for Fit4Sure meal prep business. Full-stack React 18 + Express.js + PostgreSQL application running locally on user's laptop.

---

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript + Vite
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Styling**: Tailwind CSS with custom warm/brown theme
- **UI Components**: Lucide React icons
- **Routing**: React Router

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL 18
- **Authentication**: JWT with role-based access control
- **API Design**: RESTful

### Color Theme
- Primary: `#4B2B1D` (warm brown)
- Secondary: `#2E527F` (slate blue)
- Background: `#FBF7F0` (cream)
- Monday: `#16A34A` (green)
- Thursday: `#D97706` (orange)
- Breakfast: `#0EA5E9` (blue)

---

## Database Schema

### Core Tables

**menus**
- `id`: Integer (Primary Key)
- `week_label`: Text (e.g., "Week of 1.18")
- `created_at`: Timestamp

**menu_recipes**
- `id`: Integer (Primary Key)
- `menu_id`: Integer (FK → menus)
- `recipe_name`: Text (meal name from orders, e.g., "Steak, Potatoes, asparagus")
- `day_of_week`: Text (Monday, Thursday, Breakfast)
- `recipe_id`: Integer (FK → recipes, nullable - links to standardized recipes)

**recipes**
- `recipe_id`: Integer (Primary Key)
- `name`: Text (standardized recipe name)
- `category`: Text (beef, chicken, turkey, carbohydrates, vegetables, sauces, beverage, breakfast, prepared_meal)
- `description`: Text
- `servings`: Integer
- `prep_time_minutes`: Integer
- `calories`: Integer
- `protein_g`, `carbs_g`, `fat_g`: Numeric (per serving)

**recipe_ingredients**
- `id`: Integer (Primary Key)
- `recipe_id`: Integer (FK → recipes)
- `inventory_id`: Integer (FK → inventory)
- `quantity_g`: Integer (grams used in recipe)

**inventory**
- `id`: Integer (Primary Key)
- `name`: Text (ingredient name)
- `category`: Text
- `unit_price_cents`: Integer (price per pound in cents)
- `current_stock_g`: Integer (grams in stock)
- `protein_per_100g`, `carbs_per_100g`, `fat_per_100g`, `calories_per_100g`: Numeric
- `usda_fdc_id`, `macros_source`: Text

**customers**
- `id`: Integer (Primary Key)
- `name`: Text (includes "LARGE" if large portion customer)
- `notes`: Text (dietary restrictions)

**order_totals**
- `id`: Integer (Primary Key)
- `menu_id`: Integer (FK → menus)
- `customer_id`: Integer (FK → customers)
- `total_meals_monday`: Integer
- `total_meals_thursday`: Integer
- `breakfast_meals`: Integer
- `total_meals`: Integer

---

## API Endpoints

### Orders Management (`/api/admin/orders`)
- `GET /this-week` → Current week's menu and orders
- `GET /history` → All weeks' historical data
- `GET /insights` → Analytics (top recipes, customers, metrics)
- `GET /:week` → Specific week's orders

### Weekly Prep (`/api/admin/prep`)
- `GET /weeks/list` → All available weeks for browsing
- `GET /:week` → Comprehensive prep data (recipes, ingredients, inventory, costs)
- `GET /:week/:recipeId` → Recipe details with COGS breakdown

### Recipes (`/api/admin/recipes`)
- `GET /` → All recipes with macro data
- `POST /` → Create new recipe
- `PUT /:id` → Update recipe
- `DELETE /:id` → Delete recipe

### Inventory (`/api/inventory`)
- `GET /` → All inventory with macro data
- `POST /` → Add inventory item
- `PUT /:id` → Update inventory (stock, pricing, macros)

---

## Frontend Pages

### Orders Page (`/orders`)
**Three Tabs:**

1. **This Week's Orders**
   - Summary cards: Monday, Thursday, Breakfast, Total servings
   - Menu overview with color-coded day tags
   - Shows regular/large portion counts per recipe
   - Customer orders table with meal breakdowns
   - Click recipe card → opens Weekly Prep page

2. **Order History**
   - All weeks with totals, customer count, average order size
   - Sortable/filterable

3. **Insights**
   - Average meals/week, total customers, peak week
   - Top 5 recipes by frequency
   - Top 5 customers by meals ordered

### Weekly Prep Page (`/prep/:week`)
**Navigation:**
- Back button
- Week navigation (Prev/Next with counter)

**Sections:**
1. Summary cards: Total servings, ingredient count, COGS, cost per serving
2. Menu section: Clickable recipe cards showing day + portion counts
3. Current Inventory table with columns:
   - Ingredient name
   - Category
   - Stock (g)
   - Status (In Stock / Out of Stock)
   - Inventory cost

4. Recipe Detail Modal (on recipe click):
   - Regular/Large portion counts
   - Customer lists with notes
   - Ingredients table showing:
     - Ingredient name, category, stock (g), price/lb, cost
     - **COGS displayed as:**
       - Recipe Total: Total cost of all ingredients in recipe
       - Per Meal: Cost per serving (total ÷ servings or ÷ portions ordered)

### Recipes Page (`/recipes`)
**Two Tabs:**

1. **Library** (Published recipes)
   - Filters: Category selector (beef, chicken, turkey, carb, veg, sauce, beverage, breakfast)
   - Search bar
   - Recipe cards showing:
     - Name, category badge, macros (CAL, PRO, CARB, FAT)
     - Cost per serving
   - Actions: Edit, Delete
   - **Excludes all "prepared_meal" category recipes**

2. **Drafts** (Work-in-progress recipes)
   - Shows only "prepared_meal" category recipes
   - Same card layout as Library
   - Workflow: Edit → change category → auto-moves to Library and removes from Drafts
   - Click to edit:
     - Form with name, category selector, servings, prep time
     - Macro fields (calories, protein, carbs, fat)
     - Ingredients section:
       - Add button → select ingredient from inventory, enter quantity in grams
       - Each ingredient shows cost calculated from unit price
       - Remove individual ingredients
     - Save button → updates database and moves to Library if category changed

### Inventory Page (`/inventory`)
- Table columns: Name, Category, Store, Grade, Net Weight, Price/lb, Serving Size, Price/Serving, Total Price, Last Purchased
- Macro columns: Protein, Carbs, Fat, Calories (per 100g)
- Add Ingredient drawer
- Edit/Delete actions
- Pricing based on grams: `(unit_price_cents / 453.592) × quantity_g`

---

## Key Features Implemented

### 1. Order Management
- ✅ 22 weeks of historical order data imported
- ✅ 103 unique meals from order history
- ✅ Customer name-based large/regular portion detection
- ✅ Breakfast meal tracking per customer per week
- ✅ Weekly summaries with meal counts

### 2. Recipe Management
- ✅ Generic recipe library (Steak Cafe, Kefta, Chicken Shawarma, etc.)
- ✅ Standardized recipes with ingredients and macros
- ✅ Dynamic pricing from inventory
- ✅ COGS calculation per recipe
- ✅ Draft/Library workflow for meal recipes
- ✅ 38 order meals linked to standardized recipes
- ✅ 71 unlinked order meals ready for ingredient mapping

### 3. Inventory Management
- ✅ 60+ common ingredients with nutritional data
- ✅ Stock tracking in grams
- ✅ Unit pricing in cents per pound
- ✅ Macro nutrient data (protein, carbs, fat, calories per 100g)
- ✅ Local seed data (USDA API blocked by proxy)

### 4. Weekly Prep Planning
- ✅ Browse all 22 weeks with navigation
- ✅ View recipes needed per week
- ✅ Inventory status (in stock / out of stock)
- ✅ COGS tracking:
  - Total recipe cost
  - Per-meal cost (divided by servings or customer count)
- ✅ Recipe detail modal with customer lists and dietary notes

### 5. Analytics
- ✅ Weekly metrics (total meals, customers, avg order size)
- ✅ Historical trends
- ✅ Top recipes
- ✅ Top customers
- ✅ Average meals per week

### 6. Data Consistency
- ✅ All data pulled from platform (not hardcoded)
- ✅ Unit conversion: grams ↔ pounds
- ✅ Cost calculations: cents per pound → per gram
- ✅ Regular vs Large customer detection from name contains "LARGE"

---

## Data Flow Architecture

```
Orders (Spreadsheet)
    ↓
import-all-orders.js → menus + menu_recipes + order_totals + customers
    ↓
Orders Page displays ← /api/admin/orders/this-week
    ↓
Click recipe → Weekly Prep Page shows ingredients needed
    ↓
Recipes table linked via recipe_id in menu_recipes
    ↓
recipe_ingredients table provides quantities
    ↓
inventory table provides current stock + pricing
    ↓
COGS calculated in real-time from (unit_price_cents / 453.592) × quantity_g
```

---

## Recipe Linking Status

**Linked (38):**
- Kefta recipes → Recipe #116
- Steak variations → Recipes #111, #112, #113
- Chicken variations → Recipes #118-#123
- Turkey dishes → Recipe #124
- Etc.

**Unlinked (71):**
- Specialty meal combinations (e.g., "Sweet Potato ground beef corn")
- Niche dishes requiring custom recipe creation
- Ready for manual ingredient mapping via Recipes UI

---

## Recent Fixes & Optimizations

1. **URL Encoding**: Week labels with spaces properly decoded in prep endpoints
2. **Schema Consistency**: Added missing `unit_price_cents` and `current_stock_g` columns
3. **Ingredient Calculation**: COGS now accounts for actual ingredient quantities from recipes table
4. **Per-Meal COGS**: Divided by servings or portions ordered for accurate per-plate cost
5. **Draft Workflow**: Prepared_meal recipes auto-removed from drafts when assigned real category
6. **Menu Accuracy**: Regular/Large counts calculated from customer name detection
7. **Week Navigation**: Added prev/next buttons to browse all order history

---

## Environment Variables (.env)

```
DATABASE_URL=postgresql://localhost/fit4sure
JWT_SECRET=test-secret-key-12345
VITE_API_BASE_URL=http://localhost:3000
```

---

## Next Steps / Enhancement Opportunities

1. **Recipe Completion**
   - Manually map remaining 71 meal recipes to ingredients via Recipes UI
   - Add ingredients to each by selecting from inventory + entering grams
   - System auto-calculates costs and moves to Library

2. **Advanced Reporting**
   - Profitability by recipe
   - Ingredient yield analysis
   - Customer-specific nutrition facts cards
   - Weekly cost trends

3. **Production Workflow**
   - Kitchen prep checklist (ingredient prep sequences)
   - Fulfillment tracking (who gets what by when)
   - Packaging/delivery coordination
   - Quality control checklist

4. **Supplier Integration**
   - Purchase order generation
   - Inventory reorder automation
   - Pricing alerts for ingredient cost changes

5. **Customer Portal**
   - Public order interface
   - Nutrition facts cards per meal
   - Allergy/dietary restriction filtering
   - Order history and preferences

6. **Financials**
   - Revenue per week/month
   - Profit margin by recipe
   - Customer lifetime value
   - Cost trends over time

---

## File Locations

**Frontend:**
- Main: `/Users/karimmevs/Documents/fit4sure-admin-dashboard/`
- Pages: `src/pages/Orders.tsx`, `src/pages/WeeklyPrep.tsx`, `src/pages/Recipes.tsx`, `src/pages/Inventory.tsx`
- Config: `tailwind.config.js`, `vite.config.ts`

**Backend:**
- Main: `/Users/karimmevs/Documents/fit4sure_backend/`
- Routes: `src/routes/admin/{adminOrders.js, adminPrep.js, adminRecipes.js, adminInventory.js}`
- Config: `.env`, `src/config/db.js`
- Scripts: `import-all-orders.js`, `sync-meals-to-recipes.js`, `populate-inventory-full.js`

**Database:** PostgreSQL `fit4sure` database on localhost

---

## Known Limitations

1. USDA API blocked by network proxy → Using local seed data for nutrition facts
2. No real authentication (JWT secret is static)
3. Recipe linking to menu meals is partial (38/103)
4. No image uploads yet
5. No email notifications
6. No multi-user concurrency handling

---

## How to Run

**Frontend:**
```bash
cd /Users/karimmevs/Documents/fit4sure-admin-dashboard
npm run dev
# Opens at http://localhost:5174
```

**Backend:**
```bash
cd /Users/karimmevs/Documents/fit4sure_backend
npm start
# Runs on http://localhost:3000
```

**Database:**
```bash
brew services start postgresql@18
```

---

## Testing Checklist

- [ ] Orders page loads with this week's data
- [ ] Weekly Prep page shows accurate ingredient quantities
- [ ] COGS displays per-recipe total and per-meal cost
- [ ] Recipes page filters by category correctly
- [ ] Draft recipes auto-move to Library when category assigned
- [ ] Inventory shows accurate stock and pricing
- [ ] Week navigation works (Prev/Next)
- [ ] Customer filtering works in orders
- [ ] Macro calculations match expected values

---

## Git/Version Control

Currently no version control set up. Recommend:
```bash
cd /Users/karimmevs/Documents/fit4sure_backend
git init
git remote add origin <your-repo>
# Same for frontend
```

---

## Performance Notes

- Data fetched on component mount, cached in state
- No real-time updates yet (manual refresh required)
- Database queries are indexed on menu_id, customer_id, week_label
- Consider pagination for large order history tables

---

## Accessibility

- Color contrast checked for WCAG AA
- Keyboard navigation supported
- Semantic HTML used
- Icon labels via Lucide React

