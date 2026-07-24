// ═══════════════════════════════════════════════════════════════════════════
// T&OT Foundation Command Center — API
// Express + Neon Postgres, deployed as a single Vercel serverless function.
// ═══════════════════════════════════════════════════════════════════════════
if (!process.env.VERCEL) require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('./db');
const { seed } = require('./seed');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Schema bootstrap ────────────────────────────────────────────────────────
// Serverless cold starts can hit a database that has never been migrated, and
// read paths would then crash on a missing table. Applying the (idempotent)
// schema once per instance makes every endpoint safe without a deploy hook.
let _bootstrap = null;
function ensureSchema() {
  if (_bootstrap) return _bootstrap;
  _bootstrap = (async () => {
    try {
      const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await db.query(sql);
      await seed();
    } catch (err) {
      // Non-fatal: a healthy, already-migrated database must not be taken down
      // by a bootstrap hiccup. Surface it in logs instead.
      console.warn('[bootstrap] schema/seed skipped:', err.message);
    }
  })();
  return _bootstrap;
}

app.use('/api', async (req, res, next) => {
  try { await ensureSchema(); } catch (_) { /* logged above */ }
  next();
});

// ── Auth ────────────────────────────────────────────────────────────────────
const AUTH_SECRET = process.env.AUTH_SECRET || 'tot-foundation-dev-secret-change-me';
if (!process.env.AUTH_SECRET) {
  console.warn('[auth] AUTH_SECRET not set — using the built-in dev secret. Set it in Vercel.');
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tokenFor = (passcodeHash) =>
  crypto.createHmac('sha256', AUTH_SECRET).update(passcodeHash).digest('hex');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function storedPasscodeHash() {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'passcode_hash'`);
  if (rows.length) return rows[0].value;
  // Fall back to the env var so a fresh database is usable straight after deploy.
  return process.env.APP_PASSCODE ? sha256(process.env.APP_PASSCODE) : null;
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { passcode } = req.body || {};
    if (!passcode) return res.status(400).json({ error: 'Passcode required' });

    const stored = await storedPasscodeHash();
    if (!stored) {
      return res.status(503).json({ error: 'No passcode configured. Set APP_PASSCODE and run the migration.' });
    }
    if (!safeEqual(sha256(passcode), stored)) {
      return res.status(401).json({ error: 'Incorrect passcode' });
    }
    res.json({ token: tokenFor(stored) });
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Everything under /api except health and login requires a valid token.
app.use('/api', async (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login') return next();
  try {
    const stored = await storedPasscodeHash();
    if (!stored) return res.status(503).json({ error: 'No passcode configured' });
    const supplied = req.get('x-auth-token') || '';
    if (!safeEqual(supplied, tokenFor(stored))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  } catch (err) {
    console.error('auth check failed:', err);
    res.status(500).json({ error: 'Auth check failed' });
  }
});

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── Generic REST resources ──────────────────────────────────────────────────
// Table names are compile-time literals and every column is whitelisted below,
// so nothing user-supplied ever reaches the SQL string — only $n parameters.
// `defaulted` lists columns carrying a DB default (most are also NOT NULL). A
// blank value for one of those means "leave it to the default", not "store
// NULL" — sending NULL would 500 on the NOT NULL constraint.
const RESOURCES = {
  pillars: {
    table: 'pillars',
    columns: ['code', 'name', 'description', 'driver', 'sort_order'],
    defaulted: ['sort_order'],
    order: 'sort_order ASC, code ASC',
  },
  drivers: {
    table: 'drivers',
    columns: ['name', 'description', 'sort_order'],
    defaulted: ['sort_order'],
    order: 'sort_order ASC, name ASC',
  },
  metrics: {
    table: 'metrics',
    columns: ['name', 'category', 'unit', 'target_value', 'current_value', 'period', 'direction', 'notes', 'sort_order'],
    defaulted: ['direction', 'sort_order'],
    order: 'sort_order ASC, name ASC',
  },
  initiatives: {
    table: 'initiatives',
    columns: ['title', 'description', 'pillar_code', 'owner', 'status', 'health', 'progress', 'start_date', 'due_date', 'sort_order'],
    defaulted: ['status', 'health', 'progress', 'sort_order'],
    order: 'pillar_code ASC, sort_order ASC',
  },
  accounts: {
    table: 'accounts',
    columns: ['name', 'sector', 'geography', 'tier', 'owner', 'notes'],
    defaulted: ['geography'],
    order: 'name ASC',
  },
  opportunities: {
    table: 'opportunities',
    columns: ['account_id', 'name', 'stream', 'stage', 'margin_tier', 'value_k', 'probability', 'close_date', 'owner', 'notes'],
    defaulted: ['stage', 'margin_tier', 'value_k', 'probability'],
    order: 'close_date ASC NULLS LAST, name ASC',
  },
  projections: {
    table: 'projections',
    columns: ['scenario', 'year', 'stream', 'value_k'],
    defaulted: [],
    order: 'scenario ASC, year ASC, stream ASC',
  },
  people: {
    table: 'people',
    columns: ['name', 'level', 'track', 'hire_model', 'base_cost_day', 'bill_rate_day', 'target_margin_low', 'target_margin_high', 'utilization', 'notes', 'sort_order'],
    defaulted: ['hire_model', 'sort_order'],
    order: 'sort_order ASC, name ASC',
  },
  certifications: {
    table: 'person_certifications',
    columns: ['person_id', 'name', 'provider', 'status', 'cost', 'target_date', 'obtained_date'],
    defaulted: ['status'],
    order: 'status ASC, name ASC',
  },
  assets: {
    table: 'assets',
    columns: ['name', 'category', 'status', 'owner', 'description', 'reuse_count', 'revenue_k', 'sort_order'],
    defaulted: ['status', 'reuse_count', 'revenue_k', 'sort_order'],
    order: 'sort_order ASC, name ASC',
  },
  cohorts: {
    table: 'cohorts',
    columns: ['name', 'course', 'audience', 'client', 'status', 'start_date', 'seats', 'enrolled', 'tuition', 'cert_fee', 'trainer', 'notes'],
    defaulted: ['audience', 'status', 'seats', 'enrolled', 'tuition', 'cert_fee'],
    order: 'start_date ASC NULLS LAST, name ASC',
  },
};

// Empty strings from HTML form fields must become NULL, not ''  — otherwise a
// blank date input fails Postgres date parsing.
const clean = (v) => (v === '' || v === undefined ? null : v);

function mountResource(key, spec) {
  const { table, columns, order } = spec;
  const defaulted = new Set(spec.defaulted || []);

  // Columns the request actually wants to write: present in the body, and not a
  // blank value for a column whose DB default should win.
  const writable = (body) =>
    columns.filter((c) => c in body && !(defaulted.has(c) && clean(body[c]) === null));

  app.get(`/api/${key}`, async (req, res) => {
    try {
      const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY ${order}`);
      res.json(rows);
    } catch (err) {
      console.error(`GET /api/${key} failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post(`/api/${key}`, async (req, res) => {
    try {
      const body = req.body || {};
      const cols = writable(body);
      if (!cols.length) return res.status(400).json({ error: 'No valid fields supplied' });

      const values = cols.map((c) => clean(body[c]));
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const { rows } = await db.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(`POST /api/${key} failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put(`/api/${key}/:id`, async (req, res) => {
    try {
      const body = req.body || {};
      const cols = writable(body);
      if (!cols.length) return res.status(400).json({ error: 'No valid fields supplied' });

      const values = cols.map((c) => clean(body[c]));
      const sets = cols.map((c, i) => `${c} = $${i + 1}`);
      const hasUpdatedAt = table !== 'projections';
      if (hasUpdatedAt) sets.push('updated_at = NOW()');

      const { rows } = await db.query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
        [...values, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error(`PUT /api/${key} failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(`/api/${key}/:id`, async (req, res) => {
    try {
      const { rowCount } = await db.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.status(204).end();
    } catch (err) {
      console.error(`DELETE /api/${key} failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });
}

Object.entries(RESOURCES).forEach(([key, spec]) => mountResource(key, spec));

// ── Bootstrap payload ───────────────────────────────────────────────────────
// One round trip on load instead of ten — the SPA holds the whole workspace in
// memory and re-fetches only the collection it just mutated.
app.get('/api/bootstrap', async (req, res) => {
  try {
    const keys = Object.keys(RESOURCES);
    const results = await Promise.all(
      keys.map((k) => db.query(`SELECT * FROM ${RESOURCES[k].table} ORDER BY ${RESOURCES[k].order}`))
    );
    const payload = {};
    keys.forEach((k, i) => { payload[k] = results[i].rows; });
    res.json(payload);
  } catch (err) {
    console.error('GET /api/bootstrap failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Local dev server (Vercel imports the app instead) ───────────────────────
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`T&OT Command Center running at http://localhost:${port}`));
}

module.exports = app;
