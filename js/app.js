/* ============================================================
   APP CORE — state, router, phase-gated nav, shared components.
   Data access lives in data.js. Config lives in config.js.
   ============================================================ */
import { CURRENT_PHASE, PHASES, STALL_DAYS, SEGMENTS } from './config.js';
import { data, isLocalMode } from './data.js';

export { CURRENT_PHASE, PHASES };

/* ------------------------------------------------------------
   STATE — in-memory cache, loaded once, refreshed on demand.
   ------------------------------------------------------------ */
export const STATE = {
  outreach: [], interviews: [], matrix: [], deliverables: [],
  scripts: [], kill_list: [], field_checks: [], economics: [],
  segment_cards: [], decision_memos: [], reports: [], documents: [],
  hypotheses: [], evidence_links: [], ai_assessments: [],
  chatHistory: [],
  loaded: false,
};

const TABLES = ['outreach', 'interviews', 'matrix', 'deliverables', 'scripts',
  'kill_list', 'field_checks', 'economics', 'segment_cards', 'decision_memos', 'reports',
  'documents', 'hypotheses', 'evidence_links', 'ai_assessments'];

export async function loadAllData() {
  setSync('Loading…');
  try {
    const results = await Promise.all(TABLES.map(t => data.list(t).catch(() => [])));
    TABLES.forEach((t, i) => { STATE[t] = results[i]; });
    STATE.loaded = true;
    setSync('Synced');
    renderCurrentRoute();
  } catch (e) {
    setSync(isLocalMode ? 'Storage error' : 'Offline · using cache', 'rose');
    console.error(e);
  }
}

export function setSync(text, tone = 'line') {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = `chip chip-${tone === 'rose' ? 'rose' : tone === 'sage' ? 'sage' : 'line'}`;
  el.textContent = text;
  if (text === 'Synced') {
    setTimeout(() => {
      el.className = 'chip chip-sage';
      const n = STATE.outreach.length + STATE.interviews.length + STATE.matrix.length;
      el.textContent = isLocalMode ? `✓ ${n} records · demo` : `✓ ${n} records`;
    }, 500);
  }
}

/* ------------------------------------------------------------
   DATE HELPERS
   ------------------------------------------------------------ */
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr + 'T00:00:00');
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* The single most important data-quality signal in the app. */
export function isUntaggedOverdue(interview) {
  return interview.tagged_same_day !== 'Y' && (daysSince(interview.date) ?? 0) >= 1;
}

export function isStalled(contact) {
  return ['Sent', 'Replied'].includes(contact.status) &&
    (daysSince(contact.first_contact) ?? 0) >= STALL_DAYS;
}

/* ------------------------------------------------------------
   SHARED ANALYSIS HELPERS — one formula, one rollup, used by
   sensemaking, matrix, and reports so their numbers never disagree.
   ------------------------------------------------------------ */

/** Rank theme tags by evidence weight: count × avg severity × (1 + WTP-Y share). */
export function rankThemes(rows = STATE.matrix) {
  const data = {};
  rows.forEach(r => {
    const tag = r.theme_tag;
    if (!tag) return;
    if (!data[tag]) data[tag] = { tag, count: 0, totalSev: 0, wtpY: 0, quotes: [] };
    const d = data[tag];
    d.count++;
    d.totalSev += +r.severity || 0;
    if (r.wtp === 'Y') d.wtpY++;
    d.quotes.push(r);
  });
  return Object.values(data).map(d => ({
    tag: d.tag,
    count: d.count,
    avgSev: d.count ? d.totalSev / d.count : 0,
    wtpRate: d.count ? Math.round((d.wtpY / d.count) * 100) : 0,
    score: d.count * (d.totalSev / (d.count || 1)) * (1 + d.wtpY / (d.count || 1)),
    quotes: d.quotes,
  })).sort((a, b) => b.score - a.score);
}

/** Interviews logged per segment vs. recruitment target, in config order. */
export function segmentCoverageRows() {
  return SEGMENTS.map(s => ({ label: s.name, value: STATE.interviews.filter(r => r.segment === s.name).length, target: s.target }));
}

