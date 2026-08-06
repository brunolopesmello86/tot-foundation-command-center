/* ══════════════════════════════════════════════════════════════════════════
   T&OT Foundation Command Center — client
   Vanilla ES modules. State lives in memory; every mutation round-trips to the
   API and re-renders the affected view.
   ══════════════════════════════════════════════════════════════════════════ */

import { stackedBar, hbars, seriesColors } from './charts.js';

/* ── Domain vocabulary (mirrors the Playing to Win deck) ─────────────────── */

const STREAMS = [
  'Core AI/Copilot & digital strategy consulting',
  'Nexus Model (asset) — US + LATAM export',
  'ICAgile certifications (public + client)',
  'In-person AI experiences (WOW workshops)',
];
const STREAM_SHORT = {
  [STREAMS[0]]: 'Core consulting',
  [STREAMS[1]]: 'Nexus Model',
  [STREAMS[2]]: 'ICAgile certs',
  [STREAMS[3]]: 'AI experiences',
};
const SECTORS      = ['Multilaterals', 'FIS', 'Utilities', 'Banking', 'Industry', 'Other'];
const GEOGRAPHIES  = ['US', 'LATAM'];
const ACCOUNT_TIER = ['Strategic', 'Priority', 'New logo'];
const STAGES       = ['Qualify', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const OPEN_STAGES  = ['Qualify', 'Proposal', 'Negotiation'];
const MARGIN_TIERS = [
  { v: 30, l: '30% · Land / Entry' },
  { v: 40, l: '40% · Standard' },
  { v: 50, l: '50%+ · Differentiated' },
];
const INIT_STATUS  = ['Not started', 'In progress', 'At risk', 'Blocked', 'Done'];
const HEALTH       = ['green', 'amber', 'red'];
const METRIC_CATS  = ['Growth', 'Capability', 'Positioning', 'Innovation'];
const UNITS        = ['%', '$K', '#', 'ratio'];
const LEVELS       = ['Analyst / Associate', 'Consultant', 'Senior Consultant', 'Manager / Engagement Lead', 'Principal / Practice Lead'];
const TRACKS       = ['Delivery', 'Expert / Asset', 'Trainer', 'Leadership'];
const HIRE_MODELS  = ['Build', 'Borrow', 'Buy'];
const CERT_STATUS  = ['Planned', 'In progress', 'Certified', 'Lapsed'];
const PROVIDERS    = ['Google Cloud', 'Microsoft', 'AWS', 'ICAgile', 'Scaled Agile', 'Other'];
const ASSET_CATS   = ['Transformation model', 'AI / Copilot', 'Learning', 'Method', 'Tool'];
const ASSET_STATUS = ['Backlog', 'In build', 'Packaged', 'Live', 'Retired'];
const COURSES      = ['ICP-ATF', 'ICP-ORG', 'SAFe', 'AI experience'];
const AUDIENCES    = ['Public', 'Client'];
const COHORT_STATUS= ['Planned', 'Open', 'Running', 'Delivered', 'Cancelled'];
const SCENARIOS    = ['Conservative', 'Base', 'Aggressive'];
const BASELINE_K   = 2500; // 2025 exit run-rate ($K), per the projection model


/* ── API layer ───────────────────────────────────────────────────────────── */

const TOKEN_KEY = 'tot_cc_token';
let token = localStorage.getItem(TOKEN_KEY);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // A 401 from the login call means "wrong passcode" — it must surface as such,
  // not as an expired session, and must not bounce the user back to the gate
  // they are already standing at.
  if (res.status === 401 && path !== '/auth/login') {
    logout();
    throw new Error('Session expired — sign in again.');
  }
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ── State ───────────────────────────────────────────────────────────────── */

const state = {
  pillars: [], drivers: [], metrics: [], initiatives: [], accounts: [], opportunities: [],
  projections: [], people: [], certifications: [], assets: [], cohorts: [],
  tensions: [], projects: [],
};

const ui = {
  view: 'strategy',
  scenario: 'Base',
  pipelineSector: 'All',
  navOpen: false,      // mobile drawer
  lastLoaded: null,
  boardTab: { tensions: 'board', projects: 'board' },
};

/* ── Kanban board configuration — two boards, one engine ─────────────────── */

const BOARDS = {
  tensions: {
    resource: 'tensions',
    label: 'Tension',
    kindKey: 'priority',
    personKey: 'raised_by',
    personLabel: 'Raised by',
    doneKey: 'processed_at',
    doneVerb: 'Synchronized',
    columns: ['Creative Tensions', 'Prioritized', 'Clarifying', 'Action Proposal', 'Synchronized'],
    groups: [
      { label: 'Creative Tensions', span: 1 },
      { label: 'In Processing', span: 3 },
      { label: 'Synchronized', span: 1 },
    ],
    kinds: [
      { v: 'Critical', color: 'var(--critical)' },
      { v: 'High', color: 'var(--blue)' },
      { v: 'Medium', color: 'var(--warning)' },
      { v: 'Low', color: 'var(--muted)' },
    ],
  },
  projects: {
    resource: 'projects',
    label: 'Project',
    kindKey: 'card_type',
    personKey: 'owner',
    personLabel: 'Owner',
    doneKey: 'done_at',
    doneVerb: 'Done',
    columns: ['Backlog', 'Prioritized', 'Create', 'Review', 'Done'],
    groups: [
      { label: 'Backlog', span: 1 },
      { label: 'In Progress', span: 4 },
    ],
    kinds: [
      { v: 'Project', color: 'var(--text)' },
      { v: 'Move Act', color: 'var(--blue)' },
      { v: 'Idea', color: 'var(--good)' },
      { v: 'Pending Action', color: 'var(--warning)' },
    ],
  },
};

const kindColor = (cfg, v) => (cfg.kinds.find((k) => k.v === v) || {}).color || 'var(--muted)';
const terminalStage = (cfg) => cfg.columns[cfg.columns.length - 1];
const cardStage = (cfg, c) => c.stage || cfg.columns[0];

/* ── Navigation — grouped, rendered into the sidebar ─────────────────────── */

const ICONS = {
  strategy:   '<path d="M8 1.5 9.9 5.6l4.5.5-3.3 3 .9 4.4L8 11.4 4 13.5l.9-4.4-3.3-3 4.5-.5z"/>',
  financials: '<path d="M2 13.5h12M4 11V6.5M7.3 11V3M10.7 11V7.8M14 11V5"/>',
  pipeline:   '<path d="M1.5 3h13l-5 5.6V14L6.5 12V8.6z"/>',
  leads:      '<path d="M2 12.5 6 8l3 2.5L14 4"/><circle cx="6" cy="8" r="1"/><circle cx="9" cy="10.5" r="1"/>',
  people:     '<circle cx="6" cy="5" r="2.4"/><path d="M1.8 13.5c0-2.3 1.9-4.1 4.2-4.1s4.2 1.8 4.2 4.1"/><path d="M11 3.2a2.4 2.4 0 0 1 0 4.6M12.2 13.5c0-1.6-.5-2.6-1.2-3.4"/>',
  assets:     '<path d="M2 4.6 8 1.5l6 3.1v6.8L8 14.5l-6-3.1z"/><path d="M2 4.6 8 7.8l6-3.2M8 7.8v6.7"/>',
  tensions:   '<path d="M2.5 2.5h4v11h-4zM9.5 2.5h4v7h-4z"/><path d="M4.5 6h0M11.5 5h0"/>',
  projects:   '<rect x="1.8" y="2.5" width="3.2" height="11" rx="1"/><rect x="6.4" y="2.5" width="3.2" height="7" rx="1"/><rect x="11" y="2.5" width="3.2" height="9" rx="1"/>',
};

const NAV = [
  { group: 'Direction',    items: [
    { view: 'strategy',   label: 'Strategy',   hint: 'Goal, pillars, scoreboard' },
    { view: 'financials', label: 'Financials', hint: '3-year projection' },
  ]},
  { group: 'Commercial',   items: [
    { view: 'pipeline',   label: 'Pipeline',   hint: 'Active accounts & opportunities' },
    { view: 'leads',      label: 'Leads',      hint: 'Earlier / unqualified opportunities' },
  ]},
  { group: 'Organization', items: [
    { view: 'people',     label: 'People',     hint: 'Ladder, margin, certs' },
    { view: 'assets',     label: 'Assets & Certifications', hint: 'IP catalog & cohorts' },
    { view: 'tensions',   label: 'Tensions Board', hint: 'Creative tensions kanban & flow metrics' },
    { view: 'projects',   label: 'Internal Projects', hint: 'Initiatives kanban & flow metrics' },
  ]},
];

const VIEW_META = {
  strategy:   { title: 'Strategy',   sub: 'Playing to Win — one goal, three drivers, four pillars' },
  pipeline:   { title: 'Pipeline',   sub: 'Active commercial pipeline by sector, stage and margin tier' },
  leads:      { title: 'Leads',      sub: 'Earlier and unqualified opportunities — promote one to move it into the pipeline' },
  people:     { title: 'People',     sub: 'Delivery ladder, capacity and the certification path' },
  assets:     { title: 'Assets & Certifications', sub: 'Reusable IP and the ICAgile cohort machine' },
  financials: { title: 'Financials', sub: 'Three-year sales projection and pipeline coverage' },
  tensions:   { title: 'Tensions Board', sub: 'Creative tensions — the gap between what is and what could be better' },
  projects:   { title: 'Internal Projects', sub: 'The team\'s own initiatives, tracked to done' },
};

function renderNav() {
  const html = NAV.map((section) => `
    <div class="nav-group">
      <div class="nav-group-label">${esc(section.group)}</div>
      ${section.items.map((item) => `
        <button class="nav-item" data-view="${item.view}" aria-current="${ui.view === item.view}" title="${esc(item.hint)}">
          <svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[item.view]}</svg>
          <span>${esc(item.label)}</span>
        </button>`).join('')}
    </div>`).join('');
  document.getElementById('nav-sections').innerHTML = html;
}

