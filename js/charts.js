/* ============================================================
   CHARTS — dependency-free inline SVG. No charting library (the
   app allows no external libraries), so every chart here is built
   with document.createElementNS and plain SVG primitives.

   Colours are resolved hex, not CSS var() — the print report opens
   in a brand-new document with no access to the app's :root
   variables, so the same markup must carry its own colour values
   to render identically on-screen and on paper. Keep this palette
   in sync with css/theme.css by hand if the palette ever changes.

   All text is set via .textContent (never innerHTML), so labels
   built from user data cannot inject markup.
   ============================================================ */

export const PALETTE = {
  sage: '#5C7A6B', sageDeep: '#3F5A4D', sageSoft: '#E6EDE7',
  clay: '#B8693E',
  rose: '#C95F5F', roseSoft: '#F6E3E3',
  honey: '#D4A24C', honeyDeep: '#755A1E', honeySoft: '#F5E9CF',
  info: '#5B7B9A', infoSoft: '#E4EBF1',
  plum: '#7B5E7E', plumSoft: '#EEE6EF',
  ink: '#1F2A28', inkMute: '#6E6A5E', line: '#E5DDD0', lineSoft: '#EFE9DD',
  paper: '#FFFFFF',
};

const FONT = 'Inter, system-ui, sans-serif';

function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  (Array.isArray(children) ? children : [children]).forEach(c => { if (c) el.appendChild(c); });
  return el;
}

function svgText(x, y, str, attrs = {}) {
  const t = svgEl('text', { x, y, 'font-family': FONT, ...attrs });
  t.textContent = str;
  return t;
}

