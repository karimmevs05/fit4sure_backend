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

// Gemini occasionally 503s ("currently experiencing high demand") or hits a
// short-lived per-minute 429 under load -- both transient and worth a short
// retry, unlike a genuine parse/validation failure which would just fail
// the same way again immediately.
function isRetryableGeminiError(error) {
  return /\b(503|429)\b/.test(error.message || '') && !isDailyQuotaExceeded(error);
}

// The free tier's per-day quota (20 requests/day/model as of this writing)
// is a completely different failure mode from a transient rate limit -- no
// amount of waiting a few seconds fixes it, and every other call made today
// will fail identically. Detected separately so callers can stop burning
// through a whole batch instead of retrying (and failing) each one.
function isDailyQuotaExceeded(error) {
  return /PerDay/i.test(error.message || '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process receipt image with Google Gemini API (FREE)
 * Extracts: vendor, items (name, price, quantity/weight, unit)
 * Returns structured data ready for database storage
 */
async function processReceiptWithAI(imageBase64, imageSource = 'unknown', mimeType = 'image/jpeg') {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await processReceiptWithAIOnce(imageBase64, imageSource, mimeType);
    } catch (error) {
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      if (!isRetryableGeminiError(error) || isLastAttempt) throw error;
      const delayMs = attempt * 2000; // 2s, 4s
      console.warn(`Gemini transient error on attempt ${attempt}/${MAX_ATTEMPTS} for ${imageSource}, retrying in ${delayMs}ms: ${error.message}`);
      await sleep(delayMs);
    }
  }
}