/* ── Theme ───────────────────────────────────────────────────────────────── */
// The initial theme is applied by an inline script in index.html, before first
// paint, so there is no flash. This only handles switching afterwards.

const THEME_KEY = 'tot_cc_theme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme, { persist = true } = {}) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) localStorage.setItem(THEME_KEY, theme);

  const button = document.getElementById('btn-theme');
  if (button) {
    const isLight = theme === 'light';
    button.querySelector('.theme-icon').textContent = isLight ? '☀' : '☾';
    document.getElementById('theme-label').textContent = isLight ? 'Light' : 'Dark';
    button.setAttribute('aria-pressed', String(isLight));
    button.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
  }

  // Charts read their palette from CSS custom properties at draw time, and each
  // theme carries its own validated steps — so they must be redrawn, not
  // recoloured in place.
  const view = VIEWS[ui.view];
  if (view && view.draw && !document.getElementById('views').hidden) view.draw();
}

/* ── Formatting & small helpers ──────────────────────────────────────────── */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const moneyK = (v) => `$${num(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}K`;
const moneyKCompact = (v) => (num(v) >= 1000 ? `$${(num(v) / 1000).toFixed(1)}M` : `$${Math.round(num(v))}K`);
const usd = (v) => `$${num(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (v, d = 0) => `${num(v).toFixed(d)}%`;
const dash = (v) => (v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : esc(v));

function fmtDate(v) {
  if (!v) return '';
  const iso = String(v).slice(0, 10);
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

function healthClass(h) {
  return h === 'red' ? 'critical' : h === 'amber' ? 'warning' : 'good';
}

function statusChip(status) {
  const map = {
    'Done': 'good', 'Delivered': 'good', 'Certified': 'good', 'Live': 'good', 'Won': 'good', 'Packaged': 'good',
    'At risk': 'warning', 'Open': 'warning', 'In progress': 'neutral', 'In build': 'neutral', 'Running': 'neutral',
    'Blocked': 'critical', 'Lost': 'critical', 'Lapsed': 'critical', 'Cancelled': 'critical',
  };
  return `<span class="chip ${map[status] || 'neutral'}">${esc(status || '—')}</span>`;
}

function toast(message, isError = false) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { node.hidden = true; }, 3200);
}

const byId = (list, id) => list.find((r) => String(r.id) === String(id));
const sum = (list, fn) => list.reduce((acc, item) => acc + num(fn(item)), 0);

/* ── Entity definitions — drive both the editor form and the API calls ───── */

const ENTITIES = {
  tensions: {
    label: 'Tension',
    fields: [
      { key: 'title', label: 'Tension', type: 'text', required: true, span: true },
      { key: 'priority', label: 'Priority', type: 'select', options: () => BOARDS.tensions.kinds.map((k) => k.v) },
      { key: 'stage', label: 'Column', type: 'select', options: () => BOARDS.tensions.columns },
      { key: 'raised_by', label: 'Raised by', type: 'text' },
      { key: 'role', label: 'Role that can address it', type: 'text' },
      { key: 'sort_order', label: 'Sort', type: 'number' },
      { key: 'detail', label: 'Root cause / notes', type: 'textarea', span: true },
    ],
    normalize: (body, record) => stampDone(BOARDS.tensions, body, record),
  },
  projects: {
    label: 'Project',
    fields: [
      { key: 'title', label: 'Project', type: 'text', required: true, span: true },
      { key: 'card_type', label: 'Type', type: 'select', options: () => BOARDS.projects.kinds.map((k) => k.v) },
      { key: 'stage', label: 'Column', type: 'select', options: () => BOARDS.projects.columns },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'due_date', label: 'Due', type: 'date' },
      { key: 'sort_order', label: 'Sort', type: 'number' },
      { key: 'detail', label: 'Notes', type: 'textarea', span: true },
    ],
    normalize: (body, record) => stampDone(BOARDS.projects, body, record),
  },
  drivers: {
    label: 'Driver',
    fields: [
      { key: 'name', label: 'Driver', type: 'text', required: true, span: true },
      { key: 'description', label: 'Description', type: 'textarea', span: true },
      { key: 'sort_order', label: 'Sort', type: 'number' },
    ],
  },
  pillars: {
    label: 'Pillar',
    fields: [
      { key: 'name', label: 'Pillar', type: 'text', required: true, span: true },
      { key: 'code', label: 'Number', type: 'number', required: true },
      { key: 'driver', label: 'Powered by driver', type: 'select', options: () => state.drivers.map((d) => d.name) },
      { key: 'sort_order', label: 'Sort', type: 'number' },
      { key: 'description', label: 'Description', type: 'textarea', span: true },
    ],
  },
  metrics: {
    label: 'Metric',
    fields: [
      { key: 'name', label: 'Metric', type: 'text', required: true, span: true },
      { key: 'category', label: 'Category', type: 'select', options: () => METRIC_CATS },
      { key: 'unit', label: 'Unit', type: 'select', options: () => UNITS },
      { key: 'target_value', label: 'Target', type: 'number', step: 'any' },
      { key: 'current_value', label: 'Actual', type: 'number', step: 'any' },
      { key: 'period', label: 'Period', type: 'text' },
      { key: 'sort_order', label: 'Sort', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: true },
    ],
  },
  initiatives: {
    label: 'Initiative',
    fields: [
      { key: 'title', label: 'Initiative', type: 'text', required: true, span: true },
      { key: 'pillar_code', label: 'Pillar', type: 'select', options: () => state.pillars.map((p) => ({ v: p.code, l: `${p.code} · ${p.name}` })) },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: () => INIT_STATUS },
      { key: 'health', label: 'Health', type: 'select', options: () => HEALTH },
      { key: 'progress', label: 'Progress %', type: 'number', min: 0, max: 100 },
      { key: 'start_date', label: 'Start', type: 'date' },
      { key: 'due_date', label: 'Due', type: 'date' },
      { key: 'description', label: 'Notes', type: 'textarea', span: true },
    ],
  },
  accounts: {
    label: 'Account',
    fields: [
      { key: 'name', label: 'Account', type: 'text', required: true, span: true },
      { key: 'sector', label: 'Sector', type: 'select', options: () => SECTORS },
      { key: 'geography', label: 'Geography', type: 'select', options: () => GEOGRAPHIES },
      { key: 'tier', label: 'Tier', type: 'select', options: () => ACCOUNT_TIER },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: true },
    ],
  },
  opportunities: {
    label: 'Opportunity',
    fields: [
      { key: 'name', label: 'Opportunity', type: 'text', required: true, span: true },
      { key: 'account_id', label: 'Account', type: 'select', required: true, options: () => state.accounts.map((a) => ({ v: a.id, l: a.name })) },
      { key: 'stream', label: 'Revenue stream', type: 'select', options: () => STREAMS.map((s) => ({ v: s, l: STREAM_SHORT[s] })) },
      { key: 'record_type', label: 'List', type: 'select', options: () => ['Pipeline', 'Lead'] },
      { key: 'stage', label: 'Stage', type: 'select', options: () => STAGES },
      { key: 'margin_tier', label: 'Margin tier', type: 'select', options: () => MARGIN_TIERS },
      { key: 'value_k', label: 'Value ($K)', type: 'number', step: 'any' },
      { key: 'probability', label: 'Probability %', type: 'number', min: 0, max: 100 },
      { key: 'close_date', label: 'Close date', type: 'date' },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: true },
    ],
  },
  people: {
    label: 'Person',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'level', label: 'Level', type: 'select', options: () => LEVELS },
      { key: 'track', label: 'Career track', type: 'select', options: () => TRACKS },
      { key: 'hire_model', label: 'Build / Borrow / Buy', type: 'select', options: () => HIRE_MODELS },
      { key: 'base_cost_day', label: 'Base cost / day ($)', type: 'number', step: 'any' },
      { key: 'bill_rate_day', label: 'Bill rate / day ($)', type: 'number', step: 'any' },
      { key: 'target_margin_low', label: 'Target margin low (%)', type: 'number', step: 'any' },
      { key: 'target_margin_high', label: 'Target margin high (%)', type: 'number', step: 'any' },
      { key: 'utilization', label: 'Utilization (%)', type: 'number', step: 'any' },
      { key: 'sort_order', label: 'Sort', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: true },
    ],
  },
  certifications: {
    label: 'Certification',
    fields: [
      { key: 'name', label: 'Certification', type: 'text', required: true, span: true },
      { key: 'person_id', label: 'Person', type: 'select', required: true, options: () => state.people.map((p) => ({ v: p.id, l: p.name })) },
      { key: 'provider', label: 'Provider', type: 'select', options: () => PROVIDERS },
      { key: 'status', label: 'Status', type: 'select', options: () => CERT_STATUS },
      { key: 'cost', label: 'Cost ($)', type: 'number', step: 'any' },
      { key: 'target_date', label: 'Target date', type: 'date' },
      { key: 'obtained_date', label: 'Obtained', type: 'date' },
    ],
  },
  assets: {
    label: 'Asset',
    fields: [
      { key: 'name', label: 'Asset', type: 'text', required: true, span: true },
      { key: 'category', label: 'Category', type: 'select', options: () => ASSET_CATS },
      { key: 'status', label: 'Status', type: 'select', options: () => ASSET_STATUS },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'reuse_count', label: 'Times reused', type: 'number' },
      { key: 'revenue_k', label: 'Revenue to date ($K)', type: 'number', step: 'any' },
      { key: 'sort_order', label: 'Sort', type: 'number' },
      { key: 'description', label: 'Description', type: 'textarea', span: true },
    ],
  },
  cohorts: {
    label: 'Cohort',
    fields: [
      { key: 'name', label: 'Cohort', type: 'text', required: true, span: true },
      { key: 'course', label: 'Course', type: 'select', options: () => COURSES },
      { key: 'audience', label: 'Audience', type: 'select', options: () => AUDIENCES },
      { key: 'client', label: 'Client (if client cohort)', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: () => COHORT_STATUS },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'seats', label: 'Seats', type: 'number' },
      { key: 'enrolled', label: 'Enrolled', type: 'number' },
      { key: 'tuition', label: 'Tuition / student ($)', type: 'number', step: 'any' },
      { key: 'cert_fee', label: 'Cert fee / student ($)', type: 'number', step: 'any' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: true },
    ],
  },
  projections: {
    label: 'Projection line',
    fields: [
      { key: 'scenario', label: 'Scenario', type: 'select', required: true, options: () => SCENARIOS },
      { key: 'year', label: 'Year', type: 'number', required: true },
      { key: 'stream', label: 'Stream', type: 'select', required: true, options: () => STREAMS.map((s) => ({ v: s, l: STREAM_SHORT[s] })) },
      { key: 'value_k', label: 'Value ($K)', type: 'number', step: 'any', required: true },
    ],
  },
};

/* ── Record editor modal ─────────────────────────────────────────────────── */

let editorContext = null;

function optionList(field) {
  const raw = typeof field.options === 'function' ? field.options() : field.options || [];
  return raw.map((o) => (typeof o === 'object' ? { v: o.v, l: o.l } : { v: o, l: o }));
}

function openEditor(entityKey, record = null, defaults = null) {
  const entity = ENTITIES[entityKey];
  editorContext = { entityKey, id: record ? record.id : null };

  document.getElementById('modal-title').textContent =
    `${record ? 'Edit' : 'New'} ${entity.label.toLowerCase()}`;

  const container = document.getElementById('modal-fields');
  container.innerHTML = entity.fields.map((f) => {
    const value = record ? record[f.key]
      : (defaults && defaults[f.key] !== undefined ? defaults[f.key] : '');
    const cls = f.span ? 'field span-2' : 'field';
    let control;

    if (f.type === 'select') {
      const opts = optionList(f)
        .map((o) => `<option value="${esc(o.v)}"${String(value) === String(o.v) ? ' selected' : ''}>${esc(o.l)}</option>`)
        .join('');
      control = `<select name="${f.key}"${f.required ? ' required' : ''}>
        <option value="">—</option>${opts}</select>`;
    } else if (f.type === 'textarea') {
      control = `<textarea name="${f.key}">${esc(value)}</textarea>`;
    } else {
      const val = f.type === 'date' ? String(value ?? '').slice(0, 10) : value ?? '';
      control = `<input type="${f.type}" name="${f.key}" value="${esc(val)}"` +
        `${f.required ? ' required' : ''}${f.min !== undefined ? ` min="${f.min}"` : ''}` +
        `${f.max !== undefined ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}>`;
    }
    return `<label class="${cls}"><span>${esc(f.label)}</span>${control}</label>`;
  }).join('');

  document.getElementById('modal-backdrop').hidden = false;
  const first = container.querySelector('input, select, textarea');
  if (first) first.focus();
}

function closeEditor() {
  document.getElementById('modal-backdrop').hidden = true;
  editorContext = null;
}

async function submitEditor(event) {
  event.preventDefault();
  if (!editorContext) return;

  const { entityKey, id } = editorContext;
  const entity = ENTITIES[entityKey];
  const form = new FormData(event.target);

  const body = {};
  entity.fields.forEach((f) => {
    const raw = form.get(f.key);
    body[f.key] = raw === null ? '' : String(raw).trim();
  });
  if (entity.normalize) entity.normalize(body, id ? byId(state[entityKey], id) : null);

  const saveButton = document.getElementById('modal-save');
  saveButton.disabled = true;
  try {
    await api(`/${entityKey}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body });
    await reload(entityKey);
    closeEditor();
    toast(`${entity.label} saved`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteRecord(entityKey, id) {
  const entity = ENTITIES[entityKey];
  if (!confirm(`Delete this ${entity.label.toLowerCase()}? This cannot be undone.`)) return;
  try {
    await api(`/${entityKey}/${id}`, { method: 'DELETE' });
    await reload(entityKey);
    toast(`${entity.label} deleted`);
  } catch (err) {
    toast(err.message, true);
  }
}

/* ── Shared markup helpers ───────────────────────────────────────────────── */

function rowActions(entityKey, id) {
  return `<td class="actions">
    <button class="btn sm" data-act="edit" data-entity="${entityKey}" data-id="${esc(id)}">Edit</button>
    <button class="btn sm danger" data-act="del" data-entity="${entityKey}" data-id="${esc(id)}">×</button>
  </td>`;
}

function addButton(entityKey, text) {
  return `<button class="btn primary sm" data-act="add" data-entity="${entityKey}">+ ${esc(text)}</button>`;
}

function table(headers, bodyRows, emptyText) {
  const head = headers.map((h) =>
    `<th${h.right ? ' class="right"' : ''}${h.actions ? ' class="actions"' : ''}>${esc(h.label ?? h)}</th>`).join('');
  const body = bodyRows.length
    ? bodyRows.join('')
    : `<tr><td colspan="${headers.length}" class="empty-row">${esc(emptyText)}</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function stat(label, value, foot = '', variant = '') {
  return `<div class="stat ${variant}">
    <div class="label">${esc(label)}</div>
    <div class="value">${value}</div>
    ${foot ? `<div class="foot">${foot}</div>` : ''}
  </div>`;
}

function progressCell(value) {
  const p = Math.max(0, Math.min(100, Math.round(num(value))));
  return `<div class="progress"><div class="track"><i style="width:${p}%"></i></div><div class="pct">${p}%</div></div>`;
}

/* ── View 01 · Strategy ──────────────────────────────────────────────────── */

function renderStrategy() {
  const initiativesByPillar = (code) => state.initiatives.filter((i) => num(i.pillar_code) === code);

  const pillarCards = state.pillars.map((p) => {
    const list = initiativesByPillar(num(p.code));
    const done = list.filter((i) => i.status === 'Done').length;
    const atRisk = list.filter((i) => i.health === 'red' || i.status === 'At risk' || i.status === 'Blocked').length;
    return `<div class="pillar" data-code="${esc(p.code)}">
      <div class="pillar-top">
        <span class="code">${esc(p.code)}</span><span class="name">${esc(p.name)}</span>
        <button class="btn sm ghost edit-inline" data-act="edit" data-entity="pillars" data-id="${esc(p.id)}" title="Edit pillar">Edit</button>
      </div>
      <p>${esc(p.description)}</p>
      <div class="tally">${list.length} initiative${list.length === 1 ? '' : 's'} · ${done} done${atRisk ? ` · <span style="color:var(--critical)">${atRisk} at risk</span>` : ''}</div>
    </div>`;
  }).join('');

  const driverCards = state.drivers.map((d) =>
    `<div class="driver">
      <div class="name">${esc(d.name)}
        <button class="btn sm ghost edit-inline" data-act="edit" data-entity="drivers" data-id="${esc(d.id)}" title="Edit driver">Edit</button>
      </div>
      <p>${esc(d.description)}</p>
    </div>`).join('') || '<p class="muted">No drivers yet.</p>';

  // Scoreboard — one tile per metric, grouped by category, with a target meter.
  const scoreboard = METRIC_CATS.map((cat) => {
    const metrics = state.metrics.filter((m) => m.category === cat);
    if (!metrics.length) return '';
    const tiles = metrics.map((m) => {
      const target = num(m.target_value);
      const current = num(m.current_value);
      const ratio = target > 0 ? Math.min(1, current / target) : 0;
      const cls = ratio >= 0.9 ? 'is-good' : ratio >= 0.5 ? 'is-warn' : 'is-bad';
      const fmt = (v) => (m.unit === '$K' ? moneyK(v) : m.unit === '%' ? pct(v) : m.unit === 'ratio' ? num(v).toFixed(2) : String(num(v)));
      return `<div class="stat">
        <div class="label">${esc(m.name)}</div>
        <div class="value">${fmt(current)}</div>
        <div class="meter"><i class="${cls}" style="width:${(ratio * 100).toFixed(1)}%"></i></div>
        <div class="foot">Target ${fmt(target)} · ${esc(m.period || '')}
          <button class="btn sm" style="float:right;margin-top:-4px" data-act="edit" data-entity="metrics" data-id="${esc(m.id)}">Edit</button>
        </div>
      </div>`;
    }).join('');
    return `<div style="margin-bottom:18px">
      <div class="eyebrow eyebrow-rule" style="margin-bottom:12px">${esc(cat)}</div>
      <div class="grid grid-4">${tiles}</div>
    </div>`;
  }).join('');

  const initRows = state.initiatives.map((i) => {
    const pillar = state.pillars.find((p) => num(p.code) === num(i.pillar_code));
    return `<tr>
      <td>${esc(i.title)}${i.description ? `<div class="muted" style="font-size:11px;margin-top:3px">${esc(i.description)}</div>` : ''}</td>
      <td>${pillar ? `<span class="chip tag">${esc(pillar.code)} · ${esc(pillar.name)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${dash(i.owner)}</td>
      <td>${statusChip(i.status)}</td>
      <td><span class="chip ${healthClass(i.health)}">${esc(i.health || 'green')}</span></td>
      <td>${progressCell(i.progress)}</td>
      <td class="num">${i.due_date ? fmtDate(i.due_date) : '<span class="muted">—</span>'}</td>
      ${rowActions('initiatives', i.id)}
    </tr>`;
  });

  return `
    <div class="goal-banner">
      <div class="eyebrow">North-star goal · 2026–2028</div>
      <div class="goal-value">Drive Sustainable Growth</div>
      <p>Convert capability-building into scalable revenue by making AI the spearhead of digital strategy,
         productizing our know-how into reusable assets, and diversifying across sectors.</p>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Drivers</h2>
        <div class="row-gap">
          <div class="hint">The engines of growth — every pillar is powered by at least one.</div>
          ${addButton('drivers', 'Driver')}
        </div>
      </div>
      <div class="grid grid-3">${driverCards}</div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Strategic Pillars</h2>
        <div class="row-gap">
          <div class="hint">Where the work happens. Initiative counts roll up live from the table below.</div>
          ${addButton('pillars', 'Pillar')}
        </div>
      </div>
      <div class="grid grid-4">${pillarCards}</div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Strategy Scoreboard</h2>
        <div class="row-gap">
          <div class="hint">Metrics that matter. The meter shows actual against target.</div>
          ${addButton('metrics', 'Metric')}
        </div>
      </div>
      ${scoreboard || '<p class="muted">No metrics yet.</p>'}
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Initiatives</h2>
        ${addButton('initiatives', 'Initiative')}
      </div>
      ${table(
        ['Initiative', 'Pillar', 'Owner', 'Status', 'Health', 'Progress', 'Due', { label: 'Actions', actions: true }],
        initRows,
        'No initiatives yet — add the first one.'
      )}
    </div>
  `;
}

