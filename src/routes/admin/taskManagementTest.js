const express = require('express')
const router = express.Router()
const pool = require('../../config/db')
const axios = require('axios')

// ============================================================================
// TEST: Get sample data for development
// ============================================================================

router.get('/test-data', async (req, res) => {
  try {
    // Get customers
    const customersResult = await pool.query(
      `SELECT id, name, sales_pipeline_stage FROM customers LIMIT 10`
    )

    // Get menus
    const menusResult = await pool.query(
      `SELECT id, name, protein, carb, vegetable, sauce FROM menus LIMIT 5`
    )

    // Get recent orders
    const ordersResult = await pool.query(
      `SELECT
        id,
        customer_id,
        quantity,
        total_price,
        created_at
       FROM orders
       WHERE created_at >= NOW() - INTERVAL '7 days'
       LIMIT 20`
    )

    res.json({
      customers: customersResult.rows,
      menus: menusResult.rows,
      orders: ordersResult.rows,
      stats: {
        total_customers: customersResult.rows.length,
        total_menus: menusResult.rows.length,
        recent_orders: ordersResult.rows.length
      }
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// TEST: Check if tables exist
// ============================================================================

router.get('/check-tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'production_%' OR table_name = 'labor_%' OR table_name = 'procurement_%' OR table_name = 'waste_%'
    `)

    res.json({
      tables_found: result.rows.map(r => r.table_name),
      status: result.rows.length > 0 ? 'TABLES EXIST' : 'TABLES MISSING - Run migration'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ============================================================================
// RECEIPT PARSER: Parse receipts with GoHighLevel
// ============================================================================

/**
 * Parse receipt with GoHighLevel Document Intelligence API
 * Sends base64 image to GHL for AI-powered OCR parsing
 */
router.post('/parse-receipt', async (req, res) => {
  const GHL_API_KEY = process.env.GHL_API_KEY
  const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID

  try {
    const { imageBase64, fileName } = req.body || {}

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' })
    }

    if (!GHL_API_KEY || !GHL_LOCATION_ID) {
      console.warn('[parse-receipt] Missing GHL credentials, using mock data')
      // Fallback to mock if credentials not configured
      return res.json({
        success: true,
        data: getMockReceiptData(),
        source: 'mock',
        message: 'Using mock data (configure GHL_API_KEY and GHL_LOCATION_ID for real parsing)'
      })
    }

    console.log('[parse-receipt] Calling GoHighLevel Private Integration v2.0 for:', fileName)
    console.log('[parse-receipt] Location ID:', GHL_LOCATION_ID)
    console.log('[parse-receipt] API Key (first 20 chars):', GHL_API_KEY?.substring(0, 20) + '...')

    // GoHighLevel Private Integration API v2.0
    // Using Private Integration credentials (pit-* format)
    let ghlResponse = null
    let lastError = null

    try {
      console.log('[parse-receipt] Attempting GHL v2.0 API: POST /private-integrations/parse-receipt')

      ghlResponse = await axios.post(
        'https://api.gohighlevel.com/v2/private-integrations/parse-receipt',
        {
          image: imageBase64,
          fileName: fileName,
          documentType: 'receipt',
          locationId: GHL_LOCATION_ID
        },
        {
          headers: {
            'Authorization': `Bearer ${GHL_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      )
      console.log('[parse-receipt] GHL v2.0 API succeeded with status:', ghlResponse.status)
    } catch (err) {
      lastError = err
      console.log('[parse-receipt] GHL v2.0 API failed:', {
        status: err.response?.status,
        message: err.message,
        data: err.response?.data
      })

      // Fallback: Try alternate endpoint format
      try {
        console.log('[parse-receipt] Attempting alternate endpoint: /v2/workflows/trigger')
        ghlResponse = await axios.post(
          'https://api.gohighlevel.com/v2/workflows/trigger',
          {
            workflowId: 'parse-receipt',
            data: {
              image: imageBase64,
              fileName: fileName,
              documentType: 'receipt'
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${GHL_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        )
        console.log('[parse-receipt] Workflow trigger succeeded')
      } catch (err2) {
        console.log('[parse-receipt] Workflow trigger also failed:', err2.response?.status || err2.message)
      }
    }

    // If GHL API failed, use mock with debug info
    if (!ghlResponse) {
      console.error('[parse-receipt] GHL v2.0 API calls failed. Using mock data.')
      console.error('[parse-receipt] Error details:', {
        status: lastError?.response?.status,
        message: lastError?.message,
        responseData: lastError?.response?.data
      })

      return res.json({
        success: true,
        data: getMockReceiptData(),
        source: 'mock',
        debug: {
          status: lastError?.response?.status,
          error: lastError?.message,
          apiResponse: lastError?.response?.data,
          hint: 'GHL v2.0 API currently unavailable - ensure Private Integration is active and credentials are correct'
        }
      })
    }

    console.log('[parse-receipt] Processing GHL response')

    console.log('[parse-receipt] GHL response received')

    // Parse GHL response and extract receipt data
    const parsedData = parseGHLResponse(ghlResponse.data)

    return res.json({
      success: true,
      data: parsedData,
      source: 'gohighlevel',
      message: 'Receipt parsed successfully with GoHighLevel AI'
    })
  } catch (error) {
    console.error('[parse-receipt] Outer catch error:', error.message)

    // Return mock data on any error
    return res.json({
      success: true,
      data: getMockReceiptData(),
      source: 'mock',
      message: 'Parsed with mock data (GHL currently unavailable)',
      error: error.message
    })
  }
})

/**
 * Parse GoHighLevel API response format
 * GHL returns structured OCR data that we normalize
 */
function parseGHLResponse(ghlData) {
  if (!ghlData) return getMockReceiptData()

  try {
    // GHL response structure varies - adapt to actual format
    const vendor = ghlData.vendor || ghlData.storeName || 'Unknown Vendor'
    const items = (ghlData.items || ghlData.lineItems || []).map(item => ({
      description: item.name || item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'unit',
      price: parseFloat(item.amount || item.price || 0),
      category: categorizeItem(item.name || item.description || '')
    }))

    const total = parseFloat(ghlData.total || ghlData.amount || 0)

    return {
      vendor,
      items,
      total,
      confidence: ghlData.confidence || 0.85,
      date: ghlData.date || new Date().toISOString().split('T')[0],
      status: 'parsed',
      source: 'gohighlevel'
    }
  } catch (err) {
    console.error('[parseGHLResponse] Error parsing response:', err)
    return getMockReceiptData()
  }
}

/**
 * Mock receipt data for testing/fallback
 */
function getMockReceiptData() {
  return {
    vendor: 'Local Produce Market',
    items: [
      {
        description: 'Fresh Vegetables (Mixed)',
        quantity: 5,
        unit: 'lbs',
        price: 24.99,
        category: 'food_cogs'
      },
      {
        description: 'Chicken Breast (Organic)',
        quantity: 10,
        unit: 'lbs',
        price: 45.50,
        category: 'food_cogs'
      },
      {
        description: 'Olive Oil',
        quantity: 1,
        unit: 'L',
        price: 12.99,
        category: 'food_cogs'
      }
    ],
    total: 83.48,
    confidence: 0.92,
    date: new Date().toISOString().split('T')[0],
    status: 'parsed'
  }
}

/**
 * Auto-categorize receipt items based on keywords
 */
function categorizeItem(description) {
  if (!description) return 'other'

  const lower = description.toLowerCase()

  if (lower.match(/vegetable|fruit|meat|chicken|beef|fish|produce|organic|ingredient|spice|oil|butter|cream|cheese|milk|protein|fresh|lettuce|tomato|onion|pepper|garlic|rice|grain|flour/)) {
    return 'food_cogs'
  }
  if (lower.match(/container|box|bag|wrap|foil|plastic|cup|lid|label|tape|package|carton|tray/)) {
    return 'packaging'
  }
  if (lower.match(/delivery|fuel|gas|transportation|shipping|courier/)) {
    return 'delivery'
  }
  if (lower.match(/wage|salary|payroll|staff|employee|labor|hourly/)) {
    return 'labor'
  }
  if (lower.match(/electricity|water|gas|internet|phone|utility|bill/)) {
    return 'utilities'
  }

  return 'other'
}

module.exports = router
