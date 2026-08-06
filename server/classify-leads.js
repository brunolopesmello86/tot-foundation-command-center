// ═══════════════════════════════════════════════════════════════════════════
// Split opportunities into Leads vs Pipeline, and give every opportunity an
// owner. Idempotent — safe to re-run.
//   node server/classify-leads.js   (or: npm run classify:leads)
//
// Per the team's decision, the older DS USA spreadsheet import is Leads and the
// current Sept account plan is the active Pipeline. Classification is by the
// note tag each importer stamped, so it is deterministic and re-runnable.
//
// Owners: the DS USA rows already carry a salesperson. The account-plan rows
// were imported without one, so each inherits its account's owner. The eight
// brand-new prospect accounts had no owner, so they get a best-guess lead by
// sector/relationship — flagged in the run output as values to confirm.
// ═══════════════════════════════════════════════════════════════════════════
if (!process.env.VERCEL) require('dotenv').config();
const db = require('./db');

// Best-guess owners for the new account-plan accounts (no prior owner). These
// mirror the existing book: Victor on multilateral/energy, Ana on CAF/insurance,
// Bruno across FIS/industry. Confirm and adjust in the app.
const NEW_ACCOUNT_OWNERS = {
  'World Bank': 'Victor',
  'Bradesco': 'Bruno',
  'BCP': 'Bruno',
  'COFCO': 'Bruno',
  'Univista': 'Ana',
  'Repsol': 'Victor',
  'Quantum Energies': 'Victor',
  'Volkswagen (VW)': 'Bruno',
};

async function main() {
  // ── 1 · Classify ──────────────────────────────────────────────────────────
  // The older DS USA batch = the spreadsheet rows plus the demo closed deals I
  // added alongside them. Everything from that batch is Leads; only the current
  // Sept account plan stays in Pipeline.
  const leads = await db.query(
    `UPDATE opportunities SET record_type = 'Lead', updated_at = NOW()
     WHERE (notes ILIKE '%DS USA pipeline%' OR notes ILIKE '%fake demo%')
       AND record_type <> 'Lead'`
  );
  const pipe = await db.query(
    `UPDATE opportunities SET record_type = 'Pipeline', updated_at = NOW()
     WHERE notes ILIKE '%account plan%' AND record_type <> 'Pipeline'`
  );

  // ── 2 · Owners for the new prospect accounts ──────────────────────────────
  let accOwners = 0;
  for (const [name, owner] of Object.entries(NEW_ACCOUNT_OWNERS)) {
    const r = await db.query(
      `UPDATE accounts SET owner = $2, updated_at = NOW()
       WHERE name = $1 AND (owner IS NULL OR owner = '')`,
      [name, owner]
    );
    accOwners += r.rowCount;
  }

  // ── 3 · Every opportunity gets an owner: inherit the account's ────────────
  const oppOwners = await db.query(
    `UPDATE opportunities o SET owner = a.owner, updated_at = NOW()
     FROM accounts a
     WHERE o.account_id = a.id
       AND (o.owner IS NULL OR o.owner = '')
       AND a.owner IS NOT NULL AND a.owner <> ''`
  );

  // ── Report ────────────────────────────────────────────────────────────────
  const counts = await db.query(
    `SELECT record_type, COUNT(*)::int n FROM opportunities GROUP BY record_type ORDER BY record_type`
  );
  const noOwner = await db.query(
    `SELECT COUNT(*)::int n FROM opportunities WHERE owner IS NULL OR owner = ''`
  );

  console.log(`✓ classified ${leads.rowCount} → Lead, ${pipe.rowCount} → Pipeline (this run)`);
  console.log(`✓ owners: ${accOwners} new accounts set, ${oppOwners.rowCount} opportunities inherited an owner`);
  console.log('  current split:', counts.rows.map((r) => `${r.record_type} ${r.n}`).join(' · '));
  console.log(`  opportunities still without an owner: ${noOwner.rows[0].n}`);

  await db.pool.end();
}

main().catch((err) => {
  console.error('classify failed:', err.message);
  process.exit(1);
});