/* ── View 02 · Pipeline ──────────────────────────────────────────────────── */

const pipelineOpps = () => state.opportunities.filter((o) => o.record_type !== 'Lead');
const leadOpps = () => state.opportunities.filter((o) => o.record_type === 'Lead');

function pipelineRows() {
  const base = pipelineOpps();
  if (ui.pipelineSector === 'All') return base;
  return base.filter((o) => {
    const account = byId(state.accounts, o.account_id);
    return account && account.sector === ui.pipelineSector;
  });
}

function renderPipeline() {
  const opps = pipelineRows();
  const open = opps.filter((o) => OPEN_STAGES.includes(o.stage));
  const won = opps.filter((o) => o.stage === 'Won');

  const totalOpen = sum(open, (o) => o.value_k);
  const weighted = sum(open, (o) => num(o.value_k) * num(o.probability) / 100);
  const wonValue = sum(won, (o) => o.value_k);
  const avgTier = open.length ? sum(open, (o) => o.margin_tier) / open.length : 0;

  const accountRows = state.accounts.map((a) => {
    const accountOpps = pipelineOpps().filter((o) => String(o.account_id) === String(a.id));
    const value = sum(accountOpps.filter((o) => o.stage !== 'Lost'), (o) => o.value_k);
    return `<tr>
      <td>${esc(a.name)}</td>
      <td>${dash(a.sector)}</td>
      <td>${dash(a.geography)}</td>
      <td>${a.tier ? `<span class="chip plain">${esc(a.tier)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${dash(a.owner)}</td>
      <td class="right num">${accountOpps.length}</td>
      <td class="right num">${moneyK(value)}</td>
      ${rowActions('accounts', a.id)}
    </tr>`;
  });

  const oppRows = opps.map((o) => {
    const account = byId(state.accounts, o.account_id);
    return `<tr>
      <td>${esc(o.name)}</td>
      <td>${account ? esc(account.name) : '<span class="muted">unassigned</span>'}</td>
      <td>${o.stream ? esc(STREAM_SHORT[o.stream] || o.stream) : '<span class="muted">—</span>'}</td>
      <td>${statusChip(o.stage)}</td>
      <td><span class="tier tier-${esc(o.margin_tier)}">${esc(o.margin_tier)}%</span></td>
      <td class="right num">${moneyK(o.value_k)}</td>
      <td class="right num">${num(o.probability)}%</td>
      <td class="right num">${moneyK(num(o.value_k) * num(o.probability) / 100)}</td>
      <td>${dash(o.owner)}</td>
      <td class="num">${o.close_date ? fmtDate(o.close_date) : '<span class="muted">—</span>'}</td>
      <td class="actions">
        <button class="btn sm" data-act="tolead" data-id="${esc(o.id)}" title="Move to Leads">→ Lead</button>
        <button class="btn sm" data-act="edit" data-entity="opportunities" data-id="${esc(o.id)}">Edit</button>
        <button class="btn sm danger" data-act="del" data-entity="opportunities" data-id="${esc(o.id)}">×</button>
      </td>
    </tr>`;
  });

  const sectorFilter = ['All', ...SECTORS].map((s) =>
    `<button data-act="sector" data-sector="${esc(s)}" aria-pressed="${ui.pipelineSector === s}">${esc(s)}</button>`).join('');

  return `
    <div class="row-gap">
      <div class="eyebrow">Filter by sector</div>
      <div class="seg">${sectorFilter}</div>
    </div>

    <div class="grid grid-4">
      ${stat('Open pipeline', moneyKCompact(totalOpen), `${open.length} open opportunit${open.length === 1 ? 'y' : 'ies'}`, 'blue')}
      ${stat('Weighted pipeline', moneyKCompact(weighted), 'value × probability', 'accent')}
      ${stat('Closed won', moneyKCompact(wonValue), `${won.length} deal${won.length === 1 ? '' : 's'}`)}
      ${stat('Avg margin tier', open.length ? pct(avgTier) : '—', 'floor 30 · default 40 · push 50+')}
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>Sector mix</h2>
          <div class="hint">Open + won value by account sector ($K).</div></div>
        <div id="chart-sector"></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Margin tier mix</h2>
          <div class="hint">Value by deal archetype — lead with assets to earn the 50%+ tier.</div></div>
        <div id="chart-tier"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Stage distribution</h2>
        <div class="hint">Total value at each stage ($K).</div></div>
      <div id="chart-stage"></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Opportunities</h2>
        ${addButton('opportunities', 'Opportunity')}
      </div>
      ${table(
        ['Opportunity', 'Account', 'Stream', 'Stage', 'Tier', { label: 'Value', right: true }, { label: 'Prob.', right: true },
         { label: 'Weighted', right: true }, 'Owner', 'Close', { label: 'Actions', actions: true }],
        oppRows,
        state.accounts.length ? 'No active opportunities in this filter — check the Leads view.' : 'Add an account first, then log opportunities against it.'
      )}
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Accounts</h2>
        ${addButton('accounts', 'Account')}
      </div>
      ${table(
        ['Account', 'Sector', 'Geo', 'Tier', 'Owner', { label: 'Opps', right: true }, { label: 'Value', right: true },
         { label: 'Actions', actions: true }],
        accountRows,
        'No accounts yet — start with your existing US strategic accounts.'
      )}
    </div>
  `;
}

function drawPipelineCharts() {
  const opps = pipelineRows();

  hbars(document.getElementById('chart-sector'), {
    rows: SECTORS.map((sector) => ({
      name: sector,
      value: sum(opps.filter((o) => {
        const a = byId(state.accounts, o.account_id);
        return a && a.sector === sector && o.stage !== 'Lost';
      }), (o) => o.value_k),
    })),
    format: moneyK,
    emptyText: 'No open or won value yet.',
  });

  hbars(document.getElementById('chart-tier'), {
    rows: MARGIN_TIERS.map((tier) => ({
      name: tier.l,
      value: sum(opps.filter((o) => num(o.margin_tier) === tier.v && o.stage !== 'Lost'), (o) => o.value_k),
    })),
    format: moneyK,
    emptyText: 'No open or won value yet.',
  });

  hbars(document.getElementById('chart-stage'), {
    rows: STAGES.map((stage) => ({
      name: stage,
      value: sum(opps.filter((o) => o.stage === stage), (o) => o.value_k),
    })),
    format: moneyK,
    emptyText: 'No opportunities logged yet.',
  });
}

/* ── View 03 · People ────────────────────────────────────────────────────── */

function personMargin(person) {
  const bill = num(person.bill_rate_day);
  const cost = num(person.base_cost_day);
  if (bill <= 0) return null;
  return ((bill - cost) / bill) * 100;
}

function renderPeople() {
  const withRates = state.people.filter((p) => num(p.bill_rate_day) > 0);
  const blended = withRates.length
    ? ((sum(withRates, (p) => p.bill_rate_day) - sum(withRates, (p) => p.base_cost_day)) / sum(withRates, (p) => p.bill_rate_day)) * 100
    : null;
  const utilised = state.people.filter((p) => num(p.utilization) > 0);
  const avgUtil = utilised.length ? sum(utilised, (p) => p.utilization) / utilised.length : null;

  const certified = state.certifications.filter((c) => c.status === 'Certified').length;
  const certInvestment = sum(state.certifications, (c) => c.cost);

  const peopleRows = state.people.map((p) => {
    const margin = personMargin(p);
    const target = num(p.target_margin_low);
    const cls = margin === null ? 'neutral' : margin >= num(p.target_margin_high) ? 'good' : margin >= target ? 'warning' : 'critical';
    const marginLabel = margin === null
      ? '<span class="muted">set rates</span>'
      : `<span class="chip ${cls}">${pct(margin)}</span>`;
    return `<tr>
      <td>${esc(p.name)}</td>
      <td>${dash(p.level)}</td>
      <td>${p.track ? `<span class="chip plain">${esc(p.track)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${dash(p.hire_model)}</td>
      <td class="right num">${num(p.base_cost_day) ? usd(p.base_cost_day) : '<span class="muted">—</span>'}</td>
      <td class="right num">${num(p.bill_rate_day) ? usd(p.bill_rate_day) : '<span class="muted">—</span>'}</td>
      <td class="right">${marginLabel}</td>
      <td class="right num">${num(p.target_margin_low)}–${num(p.target_margin_high)}%</td>
      <td class="right num">${num(p.utilization) ? pct(p.utilization) : '<span class="muted">—</span>'}</td>
      ${rowActions('people', p.id)}
    </tr>`;
  });

  const certRows = state.certifications.map((c) => {
    const person = byId(state.people, c.person_id);
    return `<tr>
      <td>${esc(c.name)}</td>
      <td>${person ? esc(person.name) : '<span class="muted">unassigned</span>'}</td>
      <td>${dash(c.provider)}</td>
      <td>${statusChip(c.status)}</td>
      <td class="right num">${num(c.cost) ? usd(c.cost) : '<span class="muted">—</span>'}</td>
      <td class="num">${c.target_date ? fmtDate(c.target_date) : '<span class="muted">—</span>'}</td>
      <td class="num">${c.obtained_date ? fmtDate(c.obtained_date) : '<span class="muted">—</span>'}</td>
      ${rowActions('certifications', c.id)}
    </tr>`;
  });

  const missingRates = state.people.filter((p) => !num(p.bill_rate_day) || !num(p.base_cost_day)).length;

  return `
    <div class="grid grid-4">
      ${stat('Headcount', String(state.people.length), 'lean, high-skill US core')}
      ${stat('Blended margin', blended === null ? '—' : pct(blended), blended === null ? 'complete the rate card' : 'across profiles with rates set', 'accent')}
      ${stat('Avg utilization', avgUtil === null ? '—' : pct(avgUtil), 'protect utilization with recurring work')}
      ${stat('Certifications', `${certified}/${state.certifications.length}`, `${usd(certInvestment)} programme investment`, 'blue')}
    </div>

    ${missingRates ? `<div class="card" style="border-color:rgba(210,153,34,0.35)">
      <div class="row-gap"><span class="chip warning">Rate card incomplete</span>
      <span class="muted" style="font-size:12px">${missingRates} profile${missingRates === 1 ? ' is' : 's are'} missing a base cost or bill rate —
      margin figures exclude them. Complete with the current US rate card.</span></div>
    </div>` : ''}

    <div class="card">
      <div class="card-head">
        <h2>Delivery ladder</h2>
        <div class="row-gap">
          <div class="hint">Margin = (bill rate − base cost) ÷ bill rate. The chip turns green once actual margin clears the target band.</div>
          ${addButton('people', 'Person')}
        </div>
      </div>
      ${table(
        ['Name', 'Level', 'Track', 'Model', { label: 'Cost/day', right: true }, { label: 'Bill/day', right: true },
         { label: 'Margin', right: true }, { label: 'Target', right: true }, { label: 'Util.', right: true },
         { label: 'Actions', actions: true }],
        peopleRows,
        'No people yet.'
      )}
    </div>

    <div class="card">
      <div class="card-head"><h2>Margin by profile</h2>
        <div class="hint">Actual margin per profile (%). Target rises with seniority and with asset-based work.</div></div>
      <div id="chart-margin"></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Certification tracker</h2>
        <div class="row-gap">
          <div class="hint">The AI + ICAgile/SAFe investment path behind Pillars 2 and 3.</div>
          ${addButton('certifications', 'Certification')}
        </div>
      </div>
      ${table(
        ['Certification', 'Person', 'Provider', 'Status', { label: 'Cost', right: true }, 'Target', 'Obtained',
         { label: 'Actions', actions: true }],
        certRows,
        'No certifications tracked yet.'
      )}
    </div>
  `;
}

function drawPeopleCharts() {
  const rows = state.people
    .map((p) => ({ name: p.name, value: personMargin(p) }))
    .filter((r) => r.value !== null);

  hbars(document.getElementById('chart-margin'), {
    rows,
    // Percentages read against a fixed 0–100 axis; scaling to the largest bar
    // would make a 36% and a 47% margin look worlds apart.
    scaleMax: 100,
    format: (v) => pct(v, 1),
    emptyText: 'Set base cost and bill rate on at least one profile to see margins.',
  });
}

/* ── View 04 · Assets & certification engine ─────────────────────────────── */

function cohortMargin(c) {
  return num(c.enrolled) * (num(c.tuition) - num(c.cert_fee));
}
function cohortRevenue(c) {
  return num(c.enrolled) * num(c.tuition);
}

function renderAssets() {
  const live = state.assets.filter((a) => ['Packaged', 'Live'].includes(a.status));
  const assetRevenue = sum(state.assets, (a) => a.revenue_k);
  const totalReuse = sum(state.assets, (a) => a.reuse_count);

  const delivered = state.cohorts.filter((c) => c.status === 'Delivered');
  const cohortGross = sum(delivered, cohortMargin);
  const pipelineCohorts = state.cohorts.filter((c) => ['Planned', 'Open', 'Running'].includes(c.status));
  const scheduledGross = sum(pipelineCohorts, cohortMargin);
  const seatsOpen = sum(pipelineCohorts, (c) => Math.max(0, num(c.seats) - num(c.enrolled)));

  const assetRows = state.assets.map((a) => `<tr>
    <td>${esc(a.name)}${a.description ? `<div class="muted" style="font-size:11px;margin-top:3px">${esc(a.description)}</div>` : ''}</td>
    <td>${dash(a.category)}</td>
    <td>${statusChip(a.status)}</td>
    <td>${dash(a.owner)}</td>
    <td class="right num">${num(a.reuse_count)}</td>
    <td class="right num">${moneyK(a.revenue_k)}</td>
    ${rowActions('assets', a.id)}
  </tr>`);

  const cohortRows = state.cohorts.map((c) => {
    const fill = num(c.seats) > 0 ? (num(c.enrolled) / num(c.seats)) * 100 : 0;
    return `<tr>
      <td>${esc(c.name)}${c.client ? `<div class="muted" style="font-size:11px">${esc(c.client)}</div>` : ''}</td>
      <td>${dash(c.course)}</td>
      <td>${dash(c.audience)}</td>
      <td>${statusChip(c.status)}</td>
      <td class="num">${c.start_date ? fmtDate(c.start_date) : '<span class="muted">—</span>'}</td>
      <td>${progressCell(fill)}</td>
      <td class="right num">${num(c.enrolled)}/${num(c.seats)}</td>
      <td class="right num">${usd(cohortRevenue(c))}</td>
      <td class="right num">${usd(cohortMargin(c))}</td>
      ${rowActions('cohorts', c.id)}
    </tr>`;
  });

  return `
    <div class="grid grid-4">
      ${stat('Assets packaged or live', `${live.length}/${state.assets.length}`, 'scale revenue without scaling headcount', 'accent')}
      ${stat('Asset revenue', moneyKCompact(assetRevenue), `${totalReuse} total reuse${totalReuse === 1 ? '' : 's'}`, 'blue')}
      ${stat('Cohort margin · delivered', usd(cohortGross),
        `${delivered.length} delivered · ${usd(scheduledGross)} scheduled in ${pipelineCohorts.length}`)}
      ${stat('Seats open', String(seatsOpen), `${pipelineCohorts.length} cohort${pipelineCohorts.length === 1 ? '' : 's'} planned or running`)}
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Asset &amp; IP catalog</h2>
        <div class="row-gap">
          <div class="hint">The backlog and standard for productizing, cataloguing and reusing assets.</div>
          ${addButton('assets', 'Asset')}
        </div>
      </div>
      ${table(
        ['Asset', 'Category', 'Status', 'Owner', { label: 'Reused', right: true }, { label: 'Revenue', right: true },
         { label: 'Actions', actions: true }],
        assetRows,
        'No assets yet.'
      )}
    </div>

    <div class="card">
      <div class="card-head"><h2>Assets by status</h2>
        <div class="hint">How much of the catalog has made it from backlog to sellable.</div></div>
      <div id="chart-asset-status"></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Certification engine</h2>
        <div class="row-gap">
          <div class="hint">Gross margin per cohort = enrolled × (tuition − certification fee). Delivery cost and marketing sit outside this figure.</div>
          ${addButton('cohorts', 'Cohort')}
        </div>
      </div>
      ${table(
        ['Cohort', 'Course', 'Audience', 'Status', 'Start', 'Fill', { label: 'Enrolled', right: true },
         { label: 'Revenue', right: true }, { label: 'Gross margin', right: true }, { label: 'Actions', actions: true }],
        cohortRows,
        'No cohorts scheduled — the plan calls for a first ICP-ATF & ICP-ORG cohort to build momentum.'
      )}
    </div>

    <div class="card">
      <div class="card-head"><h2>Gross margin by cohort</h2>
        <div class="hint">Margin scales with cohort size — $10K–$15K+ per 15–20 attendee cohort in the model.</div></div>
      <div id="chart-cohort"></div>
    </div>
  `;
}

function drawAssetCharts() {
  hbars(document.getElementById('chart-asset-status'), {
    rows: ASSET_STATUS.map((status) => ({
      name: status,
      value: state.assets.filter((a) => a.status === status).length,
    })),
    format: (v) => String(Math.round(v)),
    emptyText: 'No assets yet.',
  });

  hbars(document.getElementById('chart-cohort'), {
    rows: state.cohorts.map((c) => ({ name: c.name, value: cohortMargin(c) })),
    format: usd,
    emptyText: 'No cohorts scheduled yet.',
  });
}

/* ── View 05 · Financials ────────────────────────────────────────────────── */

function projectionFor(scenario) {
  const rows = state.projections.filter((p) => p.scenario === scenario);
  const years = [...new Set(rows.map((r) => num(r.year)))].sort((a, b) => a - b);
  const palette = seriesColors();
  const series = STREAMS.map((stream, i) => ({
    name: STREAM_SHORT[stream],
    color: palette[i],
    values: years.map((y) => sum(rows.filter((r) => num(r.year) === y && r.stream === stream), (r) => r.value_k)),
  }));
  const totals = years.map((_, idx) => series.reduce((acc, s) => acc + s.values[idx], 0));
  return { years, series, totals, rows };
}

function renderFinancials() {
  const { years, series, totals, rows } = projectionFor(ui.scenario);
  const last = totals.length ? totals[totals.length - 1] : 0;
  const cumulative = totals.reduce((a, b) => a + b, 0);
  const span = years.length || 1;
  const cagr = last > 0 ? (Math.pow(last / BASELINE_K, 1 / span) - 1) * 100 : 0;

  // New-stream share = everything other than core consulting, in the final year.
  const coreLast = series[0] && series[0].values.length ? series[0].values[series[0].values.length - 1] : 0;
  const newShare = last > 0 ? ((last - coreLast) / last) * 100 : 0;

  // Pipeline coverage against the first projected year.
  const firstYear = years[0];
  const yearTarget = totals[0] || 0;
  const won = sum(pipelineOpps().filter((o) => o.stage === 'Won'), (o) => o.value_k);
  const weighted = sum(
    pipelineOpps().filter((o) => OPEN_STAGES.includes(o.stage)),
    (o) => num(o.value_k) * num(o.probability) / 100
  );
  const coverage = yearTarget > 0 ? ((won + weighted) / yearTarget) * 100 : 0;
  const coverageClass = coverage >= 90 ? 'is-good' : coverage >= 50 ? 'is-warn' : 'is-bad';

  const scenarioButtons = SCENARIOS.map((s) =>
    `<button data-act="scenario" data-scenario="${esc(s)}" aria-pressed="${ui.scenario === s}">${esc(s)}</button>`).join('');

  const projRows = rows.map((r) => `<tr>
    <td>${esc(r.scenario)}</td>
    <td class="num">${num(r.year)}</td>
    <td>${esc(STREAM_SHORT[r.stream] || r.stream)}</td>
    <td class="right num">${moneyK(r.value_k)}</td>
    ${rowActions('projections', r.id)}
  </tr>`);

  const summaryRows = SCENARIOS.map((scenario) => {
    const p = projectionFor(scenario);
    const total2028 = p.totals.length ? p.totals[p.totals.length - 1] : 0;
    const cum = p.totals.reduce((a, b) => a + b, 0);
    const growth = total2028 > 0 ? (Math.pow(total2028 / BASELINE_K, 1 / (p.years.length || 1)) - 1) * 100 : 0;
    return `<tr${scenario === ui.scenario ? ' style="background:rgba(8,168,248,0.07)"' : ''}>
      <td>${esc(scenario)}${scenario === ui.scenario ? ' <span class="chip plain">viewing</span>' : ''}</td>
      ${p.totals.map((t) => `<td class="right num">${moneyK(t)}</td>`).join('')}
      <td class="right num">${moneyKCompact(cum)}</td>
      <td class="right num">${pct(growth, 1)}</td>
    </tr>`;
  });

  return `
    <div class="row-gap">
      <div class="eyebrow">Scenario</div>
      <div class="seg">${scenarioButtons}</div>
      <span class="muted" style="font-size:12px">Bottom-up from four revenue streams on a ${moneyK(BASELINE_K)} 2025 base.</span>
    </div>

    <div class="grid grid-4">
      ${stat(`${years[years.length - 1] || ''} sales`, moneyKCompact(last), `${ui.scenario} case`, 'accent')}
      ${stat('3-year cumulative', moneyKCompact(cumulative), `${years[0] || ''}–${years[years.length - 1] || ''}`, 'blue')}
      ${stat('CAGR', pct(cagr, 1), `vs ${moneyK(BASELINE_K)} baseline`)}
      ${stat('New-stream share', pct(newShare), 'Nexus + certs + AI experiences')}
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Sales by stream — ${esc(ui.scenario)} case</h2>
        <div class="hint">US$ thousands. Growth that diversifies away from core consulting.</div>
      </div>
      <div id="chart-projection"></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Pipeline coverage · ${esc(String(firstYear || ''))}</h2>
        <div class="hint">Closed-won plus weighted open pipeline against the ${esc(ui.scenario.toLowerCase())}-case target for the first projected year.</div>
      </div>
      <div class="grid grid-3">
        ${stat('Target', moneyKCompact(yearTarget), `${esc(ui.scenario)} case ${firstYear || ''}`)}
        ${stat('Won + weighted', moneyKCompact(won + weighted), `${moneyKCompact(won)} won · ${moneyKCompact(weighted)} weighted`)}
        `+`<div class="stat">
          <div class="label">Coverage</div>
          <div class="value">${pct(coverage)}</div>
          <div class="meter"><i class="${coverageClass}" style="width:${Math.min(100, coverage).toFixed(1)}%"></i></div>
          <div class="foot">of the ${esc(String(firstYear || ''))} target</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Scenario summary</h2>
        <div class="hint">Total sales by year across all three scenarios ($K).</div></div>
      ${table(
        ['Scenario', ...years.map(String), { label: 'Cumulative', right: true }, { label: 'CAGR', right: true }],
        summaryRows,
        'No projection data.'
      )}
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Projection model — ${esc(ui.scenario)}</h2>
        <div class="row-gap">
          <div class="hint">Edit a line to re-plan. Figures seeded from the Excel model.</div>
          ${addButton('projections', 'Line')}
        </div>
      </div>
      ${table(
        ['Scenario', 'Year', 'Stream', { label: 'Value', right: true }, { label: 'Actions', actions: true }],
        projRows,
        'No projection lines for this scenario.'
      )}
    </div>
  `;
}

function drawFinancialCharts() {
  const { years, series } = projectionFor(ui.scenario);
  const node = document.getElementById('chart-projection');
  if (!node) return;
  if (!years.length) {
    node.innerHTML = '<p class="muted" style="padding:20px 0;font-size:12px">No projection data for this scenario.</p>';
    return;
  }
  stackedBar(node, {
    categories: years.map(String),
    series,
    format: (v) => (v === 0 ? '$0' : v >= 1000 ? `$${(v / 1000).toFixed(1)}M` : `$${Math.round(v)}K`),
  });
}

/* ── Kanban boards ───────────────────────────────────────────────────────── */

// Keep the terminal-column timestamp in sync with the card's stage, whether the
// change came from the editor or a drag. Uses the browser clock — fine for an
// internal tool. Sending '' clears it (the server maps '' to NULL).
function stampDone(cfg, body, record) {
  if (!('stage' in body)) return;
  if (body.stage === terminalStage(cfg)) {
    body[cfg.doneKey] = (record && record[cfg.doneKey]) || new Date().toISOString();
  } else {
    body[cfg.doneKey] = '';
  }
}

async function setRecordType(id, recordType) {
  try {
    await api(`/opportunities/${id}`, { method: 'PUT', body: { record_type: recordType } });
    await reload('opportunities');
    toast(recordType === 'Lead' ? 'Moved to Leads' : 'Moved to Pipeline');
  } catch (err) {
    toast(err.message, true);
  }
}

async function moveCard(resource, id, stage) {
  const cfg = BOARDS[resource];
  const rec = byId(state[resource], id);
  if (!rec || cardStage(cfg, rec) === stage) return;
  const body = { stage };
  stampDone(cfg, body, rec);
  try {
    await api(`/${resource}/${id}`, { method: 'PUT', body });
    await reload(resource);
    toast(`Moved to ${stage}`);
  } catch (err) {
    toast(err.message, true);
  }
}

function boardCards(cfg, stage) {
  return state[cfg.resource]
    .filter((c) => cardStage(cfg, c) === stage)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order) ||
      (String(a.created_at) < String(b.created_at) ? -1 : 1));
}

