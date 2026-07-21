const db = require('../config/db');
const fs = require('fs');
const path = require('path');

/**
 * Parse receipt text and extract structured item data
 * Uses simple regex patterns - no AI needed
 */
function parseReceiptText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Extract vendor (usually first line)
  let vendor = lines[0] || 'Unknown Store';
  vendor = vendor.replace(/RECEIPT|INVOICE|ORDER|CONFIRMATION|#\d+/gi, '').trim();
  if (vendor.length > 100) vendor = vendor.substring(0, 50);

  // Keywords to exclude (totals, payment info, etc.)
  const excludeKeywords = [
    'TOTAL', 'SUBTOTAL', 'TAX', 'AMOUNT DUE', 'CHANGE', 'BALANCE',
    'PAYMENT', 'TENDER', 'CASH', 'CARD', 'DEBIT', 'CREDIT',
    'VISA', 'MASTERCARD', 'AMEX', 'DATE', 'TIME', 'STORE', 'PHONE',
    'RETURN', 'REFUND', 'DISCOUNT', 'COUPON', 'VOID', 'CANCELED',
    'REGISTER', 'CASHIER', 'TERMINAL', 'TRANSACTION', 'RECEIPT'
  ];

  const items = [];
  const pricePattern = /\$?\s*(\d+[.,]\d{2})/;
  const quantityPattern = /(\d+(?:\.\d+)?)\s*(g|kg|oz|lb|ml|l|liter|liters|cup|tbsp|tsp|count|x|each)/i;

  for (let i = 1; i < Math.min(lines.length, 60); i++) {
    const line = lines[i];
    const upperLine = line.toUpperCase();

    // Skip excluded keywords
    if (excludeKeywords.some(kw => upperLine.includes(kw))) continue;

    // Find price
    const priceMatch = line.match(pricePattern);
    if (!priceMatch) continue;

    const price = parseFloat(priceMatch[1].replace(',', '.'));
    if (price <= 0 || price > 10000) continue;

    // Extract description (remove price)
    let description = line.replace(/\$?\s*\d+[.,]\d{2}/g, '').trim();

    // Extract quantity if present
    const qtyMatch = description.match(quantityPattern);
    let quantity = null;
    let unit = 'count';

    if (qtyMatch) {
      quantity = parseFloat(qtyMatch[1]) || null;
      unit = normalizeUnit(qtyMatch[2]);
      description = description.replace(quantityPattern, '').trim();
    }

    if (description.length > 2) {
      items.push({
        name: description,
        price: price,
        quantity: quantity,
        unit: unit,
        category: categorizeItem(description),
        vendor: vendor,
      });
    }
  }

  return {
    vendor: vendor,
    items: items,
  };
}

/**
 * Normalize unit names
 */
function normalizeUnit(unit) {
  const lower = unit.toLowerCase();
  if (lower.includes('k')) return 'kg';
  if (lower.includes('g')) return 'g';
  if (lower.includes('oz')) return 'oz';
  if (lower.includes('lb')) return 'lb';
  if (lower.includes('l')) return 'L';
  if (lower.includes('ml')) return 'ml';
  if (lower.includes('cup')) return 'cup';
  if (lower.includes('tbsp')) return 'tbsp';
  if (lower.includes('tsp')) return 'tsp';
  if (lower === 'x' || lower === 'each') return 'count';
  return 'count';
}

/**
 * Auto-categorize item
 */
function categorizeItem(description) {
  const lower = description.toLowerCase();

  if (lower.match(/vegetable|fruit|meat|chicken|beef|fish|produce|organic|ingredient|spice|oil|butter|cream|cheese|milk|protein|fresh|lettuce|tomato|onion|pepper|garlic|egg|rice|bean|pasta|bread|flour|sugar/)) {
    return 'food_cogs';
  } else if (lower.match(/container|box|bag|wrap|foil|plastic|cup|lid|label|tape|package|carton|tray|bottle|jar/)) {
    return 'packaging';
  } else if (lower.match(/delivery|fuel|gas|transportation|shipping|courier|logistics|freight/)) {
    return 'delivery';
  } else if (lower.match(/wage|salary|payroll|staff|employee|labor|worker|hourly/)) {
    return 'labor';
  } else if (lower.match(/electricity|water|gas|internet|phone|utility|electric|bill|service/)) {
    return 'utilities';
  }

  return 'other';
}

/**
 * Process receipt image with local OCR (Tesseract via child process)
 * Falls back to text-only parsing if image processing fails
 */
async function processReceiptImage(imageBase64, filename) {
  try {
    console.log(`Processing receipt: ${filename}`);

    // For now, just return empty items - user will manually enter
    // This is a placeholder for future OCR integration
    return {
      vendor: extractVendorFromFilename(filename),
      items: [],
      filename: filename,
    };
  } catch (error) {
    console.error(`Error processing ${filename}:`, error.message);
    return {
      vendor: extractVendorFromFilename(filename),
      items: [],
      filename: filename,
      error: error.message,
    };
  }
}

/**
 * Try to extract vendor from filename
 */
function extractVendorFromFilename(filename) {
  // Remove date, extension
  let vendor = filename
    .replace(/\.\w+$/, '') // Remove extension
    .replace(/\d{4}-\d{2}-\d{2}/, '') // Remove dates
    .replace(/_/g, ' ')
    .replace(/^\d+\s*/, '')
    .trim();

  return vendor || 'Unknown Store';
}

/**
 * Save approved receipt items to database
 */
async function saveReceiptItemsToDatabase(items, vendor, date) {
  try {
    const savedProducts = [];
    const createdExpenses = [];

    for (const item of items) {
      if (!item.name || item.price <= 0) continue;

      // Save product
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
          item.name,
          item.category || 'other',
          item.unit || 'count',
          vendor || 'Manual Entry',
          Math.round(item.price * 100),
        ]);

        savedProducts.push(productResult.rows[0]);
      } catch (err) {
        console.error('Error saving product:', err);
      }

      // Create expense
      try {
        const description = item.quantity && item.unit
          ? `${item.name} (${item.quantity}${item.unit})`
          : item.name;

        const expenseResult = await db.query(`
          INSERT INTO expenses (date, vendor, category, description, amount, status)
          VALUES ($1, $2, $3, $4, $5, 'pending')
          RETURNING id, date, vendor, category, description, amount, status
        `, [
          date || new Date().toISOString().split('T')[0],
          vendor || 'Manual Entry',
          item.category || 'other',
          description,
          item.price, // expenses.amount stores plain dollars, not cents
        ]);

        createdExpenses.push(expenseResult.rows[0]);
      } catch (err) {
        console.error('Error creating expense:', err);
      }
    }

    console.log(`Saved ${savedProducts.length} products, created ${createdExpenses.length} expenses`);
    return {
      productsAdded: savedProducts.length,
      expensesCreated: createdExpenses.length,
    };
  } catch (error) {
    console.error('Error saving to database:', error);
    throw error;
  }
}

module.exports = {
  parseReceiptText,
  processReceiptImage,
  saveReceiptItemsToDatabase,
  categorizeItem,
};