/* ------------------------------------------------------------
   ROUTER — routes carry a group and the one question they answer.
   ------------------------------------------------------------ */
const ROUTES = {};

export function registerRoute(name, title, renderFn, question = '') {
  ROUTES[name] = { title, question, render: renderFn };
}

export function go(route) {
  if (!ROUTES[route]) route = 'overview';
  location.hash = route;
}

/* The screen's single primary action lives top-right in the app header.
   Screens set it via setPageActions(); it clears on every route render. */
export function setPageActions(...nodes) {
  const slot = document.getElementById('page-actions');
  if (!slot) return;
  slot.innerHTML = '';
  nodes.filter(Boolean).forEach(n => slot.appendChild(n));
}

export function renderCurrentRoute() {
  let route = (location.hash || '#overview').slice(1);
  if (route === 'dashboard') route = 'overview'; // legacy hash
  const r = ROUTES[route] || ROUTES.overview;
  if (!r) return;
  document.getElementById('page-title').textContent = r.title;
  const q = document.getElementById('page-question');
  if (q) q.textContent = r.question || '';
  setPageActions(); // screens re-add their primary action during render
  document.querySelectorAll('[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  const page = document.getElementById('page');
  page.innerHTML = '';
  page.classList.add('fade-in');
  r.render(page);
  setTimeout(() => page.classList.remove('fade-in'), 300);
}

/* ------------------------------------------------------------
   NAV — one axis: the research pipeline. Phase-gated.
   ------------------------------------------------------------ */
const NAV = [
  { type: 'route', route: 'overview', label: 'Overview' },
  // Available from Phase 0 onward by design: early on, the honest brief
  // says INSUFFICIENT — showing that is the point.
  { type: 'route', route: 'decision-brief', label: 'Decision Brief' },
  {
    type: 'group', id: 'fieldwork', label: 'Fieldwork', phaseLabel: 'phase 1–2',
    unlockAt: 1, activeThrough: 2,
    routes: [['outreach', 'Outreach'], ['interviews', 'Interviews'], ['matrix', 'Theme matrix'], ['saturation', 'Saturation']],
  },
  {
    type: 'group', id: 'sensemaking', label: 'Sense-making', phaseLabel: 'phase 3',
    unlockAt: 3, activeThrough: 3,
    routes: [['theme-analysis', 'Theme analysis'], ['segment-cards', 'Segment cards'], ['top-pains', 'Top-3 pains'], ['kill-list', 'Kill list'], ['state-of-field', 'State of the field']],
  },
  {
    type: 'group', id: 'economics', label: 'Economics', phaseLabel: 'phase 4',
    unlockAt: 4, activeThrough: 4,
    routes: [['economics', 'Unit economics'], ['alt-models', 'Alternate models'], ['field-checks', 'Field checks']],
  },
  {
    type: 'group', id: 'decision', label: 'Decision', phaseLabel: 'phase 5',
    unlockAt: 5, activeThrough: 5,
    routes: [['decision-memo', 'Decision memo'], ['mvp-scope', 'MVP scope'], ['confirmatory-tests', 'Confirmatory tests']],
  },
  { type: 'divider' },
  {
    type: 'group', id: 'reference', label: 'Reference', phaseLabel: '',
    unlockAt: 0, activeThrough: 99, startCollapsed: true,
    routes: [['scripts', 'Scripts'], ['templates', 'Templates'], ['manual', 'Operating manual']],
  },
  { type: 'route', route: 'documents', label: 'Documents' },
  { type: 'route', route: 'reports', label: 'Reports' },
];

export function buildNav() {
  const nav = document.getElementById('nav-root');
  nav.innerHTML = '';

  NAV.forEach(item => {
    if (item.type === 'divider') {
      nav.appendChild(h('div', { class: 'nav-divider' }));
      return;
    }
    if (item.type === 'route') {
      nav.appendChild(h('a', { class: 'nav-item', 'data-route': item.route, href: `#${item.route}` }, [
        h('span', { class: 'dot' }), item.label,
      ]));
      return;
    }

    const locked = CURRENT_PHASE < item.unlockAt;
    const isCurrent = CURRENT_PHASE >= item.unlockAt && CURRENT_PHASE <= item.activeThrough;
    let collapsed = item.startCollapsed || !isCurrent;

    const group = h('div', { class: `nav-group${locked ? ' locked' : ''}` });
    const chevron = h('span', { class: 'nav-chevron', text: '›' });
    /* Label left; phase badge + chevron (or lock) as a right-aligned column */
    const header = h('button', { class: 'nav-group-header', type: 'button' }, [
      h('span', { class: 'micro', text: item.label }),
      h('span', { class: 'nav-group-right' }, [
        locked
          ? h('span', { class: 'nav-lock', title: `Unlocks at phase ${item.unlockAt}`, text: `🔒 phase ${item.unlockAt}` })
          : (item.phaseLabel ? h('span', { class: 'nav-phase-badge', text: item.phaseLabel }) : null),
        locked ? null : chevron,
      ].filter(Boolean)),
    ]);
    const list = h('div', { class: 'nav-group-list' });
    item.routes.forEach(([route, label]) => {
      list.appendChild(h('a', { class: 'nav-item', 'data-route': route, href: `#${route}` }, [
        h('span', { class: 'dot' }), label,
      ]));
    });

    function applyCollapsed() {
      list.style.display = collapsed ? 'none' : '';
      chevron.style.transform = collapsed ? '' : 'rotate(90deg)';
    }
    header.addEventListener('click', () => { collapsed = !collapsed; applyCollapsed(); });
    applyCollapsed();

    group.appendChild(header);
    group.appendChild(list);
    nav.appendChild(group);
  });

  // route clicks (delegated per element so .active toggling keeps working)
  nav.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => {
      go(el.dataset.route);
      closeSidebar();
    });
  });
}

