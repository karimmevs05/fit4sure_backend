require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');

async function runMigration() {
  try {
    console.log('Reading schema.sql...');
    const schemaPath = path.join(__dirname, 'src/config/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Running migration...');
    await db.query(schema);

    console.log('✅ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
