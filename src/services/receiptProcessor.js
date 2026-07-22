const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/db');
const { syncInventoryFromReceiptItem } = require('./inventorySync');

// Initialize Gemini with Google API key from .env
const getGeminiClient = () => {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY not configured in .env');
  }
  return new GoogleGenerativeAI(apiKey);
};

/**
 * Process receipt image with Google Gemini API (FREE)
 * Extracts: vendor, items (name, price, quantity/weight, unit)
 * Returns structured data ready for database storage
 */
async function processReceiptWithAI(imageBase64, imageSource = 'unknown') {
  try {
    console.log(`Processing receipt from ${imageSource}...`);

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `Analyze this receipt or order screenshot and extract:

1. VENDOR NAME (store/restaurant/online service name)
2. RECEIPT TOTAL (the final total amount actually charged, as printed on the receipt)
3. All LINE ITEMS with:
   - Product name (clean, descriptive)
   - "amount": the ACTUAL dollar amount charged for this line item, exactly as printed
     (this is the number on the right-hand side of the line, e.g. "$15.63" -- NOT
     a per-pound or per-unit rate like "$10.78/lb". If an item is priced per weight,
     "amount" must be the final charged total for that line, already accounting for
     the weight -- never the per-unit rate by itself)
   - "unit_rate": if the item shows a separate per-unit or per-pound price (e.g.
     "$10.78/lb"), record that rate here for reference. Leave null if not shown.
   - Quantity or weight (if available, e.g., "500g", "2 lbs", "1 unit")
   - Unit of measurement (g, kg, oz, lb, ml, L, count, etc.)

IMPORTANT RULES:
- Skip payment method lines (Visa, Mastercard, cash, etc.)
- Skip tax, subtotal, total lines from the LINE ITEMS list -- only list actual products
- Read decimal points carefully -- do not drop or misplace decimal points (e.g. $10.78 must never become 1078)
- If weight/quantity is on package (e.g., "2lb bag of chicken"), extract it
- For items without quantity, use "count" as unit with quantity 1
- If unclear, make best guess based on product type
- The sum of all "amount" values should be close to the receipt total (before tax).
  Double check any line item whose amount looks unusually large or doesn't fit this pattern.

Return ONLY valid JSON, no markdown:
{
  "vendor": "store name",
  "receipt_total": 99.27,
  "items": [
    {
      "name": "product name",
      "amount": 12.99,
      "unit_rate": null,
      "quantity": 500,
      "unit": "g",
      "category": "food_cogs"
    }
  ]
}

Categories: food_cogs, packaging, delivery, labor, utilities, other

Auto-categorize based on keywords:
- food_cogs: vegetables, fruits, meat, chicken, beef, fish, produce, organic, spice, oil, butter, cream, cheese, milk, protein
- packaging: container, box, bag, wrap, foil, plastic, cup, lid
- delivery: delivery, shipping, courier
- labor: wage, salary, staff
- utilities: electricity, water, internet, phone
- other: everything else`;

    const response = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/jpeg',
        },
      },
      prompt,
    ]);

    const responseText = response.response.text();

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const receiptData = JSON.parse(jsonStr);

    // Validate structure
    if (!receiptData.vendor || !Array.isArray(receiptData.items)) {
      throw new Error('Invalid receipt data structure');
    }

    console.log(`✓ Extracted ${receiptData.items.length} items from ${receiptData.vendor}`);

    // Validation: flag if the sum of line items is way off from the printed receipt total.
    // This catches misreads (e.g. a per-pound rate mistaken for a charged amount)
    // before they get saved as expenses.
    const itemSum = receiptData.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    let lowConfidence = false;
    if (receiptData.receipt_total && receiptData.receipt_total > 0) {
      const diff = Math.abs(itemSum - receiptData.receipt_total);
      const pctDiff = diff / receiptData.receipt_total;
      if (pctDiff > 0.15) {
        lowConfidence = true;
        console.warn(`⚠ Item sum ($${itemSum.toFixed(2)}) doesn't match receipt total ($${receiptData.receipt_total}) for ${receiptData.vendor} -- flagging for review`);
      }
    }

    return {
      vendor: receiptData.vendor,
      receiptTotal: receiptData.receipt_total || null,
      lowConfidence,
      items: receiptData.items.map(item => ({
        productName: item.name || 'Unknown Product',
        price: parseFloat(item.amount) || 0,
        quantity: item.quantity || 1,
        unit: item.unit || 'count',
        category: item.category || 'other',
        description: item.name || 'Unknown',
        amount: parseFloat(item.amount) || 0,
        confidence: lowConfidence ? 0.5 : 0.95,
      })),
    };
  } catch (error) {
    console.error('Error processing receipt with Gemini:', error);
    throw error;
  }
}


/**
 * Save processed receipt items to database
 */
async function saveReceiptToDB(receiptData) {
  try {
    const { vendor, items } = receiptData;
    const savedProducts = [];
    const createdExpenses = [];

    for (const item of items) {
      if (!item.productName || item.amount <= 0) {
        console.warn('Skipping invalid item:', item);
        continue;
      }

      // Save to receipt_products table
      try {
        const productResult = await db.query(`
          INSERT INTO receipt_products (name, category, unit, store, last_purchase_price_cents)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (LOWER(name), store)
          DO UPDATE SET
            last_purchase_price_cents = EXCLUDED.last_purchase_price_cents,
            last_purchase_date = NOW(),
            purchase_count = receipt_products.purchase_count + 1
          RETURNING id, name, unit, store, category
        `, [
          item.productName,
          item.category || 'other',
          item.unit || 'count',
          vendor || 'Unknown',
          Math.round(item.amount * 100), // Convert to cents
        ]);

        savedProducts.push(productResult.rows[0]);
      } catch (productError) {
        console.error('Error saving product:', productError);
      }

      // Create expense entry
      try {
        const descriptionWithQty = item.quantity && item.unit
          ? `${item.productName} (${item.quantity}${item.unit})`
          : item.productName;

        const expenseResult = await db.query(`
          INSERT INTO expenses (date, vendor, category, description, amount, status)
          VALUES (NOW(), $1, $2, $3, $4, 'pending')
          RETURNING id, date, vendor, category, description, amount, status
        `, [
          vendor || 'Online Order',
          item.category || 'other',
          descriptionWithQty,
          item.amount, // expenses.amount stores plain dollars, not cents
        ]);

        createdExpenses.push(expenseResult.rows[0]);
      } catch (expenseError) {
        console.error('Error creating expense:', expenseError);
      }

      // Keep Inventory in sync for food items (skips non-food automatically)
      try {
        await syncInventoryFromReceiptItem(
          { name: item.productName, category: item.category, amount: item.amount, quantity: item.quantity, unit: item.unit },
          vendor
        );
      } catch (inventoryError) {
        console.error('Error syncing inventory:', inventoryError);
      }
    }

    console.log(`✓ Saved ${savedProducts.length} products, created ${createdExpenses.length} expenses`);

    return {
      productsAdded: savedProducts.length,
      expensesCreated: createdExpenses.length,
      products: savedProducts,
      expenses: createdExpenses,
    };
  } catch (error) {
    console.error('Error saving to database:', error);
    throw error;
  }
}

module.exports = {
  processReceiptWithAI,
  saveReceiptToDB,
};