/* Mobile drawer behaviours: body scroll locks while open, Escape closes,
   focus moves into the drawer and returns to the opener on close. On
   desktop the sidebar is persistent and none of this applies (closeSidebar
   is a no-op when the drawer was never opened). */
let drawerReturnFocus = null;

export function openSidebar() {
  const sb = document.getElementById('sidebar');
  sb.classList.add('open');
  document.getElementById('mobile-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  drawerReturnFocus = document.activeElement;
  const first = sb.querySelector('a, button');
  if (first) first.focus();
}

export function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb.classList.contains('open')) return;
  sb.classList.remove('open');
  document.getElementById('mobile-overlay').classList.remove('open');
  document.body.style.overflow = '';
  if (drawerReturnFocus && typeof drawerReturnFocus.focus === 'function') drawerReturnFocus.focus();
  drawerReturnFocus = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSidebar();
});

/* ------------------------------------------------------------
   DOM HELPERS — h() builds elements; all text goes through
   textContent, never innerHTML, so user data cannot inject HTML.
   ------------------------------------------------------------ */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  });
  return el;
}

/* ------------------------------------------------------------
   SHARED COMPONENTS — the six building blocks every screen uses.
   Semantic colour: sage = done/on-track · honey = attention ·
   rose = blocked/breach · info = current/informational · plum = themes.
   ------------------------------------------------------------ */

/* 1 · Metric card */
export function kpiCard(label, value, sub, tone) {
  const toneColor = { rose: 'var(--rose)', honey: 'var(--honey-deep)', sage: 'var(--sage-deep)', info: 'var(--info)' }[tone];
  const num = h('div', { class: 'kpi-num', text: String(value) });
  if (toneColor) num.style.color = toneColor;
  const card = h('div', { class: 'card kpi' }, [num, h('div', { class: 'kpi-label', text: label })]);
  if (sub) card.appendChild(h('div', { class: 'text-xs mt-2 t-mute', text: sub }));
  return card;
}

/* 2 · Pill chip with semantic tone */
export function chip(text, tone = 'line') {
  return h('span', { class: `chip chip-${tone}`, text });
}