async function processReceiptWithAIOnce(imageBase64, imageSource, mimeType) {
  try {
    console.log(`Processing receipt from ${imageSource}...`);

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `This receipt is for Fit4Sure, a high-protein, seed-oil-free
meal prep business. Purchases are overwhelmingly bulk proteins, vegetables,
and cooking staples -- keep that in mind when an abbreviated item name is
ambiguous (bias toward the bulk-protein/produce reading, not a beverage or
snack brand, unless the context clearly points elsewhere).

Analyze this receipt or order screenshot and extract:

1. VENDOR NAME (store/restaurant/online service name)
2. RECEIPT TOTAL (the final total amount actually charged, as printed on the receipt)
3. All LINE ITEMS with:
   - "name": a clean, full common product name. Warehouse-store receipts
     (Costco, Sam's Club, etc.) print heavily abbreviated, truncated text
     (e.g. "ORG BLUES", "RNBOW CARROT", "ORGANIC GT"). Use your knowledge of
     common grocery products -- and this business's bulk-protein/produce
     purchasing pattern -- to expand these into their real name (e.g.
     "ORG BLUES" -> "Organic Blueberries", "RNBOW CARROT" -> "Rainbow
     Carrots", "ORGANIC GT" -> "Organic Ground Turkey", NOT a beverage
     brand). If a name is already clear and unabbreviated, keep it as
     printed -- don't guess wildly on something genuinely ambiguous, just
     clean up obvious
     truncation/abbreviation.
   - "display_name": the bare, generic ingredient name as it would appear in
     a recipe or shopping list -- strip the store/retailer brand (e.g.
     "Member's Mark", "Kirkland Signature", "Great Value"), any diet/quality
     qualifier (grass-fed, organic, wild-caught, free-range, non-GMO,
     cage-free), and packaging/count/size info, keeping only the core
     food + cut/variety. This is the name used for inventory going forward,
     so the same real ingredient purchased from different brands/stores
     should always produce the same display_name (e.g. "Member's Mark Grass
     Fed Beef Top Sirloin Steak" -> "Top Sirloin Steak", "Organic Ground
     Turkey" -> "Ground Turkey", "Rainbow Carrots, 2 lb bag" -> "Carrots").
   - "amount": the ACTUAL dollar amount charged for this line item, exactly as printed
     (this is the number on the right-hand side of the line, e.g. "$15.63" -- NOT
     a per-pound or per-unit rate like "$10.78/lb". If an item is priced per weight,
     "amount" must be the final charged total for that line, already accounting for
     the weight -- never the per-unit rate by itself)
   - "unit_rate": if the item shows a separate per-unit or per-pound price (e.g.
     "$10.78/lb"), record that rate here for reference. Leave null if not shown.
   - "item_count": how many DISCRETE physical units this "amount" pays for (e.g. a
     multi-pack of 3 yogurt cups rung as one line -> 3; a single bag of carrots ->
     1; a steak sold by weight -> 1, since it's one physical piece even though its
     weight is a decimal). This is a count of objects, never a weight.
   - "gram_weight": the TOTAL food weight in grams for ALL "item_count" units on
     this line combined -- this feeds inventory stock directly, so make a real
     effort on every food item rather than defaulting to null:
     * If the receipt shows a weight/size (e.g. "2 lb", "500g", "12 oz", "1.63 lb
       @ $10.78/lb"), convert it to grams (1 lb = 453.6g, 1 oz = 28.3g, 1 kg = 1000g).
     * If no weight is printed but this is a standard packaged grocery item you
       recognize (a dozen eggs, a gallon of milk, a standard yogurt cup/tub, a
       loaf of bread, a jar of honey, a bag of rice), use your knowledge of that
       product's typical package weight in grams, multiplied by item_count.
     * Only leave this null if it's genuinely impossible to estimate (e.g. a
       category that isn't really "weighable" at all).
   - Quantity or weight as printed, for reference/display (if available, e.g.,
     "500g", "2 lbs", "1 unit")
   - Unit of measurement as printed (g, kg, oz, lb, ml, L, count, etc.)

IMPORTANT RULES:
- Skip payment method lines (Visa, Mastercard, cash, etc.)
- Skip tax, subtotal, total lines from the LINE ITEMS list -- only list actual products
- Skip ALL refund, return, and "refund issued" lines entirely -- these are not
  purchases and must never appear in the items list, even if the same product
  also appears as a genuine purchase elsewhere on the receipt
- Read decimal points carefully -- do not drop or misplace decimal points (e.g. $10.78 must never become 1078)
- If weight/quantity is on package (e.g., "2lb bag of chicken"), extract it
- For items without a printed quantity, item_count defaults to 1 -- but still
  estimate gram_weight per the rules above, don't let a missing printed
  quantity become a missing gram_weight
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
      "display_name": "generic ingredient name",
      "amount": 12.99,
      "unit_rate": null,
      "item_count": 1,
      "gram_weight": 500,
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
          mimeType,
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

    // Safety net: drop any refund/return line that slipped past the prompt
    // instruction, so a returned item never gets double-counted as a purchase.
    const refundedCount = receiptData.items.filter((item) =>
      /refund|return(ed)?/i.test(item.name || '')
    ).length;
    if (refundedCount > 0) {
      console.log(`Filtered out ${refundedCount} refund/return line(s) from ${receiptData.vendor}`);
      receiptData.items = receiptData.items.filter(
        (item) => !/refund|return(ed)?/i.test(item.name || '')
      );
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
        displayName: item.display_name || item.name || 'Unknown Product',
        price: parseFloat(item.amount) || 0,
        itemCount: parseInt(item.item_count, 10) || 1,
        gramWeight: item.gram_weight != null ? parseFloat(item.gram_weight) || 0 : null,
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
    const { vendor, items, date, driveFileId, driveViewLink, lowConfidence, receiptTotal } = receiptData;
    const savedProducts = [];
    const createdExpenses = [];

    // One row per receipt (Drive scan, or a single manual/screenshot entry)
    // so the expense summary can show one line per receipt -- with a link
    // back to the source image -- instead of only a flat list of line items.
    // ON CONFLICT is a safety net for the same file being saved twice in a
    // race; DO NOTHING + a follow-up SELECT recovers the existing row's id
    // rather than erroring or silently dropping the link.
    const itemsTotalCents = Math.round(items.reduce((sum, item) => sum + (item.amount || 0), 0) * 100);
    const totalAmountCents = receiptTotal != null ? Math.round(receiptTotal * 100) : itemsTotalCents;
    let receiptScanId = null;
    try {
      const receiptScanResult = await db.query(`
        INSERT INTO receipt_scans (vendor, receipt_date, total_amount_cents, drive_file_id, drive_view_link, low_confidence)
        VALUES ($1, COALESCE($2, NOW()), $3, $4, $5, $6)
        ON CONFLICT (drive_file_id) DO NOTHING
        RETURNING id
      `, [vendor || 'Unknown', date || null, totalAmountCents, driveFileId || null, driveViewLink || null, !!lowConfidence]);

      if (receiptScanResult.rows.length > 0) {
        receiptScanId = receiptScanResult.rows[0].id;
      } else if (driveFileId) {
        const existing = await db.query('SELECT id FROM receipt_scans WHERE drive_file_id = $1', [driveFileId]);
        receiptScanId = existing.rows[0]?.id ?? null;
      }
    } catch (receiptScanError) {
      console.error('Error creating receipt scan record:', receiptScanError);
    }

    for (const item of items) {
      if (!item.productName || item.amount <= 0) {
        console.warn('Skipping invalid item:', item);
        continue;
      }

      // Save to receipt_products table -- gramWeight is the real total food
      // weight Gemini already extracted for this line (it feeds inventory
      // stock updates below); persisting it here too is what lets recipe
      // costing derive a real $/lb "last price on file" instead of just
      // knowing the total dollar amount with no weight to divide it by.
      try {
        const productResult = await db.query(`
          INSERT INTO receipt_products (name, category, unit, store, last_purchase_price_cents, last_purchase_weight_g)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (LOWER(name), store)
          DO UPDATE SET
            last_purchase_price_cents = EXCLUDED.last_purchase_price_cents,
            last_purchase_weight_g = COALESCE(EXCLUDED.last_purchase_weight_g, receipt_products.last_purchase_weight_g),
            last_purchase_date = NOW(),
            purchase_count = receipt_products.purchase_count + 1
          RETURNING id, name, unit, store, category
        `, [
          item.productName,
          item.category || 'other',
          item.unit || 'count',
          vendor || 'Unknown',
          Math.round(item.amount * 100), // Convert to cents
          item.gramWeight != null && item.gramWeight > 0 ? item.gramWeight : null,
        ]);

        savedProducts.push(productResult.rows[0]);
      } catch (productError) {
        console.error('Error saving product:', productError);
      }

      // Create expense entry
      try {
        const descriptionWithQty = item.gramWeight
          ? `${item.productName} (${item.itemCount || 1} × ${Math.round(item.gramWeight / (item.itemCount || 1))}g)`
          : item.quantity && item.unit
          ? `${item.productName} (${item.quantity}${item.unit})`
          : item.productName;

        const expenseResult = await db.query(`
          INSERT INTO expenses (date, vendor, category, description, amount, status, receipt_scan_id, source_type)
          VALUES (COALESCE($1, NOW()), $2, $3, $4, $5, 'pending', $6, 'gdrive')
          RETURNING id, date, vendor, category, description, amount, status
        `, [
          date || null,
          vendor || 'Online Order',
          item.category || 'other',
          descriptionWithQty,
          item.amount, // expenses.amount stores plain dollars, not cents
          receiptScanId,
        ]);

        createdExpenses.push(expenseResult.rows[0]);
      } catch (expenseError) {
        console.error('Error creating expense:', expenseError);
      }

      // Keep Inventory in sync for food items (skips non-food automatically)
      try {
        await syncInventoryFromReceiptItem(
          {
            name: item.productName,
            displayName: item.displayName,
            category: item.category,
            amount: item.amount,
            quantity: item.quantity,
            unit: item.unit,
            gramsTotal: item.gramWeight,
          },
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
  isDailyQuotaExceeded,
};