function cardHtml(cfg, c) {
  const person = c[cfg.personKey];
  const kind = c[cfg.kindKey];
  const done = c[cfg.doneKey];
  return `<div class="kanban-card" draggable="true" data-resource="${cfg.resource}" data-id="${esc(c.id)}"
      style="--card-accent:${kindColor(cfg, kind)}">
    <div class="kc-top">
      <span class="kc-title">${esc(c.title)}</span>
      <button class="kc-del" data-act="del" data-entity="${cfg.resource}" data-id="${esc(c.id)}" aria-label="Delete card">×</button>
    </div>
    ${c.detail ? `<div class="kc-detail">${esc(c.detail)}</div>` : ''}
    <div class="kc-foot">
      ${kind ? `<span class="kc-kind">${esc(kind)}</span>` : ''}
      ${person ? `<span class="kc-person">${esc(person)}</span>` : ''}
      ${done ? `<span class="kc-date">${fmtDate(done)}</span>` : (c.due_date ? `<span class="kc-date">due ${fmtDate(c.due_date)}</span>` : '')}
    </div>
  </div>`;
}

function boardTabToggle(cfg) {
  const tab = ui.boardTab[cfg.resource] || 'board';
  return `<div class="seg">
    <button data-act="boardtab" data-view="${cfg.resource}" data-tab="board" aria-pressed="${tab === 'board'}">Board</button>
    <button data-act="boardtab" data-view="${cfg.resource}" data-tab="report" aria-pressed="${tab === 'report'}">Report</button>
  </div>`;
}

