// ═══════════════════════════════════════════════════════════════════════════
// Import the DS USA account-planning grid (Tier / Account / Opportunities /
// Value offering / Sept 14–18 business trip).
//   node server/import-account-plan.js   (or: npm run import:accountplan)
//
// Idempotent: accounts are matched by name (tier + sector updated in place),
// opportunities by name+account (skipped if already present). Safe to re-run.
//
// This is an account plan, not a deal sheet — most rows are networking targets
// with no sized deal, so they import at $0 / 10% (early Qualify) with the value
// offering and trip contacts captured in notes. The only sized deals are the two
// Avangrid offerings. Separately, Santander's existing "Agile Transformation"
// opportunity is repriced to $200K per the latest estimate.
// ═══════════════════════════════════════════════════════════════════════════
if (!process.env.VERCEL) require('dotenv').config();
const db = require('./db');

const CONSULTING = 'Core AI/Copilot & digital strategy consulting';
const TIER = { 1: 'Strategic', 2: 'Priority', 3: 'New logo' };

// name -> { sector, tier }. Names must match existing rows exactly so we update
// rather than duplicate (Avangrid is stored as "AVANGRID, Inc.").
const ACCOUNTS = {
  'AVANGRID, Inc.':   { sector: 'Utilities',     tier: TIER[1] },
  'Santander':        { sector: 'FIS',           tier: TIER[1] },
  'CAF':              { sector: 'Multilaterals', tier: TIER[1] },
  'IDB':              { sector: 'Multilaterals', tier: TIER[1] },
  'UNJSPF':           { sector: 'Multilaterals', tier: TIER[1] },
  'World Bank':       { sector: 'Multilaterals', tier: TIER[2] },
  'BBVA':             { sector: 'FIS',           tier: TIER[2] },
  'Bradesco':         { sector: 'FIS',           tier: TIER[2] },
  'BCP':              { sector: 'FIS',           tier: TIER[2] },
  'COFCO':            { sector: 'Industry',      tier: TIER[3] },
  'Univista':         { sector: 'FIS',           tier: TIER[3] },
  'Repsol':           { sector: 'Industry',      tier: TIER[3] },
  'Quantum Energies': { sector: 'Industry',      tier: TIER[3] },
  'Volkswagen (VW)':  { sector: 'Industry',      tier: TIER[3] },
};

// account, name, value_k, probability, notes
const OPPS = [
  ['AVANGRID, Inc.', 'Evolve CX strategy',                            0, 10, 'Value offering: CX in utilities · Meet Michael Lawry → DS Utilities. Sept 14–18 trip: Meeting CX (14/15 Sep).'],
  ['AVANGRID, Inc.', 'Digital Products IT transformation',           65, 25, 'NextGen Assessment + Lean Operating Model (LPM) design & implementation. Estimated $60–70K.'],
  ['AVANGRID, Inc.', 'P&S Program Training',                         38, 25, 'Upskilling offering. Estimated $38K.'],
  ['Santander',      'Post-merger Webster',                           0, 10, 'Contacts: Pablo del Campo, Vikram. Value offering: post-merger deck. Sept 14–18 trip: Meeting post-merger (14/15 Sep).'],
  ['Santander',      'Cat3 opportunities',                            0, 10, 'Contact: Toni Pimentel.'],
  ['CAF',            'AI governance',                                 0, 10, 'Value offering: AI strategy deck (Victor) · GTS (Gisela).'],
  ['CAF',            'AI business solutions (credit)',                0, 10, ''],
  ['IDB',            'AI governance',                                 0, 10, 'Value offering: AI strategy deck (Victor) · Process mining · GTS (Gisela). Sept 14–18 trip: David Brogeras (17/18 Sep).'],
  ['IDB',            'CFO → operations in finance',                   0, 10, 'Sept 14–18 trip: CFO (17/18 Sep).'],
  ['UNJSPF',         'Post-TOM UNJSPF',                               0, 10, 'Value offering: Process mining. Sept 14–18 trip: Claribelle Poujol / Dino Cataldo (16 Sep).'],
  ['World Bank',     'Process mining',                                0, 10, 'Value offering: Process mining · GTS (Gisela). Sept 14–18 trip: Kristina Turilova (17/18 Sep).'],
  ['BBVA',           'Process automation (Houston)',                  0, 10, 'Value offering: Process automation.'],
  ['COFCO',          'S4HANA adoption',                               0, 10, ''],
  ['Univista',       'Customer & operations strategy',               0, 10, 'Value offering: Carlos L. / Iagoba → DS Insurance.'],
  ['Repsol',         'Digital transformation — intro via Pablo Alarcón', 0, 10, 'Account manager: Pablo Alarcón. Grouped under "Other Industry".'],
  ['Quantum Energies','Gas commercialization (US)',                   0, 10, 'Grouped under "Other Industry".'],
  ['Volkswagen (VW)', 'Digital Maturity Index',                       0, 10, 'Grouped under "Other Industry".'],
];

