const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const vision = require('@google-cloud/vision');
const fetch = require('node-fetch');

// Initialize Vision API client with credentials from env
const getVisionClient = () => {
  try {
    const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS)
      : null;

    if (!credentials) {
      throw new Error('Google credentials not configured');
    }

    return new vision.ImageAnnotatorClient({
      credentials: {
        type: credentials.type,
        project_id: credentials.project_id,
        private_key_id: credentials.private_key_id,
        private_key: credentials.private_key.replace(/\\n/g, '\n'),
        client_email: credentials.client_email,
        client_id: credentials.client_id,
        auth_uri: credentials.auth_uri,
        token_uri: credentials.token_uri,
      }
    });
  } catch (error) {
    console.error('Vision client error:', error);
    throw error;
  }
};

// Use OCR.space API (free, no API key, reliable for receipts)
const tryOcrSpaceAPI = async (imageBase64) => {
  try {
    console.log('Calling OCR.space API...');
    const payload = {
      base64Image: `data:image/png;base64,${imageBase64}`,
      language: 'eng',
      isOverlayRequired: false,
    };

    console.log('Payload size:', JSON.stringify(payload).length);

    const response = await fetch('https://api.ocr.space/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: 30000
    });

    console.log('OCR.space response status:', response.status);

    const data = await response.json();

    console.log('OCR.space response keys:', Object.keys(data));
    console.log('IsErroredOnProcessing:', data.IsErroredOnProcessing);
    console.log('ErrorMessage:', data.ErrorMessage);

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage || 'OCR processing failed');
    }

    const text = data.ParsedText || '';
    console.log('Extracted text length:', text.length);
    return text;
  } catch (error) {
    console.error('OCR.space error:', error);
    throw error;
  }
};

// POST /api/admin/expenses/save-receipt-items - Save scanned receipt items to database
router.post('/save-receipt-items', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { items, vendor } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const savedProducts = [];
    const createdExpenses = [];

    // Process each item
    for (const item of items) {
      const { productName, description, amount, category, unit, quantity } = item;

      // Product name defaults to description if not provided
      const finalProductName = productName || description;

      if (!finalProductName || !category || amount <= 0) {
        console.warn('Skipping invalid item:', item);
        continue;
      }

      // Save product to database
      try {
        const productResult = await db.query(`
          INSERT INTO receipt_products (name, category, unit, store, last_purchase_price_cents)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (LOWER(name), store)
          DO UPDATE SET
            last_purchase_price_cents = $5,
            last_purchase_date = NOW(),
            purchase_count = purchase_count + 1
          RETURNING id, name, unit, store
        `, [
          finalProductName,
          category,
          unit || 'g',
          vendor || 'Unknown',
          Math.round(amount * 100) // Convert to cents
        ]);

        savedProducts.push(productResult.rows[0]);
      } catch (productError) {
        console.error('Error saving product:', productError);
      }

      // Create expense entry
      try {
        const expenseResult = await db.query(`
          INSERT INTO expenses (date, vendor, category, description, amount, status)
          VALUES (NOW(), $1, $2, $3, $4, 'pending')
          RETURNING id, date, vendor, category, description, amount, status
        `, [
          vendor || 'Receipt',
          category,
          finalProductName + (quantity && unit ? ` (${quantity}${unit})` : ''),
          amount // expenses.amount stores plain dollars, not cents
        ]);

        createdExpenses.push(expenseResult.rows[0]);
      } catch (expenseError) {
        console.error('Error creating expense:', expenseError);
      }
    }

    res.json({
      success: true,
      data: {
        productsAdded: savedProducts.length,
        expensesCreated: createdExpenses.length,
        products: savedProducts,
        expenses: createdExpenses
      }
    });

  } catch (error) {
    console.error('Error saving receipt items:', error);
    res.status(500).json({ error: error.message || 'Failed to save receipt items' });
  }
});