function renderBoard(cfg) {
  const tab = ui.boardTab[cfg.resource] || 'board';
  if (tab === 'report') {
    return `<div class="board-head"><div></div>${boardTabToggle(cfg)}</div>${renderBoardReport(cfg)}`;
  }

  const groupBand = cfg.groups.map((g) =>
    `<div class="kc-group" style="grid-column:span ${g.span}">${esc(g.label)}</div>`).join('');

  const cols = cfg.columns.map((stage) => {
    const cards = boardCards(cfg, stage);
    return `<div class="kanban-col" data-resource="${cfg.resource}" data-stage="${esc(stage)}">
      <div class="kc-col-head"><span>${esc(stage)}</span><span class="kc-count">${cards.length}</span></div>
      <div class="kc-list">${cards.map((c) => cardHtml(cfg, c)).join('')}</div>
      <button class="kc-add" data-act="add" data-entity="${cfg.resource}" data-stage="${esc(stage)}">+ Add</button>
    </div>`;
  }).join('');

  const n = cfg.columns.length;
  return `<div class="board-head">
      <div class="hint">Drag a card between columns, or click it to edit. Cards reaching <strong>${esc(cfg.doneVerb)}</strong> are timestamped for the flow report.</div>
      <div class="row-gap">${boardTabToggle(cfg)}${addButton(cfg.resource, cfg.label)}</div>
    </div>
    <div class="kanban-scroll">
      <div class="kanban-grid" style="--cols:${n}">
        <div class="kanban-groups">${groupBand}</div>
        <div class="kanban-cols">${cols}</div>
      </div>
    </div>`;
}

