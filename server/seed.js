// ═══════════════════════════════════════════════════════════════════════════
// Seed data — lifted from "T&OT_Playing_to_Win_2026-2028 v.1.3.pptx" and
// "T&OT_Sales_Projection_2026-2028.xlsx" so the Command Center opens with the
// real strategy loaded rather than an empty shell.
//
// Every insert is ON CONFLICT DO NOTHING / guarded by a count check, so running
// the seed twice never duplicates or overwrites edits made in the UI.
// ═══════════════════════════════════════════════════════════════════════════

const db = require('./db');

const PILLARS = [
  [1, 'Diversification of Sectors', 'Banking · Industry · Utilities — US home market, expanding via LATAM collaboration.', 'Digital Strategy as Spearhead'],
  [2, 'AI as Key Driver', 'AI as the core of every digital strategy we design and sell.', 'AI Co-pilot'],
  [3, 'Upskilling & Reskilling', 'Future-ready talent — and a high-margin certification business.', 'Assets / IPs'],
  [4, 'Org Transformation — Nexus Model', 'A proprietary, asset-based transformation operating model.', 'Assets / IPs'],
];

// name, category, unit, target, current, period, sort
const METRICS = [
  ['Revenue growth',                'Growth',      '%',     20,   0, '2026', 1],
  ['Total sales',                   'Growth',      '$K',  3477,   0, '2026', 2],
  ['New clients',                   'Growth',      '#',      6,   0, '2026', 3],
  ['New services launched',         'Growth',      '#',      3,   0, '2026', 4],
  ['Proposals submitted',           'Capability',  '#',     24,   0, '2026', 5],
  ['Certified talent',              'Capability',  '#',      5,   0, '2026', 6],
  ['Hiring pipeline',               'Capability',  '#',      4,   0, '2026', 7],
  ['Sector diversification ratio',  'Positioning', 'ratio', 0.6,  0, '2026', 8],
  ['Revenue per sector — Banking',  'Positioning', '$K',  1200,   0, '2026', 9],
  ['Revenue from AI / Copilot',     'Innovation',  '%',     40,   0, '2026', 10],
  ['Revenue from assets & blends',  'Innovation',  '%',     15,   0, '2026', 11],
  ['ICAgile cohorts delivered',     'Innovation',  '#',      6,   0, '2026', 12],
];

// title, pillar, owner, status, health, progress, due
const INITIATIVES = [
  ['Launch first ICP-ATF & ICP-ORG cohort',        3, 'Bruno', 'In progress', 'green', 30, '2026-09-30'],
  ['Certify 2 trainers (ICAgile onboarding + SPC)', 3, 'Bruno', 'In progress', 'amber', 20, '2026-06-30'],
  ['Certify US core team on foundational AI',       2, 'Ana',   'In progress', 'green', 40, '2026-04-30'],
  ['Deepen Ana & Edu on Azure AI Engineer (AI-103)', 2, 'Ana',  'Not started', 'green',  0, '2026-09-30'],
  ['Ship an AI copilot with every offering',        2, 'Edu',   'In progress', 'amber', 25, '2026-12-31'],
  ['Package the Nexus Model as a sellable asset',   4, 'Bruno', 'In progress', 'green', 55, '2026-06-30'],
  ['Export Nexus Model via LATAM collaboration',    4, 'Bruno', 'Not started', 'green',  0, '2026-12-31'],
  ['Stand up per-sector pipeline cadence',          1, 'Ana',   'In progress', 'green', 45, '2026-03-31'],
  ['Open 3 new Utilities accounts',                 1, 'Ana',   'Not started', 'amber',  0, '2026-12-31'],
  ['Run first in-person AI experience (WOW)',       2, 'Sofia', 'In progress', 'green', 35, '2026-05-31'],
  ['Build asset & IP governance backlog',           4, 'Bruno', 'Not started', 'green',  0, '2026-06-30'],
  ['Complete the US rate card (cost & bill rates)', 1, 'Bruno', 'At risk',     'red',   10, '2026-03-31'],
];

// name, level, track, hire_model, target margin low/high, sort
const PEOPLE = [
  ['Angela', 'Analyst / Associate',        'Delivery',      'Build', 30, 40, 1],
  ['Sofia',  'Consultant',                 'Trainer',       'Build', 35, 45, 2],
  ['Edu',    'Senior Consultant',          'Expert / Asset','Build', 40, 50, 3],
  ['Ana',    'Manager / Engagement Lead',  'Leadership',    'Build', 45, 50, 4],
  ['Bruno',  'Principal / Practice Lead',  'Leadership',    'Build', 50, 60, 5],
];