const PLAN_TAG = 'From DS USA account plan (Sept 2026).';

async function upsertAccount(name) {
  const meta = ACCOUNTS[name];
  const found = await db.query('SELECT id FROM accounts WHERE name = $1', [name]);
  if (found.rows.length) {
    await db.query(
      `UPDATE accounts SET sector = $2, tier = $3, updated_at = NOW() WHERE id = $1`,
      [found.rows[0].id, meta.sector, meta.tier]
    );
    return { id: found.rows[0].id, created: false };
  }
  const ins = await db.query(
    `INSERT INTO accounts (name, sector, geography, tier, notes)
     VALUES ($1, $2, 'US', $3, $4) RETURNING id`,
    [name, meta.sector, meta.tier, PLAN_TAG]
  );
  return { id: ins.rows[0].id, created: true };
}

async function main() {
  let accCreated = 0, accUpdated = 0, oppAdded = 0, oppSkipped = 0;

  // Every account in the plan gets created/updated, even the two (Bradesco, BCP)
  // that have no opportunity yet — they are named targets worth tracking.
  const ids = new Map();
  for (const name of Object.keys(ACCOUNTS)) {
    const { id, created } = await upsertAccount(name);
    ids.set(name, id);
    created ? accCreated++ : accUpdated++;
  }

  for (const [acct, name, value_k, probability, note] of OPPS) {
    const accId = ids.get(acct);
    const exists = await db.query(
      'SELECT id FROM opportunities WHERE name = $1 AND account_id = $2',
      [name, accId]
    );
    if (exists.rows.length) { oppSkipped++; continue; }
    await db.query(
      `INSERT INTO opportunities (account_id, name, stream, stage, margin_tier, value_k, probability, owner, notes)
       VALUES ($1, $2, $3, 'Qualify', 40, $4, $5, NULL, $6)`,
      [accId, name, CONSULTING, value_k, probability, [note, PLAN_TAG].filter(Boolean).join(' ')]
    );
    oppAdded++;
  }

  // Reprice Santander's existing Agile Transformation to $200K.
  const santander = ids.get('Santander');
  const repriced = await db.query(
    `UPDATE opportunities SET value_k = 200, updated_at = NOW()
     WHERE account_id = $1 AND name = 'Agile Transformation'
     RETURNING value_k`,
    [santander]
  );
  const santanderMsg = repriced.rows.length
    ? `✓ Santander "Agile Transformation" repriced to $200K`
    : `! Santander "Agile Transformation" not found — created it at $200K` +
      (await db.query(
        `INSERT INTO opportunities (account_id, name, stream, stage, margin_tier, value_k, probability, notes)
         VALUES ($1, 'Agile Transformation', $2, 'Proposal', 40, 200, 50, $3)`,
        [santander, CONSULTING, PLAN_TAG]
      ), '');

  console.log(`✓ accounts: ${accCreated} created, ${accUpdated} updated (tier + sector)`);
  console.log(`✓ opportunities: ${oppAdded} added, ${oppSkipped} already present`);
  console.log(`  ${santanderMsg}`);

  const { rows } = await db.query('SELECT COUNT(*)::int n FROM opportunities');
  console.log(`  opportunities now in DB: ${rows[0].n}`);
  await db.pool.end();
}

main().catch((err) => {
  console.error('import failed:', err.message);
  process.exit(1);
});