/* ── Board flow metrics ──────────────────────────────────────────────────── */

function weekStart(value) {
  const d = new Date(value);
  const shift = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - shift);
  d.setHours(0, 0, 0, 0);
  return d;
}

function boardMetrics(cfg) {
  const all = state[cfg.resource];
  const done = all.filter((c) => c[cfg.doneKey]);
  const open = all.filter((c) => cardStage(cfg, c) !== terminalStage(cfg));
  const daysOf = (c) => Math.max(0, (new Date(c[cfg.doneKey]) - new Date(c.created_at)) / 86400000);
  const avgDays = done.length ? done.reduce((sum, c) => sum + daysOf(c), 0) / done.length : null;
  const people = [...new Set(all.map((c) => c[cfg.personKey]).filter(Boolean))];

  // Throughput over the last 8 weeks.
  const anchor = weekStart(new Date());
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const w = new Date(anchor);
    w.setDate(w.getDate() - i * 7);
    weeks.push(w);
  }
  const perWeek = weeks.map((w) =>
    done.filter((c) => weekStart(c[cfg.doneKey]).getTime() === w.getTime()).length);

  const byPerson = people
    .map((p) => ({ name: p, value: all.filter((c) => c[cfg.personKey] === p).length }))
    .sort((a, b) => b.value - a.value);

  return { all, done, open, avgDays, people, weeks, perWeek, byPerson, daysOf };
}

