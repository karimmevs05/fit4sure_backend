const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { google } = require('googleapis');
const fetch = require('node-fetch');

let drive = null;

/**
 * Initialize Google Drive API
 */
function initializeDrive() {
  try {
    const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS)
      : null;

    if (!credentials) {
      throw new Error('Google credentials not configured');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: credentials.type,
        project_id: credentials.project_id,
        private_key_id: credentials.private_key_id,
        private_key: credentials.private_key.replace(/\\n/g, '\n'),
        client_email: credentials.client_email,
        client_id: credentials.client_id,
        auth_uri: credentials.auth_uri,
        token_uri: credentials.token_uri,
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    drive = google.drive({ version: 'v3', auth });
    return drive;
  } catch (error) {
    console.error('Error initializing Google Drive:', error);
    throw error;
  }
}

/**
 * GET /api/admin/receipt-read/pending
 * Get all unprocessed receipt images from Google Drive
 */
router.get('/pending', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!drive) initializeDrive();

    // Find Fit4Sure Receipts folder
    const folderResponse = await drive.files.list({
      q: `name='Fit4Sure Receipts' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
      return res.json({
        success: true,
        data: { receipts: [], message: 'No Fit4Sure Receipts folder found' }
      });
    }

    const folderId = folderResponse.data.files[0].id;

    // Get all image files in the folder
    const filesResponse = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png') and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, mimeType)',
      pageSize: 50,
    });

    const receipts = [];

    for (const file of filesResponse.data.files || []) {
      try {
        // Download image as base64
        const imageResponse = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );

        const base64Image = Buffer.from(imageResponse.data).toString('base64');

        // Extract vendor from filename
        const vendor = extractVendorFromFilename(file.name);

        receipts.push({
          id: file.id,
          filename: file.name,
          vendor: vendor,
          image: base64Image,
          items: [] // Will be filled by Claude
        });
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err.message);
      }
    }

    res.json({
      success: true,
      data: { receipts }
    });
  } catch (error) {
    console.error('Error reading receipts from Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Extract vendor name from filename
 */
function extractVendorFromFilename(filename) {
  // Remove extension
  let vendor = filename.replace(/\.\w+$/, '');

  // Remove common date patterns
  vendor = vendor
    .replace(/\d{1,2}[\s_-]\w+[\s_-]?\d{4}/, '') // "17 jul 2026", "17_jul_2026"
    .replace(/\d{4}-\d{1,2}-\d{1,2}/, '') // "2026-07-17"
    .replace(/\d{1,2}-\d{1,2}-\d{4}/, '') // "07-17-2026"
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/, '') // "07/17/2026"
    .replace(/jul\s*\d+/i, '') // "jul 17"
    .replace(/july\s*\d+/i, '') // "july 17"
    .trim();

  // Remove leading/trailing numbers and special chars
  vendor = vendor.replace(/^\d+[\s_-]*/, '').replace(/[\s_-]*\d+$/, '').trim();

  // Replace underscores and multiple spaces with single space
  vendor = vendor.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  return vendor || 'Unknown Store';
}

module.exports = router;
