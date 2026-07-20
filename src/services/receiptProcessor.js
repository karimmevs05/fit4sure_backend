const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/db');

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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Analyze this receipt or order screenshot and extract:

1. VENDOR NAME (store/restaurant/online service name)
2. All LINE ITEMS with:
   - Product name (clean, descriptive)
   - Price per unit in dollars
   - Quantity or weight (if available, e.g., "500g", "2 lbs", "1 unit")
   - Unit of measurement (g, kg, oz, lb, ml, L, count, etc.)

IMPORTANT RULES:
- Skip payment method lines (Visa, Mastercard, cash, etc.)
- Skip tax, subtotal, total lines - only list actual products
- If weight/quantity is on package (e.g., "2lb bag of chicken"), extract it
- For items without quantity, use "count" as unit with quantity 1
- If unclear, make best guess based on product type

Return ONLY valid JSON, no markdown:
{
  "vendor": "store name",
  "items": [
    {
      "name": "product name",
      "price": 12.99,
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

    return {
      vendor: receiptData.vendor,
      items: receiptData.items.map(item => ({
        productName: item.name || 'Unknown Product',
        price: parseFloat(item.price) || 0,
        quantity: item.quantity || 1,
        unit: item.unit || 'count',
        category: item.category || 'other',
        description: item.name || 'Unknown',
        amount: parseFloat(item.price) || 0,
        confidence: 0.95,
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
            last_purchase_price_cents = $5,
            last_purchase_date = NOW(),
            purchase_count = purchase_count + 1
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
          Math.round(item.amount * 100), // Store in cents
        ]);

        createdExpenses.push(expenseResult.rows[0]);
      } catch (expenseError) {
        console.error('Error creating expense:', expenseError);
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
