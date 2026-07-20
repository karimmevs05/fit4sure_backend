const { google } = require('googleapis');
const db = require('../config/db');

/**
 * Google Sheets Sync Service
 * Automatically imports order data from Google Forms responses
 */

class GoogleSheetsSyncService {
  constructor(credentials) {
    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  /**
   * Parse form responses from Google Sheet
   * Expects columns: Timestamp, Name, Regular, Large, Breakfast, By The LB, Notes
   */
  async parseFormResponses(spreadsheetId, sheetName = 'Form Responses 1') {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A:Z`,
      });

      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        return { responses: [], errors: ['No data found in sheet'] };
      }

      // Parse header row to find column indices
      const headers = rows[0].map(h => h?.toLowerCase().trim() || '');
      const getColIndex = (name) => headers.findIndex(h => h.includes(name));

      const nameCol = getColIndex('name');
      const regularCol = getColIndex('regular');
      const largeCol = getColIndex('large');
      const breakfastCol = getColIndex('breakfast');
      const byTheLbCol = getColIndex('lb');
      const notesCol = getColIndex('notes');
      const timestampCol = 0;

      if (nameCol === -1) {
        return { responses: [], errors: ['Name column not found'] };
      }

      const responses = [];
      const errors = [];

      // Parse data rows (skip header)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[nameCol]) continue;

        try {
          const customerName = row[nameCol]?.trim();
          const regularMeals = this.parseNumber(row[regularCol]);
          const largeMeals = this.parseNumber(row[largeCol]);
          const breakfastMeals = this.parseNumber(row[breakfastCol]);
          const byTheLbItems = this.parseNumber(row[byTheLbCol]);
          const notes = row[notesCol]?.trim() || '';
          const timestamp = row[timestampCol]?.trim() || new Date().toISOString();

          if (regularMeals + largeMeals + breakfastMeals + byTheLbItems > 0) {
            responses.push({
              timestamp,
              customerName,
              regularMeals,
              largeMeals,
              breakfastMeals,
              byTheLbItems,
              notes,
            });
          }
        } catch (error) {
          errors.push({
            row: i + 1,
            error: error.message,
            data: row,
          });
        }
      }

      return { responses, errors };
    } catch (error) {
      throw new Error(`Failed to parse Google Sheet: ${error.message}`);
    }
  }

  /**
   * Parse a value as a number, handling various formats
   */
  parseNumber(value) {
    if (!value) return 0;
    const num = parseInt(value.toString().match(/\d+/)?.[0] || 0);
    return Math.max(0, num);
  }

  /**
   * Import parsed responses into database
   */
  async importResponses(responses, weekLabel) {
    if (!responses || responses.length === 0) {
      return { imported: 0, errors: ['No valid responses to import'] };
    }

    try {
      // Find or create menu
      let menuResult = await db.query(
        `SELECT id FROM menus WHERE week_label = $1`,
        [weekLabel]
      );

      let menuId;
      if (menuResult.rows.length === 0) {
        const createMenuResult = await db.query(
          `INSERT INTO menus (week_label, created_at) VALUES ($1, NOW()) RETURNING id`,
          [weekLabel]
        );
        menuId = createMenuResult.rows[0].id;
      } else {
        menuId = menuResult.rows[0].id;
        // Delete old orders to avoid duplicates
        await db.query(`DELETE FROM order_totals WHERE menu_id = $1`, [menuId]);
      }

      let importedCount = 0;
      const errors = [];

      // Import each response
      for (const response of responses) {
        try {
          const { customerName, regularMeals, largeMeals, breakfastMeals, byTheLbItems, notes } = response;

          // Find or create customer
          let customerResult = await db.query(
            `SELECT id FROM customers WHERE LOWER(name) = LOWER($1)`,
            [customerName]
          );

          let customerId;
          if (customerResult.rows.length === 0) {
            const createCustomerResult = await db.query(
              `INSERT INTO customers (name, notes, created_at) VALUES ($1, $2, NOW()) RETURNING id`,
              [customerName, notes || '']
            );
            customerId = createCustomerResult.rows[0].id;
          } else {
            customerId = customerResult.rows[0].id;
            // Update notes if provided
            if (notes) {
              await db.query(
                `UPDATE customers SET notes = $1 WHERE id = $2`,
                [notes, customerId]
              );
            }
          }

          const totalMeals = regularMeals + largeMeals + breakfastMeals + byTheLbItems;

          // Create order
          await db.query(
            `INSERT INTO order_totals (
              menu_id, customer_id, total_meals_monday, total_meals_thursday,
              breakfast_meals, total_meals, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              menuId,
              customerId,
              Math.ceil(totalMeals / 2),
              Math.floor(totalMeals / 2),
              breakfastMeals,
              totalMeals,
            ]
          );

          importedCount++;
        } catch (error) {
          errors.push({
            customer: response.customerName,
            error: error.message,
          });
        }
      }

      return { imported: importedCount, errors: errors.length > 0 ? errors : null, menuId };
    } catch (error) {
      throw new Error(`Failed to import responses: ${error.message}`);
    }
  }

  /**
   * Full sync: fetch from Google Sheets and import
   */
  async syncWeek(spreadsheetId, weekLabel, sheetName = 'Form Responses 1') {
    try {
      const { responses, errors: parseErrors } = await this.parseFormResponses(spreadsheetId, sheetName);

      if (responses.length === 0) {
        return {
          success: false,
          message: 'No valid responses found',
          errors: parseErrors,
        };
      }

      const { imported, errors: importErrors } = await this.importResponses(responses, weekLabel);

      return {
        success: true,
        imported,
        parsed: responses.length,
        message: `Successfully imported ${imported} orders for ${weekLabel}`,
        errors: importErrors,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = GoogleSheetsSyncService;
