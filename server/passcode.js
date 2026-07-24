// Set (or change) the shared passcode.
//
//   1. edit APP_PASSCODE in .env
//   2. npm run passcode
//
// Unlike `npm run migrate`, this OVERWRITES the stored hash — that is the whole
// point. Every signed-in browser is logged out, because the session token is
// derived from the passcode hash.
if (!process.env.VERCEL) require('dotenv').config();

const crypto = require('crypto');
const db = require('./db');

async function main() {
  const passcode = process.env.APP_PASSCODE;

  if (!passcode) {
    console.error('✗ APP_PASSCODE is empty in .env — set it, then run this again.');
    process.exit(1);
  }
  if (passcode.length < 6) {
    console.error(`✗ APP_PASSCODE is only ${passcode.length} characters. Use at least 6.`);
    process.exit(1);
  }

  const hash = crypto.createHash('sha256').update(passcode).digest('hex');

  const { rows: before } = await db.query(
    `SELECT value FROM settings WHERE key = 'passcode_hash'`
  );
  const unchanged = before.length && before[0].value === hash;

  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('passcode_hash', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [hash]
  );

  const masked = passcode.slice(0, 2) + '•'.repeat(Math.max(0, passcode.length - 2));
  if (unchanged) {
    console.log(`· passcode unchanged (${masked}) — nothing to do.`);
  } else {
    console.log(`✓ passcode set to ${masked}`);
    console.log('  Everyone currently signed in has been logged out.');
    console.log('  Remember to update APP_PASSCODE in Vercel too:');
    console.log('    vercel env rm APP_PASSCODE production && vercel env add APP_PASSCODE production');
  }

  await db.pool.end();
}

main().catch((err) => {
  console.error('failed to set passcode:', err.message);
  process.exit(1);
});
