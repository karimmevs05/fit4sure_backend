const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
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
 * A stable link back to the receipt image in Drive's own viewer -- captured
 * at parse time and stored, so the expense summary can link straight to the
 * source image without us hosting a copy ourselves. Stays valid after the
 * file is archived (moving a file doesn't change its id or this link).
 */
async function getFileViewLink(fileId) {
  try {
    if (!drive) initializeDrive();
    const response = await drive.files.get({ fileId, fields: 'webViewLink' });
    return response.data.webViewLink || null;
  } catch (error) {
    console.error('Error fetching Drive view link:', error);
    return null;
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

    // removeParents must name the file's ACTUAL current parent(s), not the
    // literal string 'root' -- this receipt lives in the "Fit4Sure Receipts"
    // folder, not the Drive root, so a hardcoded 'root' 403s with "Increasing
    // the number of parents is not allowed" (Drive adds the new parent but
    // refuses to also drop a parent the file was never actually in).
    const current = await drive.files.get({ fileId, fields: 'parents' });
    const currentParents = (current.data.parents || []).join(',');

    // Move file to archive
    await drive.files.update({
      fileId,
      addParents: archiveFolder,
      removeParents: currentParents || undefined,
      fields: 'id, parents',
    });

    console.log(`Archived receipt: ${fileName}`);
  } catch (error) {
    console.error('Error archiving receipt:', error);
    // Don't throw - continue processing even if archiving fails
  }
}

/**
 * Parse every unprocessed receipt in the Drive folder with AI, but do NOT
 * save anything or archive the files -- that happens only after a human
 * confirms the parsed items (and any edited display names) via
 * confirmAndSaveReceipts(). Each parsed receipt carries its driveFileId/
 * fileName forward so confirmation can archive the right file.
 */
async function parseReceiptsFromDrive() {
  console.log('Starting receipt parse from Google Drive...');

  if (!drive) initializeDrive();

  const folderId = await getOrCreateReceiptsFolder();
  const receipts = await getUnprocessedReceipts(folderId);

  if (receipts.length === 0) {
    console.log('No new receipts to parse');
    return { parsed: [], failed: [] };
  }

  console.log(`Found ${receipts.length} receipts to parse`);

  const parsed = [];
  const failed = [];

  for (const receipt of receipts) {
    try {
      // A file can still be sitting in the inbox despite already being
      // recorded -- e.g. a previous archive-move failed (Drive permissions,
      // API hiccup). Catch that here instead of re-parsing (another AI call,
      // and duplicate expenses/inventory bumps if it were saved again) --
      // just retry moving it out of the way.
      const existing = await db.query('SELECT id FROM receipt_scans WHERE drive_file_id = $1', [receipt.id]);
      if (existing.rows.length > 0) {
        console.log(`Already recorded, re-archiving: ${receipt.name}`);
        await archiveReceipt(receipt.id, receipt.name);
        continue;
      }

      console.log(`Parsing: ${receipt.name}`);
      const base64Image = await downloadImageAsBase64(receipt.id);
      const receiptData = await processReceiptWithAI(base64Image, receipt.name, receipt.mimeType);
      const driveViewLink = await getFileViewLink(receipt.id);
      parsed.push({ driveFileId: receipt.id, fileName: receipt.name, driveViewLink, createdTime: receipt.createdTime, ...receiptData });
      console.log(`✓ Parsed: ${receipt.name}`);
    } catch (error) {
      console.error(`✗ Failed to parse ${receipt.name}:`, error.message);
      failed.push({ filename: receipt.name, error: error.message });
      // Continue parsing other receipts
    }
  }

  const merged = mergeSplitReceipts(parsed);
  const mergedCount = parsed.length - merged.length;
  if (mergedCount > 0) {
    console.log(`Merged ${mergedCount} split-receipt photo(s) into ${merged.filter(r => r.additionalFiles?.length).length} combined receipt(s)`);
  }

  console.log(`\nReceipt parse complete: ${merged.length} parsed, ${failed.length} failed`);
  return { parsed: merged, failed };
}

// Warehouse-club receipts (Costco, Sam's Club) often run too long for one
// photo, so a single physical receipt sometimes gets uploaded as 2+ separate
// images. Gemini can only report the printed TOTAL line if it's visible in
// that specific photo -- so the tell of a split receipt is either (a) no
// total was found at all (this photo was cropped before reaching the
// bottom), or (b) a total was found but it's far larger than this photo's
// own item sum (this photo shows the tail end, whose total covers items
// photographed elsewhere too). Group same-vendor photos uploaded within a
// few minutes of each other and fold fragments into whichever one's total
// actually explains the combined items -- don't finalize any of them on
// their own total until a total line is found that adds up.
const SPLIT_RECEIPT_WINDOW_MS = 15 * 60 * 1000;
const TOTAL_MATCH_TOLERANCE = 0.15; // matches the lowConfidence threshold in receiptProcessor.js

function itemSumOf(receipt) {
  return receipt.items.reduce((sum, item) => sum + (item.amount || 0), 0);
}

function mergeSplitReceipts(receipts) {
  const merged = [];
  const used = new Set();

  for (let i = 0; i < receipts.length; i++) {
    if (used.has(i)) continue;
    const anchor = receipts[i];
    const anchorSum = itemSumOf(anchor);
    const anchorExplainsItself =
      anchor.receiptTotal != null &&
      Math.abs(anchorSum - anchor.receiptTotal) / anchor.receiptTotal <= TOTAL_MATCH_TOLERANCE;

    if (anchorExplainsItself) {
      merged.push(anchor);
      used.add(i);
      continue;
    }

    const candidates = [i];
    for (let j = 0; j < receipts.length; j++) {
      if (j === i || used.has(j)) continue;
      const other = receipts[j];
      if ((other.vendor || '').trim().toLowerCase() !== (anchor.vendor || '').trim().toLowerCase()) continue;
      const anchorTime = anchor.createdTime ? new Date(anchor.createdTime).getTime() : null;
      const otherTime = other.createdTime ? new Date(other.createdTime).getTime() : null;
      if (anchorTime && otherTime && Math.abs(anchorTime - otherTime) > SPLIT_RECEIPT_WINDOW_MS) continue;
      candidates.push(j);
    }

    if (candidates.length === 1) {
      // No same-vendor, nearby-in-time photos to merge with -- leave as-is,
      // same fallback (item sum as total, or existing lowConfidence flag)
      // as before this feature existed.
      merged.push(anchor);
      used.add(i);
      continue;
    }

    // Find whichever candidate's own receiptTotal best explains the whole
    // group's combined item sum -- that one showed the real total line.
    const combinedSum = candidates.reduce((sum, idx) => sum + itemSumOf(receipts[idx]), 0);
    let bestIdx = null;
    let bestDiff = Infinity;
    for (const idx of candidates) {
      const total = receipts[idx].receiptTotal;
      if (total == null) continue;
      const diff = Math.abs(combinedSum - total) / total;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    }

    if (bestIdx != null && bestDiff <= TOTAL_MATCH_TOLERANCE) {
      const primary = receipts[bestIdx];
      const others = candidates.filter((idx) => idx !== bestIdx);
      merged.push({
        ...primary,
        items: candidates.flatMap((idx) => receipts[idx].items),
        lowConfidence: false,
        additionalFiles: others.map((idx) => ({
          driveFileId: receipts[idx].driveFileId,
          fileName: receipts[idx].fileName,
        })),
      });
      candidates.forEach((idx) => used.add(idx));
    } else {
      // No combination of nearby same-vendor photos explains a total --
      // don't guess at a merge, fall back to today's per-photo behavior.
      merged.push(anchor);
      used.add(i);
    }
  }

  return merged;
}

/**
 * Save a batch of previously-parsed receipts (as confirmed/edited by an
 * admin in the review UI) and archive their source files in Drive.
 * receipts: [{ driveFileId, fileName, vendor, receiptTotal, items }]
 */
async function confirmAndSaveReceipts(receipts) {
  let processed = 0;
  let failed = 0;
  let productsAdded = 0;
  let expensesCreated = 0;
  const errors = [];

  for (const receipt of receipts) {
    try {
      const result = await saveReceiptToDB(receipt);
      productsAdded += result.productsAdded;
      expensesCreated += result.expensesCreated;
      if (receipt.driveFileId) {
        await archiveReceipt(receipt.driveFileId, receipt.fileName);
      }
      // A merged split-receipt carries every source photo it absorbed --
      // archive all of them, not just the primary one, or the fragment
      // photo sits in the inbox and gets re-parsed (and re-merged) next sync.
      if (Array.isArray(receipt.additionalFiles)) {
        for (const extra of receipt.additionalFiles) {
          if (extra.driveFileId) await archiveReceipt(extra.driveFileId, extra.fileName);
        }
      }
      processed++;
    } catch (error) {
      failed++;
      console.error(`✗ Failed to save ${receipt.fileName}:`, error.message);
      errors.push({ filename: receipt.fileName, error: error.message });
    }
  }

  return { processed, failed, total: receipts.length, errors, productsAdded, expensesCreated };
}

/**
 * Process all receipts in Google Drive folder: parse + save + archive in
 * one pass, no review step. Kept for startAutoReceiptSync (currently not
 * wired up to run automatically -- see src/index.js); the live "Sync Now"
 * button instead uses parseReceiptsFromDrive + confirmAndSaveReceipts so an
 * admin can review display names before anything is saved.
 */
async function processReceiptsFromDrive() {
  const { parsed, failed: parseFailed } = await parseReceiptsFromDrive();
  const { processed, failed: saveFailed, errors: saveErrors } = await confirmAndSaveReceipts(parsed);
  return {
    processed,
    failed: parseFailed.length + saveFailed,
    total: parsed.length + parseFailed.length,
    errors: [...parseFailed, ...saveErrors],
  };
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
  parseReceiptsFromDrive,
  confirmAndSaveReceipts,
  processReceiptsFromDrive,
  startAutoReceiptSync,
  mergeSplitReceipts,
};