function renderBoardReport(cfg) {
  const m = boardMetrics(cfg);
  if (!m.done.length) {
    return `<div class="card"><p class="muted">No ${esc(cfg.doneVerb.toLowerCase())} cards yet — flow metrics appear once cards reach ${esc(cfg.doneVerb)}.</p></div>`;
  }

  const recent = m.done.slice()
    .sort((a, b) => new Date(b[cfg.doneKey]) - new Date(a[cfg.doneKey]))
    .slice(0, 10)
    .map((c) => `<tr>
      <td>${esc(c.title)}</td>
      <td>${dash(c[cfg.personKey])}</td>
      <td class="num">${fmtDate(c.created_at)}</td>
      <td class="num">${fmtDate(c[cfg.doneKey])}</td>
      <td class="right num">${Math.round(m.daysOf(c))}</td>
    </tr>`);

  return `
    <div class="grid grid-4">
      ${stat(`${esc(cfg.doneVerb)} — total`, String(m.done.length), 'cards completed', 'accent')}
      ${stat('In flow now', String(m.open.length), 'not yet ' + esc(cfg.doneVerb.toLowerCase()), 'blue')}
      ${stat('Avg days to process', m.avgDays === null ? '—' : Math.round(m.avgDays), 'created → ' + esc(cfg.doneVerb.toLowerCase()))}
      ${stat(cfg.personLabel === 'Raised by' ? 'People raising' : 'Owners', String(m.people.length), 'distinct contributors')}
    </div>

    <div class="card">
      <div class="card-head"><h2>${esc(cfg.doneVerb)} per week</h2>
        <div class="hint">Throughput over the last 8 weeks.</div></div>
      <div id="board-week"></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Cards by ${esc(cfg.personLabel.toLowerCase())}</h2>
        <div class="hint">Who is bringing the work — all cards, open and ${esc(cfg.doneVerb.toLowerCase())}.</div></div>
      <div id="board-person"></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Recently ${esc(cfg.doneVerb.toLowerCase())}</h2>
        <div class="hint">Cycle time in days, newest first.</div></div>
      ${table(
        ['Card', cfg.personLabel, 'Raised', cfg.doneVerb, { label: 'Days', right: true }],
        recent, 'None yet.'
      )}
    </div>`;
}

