const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { processReceiptWithAI, saveReceiptToDB } = require('./receiptProcessor');

let drive = null;

/**
 * Initialize Google Drive API with service account credentials
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
    console.log('✓ Google Drive initialized');
    return drive;
  } catch (error) {
    console.error('Error initializing Google Drive:', error);
    throw error;
  }
}

/**
 * Find or create receipts folder in Google Drive
 */
async function getOrCreateReceiptsFolder(folderName = 'Fit4Sure Receipts') {
  try {
    if (!drive) initializeDrive();

    // Search for existing folder
    const response = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      pageSize: 10,
    });

    if (response.data.files && response.data.files.length > 0) {
      console.log(`Found receipts folder: ${response.data.files[0].id}`);
      return response.data.files[0].id;
    }

    // Create folder if not found
    const folder = await drive.files.create({
      resource: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    console.log(`Created receipts folder: ${folder.data.id}`);
    return folder.data.id;
  } catch (error) {
    console.error('Error managing receipts folder:', error);
    throw error;
  }
}

/**
 * Get unprocessed receipt images from Google Drive folder
 */
async function getUnprocessedReceipts(folderId) {
  try {
    if (!drive) initializeDrive();

    console.log(`Searching for images in folder: ${folderId}`);

    // Get ALL files first to see what's there
    const allFilesResponse = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, mimeType, createdTime)',
      pageSize: 50,
      orderBy: 'createdTime desc',
    });

    console.log(`Found ${allFilesResponse.data.files?.length || 0} total files in folder`);

    if (allFilesResponse.data.files) {
      allFilesResponse.data.files.forEach(f => {
        console.log(`  - ${f.name} (${f.mimeType})`);
      });
    }

    // Filter to image files
    const imageFiles = (allFilesResponse.data.files || []).filter(f =>
      f.mimeType && f.mimeType.startsWith('image/')
    );

    console.log(`Filtered to ${imageFiles.length} image files`);

    return imageFiles;
  } catch (error) {
    console.error('Error fetching receipts from Drive:', error);
    throw error;
  }
}

/**
 * Download image from Google Drive as base64
 */
async function downloadImageAsBase64(fileId) {
  try {
    if (!drive) initializeDrive();

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(response.data);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error downloading file from Drive:', error);
    throw error;
  }
}

/**
 * Move processed receipt to archive folder
 */
async function archiveReceipt(fileId, fileName) {
  try {
    if (!drive) initializeDrive();

    // Create archive folder if needed
    const archiveFolder = await getOrCreateReceiptsFolder('Fit4Sure Receipts/Processed');

    // Move file to archive
    await drive.files.update({
      fileId,
      addParents: archiveFolder,
      removeParents: 'root', // Remove from root (will be moved to archive)
      fields: 'id, parents',
    });

    console.log(`Archived receipt: ${fileName}`);
  } catch (error) {
    console.error('Error archiving receipt:', error);
    // Don't throw - continue processing even if archiving fails
  }
}

/**
 * Process all receipts in Google Drive folder
 */
async function processReceiptsFromDrive() {
  try {
    console.log('Starting receipt sync from Google Drive...');

    if (!drive) initializeDrive();

    // Get receipts folder
    const folderId = await getOrCreateReceiptsFolder();

    // Get unprocessed receipts
    const receipts = await getUnprocessedReceipts(folderId);

    if (receipts.length === 0) {
      console.log('No new receipts to process');
      return { processed: 0, failed: 0 };
    }

    console.log(`Found ${receipts.length} receipts to process`);

    let processed = 0;
    let failed = 0;

    // Process each receipt
    for (const receipt of receipts) {
      try {
        console.log(`Processing: ${receipt.name}`);

        // Download image
        const base64Image = await downloadImageAsBase64(receipt.id);

        // Process with AI
        const receiptData = await processReceiptWithAI(base64Image, receipt.name);

        // Save to database
        await saveReceiptToDB(receiptData);

        // Archive the receipt
        await archiveReceipt(receipt.id, receipt.name);

        processed++;
        console.log(`✓ Processed: ${receipt.name}`);
      } catch (error) {
        failed++;
        console.error(`✗ Failed to process ${receipt.name}:`, error.message);
        // Continue processing other receipts
      }
    }

    console.log(`\nReceipt sync complete: ${processed} processed, ${failed} failed`);
    return { processed, failed, total: receipts.length };
  } catch (error) {
    console.error('Error in receipt sync:', error);
    throw error;
  }
}

/**
 * Start automatic receipt sync (runs periodically)
 */
function startAutoReceiptSync(intervalMinutes = 5) {
  console.log(`Starting auto receipt sync every ${intervalMinutes} minutes`);

  // Run immediately on start
  processReceiptsFromDrive().catch(err => console.error('Auto sync error:', err));

  // Then run periodically
  setInterval(() => {
    processReceiptsFromDrive().catch(err => console.error('Auto sync error:', err));
  }, intervalMinutes * 60 * 1000);
}

module.exports = {
  initializeDrive,
  getOrCreateReceiptsFolder,
  getUnprocessedReceipts,
  downloadImageAsBase64,
  archiveReceipt,
  processReceiptsFromDrive,
  startAutoReceiptSync,
};
