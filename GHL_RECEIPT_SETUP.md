# GoHighLevel Receipt Parser Setup Guide

This guide walks you through setting up accurate receipt parsing using GoHighLevel's AI document intelligence.

## Why GoHighLevel?

- **High Accuracy**: AI-powered OCR specifically trained for receipts
- **Cost Efficient**: You're already paying for GoHighLevel
- **Food-Specific**: Recognizes common food/beverage vendors and items
- **Automatic Categorization**: Categorizes expenses (COGS, packaging, delivery, etc.)

## Step-by-Step Setup

### Step 1: Get Your GoHighLevel API Credentials

1. **Open GoHighLevel Dashboard**
   - Go to: https://app.gohighlevel.com
   - Log in with your account

2. **Find Your Location ID**
   - Click **Settings** (gear icon, bottom left)
   - Click **Locations**
   - Select your business location
   - Copy the **Location ID** (looks like: `abc123xyz789`)

3. **Generate API Key**
   - Still in Settings, click **Integrations** or **API & Webhooks**
   - Click **Create API Key** or **Generate Key**
   - Copy the full API key (starts with something like `sk-` or `api_`)
   - Store it somewhere safe (you'll need it next)

### Step 2: Add Credentials to Your .env File

Open `/Users/karimmevs/Documents/fit4sure_backend/.env` and add these lines:

```env
# GoHighLevel Receipt Parser
GHL_API_KEY=your_api_key_here
GHL_LOCATION_ID=your_location_id_here
```

**Example:**
```env
GHL_API_KEY=sk_live_abc123xyz789
GHL_LOCATION_ID=location_789xyz123
```

### Step 3: Restart Your Backend

```bash
cd /Users/karimmevs/Documents/fit4sure_backend
npm start
```

The backend will now load your GoHighLevel credentials.

### Step 4: Test the Integration

Test the setup by calling the setup guide endpoint:

```bash
curl http://localhost:3000/api/admin/receipt-parser/setup-guide
```

You should get a JSON response with the integration status.

### Step 5: Upload a Receipt

Once configured, the Financials page will automatically use GoHighLevel for receipt parsing:

1. Go to **Financials → Receipt Scanner**
2. Upload a receipt image
3. The system will send it to GoHighLevel for parsing
4. Get back structured data: vendor, items, prices, quantities

## What Gets Extracted

GoHighLevel will parse and return:

```json
{
  "vendor": "Local Produce Co",
  "items": [
    {
      "description": "Chicken Breast",
      "quantity": 10,
      "unit": "lbs",
      "price": 45.50,
      "category": "food_cogs"
    },
    {
      "description": "Broccoli",
      "quantity": 5,
      "unit": "lbs",
      "price": 12.75,
      "category": "food_cogs"
    }
  ],
  "total": 58.25,
  "date": "2026-07-15",
  "confidence": 0.96
}
```

## Troubleshooting

**Problem: "GoHighLevel API key not configured"**
- Make sure you added `GHL_API_KEY` to your `.env` file
- Restart the backend with `npm start`
- Check the `.env` file is in: `/Users/karimmevs/Documents/fit4sure_backend/.env`

**Problem: "Invalid API Key"**
- Double-check your API key is correct (copy from GoHighLevel settings)
- Make sure it doesn't have extra spaces or line breaks
- Verify it's not expired in GoHighLevel's dashboard

**Problem: "Location ID not found"**
- Verify your Location ID in GoHighLevel settings
- Make sure it's the right location if you have multiple
- Copy the exact ID without spaces

**Problem: "Document intelligence not available"**
- Some GoHighLevel plans don't include document parsing
- Check your subscription tier in GoHighLevel
- Contact GoHighLevel support if needed

## API Endpoints

Once set up, the receipt parser will be available at:

**Parse Receipt (called automatically from Financials page)**
```
POST /api/admin/receipt-parser/parse-receipt
Body: { imageBase64: "...", fileName: "receipt.jpg" }
Response: { success: true, data: { vendor, items, total, ... } }
```

**Check Setup**
```
GET /api/admin/receipt-parser/setup-guide
Response: Setup instructions and current configuration status
```

## Next Steps

1. Complete the setup steps above
2. Restart backend
3. Go to Financials page
4. Upload a receipt image
5. See accurate parsing results!

## Support

- GoHighLevel Docs: https://docs.gohighlevel.com/reference/document-intelligence-api
- API Key Issues: Check GoHighLevel → Settings → Integrations
- Account Issues: Contact GoHighLevel support directly
