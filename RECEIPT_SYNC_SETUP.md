# Google Drive Receipt Auto-Sync Setup

## How It Works

1. **Drop receipts in Google Drive** - Upload physical receipt photos, online order screenshots, anything
2. **AI processes automatically** - Claude reads each image and extracts:
   - Vendor name
   - Each product name, price, quantity/weight
   - Auto-categorizes (Food COGS, Packaging, etc.)
3. **Saves to database** - All items stored in `receipt_products` and `expenses` tables
4. **Marks as processed** - Moves files to "Processed" folder in Drive

## Setup Steps

### 1. Google Drive Folder
Your system automatically creates a folder called **"Fit4Sure Receipts"** in your Google Drive.

Just start uploading receipt images there!

### 2. Automatic Sync
The system syncs automatically every 5 minutes. To manually sync sooner:

**Option A: Dashboard**
- Go to Financials page
- Click "☁️ Google Drive (Auto)" tab
- Click "🔄 Sync Google Drive Now" button

**Option B: API**
```bash
curl -X POST http://localhost:3000/api/admin/receipt-sync/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Verify Setup
Check that your `.env` has:
```
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}
```

If you see "Could not start receipt sync" on startup, the credentials aren't configured.

## Supported File Types
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- Any receipt image format

## What Gets Extracted

### From Physical Receipts
```
Costco Receipt
Date: 07/18/2024
Item 1: Blueberries 1lb - $8.99 → Saved as 1 lb at $8.99
Item 2: Chicken Breast 3lb - $12.49 → Saved as 3 lb at $12.49
Tax: $1.52 → Skipped
Total: $22.50 → Skipped (only items extracted)
```

### From Online Orders
```
Amazon Fresh Order
Apples (6 count) - $4.99
Organic Milk (1 gallon) - $3.49
```

## Database Tables

### receipt_products
Stores unique products with purchase history:
- `name` - Product name (e.g., "Blueberries")
- `unit` - Measurement (g, kg, oz, lb, ml, L, count, etc.)
- `store` - Where purchased (Costco, Amazon, etc.)
- `last_purchase_price_cents` - Latest price
- `purchase_count` - How many times bought
- `category` - Auto-categorized (food_cogs, packaging, etc.)

### expenses
Stores each transaction:
- `vendor` - Store name
- `category` - Expense category
- `description` - "ProductName (Quantity Unit)" e.g., "Blueberries (1kg)"
- `amount` - Price in dollars
- `status` - "pending" (ready for review)

## Troubleshooting

### "Could not start receipt sync"
- Google credentials not in `.env`
- Make sure your service account has Drive access
- Check logs for specific error

### "No text found in image"
- Receipt is too blurry or low quality
- Try better lighting or higher resolution
- AI will skip and move to next receipt

### Items not extracting correctly
- Receipt format is unusual (hand-written, very faded)
- Large receipt image might hit API limits
- Check logs for AI response

## Performance

- **Processing time**: ~5-10 seconds per receipt
- **Sync interval**: Every 5 minutes automatically
- **Batch processing**: Handles multiple receipts in one sync
- **Failure handling**: If one receipt fails, others still process

## Next Steps

1. Create a Google Drive folder or let the system create it
2. Start uploading receipts
3. Check Financials > Google Drive tab for sync status
4. Review expenses as they're created

Done! 🎉
