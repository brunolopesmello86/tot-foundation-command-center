/* ══════════════════════════════════════════════════════════════════════════
   Charts — hand-rolled SVG, no dependencies.

   Mark conventions applied throughout:
     · 4px rounded data-ends; the baseline end stays square
     · 2px surface gap between stacked segments and adjacent bars
     · recessive grid + axes, tabular-numeral labels in text tokens
     · a hover tooltip on every mark (never a number printed on every segment)
     · a legend whenever there are 2+ series
   ══════════════════════════════════════════════════════════════════════════ */

const SVG_NS = 'http://www.w3.org/2000/svg';

const SEG_GAP = 2;
const END_RADIUS = 4;

/**
 * The categorical slots, read from CSS custom properties at draw time.
 *
 * Each theme defines its own steps — light mode is a selected palette, not an
 * inverted dark one — so reading them live is what lets a theme switch recolour
 * every mark without the chart code knowing which theme is active.
 */
export function seriesColors() {
  const styles = getComputedStyle(document.documentElement);
  const slots = [1, 2, 3, 4]
    .map((n) => styles.getPropertyValue(`--series-${n}`).trim())
    .filter(Boolean);
  // Fall back to the dark steps if the stylesheet has not applied yet.
  return slots.length === 4 ? slots : ['#08A0E0', '#12A36A', '#D26A12', '#9B7FE8'];
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Path for a rect whose top corners are rounded and whose base is square. */
function roundedTopPath(x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

/** "Nice" axis maximum so gridlines land on round numbers. */
function niceMax(value) {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  for (const s of steps) if (value <= s * base) return s * base;
  return 10 * base;
}

function makeTooltip(container) {
  let tip = container.querySelector('.tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.hidden = true;
    container.appendChild(tip);
  }
  return tip;
}

function attachTooltip(container, target, html) {
  const tip = makeTooltip(container);
  const show = (evt) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const box = container.getBoundingClientRect();
    let x = evt.clientX - box.left;
    const y = evt.clientY - box.top - 12;
    // Keep the tooltip inside the card rather than letting it clip at the edge.
    const halfWidth = tip.offsetWidth / 2;
    x = Math.max(halfWidth + 4, Math.min(x, box.width - halfWidth - 4));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };
  target.addEventListener('mouseenter', show);
  target.addEventListener('mousemove', show);
  target.addEventListener('mouseleave', () => { tip.hidden = true; });
}

function renderLegend(container, series) {
  if (series.length < 2) return; // a single series is named by the title
  const legend = document.createElement('div');
  legend.className = 'legend';
  series.forEach((s) => {
    const item = document.createElement('div');
    item.className = 'item';
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = s.color;
    item.append(sw, document.createTextNode(s.name));
    legend.appendChild(item);
  });
  container.appendChild(legend);
}

/**
 * Stacked (or single-series) vertical bar chart.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 *   categories : string[]                        — x axis labels
 *   series     : [{name, color?, values:number[]}]
 *   format     : (n) => string                   — value formatter
 *   totalLabel : boolean                         — print the stack total above each bar
 */
export function stackedBar(container, { categories, series, format = (n) => n, totalLabel = true }) {
  container.innerHTML = '';
  container.classList.add('chart');

  const W = 720, H = 300;
  const pad = { top: 24, right: 12, bottom: 34, left: 52 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const palette = seriesColors();
  const coloured = series.map((s, i) => ({ ...s, color: s.color || palette[i % palette.length] }));
  const totals = categories.map((_, ci) => coloured.reduce((sum, s) => sum + (Number(s.values[ci]) || 0), 0));
  const max = niceMax(Math.max(...totals, 0));
  const yOf = (v) => pad.top + plotH - (v / max) * plotH;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });

  // ── Gridlines + y axis ──
  const TICKS = 4;
  for (let t = 0; t <= TICKS; t++) {
    const v = (max / TICKS) * t;
    const y = yOf(v);
    svg.appendChild(el('line', { class: 'grid-line', x1: pad.left, x2: W - pad.right, y1: y, y2: y }));
    const label = el('text', { class: 'axis-text', x: pad.left - 8, y: y + 3, 'text-anchor': 'end' });
    label.textContent = format(v);
    svg.appendChild(label);
  }

  // ── Bars ──
  const slot = plotW / categories.length;
  const barW = Math.min(64, slot * 0.62);

  categories.forEach((cat, ci) => {
    const x = pad.left + slot * ci + (slot - barW) / 2;
    let cursor = pad.top + plotH; // stack upward from the baseline

    // Find the topmost non-zero segment so only it gets the rounded data-end.
    let topIndex = -1;
    coloured.forEach((s, si) => { if ((Number(s.values[ci]) || 0) > 0) topIndex = si; });

    coloured.forEach((s, si) => {
      const value = Number(s.values[ci]) || 0;
      if (value <= 0) return;

      const rawH = (value / max) * plotH;
      const h = Math.max(1, rawH - SEG_GAP);
      const y = cursor - rawH;

      const isTop = si === topIndex;
      const node = isTop
        ? el('path', { class: 'bar-seg', d: roundedTopPath(x, y, barW, h, END_RADIUS), fill: s.color })
        : el('rect', { class: 'bar-seg', x, y, width: barW, height: h, fill: s.color });

      svg.appendChild(node);
      attachTooltip(
        container,
        node,
        `<div class="t-name">${cat} · ${s.name}</div><div class="t-val">${format(value)}</div>`
      );

      cursor -= rawH;
    });

    // Total above the stack — a selective direct label, not one per segment.
    if (totalLabel && totals[ci] > 0) {
      const label = el('text', {
        class: 'value-label',
        x: x + barW / 2,
        y: yOf(totals[ci]) - 8,
        'text-anchor': 'middle',
      });
      label.textContent = format(totals[ci]);
      svg.appendChild(label);
    }

    const xLabel = el('text', {
      class: 'axis-text',
      x: x + barW / 2,
      y: H - pad.bottom + 18,
      'text-anchor': 'middle',
    });
    xLabel.textContent = cat;
    svg.appendChild(xLabel);
  });

  // Baseline
  svg.appendChild(el('line', {
    class: 'grid-line',
    x1: pad.left, x2: W - pad.right,
    y1: pad.top + plotH, y2: pad.top + plotH,
  }));

  container.appendChild(svg);
  renderLegend(container, coloured);
}