// POST /api/admin/expenses/scan-receipt - Scan receipt with Tesseract OCR
router.post('/scan-receipt', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { imageBase64, imageUrl } = req.body;

    console.log('=== Receipt Scan Request ===');
    console.log('Has imageBase64:', !!imageBase64);
    console.log('Has imageUrl:', !!imageUrl);
    console.log('Base64 length:', imageBase64?.length || 0);

    if (!imageBase64 && !imageUrl) {
      return res.status(400).json({ error: 'Either imageBase64 or imageUrl required' });
    }

    // Remove data:image/* prefix if present
    let cleanBase64 = imageBase64 && imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;

    console.log('Cleaned base64 length:', cleanBase64?.length || 0);

    // Validate base64 is not too small (likely corrupted)
    if (!cleanBase64 || cleanBase64.length < 1000) {
      console.error('Base64 too small:', cleanBase64?.length || 0);
      return res.status(400).json({ error: 'Image data appears corrupted or too small' });
    }

    let fullText = '';

    // Use OCR.space - it's more reliable for receipts
    console.log('Sending to OCR.space...');
    try {
      fullText = await tryOcrSpaceAPI(cleanBase64);
      console.log('OCR.space result length:', fullText?.length || 0);
      console.log('First 200 chars:', fullText?.substring(0, 200) || 'EMPTY');
    } catch (ocrError) {
      console.error('OCR.space failed:', ocrError.message);
      return res.status(400).json({ error: `OCR failed: ${ocrError.message}` });
    }

    if (!fullText || fullText.trim().length === 0) {
      console.error('No text extracted');
      return res.status(400).json({ error: 'No readable text found in image' });
    }

    console.log('Parsing receipt data...');
    // Parse receipt data
    const receiptData = parseReceipt(fullText);
    console.log('Parsed data:', { vendor: receiptData.vendor, itemCount: receiptData.items.length, total: receiptData.total });

    res.json({
      success: true,
      data: {
        rawText: fullText,
        vendor: receiptData.vendor,
        date: receiptData.date,
        items: receiptData.items,
        total: receiptData.total,
        subtotal: receiptData.subtotal,
      }
    });

  } catch (error) {
    console.error('=== Receipt scan error ===', error);
    res.status(500).json({ error: error.message || 'Failed to scan receipt' });
  }
});

// Parse receipt text and extract structured data
function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Extract vendor (usually first line)
  const vendor = lines[0] || 'Unknown Vendor';

  // Extract date (look for date patterns)
  const dateMatch = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
  const date = dateMatch ? dateMatch[0] : new Date().toISOString().split('T')[0];

  // Extract amounts - look for dollar amounts
  const amountPattern = /\$?\s*(\d+[.,]\d{2})/g;
  const amounts = [];
  let match;
  while ((match = amountPattern.exec(text)) !== null) {
    amounts.push(parseFloat(match[1].replace(',', '')));
  }

  // Total is usually the last large amount
  const total = amounts.length > 0 ? amounts[amounts.length - 1] : 0;
  const subtotal = amounts.length > 1 ? amounts[amounts.length - 2] : total;

  // Extract line items (lines with amounts)
  const items = [];
  const itemPattern = /^(.+?)\s+\$?(\d+[.,]\d{2})$/gm;
  let itemMatch;
  while ((itemMatch = itemPattern.exec(text)) !== null) {
    const description = itemMatch[1].trim();
    const amount = parseFloat(itemMatch[2].replace(',', ''));

    if (description.length > 2 && amount > 0) {
      items.push({
        description,
        amount,
        category: categorizeItem(description),
        confidence: 0.90
      });
    }
  }

  return {
    vendor,
    date,
    items,
    total,
    subtotal
  };
}

// Categorize items based on keywords
function categorizeItem(description) {
  const lower = description.toLowerCase();

  if (lower.match(/vegetable|fruit|meat|chicken|beef|fish|produce|organic|ingredient|spice|oil|butter|cream|cheese|milk/)) {
    return 'food_cogs';
  } else if (lower.match(/container|box|bag|wrap|foil|plastic|cup|lid|label|tape|package/)) {
    return 'packaging';
  } else if (lower.match(/delivery|fuel|gas|transportation|shipping|courier/)) {
    return 'delivery';
  } else if (lower.match(/wage|salary|payroll|staff|employee|labor/)) {
    return 'labor';
  } else if (lower.match(/electricity|water|gas|internet|phone|utility/)) {
    return 'utilities';
  }

  return 'other';
}

module.exports = router;
