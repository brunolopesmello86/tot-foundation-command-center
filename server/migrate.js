// Runs schema.sql then (optionally) the seed. Idempotent — safe to re-run.
//   npm run migrate      → schema + seed
//   node server/migrate.js --schema-only
if (!process.env.VERCEL) require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { seed } = require('./seed');

async function main() {
  const schemaOnly = process.argv.includes('--schema-only');

  console.log('→ applying schema…');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('✓ schema applied');

  // Store the passcode hash on first run. Never overwritten by later migrates —
  // change it deliberately with `node server/migrate.js` after clearing the row,
  // or via the settings table.
  const passcode = process.env.APP_PASSCODE;
  if (passcode) {
    const hash = crypto.createHash('sha256').update(passcode).digest('hex');
    const { rowCount } = await db.query(
      `INSERT INTO settings (key, value) VALUES ('passcode_hash', $1)
       ON CONFLICT (key) DO NOTHING`,
      [hash]
    );
    console.log(rowCount ? '✓ passcode set' : '· passcode already set (unchanged)');
  } else {
    console.warn('! APP_PASSCODE not set — the app will refuse every login until it is.');
  }

  if (!schemaOnly) {
    console.log('→ seeding…');
    await seed();
    console.log('✓ seed complete');
  }

  await db.pool.end();
  console.log('done.');
}

main().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
