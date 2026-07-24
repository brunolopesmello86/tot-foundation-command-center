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
const SECTORS      = ['Banking', 'Industry', 'Utilities', 'Other'];
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

const DRIVERS = [
  ['AI Co-pilot', 'Embed AI copilots into every offering so delivery is faster, smarter and visibly differentiated.'],
  ['Assets / IPs', 'Productize our know-how into reusable assets that scale revenue without scaling headcount.'],
  ['Digital Strategy as Spearhead', 'Lead with digital strategy to open new technology business across the wider NTT portfolio.'],
];

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
  pillars: [], metrics: [], initiatives: [], accounts: [], opportunities: [],
  projections: [], people: [], certifications: [], assets: [], cohorts: [],
};

const ui = {
  view: 'strategy',
  scenario: 'Base',
  pipelineSector: 'All',
};

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

function openEditor(entityKey, record = null) {
  const entity = ENTITIES[entityKey];
  editorContext = { entityKey, id: record ? record.id : null };

  document.getElementById('modal-title').textContent =
    `${record ? 'Edit' : 'New'} ${entity.label.toLowerCase()}`;

  const container = document.getElementById('modal-fields');
  container.innerHTML = entity.fields.map((f) => {
    const value = record ? record[f.key] : '';
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
      <div class="pillar-top"><span class="code">${esc(p.code)}</span><span class="name">${esc(p.name)}</span></div>
      <p>${esc(p.description)}</p>
      <div class="tally">${list.length} initiative${list.length === 1 ? '' : 's'} · ${done} done${atRisk ? ` · <span style="color:var(--critical)">${atRisk} at risk</span>` : ''}</div>
    </div>`;
  }).join('');

  const driverCards = DRIVERS.map(([name, desc]) =>
    `<div class="driver"><div class="name">${esc(name)}</div><p>${esc(desc)}</p></div>`).join('');

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
      <div class="eyebrow" style="margin-bottom:10px">${esc(cat)}</div>
      <div class="grid grid-4">${tiles}</div>
    </div>`;
  }).join('');

  const initRows = state.initiatives.map((i) => {
    const pillar = state.pillars.find((p) => num(p.code) === num(i.pillar_code));
    return `<tr>
      <td>${esc(i.title)}${i.description ? `<div class="muted" style="font-size:11px;margin-top:3px">${esc(i.description)}</div>` : ''}</td>
      <td>${pillar ? `<span class="chip plain">${esc(pillar.code)} · ${esc(pillar.name)}</span>` : '<span class="muted">—</span>'}</td>
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
        <div class="hint">The three engines of growth — every pillar is powered by at least one.</div>
      </div>
      <div class="grid grid-3">${driverCards}</div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Four Strategic Pillars</h2>
        <div class="hint">Where the work happens. Initiative counts roll up live from the table below.</div>
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

function pipelineRows() {
  if (ui.pipelineSector === 'All') return state.opportunities;
  return state.opportunities.filter((o) => {
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
    const accountOpps = state.opportunities.filter((o) => String(o.account_id) === String(a.id));
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
      <td class="num">${o.close_date ? fmtDate(o.close_date) : '<span class="muted">—</span>'}</td>
      ${rowActions('opportunities', o.id)}
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
         { label: 'Weighted', right: true }, 'Close', { label: 'Actions', actions: true }],
        oppRows,
        state.accounts.length ? 'No opportunities in this filter.' : 'Add an account first, then log opportunities against it.'
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
  const won = sum(state.opportunities.filter((o) => o.stage === 'Won'), (o) => o.value_k);
  const weighted = sum(
    state.opportunities.filter((o) => OPEN_STAGES.includes(o.stage)),
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

/* ── Router ──────────────────────────────────────────────────────────────── */

const VIEWS = {
  strategy:   { render: renderStrategy,   draw: null },
  pipeline:   { render: renderPipeline,   draw: drawPipelineCharts },
  people:     { render: renderPeople,     draw: drawPeopleCharts },
  assets:     { render: renderAssets,     draw: drawAssetCharts },
  financials: { render: renderFinancials, draw: drawFinancialCharts },
};

function renderView(name = ui.view) {
  if (!VIEWS[name]) name = 'strategy';
  ui.view = name;
  // Deep-linkable: /#pipeline opens straight onto that tab.
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);

  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.view === name));
  });
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
  renderView();
}

async function boot() {
  document.getElementById('gate').hidden = true;
  document.getElementById('shell').hidden = false;
  document.getElementById('loading').hidden = false;
  document.getElementById('views').hidden = true;

  try {
    Object.assign(state, await api('/bootstrap'));
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
  document.getElementById('shell').hidden = true;
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

document.getElementById('tabs').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-view]');
  if (btn) renderView(btn.dataset.view);
});

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
  const btn = event.target.closest('button[data-act]');
  if (!btn) return;
  const { act, entity, id, scenario, sector } = btn.dataset;

  if (act === 'add') openEditor(entity);
  else if (act === 'edit') openEditor(entity, byId(state[entity], id));
  else if (act === 'del') deleteRecord(entity, id);
  else if (act === 'scenario') { ui.scenario = scenario; renderView('financials'); }
  else if (act === 'sector') { ui.pipelineSector = sector; renderView('pipeline'); }
});

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
