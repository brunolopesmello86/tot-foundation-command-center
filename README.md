# T&OT Foundation Command Center

Management UI for the **T&OT Foundation** — Digital Strategy Business Unit, NTT DATA USA.
Turns the *Playing to Win 2026–2028* strategy into something you can actually run week to week.

Same architecture as the Nexus board: **static frontend + Express API on Vercel + Neon Postgres**.

---

## What it manages

Navigation is a left rail grouped into **Direction**, **Commercial** and **Organization**.

| Section | Covers |
|---|---|
| **Strategy** | North-star goal, three drivers, four pillars, the metrics scoreboard (actual vs target), and initiatives tracked per pillar with owner, status, health and progress. |
| **Pipeline** | Accounts and opportunities by sector, stage and margin tier (30 Land / 40 Standard / 50+ Differentiated). Open, weighted and closed-won roll-ups, filterable by sector. |
| **People** | Delivery ladder with base cost, bill rate and computed margin against each profile's target band; Build/Borrow/Buy model, utilization, and the AI + ICAgile/SAFe certification tracker. |
| **Assets & Certifications** | Asset/IP catalog with reuse and revenue, plus the ICAgile cohort machine — fill rate, revenue and gross margin per cohort. |
| **Tensions Board** | Creative-tensions kanban (O2 system): intake → In Processing → Synchronized, cards by priority, drag to move. A Report tab shows throughput per week, people raising tensions, and average days to process. |
| **Internal Projects** | Kanban for the team's own initiatives: Backlog → In Progress → Done, cards by type and owner. Same flow-metrics report. |
| **Financials** | The 3-year sales projection across Conservative / Base / Aggressive scenarios, and pipeline coverage against the first projected year. |

The database ships seeded from the strategy deck and the Excel projection model, so the
app opens with the real plan rather than an empty shell.

**Everything is editable in the app** — this is the single source of truth, so nothing that
describes the strategy lives in code. The goal's drivers and the pillars themselves are
database rows with their own editors, not constants in a JavaScript file.

---

## Architecture

```
public/            static frontend — no build step, no dependencies
  index.html         sidebar shell + passcode gate
  styles.css         NTT DATA design system, dark + light themes
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

### Changing the passcode

1. Edit `APP_PASSCODE` in `.env`
2. Run:

```bash
npm run passcode
```

That's it — no SQL. The command overwrites the stored hash and prints a masked
confirmation. Everyone currently signed in is logged out automatically, because the
session token is derived from the passcode hash.

If the app is deployed, update Vercel too so the two stay in sync:

```bash
vercel env rm  APP_PASSCODE production
vercel env add APP_PASSCODE production
vercel --prod
```

> `npm run migrate` only sets the passcode when none exists yet, so it will never
> silently overwrite one. `npm run passcode` is the deliberate way to change it.

---

## Look and feel

The design system follows **nttdata.com**. The tokens were taken from their live
stylesheet rather than sampled off a screenshot:

| | NTT DATA value | Where it is used here |
|---|---|---|
| Display face | `Noto Serif` | page title, card headings, stat values, the north-star goal |
| Body face | `Noto Sans` | everything else, with tabular figures in data columns |
| Dark navy | `#070F26` / `#141B31` / `#1D264D` | page, cards, raised surfaces |
| Primary blue | `#0072BC` | category tags, light-mode links and tab underline |
| Slate | `#2E404D` | light-mode secondary text |
| Red | `#E42600` | light-mode critical status |

Structural patterns borrowed: the section label with a hairline running to the end of
the row, solid blue category tags, near-square corners (4px, not pill-soft), and a
generous serif display scale over a compact sans body.

Two deliberate departures, both for legibility in a dense tool rather than a marketing
page:

- **The accent is orange** (`#F89818` dark, `#8F440B` light) where NTT DATA uses gold
  `#ffc400`, because that is the accent chosen for this app.
- **Their `#0072BC` blue and `#949494` grey are light-mode only.** On the dark navy the
  blue reaches just 3.4:1 and the grey is too weak for small labels, so dark mode uses
  their brighter `#19A3FC` and a bluer `#A6B0C2`.

## Themes

Dark and light, toggled from the header button. The choice is saved per browser; with no
saved choice the app follows the operating system. An inline script in `<head>` applies the
theme before first paint, so there is no flash of the wrong one.

Both palettes live at the top of [public/styles.css](public/styles.css) as token blocks
(`:root[data-theme='dark']` / `[data-theme='light']`). Nothing below those blocks
references a raw hex, so the two modes cannot drift apart.

**Light mode is a selected palette, not an inverted dark one** — its series colours are
re-stepped for a white surface and separately validated. Charts read `--series-1..4` from
CSS at draw time, which is what lets a theme switch recolour every mark.

Verified numbers, if you change any colour:

| | Dark | Light |
|---|---|---|
| Accent | `#F89818` — 7.7:1 on a card | `#8F440B` — 7.0:1 on white |
| Series palette | all six checks pass on `#141B31` | all six checks pass on `#FFFFFF` |
| Worst adjacent CVD ΔE | 9.2 | 8.1 |
| Muted text | `#A6B0C2` — 7.8:1 | `#546F88` — 5.7:1 |

Status colours stay green / amber / red in **both** themes. They encode meaning, not
brand, so they are deliberately not swapped to the accent.

## Notes

- **Charts** are hand-rolled SVG — no chart library. If you change the categorical hues,
  re-validate them: lightness band, chroma floor, colour-vision-deficiency separation and
  3:1 contrast against that theme's surface.
- **Single-measure bar charts use one hue** — the category name already carries identity,
  so cycling colours across an open-ended list (people, cohorts) would give two different
  entities the same colour while encoding nothing.
- **Deep links** work: `/#pipeline`, `/#people`, `/#financials` open straight onto a tab.
- **Print** (the button in the header, or ⌘P) hides the navigation and action buttons and
  lays the current view out for PDF.
- Seeding is idempotent and never resurrects a row you deleted in the UI — tables with a
  natural key upsert, the rest seed only while still empty.
