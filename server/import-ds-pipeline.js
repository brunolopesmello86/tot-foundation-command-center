// ═══════════════════════════════════════════════════════════════════════════
// One-off import of the historical DS USA pipeline as example data.
//   node server/import-ds-pipeline.js
//
// Idempotent: accounts are matched by name, opportunities by name+account, so
// re-running never duplicates. Safe to run against a database that already has
// the seed data.
//
// The 23 REAL rows below are transcribed from the DS USA pipeline spreadsheet;
// their gross values sum to $3,536,310, matching the sheet's own total. The
// sheet has no pipeline stage — every deal is just "Created" — so stage is
// derived from probability (>=75% Negotiation, >=40% Proposal, else Qualify)
// and the original status is preserved in each opportunity's notes.
//
// A small block of clearly-labelled FAKE closed deals is added at the end so the
// stage chart and pipeline-coverage tile show won/lost value too. Every fake row
// says "(fake demo data)" in its notes.
// ═══════════════════════════════════════════════════════════════════════════
if (!process.env.VERCEL) require('dotenv').config();
const db = require('./db');

const CONSULTING = 'Core AI/Copilot & digital strategy consulting';

// account, sector, description, foundation, owner, gross$, prob%, status, code
const REAL = [
  ['UNFPA',           'Multilaterals', 'Learning Services LTA',                         'T&OT',            'Ana',         232110, 10, 'Created (% Prob)', 'OPP-089445'],
  ['CAF',             'Multilaterals', 'Use Cases + People Analit. CDO 2025',           'T&OT',            'Ana',          28320, 50, 'Created',          'OPP-026263'],
  ['IDB Invest',      'Multilaterals', 'Estrategia de Comunicación Roadmap IT',         'T&OT',            'Ana',          23280, 25, 'Created (% Prob)', 'OPP-089455'],
  ['AVANGRID, Inc.',  'Utilities',     'Staff Team Discovery Workshop',                 'T&OT',            'Bruno',        30000, 10, 'Created',          'OPP-089452'],
  ['Santander SHUSA', 'FIS',           'One Reporting',                                 'Strategic Value', 'Bruno',       300000, 50, 'Created',          'OPP-078645'],
  ['Santander Wealth','FIS',           'Transformation Office',                         'Operations',      'Bruno',       250000, 50, 'Created',          'OPP-080893'],
  ['Santander NY CIB','FIS',           'TOM Operations Department',                     'Operations',      'Bruno',       200000, 10, 'Created',          'OPP-080877'],
  ['IDB',             'Multilaterals', 'Proyectos de Hidrógeno con OLADE',              'GTS',             'Victor',      100000, 50, 'Created (% Prob)', 'OPP-089430'],
  ['IFC',             'Multilaterals', 'Platform for the Decarbonization Institute',    'GTS',             'Victor',      120000, 10, 'Created (% Prob)', 'OPP-089467'],
  ['IDB',             'Multilaterals', 'Estudio para reducir incertidumbres técnico-económicas de producir y exportar H2 y derivados', 'GTS', 'Victor', 100000, 25, 'Created (% Prob)', 'OPP-089451'],
  ['BBVA Houston',    'FIS',           'Decarbonization Assessment',                    'GTS',             'Victor / Mau',100000, 10, 'Created (% Prob)', 'OPP-080874'],
  ['BBVA Houston',    'FIS',           'Sustainability as a Service',                   'GTS',             'Victor / Mau',200000, 10, 'Created',          'OPP-080872'],
  ['BBVA',            'FIS',           'Risk Modelling and validation',                 'Operations',      'Ana',              0, 50, 'Created',          ''],
  ['PAHO',            'Multilaterals', 'Process Mapping',                               'Operations',      'Bruno',       120000, 80, 'Created',          ''],
  ['UNJSPF',          'Multilaterals', 'Target Operating Model',                        'Operations',      'Bruno',       120000, 80, 'Created',          ''],
  ['PAHO',            'Multilaterals', 'Change Management - SF Agentic',                'T&OT',            'Ana S',        33600, 50, 'Created',          ''],
  ['IDB',             'Multilaterals', 'AI use cases - Workshops',                      'BAA',             'Ana S',        30000, 80, 'Created',          ''],
  ['ICAO UN',         'Multilaterals', 'ICAO Data Products Strategy (Assessment)',      'T&OT',            'Bruno',       280000, 25, 'Created (% Prob)', 'OPP-089459'],
  ['CAF',             'Multilaterals', 'VMO',                                           'T&OT',            'Ana',          60000, 80, 'Created',          ''],
  ['Santander',       'FIS',           'Agile Transformation',                          'T&OT',            'Bruno',       500000, 50, 'Created',          ''],
  ['AVANGRID, Inc.',  'Utilities',     'NextGen in P&T Implementation Project',         'T&OT',            'Ana',         309000, 80, 'Created',          ''],
  ['IDB',             'Multilaterals', 'CoE Sales Force MVP',                           'T&OT',            'Bruno / Ana', 100000, 30, 'Created',          ''],
  ['AVANGRID, Inc.',  'Utilities',     'Product Org Design Implementation',             'T&OT',            'Bruno',       300000, 25, 'Created',          ''],
];