// person name, cert name, provider, cost
const CERTS = [
  ['Bruno',  'Google Cloud — Generative AI Leader',    'Google Cloud',  99],
  ['Ana',    'Microsoft Azure AI Engineer (AI-103)',   'Microsoft',    165],
  ['Edu',    'Microsoft Azure AI Engineer (AI-103)',   'Microsoft',    165],
  ['Sofia',  'AWS Certified AI Practitioner',          'AWS',          100],
  ['Angela', 'Google Cloud — Generative AI Leader',    'Google Cloud',  99],
  ['Bruno',  'ICAgile Instructor Authorization',       'ICAgile',     3000],
  ['Sofia',  'SAFe Practice Consultant (SPC)',         'Scaled Agile', 4500],
];

// name, category, status, owner, description
const ASSETS = [
  ['Nexus Model',              'Transformation model', 'Packaged', 'Bruno', 'Proprietary organizational-transformation operating model — the defensible, ownable IP behind Pillar 4.'],
  ['AI Copilot offering kit',  'AI / Copilot',         'In build', 'Edu',   'Reusable copilot scaffolding embedded into every offering so delivery ships AI-native.'],
  ['ICP-ATF course package',   'Learning',             'In build', 'Bruno', 'ICAgile Agile Team Facilitation course material, exercises and facilitation guide.'],
  ['ICP-ORG course package',   'Learning',             'Backlog',  'Bruno', 'ICAgile Organizational Agility course material — pairs with ICP-ATF for the cohort machine.'],
  ['In-person AI experience',  'Learning',             'In build', 'Sofia', 'The "never-seen" hands-on WOW session format — innovate, solve, learn, design.'],
  ['Sector diagnostic kit',    'Method',               'Backlog',  'Ana',   'Verticalized discovery and diagnostic instrument for Banking, Industry and Utilities.'],
];

// The Excel projection model, verbatim ($K).
const PROJECTION_STREAMS = [
  'Core AI/Copilot & digital strategy consulting',
  'Nexus Model (asset) — US + LATAM export',
  'ICAgile certifications (public + client)',
  'In-person AI experiences (WOW workshops)',
];

const PROJECTIONS = {
  Conservative: {
    2026: [2750, 150, 68, 75],
    2027: [3025, 450, 136, 150],
    2028: [3327.5, 750, 204, 250],
  },
  Base: {
    2026: [2950, 300, 102, 125],
    2027: [3481, 750, 238, 250],
    2028: [4107.58, 1350, 408, 450],
  },
  Aggressive: {
    2026: [3200, 450, 170, 200],
    2027: [4096, 1200, 408, 400],
    2028: [5242.88, 2100, 680, 700],
  },
};

async function isEmpty(table) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return rows[0].n === 0;
}

async function seed() {
  // ── Pillars (stable identity via `code`) ──
  for (const [code, name, description, driver] of PILLARS) {
    await db.query(
      `INSERT INTO pillars (code, name, description, driver, sort_order)
       VALUES ($1, $2, $3, $4, $1) ON CONFLICT (code) DO NOTHING`,
      [code, name, description, driver]
    );
  }

  // ── Projection model (stable identity via scenario+year+stream) ──
  for (const [scenario, years] of Object.entries(PROJECTIONS)) {
    for (const [year, values] of Object.entries(years)) {
      for (let i = 0; i < PROJECTION_STREAMS.length; i++) {
        await db.query(
          `INSERT INTO projections (scenario, year, stream, value_k)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (scenario, year, stream) DO NOTHING`,
          [scenario, Number(year), PROJECTION_STREAMS[i], values[i]]
        );
      }
    }
  }

  // ── Tables without a natural key: seed only while still empty, so a user who
  //    deletes a seeded row does not get it resurrected on the next deploy. ──
  if (await isEmpty('metrics')) {
    for (const [name, category, unit, target, current, period, sort] of METRICS) {
      await db.query(
        `INSERT INTO metrics (name, category, unit, target_value, current_value, period, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [name, category, unit, target, current, period, sort]
      );
    }
  }

  if (await isEmpty('initiatives')) {
    let sort = 0;
    for (const [title, pillar, owner, status, health, progress, due] of INITIATIVES) {
      await db.query(
        `INSERT INTO initiatives (title, pillar_code, owner, status, health, progress, due_date, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [title, pillar, owner, status, health, progress, due, sort++]
      );
    }
  }

  if (await isEmpty('people')) {
    for (const [name, level, track, hire, lo, hi, sort] of PEOPLE) {
      await db.query(
        `INSERT INTO people (name, level, track, hire_model, target_margin_low, target_margin_high, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [name, level, track, hire, lo, hi, sort]
      );
    }
    // Certifications reference people, so seed them in the same guarded block.
    for (const [person, certName, provider, cost] of CERTS) {
      await db.query(
        `INSERT INTO person_certifications (person_id, name, provider, cost, status)
         SELECT id, $2, $3, $4, 'Planned' FROM people WHERE name = $1`,
        [person, certName, provider, cost]
      );
    }
  }

  if (await isEmpty('assets')) {
    let sort = 0;
    for (const [name, category, status, owner, description] of ASSETS) {
      await db.query(
        `INSERT INTO assets (name, category, status, owner, description, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [name, category, status, owner, description, sort++]
      );
    }
  }
}

module.exports = { seed };