/** Serialize an SVG element to a standalone markup string (for the print window). */
export function serializeSvg(svg) {
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Horizontal bar chart. rows: [{ label, value, target?, color? }]
 * `target` (optional) draws a dashed reference line, e.g. a segment's
 * interview quota.
 */
export function barChart(rows, { width = 480, barHeight = 22, gap = 10, max } = {}) {
  const maxVal = Math.max(1, max || Math.max(...rows.map(r => Math.max(r.value, r.target || 0))));
  const labelW = 130;
  const valueW = 56;
  const chartW = width - labelW - valueW;
  const height = rows.length * (barHeight + gap) + gap;
  const svg = svgEl('svg', { width: '100%', viewBox: `0 0 ${width} ${height}`, height });

  rows.forEach((r, i) => {
    const y = gap + i * (barHeight + gap);
    svg.appendChild(svgText(labelW - 10, y + barHeight / 2 + 4, r.label, { 'text-anchor': 'end', 'font-size': 12, fill: PALETTE.ink }));
    svg.appendChild(svgEl('rect', { x: labelW, y, width: chartW, height: barHeight, rx: 5, fill: PALETTE.lineSoft }));
    const w = Math.max(2, (r.value / maxVal) * chartW);
    svg.appendChild(svgEl('rect', { x: labelW, y, width: w, height: barHeight, rx: 5, fill: r.color || PALETTE.sage }));
    if (r.target) {
      const tx = labelW + Math.min(1, r.target / maxVal) * chartW;
      svg.appendChild(svgEl('line', { x1: tx, x2: tx, y1: y - 2, y2: y + barHeight + 2, stroke: PALETTE.clay, 'stroke-width': 2, 'stroke-dasharray': '3,2' }));
    }
    svg.appendChild(svgText(labelW + chartW + 8, y + barHeight / 2 + 4, r.target ? `${r.value}/${r.target}` : String(r.value), { 'font-size': 11, fill: PALETTE.inkMute }));
  });
  return svg;
}

/** A single labelled percentage meter — a linear gauge. */
export function percentMeter(pct, { width = 320, height = 28, label, color } = {}) {
  const c = color || (pct >= 90 ? PALETTE.sage : pct >= 60 ? PALETTE.honey : PALETTE.rose);
  const topPad = label ? 18 : 0;
  const svg = svgEl('svg', { width: '100%', viewBox: `0 0 ${width} ${height + topPad}`, height: height + topPad });
  if (label) svg.appendChild(svgText(0, 12, label, { 'font-size': 11, fill: PALETTE.inkMute }));
  const barH = height - 8;
  svg.appendChild(svgEl('rect', { x: 0, y: topPad + 4, width, height: barH, rx: barH / 2, fill: PALETTE.lineSoft }));
  const w = Math.max(barH, (Math.max(0, Math.min(100, pct)) / 100) * width);
  svg.appendChild(svgEl('rect', { x: 0, y: topPad + 4, width: w, height: barH, rx: barH / 2, fill: c }));
  svg.appendChild(svgText(w / 2, topPad + 4 + barH / 2 + 4, `${Math.round(pct)}%`, { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: PALETTE.paper }));
  return svg;
}

/**
 * 2x2 likelihood x impact risk matrix.
 * items: [{ n, likelihood: 'Low'|'High', impact: 'Low'|'High' }]
 * Points are numbered; render the label legend separately as HTML/DOM —
 * fitting readable text inside a small plotted grid does not work at 375px.
 */
export function riskMatrixSvg(items, { size = 300 } = {}) {
  const padL = 40, padB = 30, padT = 8, padR = 8;
  const plotW = size - padL - padR;
  const plotH = size - padT - padB;
  const cell = plotW / 2, cellH = plotH / 2;
  const svg = svgEl('svg', { width: '100%', viewBox: `0 0 ${size} ${size}`, height: size });

  const toneFor = (li, hi) => (hi === 1 && li === 1) ? PALETTE.roseSoft : (hi === 1 || li === 1) ? PALETTE.honeySoft : PALETTE.sageSoft;
  for (let li = 0; li < 2; li++) {
    for (let hi = 0; hi < 2; hi++) {
      svg.appendChild(svgEl('rect', {
        x: padL + li * cell, y: padT + (1 - hi) * cellH, width: cell, height: cellH,
        fill: toneFor(li, hi), stroke: PALETTE.paper, 'stroke-width': 2,
      }));
    }
  }
  svg.appendChild(svgEl('line', { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: PALETTE.ink }));
  svg.appendChild(svgEl('line', { x1: padL, y1: padT + plotH, x2: padL + plotW, y2: padT + plotH, stroke: PALETTE.ink }));
  svg.appendChild(svgText(padL + plotW / 2, size - 4, 'Likelihood →', { 'text-anchor': 'middle', 'font-size': 9, fill: PALETTE.inkMute }));
  const impactLbl = svgText(10, padT + plotH / 2, 'Impact →', { 'text-anchor': 'middle', 'font-size': 9, fill: PALETTE.inkMute });
  impactLbl.setAttribute('transform', `rotate(-90 10 ${padT + plotH / 2})`);
  svg.appendChild(impactLbl);

  const buckets = {};
  items.forEach(it => {
    const key = `${it.likelihood === 'High' ? 1 : 0}-${it.impact === 'High' ? 1 : 0}`;
    (buckets[key] = buckets[key] || []).push(it);
  });
  Object.entries(buckets).forEach(([key, arr]) => {
    const [li, hi] = key.split('-').map(Number);
    const baseX = padL + li * cell, baseY = padT + (1 - hi) * cellH;
    const cols = Math.max(1, Math.ceil(Math.sqrt(arr.length)));
    arr.forEach((it, idx) => {
      const fx = cols > 1 ? (idx % cols) / (cols - 1) : 0.5;
      const rows2 = Math.ceil(arr.length / cols);
      const fy = rows2 > 1 ? Math.floor(idx / cols) / (rows2 - 1) : 0.5;
      const cx = baseX + cell * (0.22 + 0.56 * fx);
      const cy = baseY + cellH * (0.22 + 0.56 * fy);
      svg.appendChild(svgEl('circle', { cx, cy, r: 11, fill: PALETTE.paper, stroke: PALETTE.ink, 'stroke-width': 1.5 }));
      svg.appendChild(svgText(cx, cy + 4, String(it.n), { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: PALETTE.ink }));
    });
  });
  return svg;
}
