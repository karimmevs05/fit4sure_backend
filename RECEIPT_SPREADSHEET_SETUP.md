# Receipt Spreadsheet Setup

## Google Sheets Template

Create a new Google Sheet with these exact column headers:

| Item | Store | Grade/Quality | Net weight (g) | Price/Pound | Serving size (g) | Serving per container | Price | Date |
|------|-------|---------------|----------------|-------------|------------------|----------------------|-------|------|
| Blueberries | Costco | Fresh | 500 | 8.99 | 150 | 3 | 8.99 | 2026-07-18 |
| Chicken Breast | Costco | Premium | 1000 | 12.49 | 100 | 10 | 12.49 | 2026-07-18 |
| Olive Oil | Amazon | Extra Virgin | 500 | 18.50 | 15 | 33 | 18.50 | 2026-07-17 |

## Column Descriptions

| Column | Description | Example | Required |
|--------|-------------|---------|----------|
| **Item** | Product name | Blueberries, Chicken Breast | ✅ Yes |
| **Store** | Where purchased | Costco, Amazon, Instacart | ✅ Yes |
| **Grade/Quality** | Quality level or type | Fresh, Premium, Organic | ❌ No |
| **Net weight (g)** | Total weight in grams | 500, 1000 | ❌ No |
| **Price/Pound** | Unit price per pound | 8.99, 12.49 | ❌ No |
| **Serving size (g)** | Serving size in grams | 150, 100 | ❌ No |
| **Serving per container** | Number of servings | 3, 10, 33 | ❌ No |
| **Price** | Total price paid ($) | 8.99, 12.49 | ✅ Yes |
| **Date** | Purchase date (YYYY-MM-DD) | 2026-07-18 | ✅ Yes |

## How to Use

1. **Share this spreadsheet with your service account:**
   - Email: `fit4sure-sync@phrasal-league-429923-s7.iam.gserviceaccount.com`
   - Access: Editor

2. **Add receipts as rows:**
   - One row per item purchased
   - Fill in Item, Store, Price, and Date (minimum required)
   - Optional: Add Grade, weights, serving info

3. **Sync to database:**
   - Dashboard → Financials → "☁️ Google Drive (Auto)" → "🔄 Sync Google Drive Now"
   - Or create a "📊 Spreadsheet Sync" tab
   - Items automatically create expenses

## Example Data

```
Item                  | Store      | Grade/Quality | Net weight (g) | Price/Pound | Serving size (g) | Serving per container | Price  | Date
Blueberries          | Costco     | Fresh         | 500            | 8.99        | 150              | 3                     | 8.99   | 2026-07-18
Chicken Breast 3lbs  | Costco     | Premium       | 1000           | 12.49       | 100              | 10                    | 12.49  | 2026-07-18
Olive Oil            | Amazon     | Extra Virgin  | 500            | 18.50       | 15               | 33                    | 18.50  | 2026-07-17
Organic Milk 1gal    | Instacart  | Organic       | 946            | 4.99        | 240              | 4                     | 4.99   | 2026-07-17
Salmon Fillets 2lbs  | Costco     | Wild Caught   | 900            | 22.99       | 150              | 6                     | 22.99  | 2026-07-16
```

## Spreadsheet Link Format

Share your completed spreadsheet link here, and I'll set up automatic syncing!

Example: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit`
