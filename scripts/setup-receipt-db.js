require('dotenv').config()
const db = require('../src/config/db')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  try {
    console.log('Running receipt_products table migration...')

    const migrationSql = fs.readFileSync(
      path.join(__dirname, '../migrations/create_receipt_products_table.sql'),
      'utf8'
    )

    await db.query(migrationSql)
    console.log('✓ receipt_products table created successfully')

    // Verify table exists
    const result = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'receipt_products'
      )
    `)

    if (result.rows[0].exists) {
      console.log('✓ Table verified')

      // Show table structure
      const structResult = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'receipt_products'
        ORDER BY ordinal_position
      `)

      console.log('\nTable structure:')
      structResult.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`)
      })
    } else {
      console.error('✗ Table creation failed')
      process.exit(1)
    }

    await db.end()
    console.log('\n✓ Migration complete')
  } catch (error) {
    console.error('✗ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
