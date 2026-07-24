if (!process.env.VERCEL) require('dotenv').config();
const { Pool, types } = require('pg');

// DATE (oid 1082) otherwise becomes a JS Date, which JSON-serialises to UTC and
// can shift a day either side of the timezone. Keep it as the literal
// 'YYYY-MM-DD' string the browser's <input type="date"> expects.
types.setTypeParser(1082, (v) => v);
// NUMERIC (oid 1700) defaults to a string to protect precision. Our values are
// small money/percentage figures, so parse to Number and let the client do math
// without coercing at every call site.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL is not set — every query will fail. See .env.example.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
});

pool.on('error', (err) => console.error('[db] idle client error:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