function drawBoardReport(cfg) {
  const m = boardMetrics(cfg);
  const weekNode = document.getElementById('board-week');
  if (weekNode) {
    stackedBar(weekNode, {
      categories: m.weeks.map((w) => w.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
      series: [{ name: cfg.doneVerb, values: m.perWeek }],
      format: (v) => String(Math.round(v)),
    });
  }
  const personNode = document.getElementById('board-person');
  if (personNode) {
    hbars(personNode, { rows: m.byPerson, format: (v) => String(Math.round(v)), emptyText: 'No cards yet.' });
  }
}

function drawBoard(cfg) {
  if ((ui.boardTab[cfg.resource] || 'board') === 'report') drawBoardReport(cfg);
}

/* ── View · Leads ────────────────────────────────────────────────────────── */

function renderLeads() {
  const leads = leadOpps();
  const value = sum(leads, (o) => o.value_k);
  const owners = [...new Set(leads.map((o) => o.owner).filter(Boolean))];

  const bySector = SECTORS.map((sector) => ({
    name: sector,
    value: leads.filter((o) => {
      const a = byId(state.accounts, o.account_id);
      return a && a.sector === sector;
    }).length,
  })).filter((r) => r.value);

  const rows = leads
    .slice()
    .sort((a, b) => num(b.value_k) - num(a.value_k) || String(a.name).localeCompare(String(b.name)))
    .map((o) => {
      const account = byId(state.accounts, o.account_id);
      return `<tr>
        <td>${esc(o.name)}${o.notes ? `<div class="muted" style="font-size:11px;margin-top:3px">${esc(o.notes)}</div>` : ''}</td>
        <td>${account ? esc(account.name) : '<span class="muted">unassigned</span>'}</td>
        <td>${account ? dash(account.sector) : '<span class="muted">—</span>'}</td>
        <td>${dash(o.owner)}</td>
        <td>${statusChip(o.stage)}</td>
        <td class="right num">${num(o.value_k) ? moneyK(o.value_k) : '<span class="muted">—</span>'}</td>
        <td class="actions">
          <button class="btn sm primary" data-act="topipeline" data-id="${esc(o.id)}" title="Move into the active pipeline">→ Pipeline</button>
          <button class="btn sm" data-act="edit" data-entity="opportunities" data-id="${esc(o.id)}">Edit</button>
          <button class="btn sm danger" data-act="del" data-entity="opportunities" data-id="${esc(o.id)}">×</button>
        </td>
      </tr>`;
    });

  return `
    <div class="grid grid-4">
      ${stat('Leads', String(leads.length), 'earlier / unqualified', 'blue')}
      ${stat('Indicative value', moneyKCompact(value), 'across all leads', 'accent')}
      ${stat('Owners', String(owners.length), 'covering these leads')}
      ${stat('Sectors', String(bySector.length), 'with at least one lead')}
    </div>

    <div class="card">
      <div class="card-head"><h2>Leads by sector</h2>
        <div class="hint">Count of leads per sector.</div></div>
      <div id="chart-leads-sector"></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>All leads</h2>
        <div class="row-gap">
          <div class="hint">Promote a lead to move it into the active pipeline. It keeps its stage, value and owner.</div>
          ${addButton('opportunities', 'Lead')}
        </div>
      </div>
      ${table(
        ['Lead', 'Account', 'Sector', 'Owner', 'Stage', { label: 'Value', right: true }, { label: 'Actions', actions: true }],
        rows,
        'No leads — everything is in the active pipeline.'
      )}
    </div>`;
}

function drawLeadsChart() {
  const node = document.getElementById('chart-leads-sector');
  if (!node) return;
  const leads = leadOpps();
  hbars(node, {
    rows: SECTORS.map((sector) => ({
      name: sector,
      value: leads.filter((o) => {
        const a = byId(state.accounts, o.account_id);
        return a && a.sector === sector;
      }).length,
    })),
    format: (v) => String(Math.round(v)),
    emptyText: 'No leads yet.',
  });
}

/* ── Router ──────────────────────────────────────────────────────────────── */

const VIEWS = {
  strategy:   { render: renderStrategy,   draw: null },
  pipeline:   { render: renderPipeline,   draw: drawPipelineCharts },
  leads:      { render: renderLeads,      draw: drawLeadsChart },
  people:     { render: renderPeople,     draw: drawPeopleCharts },
  assets:     { render: renderAssets,     draw: drawAssetCharts },
  financials: { render: renderFinancials, draw: drawFinancialCharts },
  tensions:   { render: () => renderBoard(BOARDS.tensions), draw: () => drawBoard(BOARDS.tensions) },
  projects:   { render: () => renderBoard(BOARDS.projects), draw: () => drawBoard(BOARDS.projects) },
};

function renderView(name = ui.view) {
  if (!VIEWS[name]) name = 'strategy';
  ui.view = name;
  // Deep-linkable: /#pipeline opens straight onto that section.
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);

  const meta = VIEW_META[name];
  document.getElementById('page-title').textContent = meta.title;
  document.getElementById('page-sub').textContent = meta.sub;
  document.getElementById('crumb').textContent = meta.title;
  document.title = `${meta.title} · T&OT Command Center`;

  renderNav();
  closeNav();

  document.querySelectorAll('section.view').forEach((section) => {
    section.hidden = section.id !== `view-${name}`;
  });

  const view = VIEWS[name];
  const container = document.getElementById(`view-${name}`);
  container.innerHTML = view.render();
  if (view.draw) view.draw();
}

/* ── Data loading ────────────────────────────────────────────────────────── */

async function reload(entityKey) {
  if (entityKey) {
    state[entityKey] = await api(`/${entityKey}`);
  } else {
    Object.assign(state, await api('/bootstrap'));
  }
  stampLoaded();
  renderView();
}

function stampLoaded() {
  ui.lastLoaded = new Date();
  const node = document.getElementById('nav-footer');
  if (node) {
    node.textContent = `Last loaded ${ui.lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function openNav()  { ui.navOpen = true;  document.getElementById('app').classList.add('nav-open'); }
function closeNav() { ui.navOpen = false; document.getElementById('app').classList.remove('nav-open'); }

async function boot() {
  document.getElementById('gate').hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('loading').hidden = false;
  document.getElementById('views').hidden = true;

  try {
    Object.assign(state, await api('/bootstrap'));
    stampLoaded();
    document.getElementById('loading').hidden = true;
    document.getElementById('views').hidden = false;
    renderView(location.hash.slice(1) || ui.view);
  } catch (err) {
    document.getElementById('loading').textContent = err.message.toUpperCase();
    toast(err.message, true);
  }
}

function logout() {
  token = null;
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById('app').hidden = true;
  document.getElementById('gate').hidden = false;
  document.getElementById('gate-input').value = '';
}

/* ── Events ──────────────────────────────────────────────────────────────── */

document.getElementById('gate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('gate-input');
  const error = document.getElementById('gate-error');
  const submit = document.getElementById('gate-submit');

  error.textContent = '';
  submit.disabled = true;
  try {
    const { token: issued } = await api('/auth/login', { method: 'POST', body: { passcode: input.value } });
    token = issued;
    localStorage.setItem(TOKEN_KEY, token);
    await boot();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('nav-sections').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-view]');
  if (btn) renderView(btn.dataset.view);
});
document.getElementById('nav-toggle').addEventListener('click', () => (ui.navOpen ? closeNav() : openNav()));
document.getElementById('nav-scrim').addEventListener('click', closeNav);

document.getElementById('btn-theme').addEventListener('click', () => {
  applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
});

// Follow the OS only while the user has not made an explicit choice.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
  if (!localStorage.getItem(THEME_KEY)) applyTheme(event.matches ? 'light' : 'dark', { persist: false });
});

document.getElementById('btn-logout').addEventListener('click', logout);
document.getElementById('btn-print').addEventListener('click', () => window.print());
document.getElementById('btn-refresh').addEventListener('click', async () => {
  try { await reload(); toast('Refreshed'); } catch (err) { toast(err.message, true); }
});

// One delegated handler covers every add / edit / delete / filter control.
document.getElementById('views').addEventListener('click', (event) => {
  // A click on a kanban card body (not a button) opens its editor.
  const card = event.target.closest('.kanban-card');
  if (card && !event.target.closest('button')) {
    openEditor(card.dataset.resource, byId(state[card.dataset.resource], card.dataset.id));
    return;
  }

  const btn = event.target.closest('button[data-act]');
  if (!btn) return;
  const { act, entity, id, scenario, sector, stage, view, tab } = btn.dataset;

  if (act === 'add') {
    const defaults = stage ? { stage } : null;
    // The + button on the Leads view creates a Lead, not a pipeline opportunity.
    openEditor(entity, null, ui.view === 'leads' && entity === 'opportunities' ? { ...(defaults || {}), record_type: 'Lead' } : defaults);
  }
  else if (act === 'edit') openEditor(entity, byId(state[entity], id));
  else if (act === 'del') deleteRecord(entity, id);
  else if (act === 'topipeline') setRecordType(id, 'Pipeline');
  else if (act === 'tolead') setRecordType(id, 'Lead');
  else if (act === 'scenario') { ui.scenario = scenario; renderView('financials'); }
  else if (act === 'sector') { ui.pipelineSector = sector; renderView('pipeline'); }
  else if (act === 'boardtab') { ui.boardTab[view] = tab; renderView(view); }
});

// ── Drag and drop between kanban columns ──
(() => {
  const views = document.getElementById('views');
  let drag = null;
  const clearDrop = () => document.querySelectorAll('.kanban-col.drop').forEach((c) => c.classList.remove('drop'));

  views.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    drag = { id: card.dataset.id, resource: card.dataset.resource };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    // Firefox needs data set for the drag to start.
    try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (_) {}
  });
  views.addEventListener('dragend', (e) => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.remove('dragging');
    clearDrop();
    drag = null;
  });
  views.addEventListener('dragover', (e) => {
    const col = e.target.closest('.kanban-col');
    if (!drag || !col || col.dataset.resource !== drag.resource) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!col.classList.contains('drop')) { clearDrop(); col.classList.add('drop'); }
  });
  views.addEventListener('drop', (e) => {
    const col = e.target.closest('.kanban-col');
    if (!drag || !col || col.dataset.resource !== drag.resource) return;
    e.preventDefault();
    const { id, resource } = drag;
    const stage = col.dataset.stage;
    drag = null;
    clearDrop();
    moveCard(resource, id, stage);
  });
})();

document.getElementById('modal-form').addEventListener('submit', submitEditor);
document.getElementById('modal-cancel').addEventListener('click', closeEditor);
document.getElementById('modal-backdrop').addEventListener('click', (event) => {
  if (event.target.id === 'modal-backdrop') closeEditor();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.getElementById('modal-backdrop').hidden) closeEditor();
});

// Hash changes (browser back/forward, or a pasted /#pipeline link on an already
// open page) navigate without a reload, so boot() never re-runs — handle them.
window.addEventListener('hashchange', () => {
  const target = location.hash.slice(1);
  if (token && VIEWS[target] && target !== ui.view) renderView(target);
});

// Charts are laid out against the container width, so re-draw on resize.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const view = VIEWS[ui.view];
    if (view && view.draw) view.draw();
  }, 180);
});

/* ── Start ───────────────────────────────────────────────────────────────── */

// Sync the toggle's icon and label with the theme the inline script already
// applied. Not persisted — an OS-derived default must stay a default until the
// user actually chooses.
applyTheme(currentTheme(), { persist: false });

if (token) {
  boot();
} else {
  document.getElementById('gate-input').focus();
}
