-- ═══════════════════════════════════════════════════════════════════════════
-- T&OT Foundation Command Center — schema
-- Digital Strategy Business Unit · NTT DATA USA · strategy cycle 2026–2028
-- Idempotent: safe to run repeatedly (used as the migration entry point).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Key/value settings (passcode hash, workspace metadata) ──
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════ 1 · STRATEGY ═══════════════════════════════════

-- The four strategic pillars (Playing to Win cascade).
CREATE TABLE IF NOT EXISTS pillars (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        INTEGER NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    driver      TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The strategy scoreboard — metrics that matter.
CREATE TABLE IF NOT EXISTS metrics (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    category      TEXT,               -- Growth | Capability | Positioning | Innovation
    unit          TEXT,               -- '%' | '$K' | '#' | 'ratio'
    target_value  NUMERIC,
    current_value NUMERIC,
    period        TEXT,               -- '2026' | '2027' | '2028' | 'cycle'
    direction     TEXT DEFAULT 'up',  -- 'up' = higher is better, 'down' = lower is better
    notes         TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initiatives executing each pillar.
CREATE TABLE IF NOT EXISTS initiatives (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT,
    pillar_code INTEGER,
    owner       TEXT,
    status      TEXT NOT NULL DEFAULT 'Not started', -- Not started | In progress | At risk | Blocked | Done
    health      TEXT NOT NULL DEFAULT 'green',       -- green | amber | red
    progress    INTEGER NOT NULL DEFAULT 0,          -- 0–100
    start_date  DATE,
    due_date    DATE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_initiatives_pillar ON initiatives(pillar_code);

-- ═══════════════════════════ 2 · COMMERCIAL ═════════════════════════════════

CREATE TABLE IF NOT EXISTS accounts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    sector     TEXT,               -- Banking | Industry | Utilities | Other
    geography  TEXT DEFAULT 'US',  -- US | LATAM
    tier       TEXT,               -- Strategic | Priority | New logo
    owner      TEXT,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    stream      TEXT,               -- Core consulting | Nexus Model | ICAgile certifications | AI experiences
    stage       TEXT NOT NULL DEFAULT 'Qualify', -- Qualify | Proposal | Negotiation | Won | Lost
    margin_tier INTEGER DEFAULT 40, -- 30 Land | 40 Standard | 50 Differentiated
    value_k     NUMERIC DEFAULT 0,  -- US$ thousands
    probability INTEGER DEFAULT 50, -- 0–100
    close_date  DATE,
    owner       TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_account ON opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);

-- The 3-year sales projection model (Conservative / Base / Aggressive).
CREATE TABLE IF NOT EXISTS projections (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario TEXT NOT NULL,       -- Conservative | Base | Aggressive
    year     INTEGER NOT NULL,
    stream   TEXT NOT NULL,
    value_k  NUMERIC NOT NULL DEFAULT 0,
    UNIQUE (scenario, year, stream)
);

-- ═══════════════════════════ 3 · PEOPLE ═════════════════════════════════════

CREATE TABLE IF NOT EXISTS people (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT NOT NULL,
    level              TEXT,               -- Analyst / Associate … Principal / Practice Lead
    track              TEXT,               -- Delivery | Expert / Asset | Trainer | Leadership
    hire_model         TEXT DEFAULT 'Build', -- Build | Borrow | Buy
    base_cost_day      NUMERIC,
    bill_rate_day      NUMERIC,
    target_margin_low  NUMERIC,            -- e.g. 30 (%)
    target_margin_high NUMERIC,            -- e.g. 40 (%)
    utilization        NUMERIC,            -- 0–100 (%)
    notes              TEXT,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS person_certifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id     UUID REFERENCES people(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    provider      TEXT,            -- Google Cloud | Microsoft | AWS | ICAgile | Scaled Agile
    status        TEXT NOT NULL DEFAULT 'Planned', -- Planned | In progress | Certified | Lapsed
    cost          NUMERIC,
    target_date   DATE,
    obtained_date DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certs_person ON person_certifications(person_id);

-- ═══════════════════════ 4 · ASSETS & CERTIFICATION ENGINE ══════════════════

CREATE TABLE IF NOT EXISTS assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    category    TEXT,               -- Transformation model | AI / Copilot | Learning | Method | Tool
    status      TEXT NOT NULL DEFAULT 'Backlog', -- Backlog | In build | Packaged | Live | Retired
    owner       TEXT,
    description TEXT,
    reuse_count INTEGER NOT NULL DEFAULT 0,
    revenue_k   NUMERIC NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cohorts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    course     TEXT,               -- ICP-ATF | ICP-ORG | SAFe | AI experience
    audience   TEXT DEFAULT 'Public', -- Public | Client
    client     TEXT,
    status     TEXT NOT NULL DEFAULT 'Planned', -- Planned | Open | Running | Delivered | Cancelled
    start_date DATE,
    seats      INTEGER NOT NULL DEFAULT 20,
    enrolled   INTEGER NOT NULL DEFAULT 0,
    tuition    NUMERIC NOT NULL DEFAULT 999,   -- charged per student (USD)
    cert_fee   NUMERIC NOT NULL DEFAULT 75,    -- COGS per certificate issued (USD)
    trainer    TEXT,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