// A few fabricated closed deals so won/lost value shows on the charts.
// account, sector, description, stream, stage, tier%, owner, value$, prob%
const FAKE = [
  ['AVANGRID, Inc.',  'Utilities',     'SAP Product Operations (delivered)', 'Nexus Model (asset) — US + LATAM export', 'Won', 50, 'Bruno', 420000, 100],
  ['Santander SHUSA', 'FIS',           'Agile Adoption 2025',                CONSULTING,                                'Won', 40, 'Bruno', 650000, 100],
  ['CAF',             'Multilaterals', 'ICP-ATF client cohort',              'ICAgile certifications (public + client)','Won', 50, 'Sofia',  60000, 100],
  ['IFC',             'Multilaterals', 'Data Governance Diagnostic',         CONSULTING,                                'Lost',40, 'Victor',  90000,   0],
  ['BBVA',            'FIS',           'Cloud FinOps Advisory',              CONSULTING,                                'Lost',40, 'Ana',    140000,   0],
];

const stageFor = (prob) => (prob >= 75 ? 'Negotiation' : prob >= 40 ? 'Proposal' : 'Qualify');

async function accountId(cache, name, sector, owner) {
  if (cache.has(name)) return cache.get(name);
  const found = await db.query('SELECT id FROM accounts WHERE name = $1', [name]);
  let id;
  if (found.rows.length) {
    id = found.rows[0].id;
  } else {
    const ins = await db.query(
      `INSERT INTO accounts (name, sector, geography, owner, notes)
       VALUES ($1, $2, 'US', $3, 'Imported from DS USA pipeline') RETURNING id`,
      [name, sector, owner]
    );
    id = ins.rows[0].id;
  }
  cache.set(name, id);
  return id;
}

async function upsertOpp(accId, name, fields) {
  const exists = await db.query(
    'SELECT id FROM opportunities WHERE name = $1 AND account_id = $2',
    [name, accId]
  );
  if (exists.rows.length) return false;
  const cols = ['account_id', 'name', ...Object.keys(fields)];
  const vals = [accId, name, ...Object.values(fields)];
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  await db.query(`INSERT INTO opportunities (${cols.join(', ')}) VALUES (${ph})`, vals);
  return true;
}

// Each account's owner = the salesperson who appears most across its deals.
function ownerByAccount(rows) {
  const tally = {};
  for (const r of rows) {
    const [acct, , , , owner] = r;
    (tally[acct] ||= {})[owner] = (tally[acct]?.[owner] || 0) + 1;
  }
  const out = {};
  for (const [acct, owners] of Object.entries(tally)) {
    out[acct] = Object.entries(owners).sort((a, b) => b[1] - a[1])[0][0];
  }
  return out;
}

async function main() {
  const cache = new Map();
  const accountOwner = ownerByAccount(REAL);
  let opps = 0, skipped = 0;

  for (const [acct, sector, desc, foundation, owner, gross, prob, status, code] of REAL) {
    const id = await accountId(cache, acct, sector, accountOwner[acct] || owner);
    const note = [code, foundation, status].filter(Boolean).join(' · ') +
      ' · imported from DS USA pipeline';
    const created = await upsertOpp(id, desc, {
      stream: CONSULTING,
      stage: stageFor(prob),
      margin_tier: 40,
      value_k: gross / 1000,
      probability: prob,
      owner,
      notes: note,
    });
    created ? opps++ : skipped++;
  }

  for (const [acct, sector, desc, stream, stage, tier, owner, value, prob] of FAKE) {
    const id = await accountId(cache, acct, sector, accountOwner[acct] || owner);
    const created = await upsertOpp(id, desc, {
      stream, stage, margin_tier: tier, value_k: value / 1000, probability: prob, owner,
      notes: '(fake demo data) — fabricated closed deal for illustration',
    });
    created ? opps++ : skipped++;
  }

  const { rows: totals } = await db.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(value_k),0) AS gross_k FROM opportunities`
  );
  console.log(`✓ imported ${opps} opportunities (${skipped} already present)`);
  console.log(`  accounts touched: ${cache.size}`);
  console.log(`  opportunities now in DB: ${totals[0].n}, total gross $${Math.round(totals[0].gross_k * 1000).toLocaleString()}`);

  await db.pool.end();
}

main().catch((err) => {
  console.error('import failed:', err.message);
  process.exit(1);
});