export function statusTone(status) {
  return {
    Cold: 'line', Sent: 'info', Replied: 'honey', Booked: 'sage', Done: 'sage', Declined: 'rose',
    'Not started': 'line', 'In progress': 'honey', Complete: 'sage', Blocked: 'rose',
  }[status] || 'line';
}

/* 3 · Progress bar */
export function progressBar(pct, color) {
  const fill = h('i');
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (color) fill.style.background = color;
  return h('div', { class: 'bar-wrap' }, [fill]);
}

/* 4 · Serif quote block — quotes must look different from UI chrome */
export function quoteBlock(entry, { showEdit } = {}) {
  const sevTone = entry.severity >= 4 ? 'rose' : entry.severity >= 3 ? 'honey' : 'line';
  const chips = h('div', { class: 'flex flex-wrap gap-1.5' }, [
    entry.theme_tag ? chip(entry.theme_tag, 'plum') : null,
    entry.segment ? chip(entry.segment, 'line') : null,
    entry.severity ? chip(`Sev ${entry.severity}`, sevTone) : null,
    entry.wtp ? chip(`WTP ${entry.wtp}`, entry.wtp === 'Y' ? 'sage' : 'line') : null,
    entry.interview_id ? chip(entry.interview_id, 'info') : null,
  ].filter(Boolean));

  const head = h('div', { class: 'flex items-start justify-between gap-3 mb-2' }, [chips]);
  if (showEdit) head.appendChild(showEdit);

  const block = h('div', { class: 'quote-block' }, [
    head,
    h('div', { class: 'quote-text', text: entry.quote ? `“${entry.quote}”` : '(no quote)' }),
  ]);
  if (entry.notes) block.appendChild(h('div', { class: 'text-xs mt-2 t-mute', text: entry.notes }));
  return block;
}

/* 5 · Empty state — title + one-line body + optional single action.
   Never a bare sentence in a blank panel. */
export function emptyState(title, sub, action) {
  return h('div', { class: 'empty-state' }, [
    h('div', { class: 'empty-title', text: title }),
    sub ? h('div', { class: 'empty-sub', text: sub }) : null,
    action ? h('button', { class: 'btn btn-line', onclick: action.onclick }, action.label) : null,
  ].filter(Boolean));
}

/* 6 · Attention banners are plain divs with .banner .banner-{rose|honey|info} —
   see theme.css. Red = data-quality breach, honey = attention, info = calm note. */

/* ------------------------------------------------------------
   MODAL + FORM HELPERS
   ------------------------------------------------------------ */
export function openModal(title, fields, onSubmit, submitLabel = 'Save') {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const form = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const out = {};
    fields.forEach(f => {
      const el = form.querySelector(`[name="${f.key}"]`);
      if (el) out[f.key] = el.value;
    });
    onSubmit(out);
  } });
  form.appendChild(h('div', { class: 'serif text-xl mb-5', text: title }));
  fields.forEach(f => form.appendChild(f.el));
  form.appendChild(h('div', { class: 'flex gap-3 mt-5 justify-end pt-4 border-t b-soft' }, [
    h('button', { type: 'button', class: 'btn btn-line', onclick: closeModal }, 'Cancel'),
    h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel),
  ]));

  root.appendChild(h('div', {
    class: 'modal-bg fade-in',
    onclick: (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); },
  }, [h('div', { class: 'modal p-6' }, [form])]));
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function formField(label, key, type, value, options, inputType) {
  const wrap = h('div', { class: 'mb-3' });
  wrap.appendChild(h('label', { class: 'label', text: label }));
  let input;
  if (type === 'select') {
    input = h('select', { class: 'select', name: key });
    (options || []).forEach(o => {
      const opt = h('option', { value: o }, o);
      if (o === value) opt.selected = true;
      input.appendChild(opt);
    });
  } else if (type === 'textarea') {
    input = h('textarea', { class: 'textarea', name: key, rows: '3' });
    if (value) input.value = value;
  } else {
    input = h('input', { class: 'input', name: key, type: inputType || 'text', value: value ?? '' });
  }
  wrap.appendChild(input);
  return { key, el: wrap };
}