/**
 * Horizontal distribution bars — the right form for "share of total by category"
 * where the category names are long (sectors, margin tiers, stages, people).
 *
 * These are single-measure magnitude comparisons, so every bar wears ONE hue by
 * default: the category name already carries identity, and cycling a
 * categorical palette across an open-ended list would hand two different
 * entities the same colour while encoding nothing.
 *
 * @param rows      [{name, value, color?}]
 * @param scaleMax  fix the axis maximum (e.g. 100 for percentages) instead of
 *                  scaling to the largest bar, which exaggerates small gaps.
 */
export function hbars(container, { rows, format = (n) => n, emptyText = 'No data yet', scaleMax = null }) {
  container.innerHTML = '';
  if (!rows.length || rows.every((r) => !r.value)) {
    container.innerHTML = `<p class="muted" style="padding:20px 0;font-size:12px">${emptyText}</p>`;
    return;
  }
  const max = scaleMax || Math.max(...rows.map((r) => Number(r.value) || 0), 1);

  rows.forEach((r, i) => {
    const value = Number(r.value) || 0;
    const row = document.createElement('div');
    row.className = 'hbar-row';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = r.name;

    const track = document.createElement('div');
    track.className = 'track';
    const fill = document.createElement('i');
    fill.style.width = `${Math.min(100, (value / max) * 100)}%`;
    fill.style.background = r.color || seriesColors()[0];
    track.appendChild(fill);

    const val = document.createElement('div');
    val.className = 'val';
    val.textContent = format(value);

    row.append(name, track, val);
    container.appendChild(row);
  });
}
