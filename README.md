# T&OT Foundation Command Center

Management UI for the **T&OT Foundation** — Digital Strategy Business Unit, NTT DATA USA.
Turns the *Playing to Win 2026–2028* strategy into something you can actually run week to week.

Same architecture as the Nexus board: **static frontend + Express API on Vercel + Neon Postgres**.

---

## What it manages

| Tab | Covers |
|---|---|
| **01 · Strategy** | North-star goal, three drivers, four pillars, the metrics scoreboard (actual vs target), and initiatives tracked per pillar with owner, status, health and progress. |
| **02 · Pipeline** | Accounts and opportunities by sector, stage and margin tier (30 Land / 40 Standard / 50+ Differentiated). Open, weighted and closed-won roll-ups, filterable by sector. |
| **03 · People** | Delivery ladder with base cost, bill rate and computed margin against each profile's target band; Build/Borrow/Buy model, utilization, and the AI + ICAgile/SAFe certification tracker. |
| **04 · Assets & Certifications** | Asset/IP catalog with reuse and revenue, plus the ICAgile cohort machine — fill rate, revenue and gross margin per cohort. |
| **05 · Financials** | The 3-year sales projection across Conservative / Base / Aggressive scenarios, and pipeline coverage against the first projected year. |

The database ships seeded from the strategy deck and the Excel projection model, so the
app opens with the real plan rather than an empty shell.

---

## Architecture

```
public/            static frontend — no build step, no dependencies
  index.html         shell + passcode gate
  styles.css         NTT DATA dark theme
  app.js             state, views, editor, router (ES module)
  charts.js          hand-rolled SVG charts
api/index.js       Vercel serverless entry — re-exports the Express app
server/
  index.js           Express app: auth + generic REST resources
  db.js              Neon connection pool
  schema.sql         idempotent schema
  seed.js            seed data from the strategy deck / Excel model
  migrate.js         applies schema + seed
vercel.json        routes /api/* to the function, everything else to public/
```

**Why the API is generic.** Every collection is defined once in the `RESOURCES` map in
[server/index.js](server/index.js) — table, allowed columns, sort order, and which columns
carry a DB default. `GET/POST/PUT/DELETE` are generated from that. Adding a new tracked
entity is a schema table plus one entry there, then one entry in `ENTITIES` in
[public/app.js](public/app.js) to get a form and an editor for free.

Table names are code literals and every column is whitelisted, so nothing user-supplied
ever reaches a SQL string — only `$n` parameters.

---

## First-time setup

### 1 · Create the Neon database

1. Go to <https://console.neon.tech> and create a new project (e.g. `tot-command-center`).
2. Copy the **pooled** connection string from *Connection Details*.

### 2 · Configure locally

```bash
cp .env.example .env
```

Fill in `.env`:

```
DATABASE_URL=postgresql://…@…neon.tech/…?sslmode=require
APP_PASSCODE=<the shared passcode the team will type>
AUTH_SECRET=<paste the output of the command below>
```

Generate the auth secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3 · Create the schema and seed it

```bash
npm install
npm run migrate
```

### 4 · Run it

```bash
npm start          # http://localhost:3000
```

---

## Deploying to Vercel

```bash
vercel link        # create a new project when prompted
vercel env add DATABASE_URL production
vercel env add APP_PASSCODE  production
vercel env add AUTH_SECRET   production
vercel --prod
```

Add the same three variables to the **Preview** environment if you want branch deploys
to work. Connect the GitHub repo in the Vercel dashboard and every push to `main`
deploys automatically.

The schema is applied automatically on the first API request after a cold start, so a
fresh Neon database needs no manual migration step in production — but running
`npm run migrate` locally against the production `DATABASE_URL` is the explicit way to
do it.

---

## Access

A single shared passcode gates the app. It is hashed with SHA-256 and stored in the
`settings` table on first migrate; the browser holds an HMAC session token in
`localStorage`. Every `/api` route except `/api/health` and `/api/auth/login` requires it.

**To change the passcode**, update `APP_PASSCODE` and clear the stored hash:

```sql
DELETE FROM settings WHERE key = 'passcode_hash';
```

Then run `npm run migrate` again. Existing sessions are invalidated automatically,
because the token is derived from the passcode hash.

---

## Notes

- **Charts** are hand-rolled SVG — no chart library. The four-colour categorical palette
  (`--series-1..4` in [public/styles.css](public/styles.css)) is validated for the dark
  navy surface: lightness band, chroma floor, colour-vision-deficiency separation and
  3:1 contrast all pass. If you change those hues, re-validate them.
- **Single-measure bar charts use one hue** — the category name already carries identity,
  so cycling colours across an open-ended list (people, cohorts) would give two different
  entities the same colour while encoding nothing.
- **Deep links** work: `/#pipeline`, `/#people`, `/#financials` open straight onto a tab.
- **Print** (the button in the header, or ⌘P) hides the navigation and action buttons and
  lays the current view out for PDF.
- Seeding is idempotent and never resurrects a row you deleted in the UI — tables with a
  natural key upsert, the rest seed only while still empty.
