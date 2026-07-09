/* ============================================================================
   MedTerminal — Mobile app (native concept, reskinned to the design handoff).
   Self-contained front end: reads/writes live data through js/data.js and
   configuration through js/config.js. Reproduces the spec's shell, screens,
   forms, and overlays exactly. No framework, no build step.
   ============================================================================ */
import { data, isLocalMode, aiAvailable, chatRequest, assessmentRequest, draftSectionRequest, aiDataSlices, blobToBase64 } from './data.js';
import {
  CURRENT_PHASE, PHASES, SEGMENTS, SEGMENT_NAMES, THEMES, OUTREACH_STATUSES,
  CHANNELS, STALL_DAYS, getTeam, interviewerOptions, ownerOptions, SCHEMA_VERSION,
} from './config.js';

/* ----------------------------------------------------------------- h() */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') { /* never used for user text */ }
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
const frag = (...kids) => kids;

/* ----------------------------------------------------------------- tones */
const TONE = {
  sage:  { bg: '#E6EDE7', border: '#D4DFD5', ink: '#3F5A4D' },
  honey: { bg: '#F5E9CF', border: '#ECDCB6', ink: '#755A1E' },
  rose:  { bg: '#F6E3E3', border: '#ECC9C9', ink: '#9A3F3F' },
  info:  { bg: '#E4EBF1', border: '#CDDAE5', ink: '#3E5C77' },
  plum:  { bg: '#EEE6EF', border: '#DDD0DE', ink: '#644A67' },
  line:  { bg: '#FFFFFF', border: '#E5DDD0', ink: '#4A5651' },
};
const sevTone = (s) => (s >= 4 ? 'rose' : s >= 3 ? 'honey' : 'sage');
const wtpTone = (w) => (w === 'Y' ? 'sage' : w === 'Maybe' ? 'honey' : 'line');
const statusTone = (s) => ({ Done: 'sage', Booked: 'info', Replied: 'sage', Sent: 'honey', Declined: 'rose', Cold: 'line' }[s] || 'line');
const chip = (label, tone = 'line', size = '') => h('span', { class: `chip ${size} ${tone}`.trim(), text: label });

/* ----------------------------------------------------------------- dates */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(then)) return null;
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}
function fmtDay(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return String(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
const isTagged = (r) => r.tagged_same_day === 'Y';
const isOverdue = (r) => !isTagged(r) && (daysSince(r.date) ?? 0) >= 1;
const isStalled = (c) => ['Sent', 'Replied'].includes(c.status) && (daysSince(c.first_contact) ?? 0) >= STALL_DAYS;

/* ----------------------------------------------------------------- analysis */
function rankThemes(rows) {
  const map = {};
  rows.forEach(r => {
    if (!r.theme_tag) return;
    const d = map[r.theme_tag] || (map[r.theme_tag] = { tag: r.theme_tag, count: 0, sev: 0, wtpY: 0, quotes: [] });
    d.count++; d.sev += +r.severity || 0; if (r.wtp === 'Y') d.wtpY++; d.quotes.push(r);
  });
  return Object.values(map).map(d => ({
    tag: d.tag, count: d.count,
    avgSev: d.count ? d.sev / d.count : 0,
    wtpRate: d.count ? Math.round((d.wtpY / d.count) * 100) : 0,
    score: d.count * (d.count ? d.sev / d.count : 0) * (1 + (d.count ? d.wtpY / d.count : 0)),
    quotes: d.quotes,
  })).sort((a, b) => b.score - a.score);
}

/* ----------------------------------------------------------------- state */
const TABLES = ['outreach', 'interviews', 'matrix', 'deliverables', 'scripts', 'kill_list',
  'field_checks', 'economics', 'segment_cards', 'decision_memos', 'reports', 'documents',
  'hypotheses', 'evidence_links', 'ai_assessments'];

const STATE = {};
TABLES.forEach(t => { STATE[t] = []; });

/* Latest append-only AI assessment (the live one), or null. */
function latestAssessment() {
  return [...STATE.ai_assessments].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
}
const LEANING_TONE = { GO: 'sage', PIVOT: 'honey', 'NO-GO': 'rose', INSUFFICIENT: 'honey' };

const UI = {
  tab: 'today',
  subFieldwork: 'outreach', subInsights: 'pains', subDecision: 'brief',
  moreScreen: null, selectedId: null, scriptSeg: 'Patient',
  assistantOpen: false, formType: null, editId: null, form: {}, saving: false,
  reader: null, // { title, build } — a read-only "tap a card to read it" sheet
  busy: null,   // label of an in-flight action (e.g. 'assessment') for button states
  econForm: {}, // working copy for the editable economics assumptions sheet
  messages: [], // seeded from live data the first time the assistant opens
  chatInput: '',
};

const TITLES = {
  today: ['Today', 'Where does the project stand, and what needs me?'],
  interviews: ['Interviews', 'Which conversations have we had — and is each one tagged?'],
  outreach: ['Outreach', 'Who have we approached, and where do they stand?'],
  matrix: ['Theme matrix', 'What is the evidence saying, quote by quote?'],
  saturation: ['Saturation', 'Which segments have we heard enough from?'],
  pains: ['Top-3 pains', 'Which three pains should any product be built around?'],
  themes: ['Theme analysis', 'Which themes are strongest?'],
  segments: ['Segment cards', 'What do we now know about each segment?'],
  kill: ['Kill list', 'Which hypotheses has the evidence killed?'],
  state: ['State of the field', 'Where does the research stand, in one paragraph?'],
  brief: ['Decision Brief', 'If we had to decide today, what would we do?'],
  memo: ['Decision memo', 'GO, PIVOT, or NO-GO — and on what evidence?'],
  economics: ['Unit economics', 'Does patient-pays survive its break-points?'],
  alt: ['Alternate models', 'If patient-pays breaks, what replaces it?'],
  fieldchecks: ['Field checks', 'Which fragile assumptions have we verified?'],
  mvp: ['MVP scope', 'The narrowest thing we build first, if GO'],
  tests: ['Confirmatory tests', 'Does reality agree with the decision?'],
  moreList: ['More', 'Reference, reports, and workspace settings'],
  scripts: ['Interview scripts', 'What exactly do we ask each segment?'],
  templates: ['Outreach templates', 'Which message do I send this contact?'],
  manual: ['Operating manual', 'How do we run this project, day to day?'],
  reports: ['Reports', "What do we send to someone who wasn't in the room?"],
  documents: ['Documents', 'Where is every file the field produced?'],
  settings: ['Settings', 'Who is on the team, and how is it configured?'],
};

/* header + action per view */
const ACTIONS = {
  interviews: ['+ Log', 'interview'], outreach: ['+ Contact', 'contact'],
  matrix: ['+ Quote', 'quote'], fieldchecks: ['+ Add', 'check'],
  kill: ['+ Kill', 'kill'], documents: ['+ Upload', 'upload'],
};

const MORE_VIEWS = ['moreList', 'scripts', 'templates', 'manual', 'reports', 'documents', 'settings'];

function currentView() {
  if (UI.tab === 'today') return 'today';
  if (UI.tab === 'fieldwork') return UI.subFieldwork;
  if (UI.tab === 'insights') return UI.subInsights;
  if (UI.tab === 'decision') return UI.subDecision;
  return UI.moreScreen || 'moreList';
}

/* Reverse of currentView(): the nav state each view name restores to. Kept in
   the URL hash so a page refresh returns to the same page. Overlays (forms,
   readers, the assistant) are deliberately not encoded — a refresh returns to
   the underlying page, not a reopened modal. */
const VIEW_NAV = {
  today: { tab: 'today' },
  outreach: { tab: 'fieldwork', subFieldwork: 'outreach' },
  interviews: { tab: 'fieldwork', subFieldwork: 'interviews' },
  matrix: { tab: 'fieldwork', subFieldwork: 'matrix' },
  saturation: { tab: 'fieldwork', subFieldwork: 'saturation' },
  pains: { tab: 'insights', subInsights: 'pains' },
  themes: { tab: 'insights', subInsights: 'themes' },
  segments: { tab: 'insights', subInsights: 'segments' },
  kill: { tab: 'insights', subInsights: 'kill' },
  state: { tab: 'insights', subInsights: 'state' },
  brief: { tab: 'decision', subDecision: 'brief' },
  memo: { tab: 'decision', subDecision: 'memo' },
  economics: { tab: 'decision', subDecision: 'economics' },
  alt: { tab: 'decision', subDecision: 'alt' },
  fieldchecks: { tab: 'decision', subDecision: 'fieldchecks' },
  mvp: { tab: 'decision', subDecision: 'mvp' },
  tests: { tab: 'decision', subDecision: 'tests' },
  moreList: { tab: 'more', moreScreen: null },
  scripts: { tab: 'more', moreScreen: 'scripts' },
  templates: { tab: 'more', moreScreen: 'templates' },
  manual: { tab: 'more', moreScreen: 'manual' },
  reports: { tab: 'more', moreScreen: 'reports' },
  documents: { tab: 'more', moreScreen: 'documents' },
  settings: { tab: 'more', moreScreen: 'settings' },
};

/* Keep the URL hash pointing at the current page. replaceState (not a hash
   assignment) so it neither fires hashchange nor stacks history entries. */
function syncHash(view) {
  const want = '#' + view;
  if (location.hash !== want) { try { history.replaceState(null, '', want); } catch { /* ignore */ } }
}
/* Restore the page from the hash on boot, before the first paint. */
function restoreViewFromHash() {
  const view = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  if (VIEW_NAV[view]) Object.assign(UI, VIEW_NAV[view]);
}

/* Horizontal scroll rows (sub-nav, script segments, form pill-selects) rebuild
   at scrollLeft 0 on every render, which can leave a just-selected right-side
   item clipped off-frame. After layout, if the active item isn't fully visible,
   centre it in its row. Only acts when clipped, so an already-visible selection
   never drifts. */
function keepActiveInView(row, activeEl) {
  if (!row || !activeEl) return;
  requestAnimationFrame(() => {
    const r = row.getBoundingClientRect(), b = activeEl.getBoundingClientRect();
    if (!b.width || (b.left >= r.left && b.right <= r.right)) return;
    row.scrollLeft += (b.left + b.width / 2) - (r.left + r.width / 2);
  });
}

/* ----------------------------------------------------------------- boot */
export async function boot() {
  restoreViewFromHash(); // return to the page the URL points at before first paint
  render(); // paint the shell immediately (empty lists)
  // The synced backend (api data) and the worker assistant both require a
  // signed-in Supabase session; without one every request 401s
  // (UNAUTHORIZED_NO_AUTH_HEADER). A returning browser has the session cached,
  // but a fresh/incognito visit does not — so prompt for the magic-link login
  // here, exactly as the desktop shell does in boot-desktop.js.
  if (!isLocalMode || aiAvailable) {
    try {
      const { requireLogin } = await import('./auth.js');
      await requireLogin();
    } catch (e) { console.error('login failed', e); }
  }
  await loadTables();
  render();
}

/* Load every table, distinguishing a genuine empty result from a failed fetch.
   A per-table swallow (`.catch(()=>[])`) would render a network/401 failure as
   an empty-but-healthy-looking workspace — so we track failures and surface a
   retry banner instead. */
async function loadTables() {
  UI.loading = true;
  try {
    const results = await Promise.all(TABLES.map(t =>
      data.list(t).then(rows => ({ rows })).catch(err => ({ err }))));
    let failed = false;
    TABLES.forEach((t, i) => { if (results[i].err) failed = true; else STATE[t] = results[i].rows; });
    UI.loadError = failed;
  } catch (e) { console.error(e); UI.loadError = true; }
  UI.loading = false;
}
async function retryLoad() { UI.loadError = false; render(); await loadTables(); render(); }

/* ----------------------------------------------------------------- render */
let lastView = null, lastOverlayKey = '';
function overlayKey() {
  if (UI.reader) return `reader:${UI.reader.title}`;
  if (UI.formType) return `form:${UI.formType}:${UI.editId || ''}`;
  if (UI.selectedId) return `detail:${UI.selectedId}`;
  if (UI.assistantOpen) return 'assistant';
  return '';
}

function render() {
  const frame = document.getElementById('frame');
  const view = currentView();
  syncHash(view); // keep the URL on the current page so a refresh returns here
  // Opening the assistant clears the "reply waiting" badge — whatever route
  // opened it (icon, "Draft…" buttons), and before the header renders the dot.
  if (UI.assistantOpen) UI.assistantUnread = false;
  const oKey = overlayKey();
  // Preserve scroll across re-renders so tapping a control, saving, or toggling
  // an overlay never snaps the screen/form back to the top. Only restore when
  // it's the same screen / same overlay — a genuine navigation still starts fresh.
  const prevMain = (view === lastView) ? (document.getElementById('scroll')?.scrollTop || 0) : 0;
  const bodies = document.querySelectorAll('.overlay-body');
  const prevOverlay = (oKey && oKey === lastOverlayKey && bodies.length) ? bodies[bodies.length - 1].scrollTop : 0;

  frame.innerHTML = '';
  const [title, question] = TITLES[view] || TITLES.today;
  frame.appendChild(renderHeader(view, title, question));
  const scroll = h('div', { class: 'scroll mtscroll', id: 'scroll' });
  if (UI.loadError) scroll.appendChild(h('button', {
    class: 'banner rose', style: 'margin:12px 16px 0;width:calc(100% - 32px);text-align:left;cursor:pointer;',
    onclick: () => retryLoad(),
  }, [h('span', { class: 'dot' }), h('span', { text: 'Couldn’t load the workspace — check your connection and tap to retry.' })]));
  scroll.appendChild(renderScreen(view));
  frame.appendChild(scroll);
  frame.appendChild(renderTabBar());

  if (UI.selectedId) frame.appendChild(renderDetail());
  if (UI.assistantOpen) frame.appendChild(renderAssistant());
  if (UI.formType) frame.appendChild(renderForm());
  if (UI.reader) frame.appendChild(renderReader());

  // Restore scroll after the new DOM is in place.
  const ns = document.getElementById('scroll'); if (ns && prevMain) ns.scrollTop = prevMain;
  const nb = document.querySelectorAll('.overlay-body');
  if (nb.length) {
    const body = nb[nb.length - 1];
    // A just-sent chat message jumps the assistant to the bottom so the user
    // sees their message and the thinking indicator; otherwise keep position.
    if (UI.assistantOpen && UI.chatToBottom) { body.scrollTop = body.scrollHeight; UI.chatToBottom = false; }
    else if (prevOverlay) body.scrollTop = prevOverlay;
  }
  lastView = view; lastOverlayKey = oKey;
}

function setState(patch) { Object.assign(UI, patch); render(); }

/* ----------------------------------------------------------------- header */
const assistantIcon = () => {
  const s = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(s, 'svg');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(s, 'path'); p.setAttribute('d', 'M4 5h16v11H9l-4 4V5Z'); svg.appendChild(p);
  return svg;
};

function renderHeader(view, title, question) {
  const action = ACTIONS[view];
  const top = h('div', { class: 'hdr-pad' }, [
    h('div', { style: 'min-width:0;' }, [
      h('h1', { class: 'serif hdr-title', text: title }),
      h('div', { class: 'hdr-q', text: question }),
    ]),
    h('div', { class: 'hdr-actions' }, [
      action ? h('button', { class: 'btn btn-primary', onclick: () => openForm(action[1]) }, [
        h('span', { style: 'font-size:15px;margin-top:-1px;', text: '+' }),
        action[0].replace('+ ', ''),
      ]) : null,
      h('button', { class: 'icon-btn', style: 'position:relative;', 'aria-label': UI.assistantUnread ? 'Assistant — reply ready' : 'Assistant', onclick: () => setState({ assistantOpen: true }) },
        UI.assistantUnread ? [assistantIcon(), h('span', { class: 'chat-badge' })] : [assistantIcon()]),
    ]),
  ]);

  const hdr = h('div', { class: 'hdr' }, [top]);

  // More back-link
  if (MORE_VIEWS.includes(view) && view !== 'moreList') {
    hdr.appendChild(h('div', { class: 'moreback' }, [
      h('button', { class: 'btn-link', onclick: () => setState({ moreScreen: null }), text: '‹ More' }),
    ]));
  }

  // Sub-nav
  const subs = subnavFor(UI.tab);
  if (subs) {
    const row = h('div', { class: 'subnav mtscroll' });
    let activeBtn = null;
    subs.items.forEach(it => {
      const active = it.v === subs.current;
      const btn = h('button', {
        class: `pill ${active ? 'active' : ''}`,
        onclick: () => setState({ [subs.key]: it.v, selectedId: null }),
        text: it.l,
      });
      if (active) activeBtn = btn;
      row.appendChild(btn);
    });
    hdr.appendChild(row);
    keepActiveInView(row, activeBtn); // keep the selected pill (MVP, Tests…) in frame
  }
  return hdr;
}

function subnavFor(tab) {
  if (tab === 'fieldwork') return { key: 'subFieldwork', current: UI.subFieldwork, items: [
    { l: 'Outreach', v: 'outreach' }, { l: 'Interviews', v: 'interviews' }, { l: 'Matrix', v: 'matrix' }, { l: 'Saturation', v: 'saturation' }] };
  if (tab === 'insights') return { key: 'subInsights', current: UI.subInsights, items: [
    { l: 'Top pains', v: 'pains' }, { l: 'Themes', v: 'themes' }, { l: 'Segments', v: 'segments' }, { l: 'Kill list', v: 'kill' }, { l: 'State', v: 'state' }] };
  if (tab === 'decision') return { key: 'subDecision', current: UI.subDecision, items: [
    { l: 'Brief', v: 'brief' }, { l: 'Memo', v: 'memo' }, { l: 'Economics', v: 'economics' }, { l: 'Alt models', v: 'alt' },
    { l: 'Field checks', v: 'fieldchecks' }, { l: 'MVP', v: 'mvp' }, { l: 'Tests', v: 'tests' }] };
  return null;
}

/* ----------------------------------------------------------------- tab bar */
function tabIcon(name) {
  const s = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(s, 'svg');
  svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const paths = {
    today: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20h14V9.5'],
    fieldwork: ['M5 3h14v18H5z', 'M9 3.5V6h6V3.5M9 11h6M9 15h4'],
    insights: ['M12 3 3 8l9 5 9-5-9-5Z', 'M3 13l9 5 9-5'],
    decision: ['M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0L7 7Zm10 0-3 6a3 3 0 0 0 6 0l-3-6Z'],
    more: ['M5 12h.01M12 12h.01M19 12h.01'],
  }[name];
  paths.forEach(d => { const p = document.createElementNS(s, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
  return svg;
}
function renderTabBar() {
  const tabs = [
    ['today', 'Today', 'today'], ['fieldwork', 'Fieldwork', 'fieldwork'],
    ['insights', 'Insights', 'insights'], ['decision', 'Decision', 'decision'], ['more', 'More', 'more'],
  ];
  const bar = h('div', { class: 'tabbar' });
  tabs.forEach(([tab, label, icon]) => {
    bar.appendChild(h('button', {
      class: `tab ${UI.tab === tab ? 'active' : ''}`,
      onclick: () => setState({ tab, moreScreen: null, selectedId: null, assistantOpen: false }),
    }, [tabIcon(icon), h('span', { text: label })]));
  });
  return bar;
}

/* =====================================================================
   SCREENS
   ===================================================================== */
function screenWrap(children, pad = '16px 16px 28px', gap = null) {
  const style = `padding:${pad};` + (gap ? `display:flex;flex-direction:column;gap:${gap};` : '');
  return h('div', { class: 'screen', style }, children);
}

function renderScreen(view) {
  const fn = SCREENS[view];
  return fn ? fn() : screenWrap([h('div', { class: 'card', style: 'padding:20px;', text: 'Coming soon.' })]);
}

const SCREENS = {
  today: renderToday,
  interviews: renderInterviews, outreach: renderOutreach, matrix: renderMatrix, saturation: renderSaturation,
  pains: renderPains, themes: renderThemes, segments: renderSegments, kill: renderKill, state: renderStateOfField,
  brief: renderBrief, memo: renderMemo, economics: renderEconomics, alt: renderAlt, fieldchecks: renderFieldChecks,
  mvp: renderMvp, tests: renderTests,
  moreList: renderMoreList, scripts: renderScripts, templates: renderTemplates, manual: renderManual,
  reports: renderReports, documents: renderDocuments, settings: renderSettings,
};

/* ------------------------------------------------------------ TODAY */
function renderToday() {
  const interviews = STATE.interviews;
  const outreach = STATE.outreach;
  const tagged = interviews.filter(isTagged).length;
  // Null (not 100) when there are no interviews — an empty ledger must never
  // masquerade as "100% same-day tagged" and green-light the hard rule.
  const taggedPct = interviews.length ? Math.round((tagged / interviews.length) * 100) : null;
  const contacted = outreach.filter(o => o.status && o.status !== 'Cold').length;
  const bookedDone = outreach.filter(o => ['Booked', 'Done'].includes(o.status)).length;
  const themeCount = new Set(STATE.matrix.map(m => m.theme_tag).filter(Boolean)).size;

  // phase rail
  const rail = h('div', { class: 'mtscroll', style: 'display:flex;gap:6px;overflow-x:auto;' });
  let currentPhaseEl = null;
  PHASES.forEach(p => {
    const current = p.n === CURRENT_PHASE, done = p.n < CURRENT_PHASE;
    const bg = done ? TONE.sage.bg : '#fff';
    const border = current ? '#3F5A4D' : done ? TONE.sage.border : '#E5DDD0';
    const ink = done ? '#3F5A4D' : current ? '#1F2A28' : '#6E6A5E';
    const pct = p.n < CURRENT_PHASE ? '100%' : p.n === CURRENT_PHASE ? '20%' : '—';
    const cell = h('div', { style: `flex:0 0 auto;min-width:74px;padding:9px 11px;border-radius:12px;border:1px solid ${border};background:${bg};` }, [
      h('div', { class: 'micro', style: `color:${ink};font-size:9.5px;`, text: `Phase ${p.n}` }),
      h('div', { class: 'serif', style: `font-size:13px;line-height:16px;margin-top:2px;color:${ink};`, text: p.name }),
      h('div', { class: 'num', style: `font-size:12px;color:${ink};opacity:.85;margin-top:3px;`, text: pct }),
    ]);
    if (current) currentPhaseEl = cell;
    rail.appendChild(cell);
  });
  keepActiveInView(rail, currentPhaseEl); // don't let the current phase sit clipped off-frame

  // KPIs
  const kpis = [
    { value: String(interviews.length), label: 'Interviews logged', note: 'target 36 by phase 2 close', color: '#1F2A28' },
    { value: taggedPct == null ? '—' : `${taggedPct}%`, label: 'Same-day tagged', note: 'hard rule: must be 100%', color: taggedPct == null ? '#6E6A5E' : (taggedPct >= 100 ? '#3F5A4D' : '#755A1E') },
    { value: String(contacted), label: 'Outreach contacted', note: `${bookedDone} booked or done`, color: '#1F2A28' },
    { value: String(themeCount), label: 'Themes surfaced', note: 'rich pool', color: '#1F2A28' },
  ];
  const kpiGrid = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;' },
    kpis.map(k => h('div', { class: 'card', style: 'padding:14px 15px;' }, [
      h('div', { class: 'serif num kpi-num', style: `color:${k.color};`, text: k.value }),
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-top:6px;', text: k.label }),
      h('div', { style: 'font-size:11px;line-height:15px;color:#6E6A5E;margin-top:5px;', text: k.note }),
    ])));

  // decision pulse — derived from the live hypothesis board and kill list
  const assessment = latestAssessment();
  const leaning = assessment?.leaning || 'INSUFFICIENT';
  const strengthening = STATE.hypotheses.filter(hy => hy.kind === 'buyer_hypothesis' && hy.status === 'strengthening').length;
  const killed = STATE.kill_list.length;
  const pulse = h('button', { class: 'card', style: 'text-align:left;width:100%;padding:15px;cursor:pointer;display:flex;align-items:center;gap:12px;',
    onclick: () => setState({ tab: 'decision', subDecision: 'brief' }) }, [
    h('div', { style: 'flex:1;min-width:0;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;', text: 'If we decided today' }),
      h('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:7px;' }, [
        chip(leaning, LEANING_TONE[leaning] || 'honey'),
        h('span', { class: 'num', style: 'font-size:11.5px;color:#6E6A5E;', text: `${strengthening} strengthening · ${killed} killed` }),
      ]),
    ]),
    h('span', { style: 'color:#96501F;font-size:18px;', text: '›' }),
  ]);

  // needs attention
  const overdue = interviews.filter(isOverdue).sort((a, b) => (daysSince(b.date) ?? 0) - (daysSince(a.date) ?? 0));
  const stalled = outreach.filter(isStalled);
  const att = [];
  overdue.slice(0, 2).forEach(r => att.push(attnRow('rose',
    `${r.interview_id} untagged for ${daysSince(r.date)} days — tag it now`, () => setState({ tab: 'fieldwork', subFieldwork: 'interviews' }))));
  if (stalled[0]) att.push(attnRow('honey',
    `${stalled[0].name} (${(stalled[0].status || '').toLowerCase()}) silent since ${fmtDay(stalled[0].first_contact)} — chase or close`,
    () => setState({ tab: 'fieldwork', subFieldwork: 'outreach' })));
  if (stalled.length > 1) att.push(attnRow('honey',
    `${stalled.length - 1} more contact${stalled.length - 1 === 1 ? '' : 's'} stalled ${STALL_DAYS}+ days — review outreach`,
    () => setState({ tab: 'fieldwork', subFieldwork: 'outreach' })));

  const attnBlock = h('div', {}, [
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:8px;', text: 'Needs attention · problems first' }),
    h('div', { style: 'display:flex;flex-direction:column;gap:8px;' }, att.length ? att : [h('div', { class: 'card', style: 'padding:14px;font-size:12.5px;color:#6E6A5E;', text: 'Nothing needs you right now.' })]),
  ]);

  // exit criteria (from deliverables of current phase)
  const crit = STATE.deliverables.filter(d => d.phase === CURRENT_PHASE);
  const critCard = h('div', { class: 'listcard' }, [
    h('div', { style: 'padding:14px 16px 10px;border-bottom:1px solid #EFE9DD;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;', text: `Phase ${CURRENT_PHASE} exit criteria` }),
      h('div', { class: 'serif', style: 'font-size:15px;margin-top:2px;', text: (PHASES.find(p => p.n === CURRENT_PHASE) || {}).long || 'Exit criteria' }),
    ]),
    ...(crit.length ? crit : []).map(c => {
      const st = c.status || 'Not started';
      const tone = st === 'Complete' || st === 'Done' ? 'sage' : st === 'Blocked' ? 'rose' : 'honey';
      const done = tone === 'sage';
      return h('div', { class: 'row', style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;' }, [
        h('span', { style: `font-size:12.5px;line-height:17px;color:${done ? '#6E6A5E' : '#1F2A28'};text-decoration:${done ? 'line-through' : 'none'};`, text: c.deliverable || c.name || '—' }),
        chip(st, tone),
      ]);
    }),
  ]);

  return screenWrap([
    h('div', {}, [h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:8px;', text: `Programme · phase ${CURRENT_PHASE} of 5` }), rail]),
    kpiGrid, pulse, attnBlock, critCard,
  ], '16px 16px 28px', '16px');
}
function attnRow(tone, text, onclick) {
  const t = TONE[tone];
  return h('button', { style: `text-align:left;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:${t.bg};border:1px solid ${t.border};color:${t.ink};font-size:12.5px;line-height:17px;font-weight:500;`, onclick }, [
    tone === 'rose' ? h('span', { style: 'width:7px;height:7px;border-radius:50%;background:#C95F5F;flex-shrink:0;' }) : null,
    h('span', { style: 'flex:1;', text }),
    h('span', { style: 'font-size:16px;', text: '›' }),
  ]);
}

/* ------------------------------------------------------------ INTERVIEWS */
function renderInterviews() {
  const rows = [...STATE.interviews].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!rows.length) return screenWrap([emptyCard('No interviews logged yet', 'Log the first from the + Log button. Every conversation and its field notes live here.')]);
  const overdue = rows.filter(isOverdue);
  const kids = [];
  if (overdue.length) kids.push(h('div', { class: 'banner rose', style: 'margin-bottom:12px;' }, [
    h('span', { class: 'dot' }), h('span', { text: `Hard rule breached: ${overdue.map(r => r.interview_id).join(', ')} untagged past 24h. Tag them today.` }),
  ]));
  kids.push(h('div', { style: 'font-size:12px;color:#4A5651;margin-bottom:12px;', text: `${rows.length} logged · hard rule: tag in matrix the same day` }));
  kids.push(h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:8px;', text: 'All interviews · newest first' }));
  const list = h('div', { class: 'listcard' });
  rows.forEach(r => {
    const tone = isTagged(r) ? 'sage' : 'rose';
    list.appendChild(h('button', { class: 'rowbtn', style: `border-left:3px solid ${isOverdue(r) ? '#C95F5F' : 'transparent'};padding:12px 15px;`, onclick: () => setState({ selectedId: r.id }) }, [
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;' }, [
        h('span', { class: 'num', style: 'font-size:13.5px;font-weight:500;color:#1F2A28;', text: `${r.interview_id || '—'} · ${r.segment || '—'}` }),
        chip(isTagged(r) ? 'tagged' : 'untagged', tone, 'sm'),
      ]),
      h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-top:4px;', text: `${fmtDay(r.date)} · ${r.format || '—'} · ${r.interviewer || '—'}` }),
      r.brief_topic ? h('div', { style: 'font-size:12px;color:#4A5651;margin-top:4px;line-height:16px;', text: r.brief_topic }) : null,
    ]));
  });
  kids.push(list);
  return screenWrap(kids, '14px 16px 28px');
}

/* ------------------------------------------------------------ OUTREACH */
function renderOutreach() {
  const rows = [...STATE.outreach].sort((a, b) => (isStalled(b) - isStalled(a)) || String(b.first_contact || '').localeCompare(String(a.first_contact || '')));
  if (!rows.length) return screenWrap([emptyCard('No contacts yet', 'Add the first with the + Contact button. Outreach comes before interviews.')]);
  const stalled = rows.filter(isStalled);
  const contacted = rows.filter(o => o.status && o.status !== 'Cold').length;
  const bookedDone = rows.filter(o => ['Booked', 'Done'].includes(o.status)).length;
  const kids = [];
  if (stalled.length) kids.push(h('div', { class: 'banner honey', style: 'margin-bottom:12px;', text: `${stalled.length} contact${stalled.length === 1 ? '' : 's'} stalled — no movement for ${STALL_DAYS}+ days. Chase or close them.` }));
  kids.push(h('div', { style: 'font-size:12px;color:#4A5651;margin-bottom:10px;', text: `${rows.length} contacts · ${contacted} contacted · ${bookedDone} booked or done` }));
  const list = h('div', { class: 'listcard' });
  rows.forEach(o => {
    list.appendChild(h('button', { class: 'rowbtn', style: 'padding:12px 15px;', onclick: () => openForm('contact', o) }, [
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;' }, [
        h('span', { style: 'font-size:13.5px;font-weight:500;color:#1F2A28;', text: o.name || '—' }),
        h('div', { style: 'display:flex;gap:5px;flex-shrink:0;align-items:center;' }, [
          isStalled(o) ? chip('stalled', 'honey', 'sm') : null,
          chip(o.status || 'Cold', statusTone(o.status), 'sm'),
          h('span', { style: 'color:#96501F;font-size:16px;', text: '›' }),
        ]),
      ]),
      h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-top:4px;', text: [o.segment, o.organisation, o.country].filter(Boolean).join(' · ') || '—' }),
    ]));
  });
  kids.push(list);
  return screenWrap(kids, '14px 16px 28px');
}

/* ------------------------------------------------------------ MATRIX */
function renderMatrix() {
  if (!STATE.matrix.length) return screenWrap([emptyCard('Nothing tagged yet', 'Tag quotes from an interview (+ Quote) — the matrix ranks them by theme, severity and willingness-to-pay.')]);
  const ranked = rankThemes(STATE.matrix);
  const missing = STATE.interviews.filter(isOverdue).map(r => r.interview_id);
  const kids = [];
  if (missing.length) kids.push(h('div', { class: 'banner rose', style: 'margin-bottom:12px;' }, [
    h('span', { class: 'dot' }), h('span', { text: `Matrix is missing ${missing.join(', ')} — tag those interviews first.` }),
  ]));
  kids.push(h('div', { style: 'font-size:12px;color:#4A5651;margin-bottom:12px;', text: `${STATE.matrix.length} quotes tagged · grouped by theme, ranked by weight` }));
  const groups = h('div', { style: 'display:flex;flex-direction:column;gap:14px;' });
  ranked.forEach(g => {
    const card = h('div', { class: 'listcard' });
    card.appendChild(h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 15px;background:#FAF7F1;border-bottom:1px solid #EFE9DD;' }, [
      chip(g.tag, 'plum'),
      h('span', { class: 'num', style: 'font-size:11px;color:#6E6A5E;flex-shrink:0;', text: `${g.count} · avg sev ${g.avgSev.toFixed(1)} · WTP-Y ${g.wtpRate}%` }),
    ]));
    g.quotes.forEach(q => {
      card.appendChild(h('button', { class: 'rowbtn', style: 'padding:12px 15px;', onclick: () => openForm('quote', q) }, [
        h('div', { class: 'quote', text: `“${q.quote || ''}”` }),
        h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;' }, [
          h('span', { style: 'font-size:11px;color:#6E6A5E;', text: q.interview_id || '—' }),
          h('div', { style: 'display:flex;gap:5px;align-items:center;' }, [
            q.severity ? chip(`sev ${q.severity}`, sevTone(+q.severity), 'xs') : null,
            q.wtp ? chip(`WTP ${q.wtp}`, wtpTone(q.wtp), 'xs') : null,
            h('span', { style: 'color:#96501F;font-size:15px;', text: '›' }),
          ]),
        ]),
      ]));
    });
    groups.appendChild(card);
  });
  kids.push(groups);
  return screenWrap(kids, '14px 16px 28px');
}

/* ------------------------------------------------------------ SATURATION */
function renderSaturation() {
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:10px;' });
  SEGMENTS.forEach(s => {
    const done = STATE.interviews.filter(r => r.segment === s.name).length;
    const pct = Math.min(100, Math.round((done / s.target) * 100));
    const color = pct >= 100 ? '#5C7A6B' : pct >= 50 ? '#D4A24C' : '#E5DDD0';
    const status = pct >= 100 ? 'Target met — check the matrix for new themes' : done === 0 ? 'Not started' : `${s.target - done} more to target`;
    list.appendChild(h('div', { class: 'card', style: 'padding:14px 15px;' }, [
      h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;' }, [
        h('span', { class: 'serif', style: 'font-size:15px;', text: s.name }),
        h('span', { class: 'num', style: 'font-size:12px;color:#6E6A5E;', text: `${done} / ${s.target}` }),
      ]),
      h('div', { class: 'bar' }, [h('div', { class: 'bar-fill', style: `width:${pct}%;background:${color};` })]),
      h('div', { style: 'font-size:11px;color:#6E6A5E;margin-top:7px;', text: status }),
    ]));
  });
  const note = h('div', { style: 'background:#FAF7F1;border:1px solid #EFE9DD;border-radius:14px;padding:14px 15px;margin-top:14px;font-size:12.5px;line-height:18px;color:#4A5651;' }, [
    h('strong', { text: 'How to read this: ' }),
    'a segment “saturates” when the last three interviews surface 0–1 new themes each. Counts are necessary, not sufficient — check the matrix for whether new themes still emerge.',
  ]);
  return screenWrap([list, note]);
}

/* ------------------------------------------------------------ INSIGHTS: PAINS */
function renderPains() {
  const ranked = rankThemes(STATE.matrix).slice(0, 3);
  const cards = ranked.map((p, i) => {
    const strongest = [...p.quotes].sort((a, b) => (+b.severity || 0) - (+a.severity || 0))[0] || {};
    return h('div', { class: 'card', style: 'padding:15px;' }, [
      h('div', { class: 'serif', style: 'font-size:16px;line-height:20px;margin-bottom:9px;', text: `${i + 1}. ${p.tag}` }),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px;' }, [
        chip(`${p.count} mentions`, 'line', 'sm'),
        chip(`avg severity ${p.avgSev.toFixed(1)}`, sevTone(p.avgSev), 'sm'),
        chip(`${p.wtpRate}% WTP`, p.wtpRate >= 50 ? 'sage' : 'honey', 'sm'),
      ]),
      h('div', { class: 'quote', style: 'font-size:14.5px;line-height:1.55;padding-left:13px;', text: `“${strongest.quote || ''}”` }),
      h('div', { style: 'font-size:11px;color:#6E6A5E;text-align:right;margin-top:6px;', text: strongest.interview_id || '' }),
    ]);
  });
  return screenWrap(cards.length ? cards : [emptyCard('No pains ranked yet', 'The top-3 pains surface once quotes are tagged in the matrix.')], '16px 16px 28px', '12px');
}

/* ------------------------------------------------------------ INSIGHTS: THEMES */
function renderThemes() {
  if (!STATE.matrix.length) return screenWrap([emptyCard('No themes yet', 'Themes rank themselves once you tag quotes in the matrix.')]);
  const ranked = rankThemes(STATE.matrix);
  const themeCount = new Set(STATE.matrix.map(m => m.theme_tag).filter(Boolean)).size;
  const list = h('div', { class: 'listcard' });
  ranked.forEach((t, i) => {
    list.appendChild(h('div', { class: 'row' }, [
      h('div', { style: 'display:flex;align-items:flex-start;gap:10px;' }, [
        h('span', { class: 'num', style: 'font-size:12px;color:#6E6A5E;width:16px;margin-top:2px;', text: String(i + 1) }),
        h('span', { class: 'chip plum', style: 'flex:1;', text: t.tag }),
      ]),
      h('div', { style: 'display:flex;gap:14px;margin-top:7px;padding-left:26px;' }, [
        h('span', { class: 'num', style: 'font-size:11px;color:#6E6A5E;', text: `${t.count} quotes` }),
        h('span', { class: 'num', style: `font-size:11px;color:${TONE[sevTone(t.avgSev)].ink};`, text: `avg sev ${t.avgSev.toFixed(1)}` }),
        h('span', { class: 'num', style: 'font-size:11px;color:#6E6A5E;', text: `WTP ${t.wtpRate}%` }),
        h('span', { class: 'num', style: 'font-size:11px;color:#1F2A28;font-weight:500;margin-left:auto;', text: `score ${t.score.toFixed(1)}` }),
      ]),
    ]));
  });
  return screenWrap([
    h('div', { style: 'font-size:12px;color:#4A5651;margin-bottom:12px;', text: `Ranked by frequency × avg severity × WTP signal. ${themeCount} themes from ${STATE.matrix.length} matrix entries.` }),
    list,
  ]);
}

/* ------------------------------------------------------------ INSIGHTS: SEGMENTS */
function renderSegments() {
  const bySeg = {};
  STATE.matrix.forEach(m => { if (!m.segment) return; (bySeg[m.segment] = bySeg[m.segment] || []).push(m); });
  const cards = Object.entries(bySeg).map(([name, quotes]) => {
    const highSev = quotes.filter(q => (+q.severity || 0) >= 4).length;
    const wtpY = quotes.filter(q => q.wtp === 'Y').length;
    const topThemes = rankThemes(quotes).slice(0, 3).map(t => t.tag);
    const strongest = [...quotes].sort((a, b) => (+b.severity || 0) - (+a.severity || 0))[0] || {};
    return h('div', { class: 'card', style: 'padding:15px;' }, [
      h('div', { class: 'serif', style: 'font-size:17px;margin-bottom:10px;', text: name }),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;' }, [
        chip(`${quotes.length} quotes`, 'line', 'sm'),
        chip(`${highSev} high-severity`, highSev ? 'rose' : 'line', 'sm'),
        chip(`${wtpY} WTP`, wtpY ? 'sage' : 'line', 'sm'),
      ]),
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:7px;', text: 'Top themes' }),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;' }, topThemes.map(th => h('span', { class: 'chip plum', style: 'height:auto;padding:3px 9px;font-size:10px;', text: th }))),
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:5px;', text: 'Strongest quote' }),
      h('div', { class: 'quote', style: 'font-size:13.5px;', text: `“${strongest.quote || ''}”` }),
    ]);
  });
  return screenWrap(cards.length ? cards : [emptyCard('No segment evidence yet', 'Tag quotes in the matrix and segment cards build themselves.')], '16px 16px 28px', '12px');
}

/* ------------------------------------------------------------ INSIGHTS: KILL LIST */
function renderKill() {
  const rows = [...STATE.kill_list].sort((a, b) => String(b.killed_date || '').localeCompare(String(a.killed_date || '')));
  const list = h('div', { class: 'listcard' });
  rows.forEach(k => {
    list.appendChild(h('div', { class: 'row', style: 'padding:14px 15px;' }, [
      h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;' }, [
        chip('Killed', 'rose', 'sm'),
        h('span', { style: 'font-size:11px;color:#6E6A5E;', text: fmtDay(k.killed_date) }),
      ]),
      h('div', { class: 'serif', style: 'font-size:15px;line-height:20px;margin-bottom:6px;', text: k.hypothesis || '' }),
      h('div', { style: 'font-size:12.5px;line-height:18px;color:#4A5651;', text: k.evidence || '' }),
    ]));
  });
  return screenWrap([
    h('div', { style: 'font-size:12px;color:#4A5651;margin-bottom:12px;', text: 'Append-only. Entries cannot be edited or removed — that is the point.' }),
    rows.length ? list : emptyCard('Nothing killed yet', 'When the evidence falsifies a hypothesis, record it here — permanently.'),
  ]);
}

/* ------------------------------------------------------------ INSIGHTS: STATE OF FIELD */
function renderStateOfField() {
  const rec = STATE.deliverables.find(d => d.phase === 3 && d.deliverable === 'State of the field');
  if (rec && rec.evidence) {
    return screenWrap([h('div', { class: 'card', style: 'padding:18px;' }, [
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;' }, [
        h('div', { style: 'font-size:11px;color:#6E6A5E;', text: `Last updated ${fmtDay(rec.updated_at || rec.created_at)}` }),
        h('button', { class: 'btn-link', style: 'font-size:12.5px;', onclick: () => openStateEditor(), text: 'Edit' }),
      ]),
      h('div', { style: 'font-size:13.5px;line-height:21px;color:#1F2A28;white-space:pre-line;', text: rec.evidence }),
    ])]);
  }
  return screenWrap([h('div', { class: 'card', style: 'padding:24px 18px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;min-height:200px;justify-content:center;' }, [
    h('div', { class: 'serif', style: 'font-size:17px;color:#4A5651;', text: 'No state-of-the-field written yet' }),
    h('div', { style: 'font-size:12.5px;line-height:18px;color:#6E6A5E;max-width:40ch;', text: 'One dated paragraph, updated whenever the picture changes. Let the assistant draft it from the whole ledger, then shape and save.' }),
    h('button', { class: 'btn btn-primary tall', style: 'margin-top:12px;', onclick: () => setState({ assistantOpen: true }), text: 'Draft from evidence' }),
    h('button', { class: 'btn btn-line tall', onclick: () => openStateEditor(), text: 'Write manually' }),
  ])]);
}

/* ------------------------------------------------------------ DECISION: BRIEF */
function renderBrief() {
  const hyps = STATE.hypotheses.filter(x => x.kind === 'buyer_hypothesis').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const kills = STATE.hypotheses.filter(x => x.kind === 'kill_criterion').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const dirTone = (s) => ({ strengthening: 'sage', weakening: 'honey', dead: 'rose', open: 'line', unknown: 'line' }[s] || 'line');
  const linksFor = (id) => STATE.evidence_links.filter(l => l.hypothesis_id === id);

  const assessment = latestAssessment();
  const leaningLabel = assessment?.leaning || 'INSUFFICIENT';
  const snap = assessment?.data_snapshot || {};
  const perHyp = (code) => (assessment?.per_hypothesis || []).find(p => p.hypothesis_code === code);

  // Leaning card — tappable to read the full assessment; carries Regenerate.
  const rationale = (assessment && (assessment.summary_markdown || '').trim())
    ? String(assessment.summary_markdown).split(/\n\s*\n/)[0].replace(/[#*]/g, '').trim()
    : `No AI assessment has been run yet, and the kill criteria still have no numbers under them — so the honest current leaning is ${leaningLabel}. Regenerate to draft one from the evidence.`;
  const leaningInner = [
    h('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;', text: 'Current leaning · advisory, not a verdict' }),
      assessment ? h('span', { style: 'color:#96501F;font-size:16px;', text: '›' }) : null,
    ]),
    h('div', { style: 'margin-top:10px;' }, [chip(leaningLabel, LEANING_TONE[leaningLabel] || 'honey', 'lg')]),
    h('div', { style: 'font-size:13px;line-height:20px;color:#4A5651;margin-top:12px;', text: rationale }),
  ];
  const leaning = h('div', { class: 'card', style: 'padding:17px;' }, [
    // Only a tappable button when there's an assessment to open — otherwise a
    // plain div, so it isn't a dead pointer-cursor tap before one is generated.
    assessment
      ? h('button', { style: 'display:block;width:100%;text-align:left;background:none;border:none;padding:0;cursor:pointer;', onclick: () => openReader(`Assessment · ${fmtDay(assessment.created_at)}`, () => assessmentReader(assessment)) }, leaningInner)
      : h('div', {}, leaningInner),
    h('div', { class: 'num', style: 'font-size:11px;color:#6E6A5E;margin-top:12px;padding-top:11px;border-top:1px solid #EFE9DD;', text: `Based on ${snap.interviews ?? STATE.interviews.length} interviews · ${snap.matrix_entries ?? STATE.matrix.length} matrix entries · phase ${CURRENT_PHASE}` }),
    regenControl(),
  ]);

  const hypBlock = h('div', {}, [
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:8px;', text: 'Buyer hypotheses · who pays? · tap to read' }),
    h('div', { style: 'display:flex;flex-direction:column;gap:11px;' }, hyps.map(hy => {
      const ls = linksFor(hy.id);
      const supp = ls.filter(l => l.direction === 'supports').length;
      const contra = ls.filter(l => l.direction === 'contradicts').length;
      const a = perHyp(hy.code);
      return h('button', { class: 'card', style: 'padding:15px;text-align:left;width:100%;display:block;cursor:pointer;', onclick: () => openReader(`${hy.code} · ${hy.title}`, () => hypothesisReader(hy, a, ls)) }, [
        h('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;' }, [
          h('div', { class: 'serif', style: 'font-size:15.5px;line-height:20px;', text: `${hy.code} · ${hy.title}` }),
          chip(hy.status || 'open', dirTone(hy.status)),
        ]),
        h('div', { style: 'font-size:12px;line-height:17px;color:#4A5651;margin-top:5px;', text: hy.description || '' }),
        h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;' }, [
          h('span', { class: 'num', style: 'font-size:11.5px;color:#6E6A5E;', text: `${supp} supporting · ${contra} contradicting` }),
          h('span', { style: 'color:#96501F;font-size:15px;', text: '›' }),
        ]),
      ]);
    })),
  ]);

  const killCard = h('div', { class: 'card', style: 'padding:15px;' }, [
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:10px;', text: 'Kill criteria · any breach kills patient-pays' }),
    ...kills.map((k, i) => {
      const bp = (assessment?.breakpoints || []).find(b => b.code === k.code);
      return h('div', { style: `display:flex;align-items:flex-start;gap:9px;padding:9px 0;${i < kills.length - 1 ? 'border-bottom:1px solid #EFE9DD;' : ''}` }, [
        chip(k.status || 'unknown', 'inset', 'sm'),
        h('div', { style: 'min-width:0;' }, [
          h('div', { style: 'font-size:12.5px;font-weight:500;color:#1F2A28;', text: `${k.code} · ${k.title}` }),
          h('div', { style: 'font-size:11.5px;line-height:16px;color:#6E6A5E;margin-top:2px;', text: bp?.note || k.description || '' }),
        ]),
      ]);
    }),
  ]);

  return screenWrap([leaning, hypBlock, killCard, trajectoryStrip()], '16px 16px 28px', '16px');
}

/* Run a fresh assessment with busy state + error surfacing. Shared by the
   Generate and Regenerate affordances. */
async function runRegen() {
  if (UI.busy) return;
  setState({ busy: 'assessment' });
  try { await runAssessment(); UI.busy = null; render(); }
  catch (e) { UI.busy = null; render(); alert('Assessment failed: ' + e.message); }
}

/* Brief control. Before anything is generated the button is red and says
   "Generate brief"; once an assessment exists it turns green and says
   "Open brief" (opening the full read), with a quiet Regenerate beneath so a
   fresh assessment can still be appended. Mirrors the desktop capability while
   making state obvious on a phone. */
function regenControl() {
  if (!aiAvailable) {
    return h('div', { style: 'margin-top:14px;padding-top:12px;border-top:1px solid #EFE9DD;font-size:11.5px;color:#6E6A5E;', text: 'Connect the assistant to generate the brief.' });
  }
  const wrap = h('div', { style: 'margin-top:14px;padding-top:12px;border-top:1px solid #EFE9DD;' });

  if (UI.busy === 'assessment') {
    wrap.appendChild(h('button', { class: 'btn btn-primary tall', style: 'width:100%;opacity:.6;', disabled: '', text: 'Generating…' }));
    return wrap;
  }

  const assessment = latestAssessment();
  if (!assessment) {
    wrap.appendChild(h('button', { class: 'btn btn-danger tall', style: 'width:100%;', onclick: () => runRegen(), text: 'Generate brief' }));
    wrap.appendChild(h('div', { style: 'font-size:11px;color:#6E6A5E;margin-top:7px;text-align:center;', text: 'Drafts the first assessment from the evidence ledger.' }));
    return wrap;
  }

  wrap.appendChild(h('button', { class: 'btn btn-go tall', style: 'width:100%;',
    onclick: () => openReader(`Assessment · ${fmtDay(assessment.created_at)}`, () => assessmentReader(assessment)),
    text: 'Open brief' }));
  wrap.appendChild(h('button', { class: 'btn-link', style: 'display:block;margin:9px auto 0;font-size:12px;',
    onclick: () => runRegen(), text: 'Regenerate — append a new assessment' }));
  return wrap;
}

/* Full-assessment reader body. */
function assessmentReader(a) {
  const dir = (d) => (d === 'strengthening' ? 'sage' : d === 'weakening' ? 'honey' : 'line');
  return h('div', { style: 'display:flex;flex-direction:column;gap:14px;' }, [
    h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
      chip(a.leaning, LEANING_TONE[a.leaning] || 'line'),
      h('span', { style: 'font-size:11px;color:#6E6A5E;', text: `trigger ${a.trigger} · phase ${a.phase}${a.model ? ` · ${a.model}` : ''}` }),
    ]),
    renderMarkdown(a.summary_markdown),
    ...(a.per_hypothesis || []).length ? [h('div', { class: 'micro', style: 'color:#6E6A5E;margin-top:4px;', text: 'Per hypothesis' })] : [],
    ...(a.per_hypothesis || []).map(p => h('div', { style: 'border-top:1px solid #EFE9DD;padding-top:10px;' }, [
      h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px;' }, [
        h('span', { style: 'font-size:12.5px;font-weight:500;', text: p.hypothesis_code }),
        chip(`${p.direction} · ${p.strength}`, dir(p.direction), 'sm'),
      ]),
      p.gaps ? h('div', { style: 'font-size:12px;line-height:17px;color:#4A5651;', text: `Gaps: ${p.gaps}` }) : null,
      p.what_would_change ? h('div', { style: 'font-size:12px;line-height:17px;color:#6E6A5E;margin-top:2px;', text: `Would change it: ${p.what_would_change}` }) : null,
    ])),
  ]);
}

/* Single-hypothesis reader body: assessment view + linked quotes. */
function hypothesisReader(hy, assessed, links) {
  const dirTone = (s) => ({ strengthening: 'sage', weakening: 'honey', dead: 'rose', open: 'line', unknown: 'line' }[s] || 'line');
  const quotes = links.filter(l => l.evidence_type === 'matrix')
    .map(l => STATE.matrix.find(m => m.id === l.evidence_id)).filter(Boolean).slice(0, 4);
  return h('div', { style: 'display:flex;flex-direction:column;gap:12px;' }, [
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' }, [
      chip(hy.status || 'open', dirTone(hy.status)),
      assessed ? chip(`${assessed.direction} · ${assessed.strength}`, dirTone(assessed.direction), 'sm') : chip('not yet assessed', 'line', 'sm'),
    ]),
    h('div', { style: 'font-size:13px;line-height:20px;color:#1F2A28;', text: hy.description || '' }),
    assessed?.gaps ? h('div', {}, [h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:3px;', text: 'Gaps' }), h('div', { style: 'font-size:12.5px;line-height:18px;color:#4A5651;', text: assessed.gaps })]) : null,
    assessed?.what_would_change ? h('div', { class: 'banner info', style: 'flex-direction:column;align-items:flex-start;gap:3px;' }, [h('span', { class: 'micro', text: 'What would change this' }), h('span', { style: 'font-weight:400;', text: assessed.what_would_change })]) : null,
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-top:2px;', text: `Linked quotes (${quotes.length})` }),
    quotes.length
      ? h('div', { style: 'display:flex;flex-direction:column;gap:10px;' }, quotes.map(q => h('div', {}, [
          h('div', { class: 'quote', text: `“${q.quote || ''}”` }),
          h('div', { style: 'font-size:11px;color:#6E6A5E;margin-top:4px;', text: q.interview_id || '' }),
        ])))
      : h('div', { style: 'font-size:12px;color:#6E6A5E;', text: 'No linked quotes yet — link matrix evidence to this hypothesis on desktop.' }),
  ]);
}

/* Trajectory — every assessment, oldest first; tap one to read it. */
function trajectoryStrip() {
  const all = [...STATE.ai_assessments].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const card = h('div', { class: 'card', style: 'padding:15px;' }, [
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:10px;', text: 'Trajectory · every assessment, oldest first — the sequence is evidence' }),
  ]);
  if (!all.length) {
    card.appendChild(h('div', { style: 'font-size:12px;color:#6E6A5E;', text: 'No assessments yet. The first one starts the trajectory.' }));
    return card;
  }
  const strip = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;' });
  all.forEach((a, i) => {
    const c = chip(`${a.leaning} · ${fmtDay(a.created_at)}`, LEANING_TONE[a.leaning] || 'line');
    c.style.cursor = 'pointer';
    if (i === all.length - 1) c.style.boxShadow = '0 0 0 2px var(--sage)';
    c.addEventListener('click', () => openReader(`Assessment · ${fmtDay(a.created_at)}`, () => assessmentReader(a)));
    strip.appendChild(c);
    if (i < all.length - 1) strip.appendChild(h('span', { style: 'font-size:11px;color:#6E6A5E;', text: '→' }));
  });
  card.appendChild(strip);
  return card;
}

/* ------------------------------------------------------------ DECISION: MEMO */
const VERDICTS = ['Undecided', 'GO', 'PIVOT', 'NO-GO'];
const VERDICT_TONE = { GO: 'sage', PIVOT: 'honey', 'NO-GO': 'rose', Undecided: 'line' };
function memoContent() { return (STATE.decision_memos[0]?.content) || {}; }
function agreedVerdict(c) {
  const a = c.verdict_lead || 'Undecided', b = c.verdict_field || 'Undecided';
  return a !== 'Undecided' && a === b ? a : 'Undecided';
}
async function saveMemo(patch) {
  const memo = STATE.decision_memos[0];
  if (memo) await data.update('decision_memos', memo.id, patch);
  else await data.create('decision_memos', { version: 1, content: {}, ...patch });
  STATE.decision_memos = await data.list('decision_memos');
  render();
}
async function pickVerdict(key, v) {
  // Guard: without this, two quick taps both read an empty decision_memos and
  // each create() a second memo record — the seats race and one verdict is lost.
  if (UI.savingMemo) return;
  UI.savingMemo = true; render();
  const next = { ...memoContent(), [key]: v };
  next.verdict = agreedVerdict(next);
  try { await saveMemo({ content: next }); }
  catch (e) { alert('Save failed: ' + e.message); }
  finally { UI.savingMemo = false; render(); }
}
function renderMemo() {
  const team = getTeam();
  const content = memoContent();
  // Human verdict seat: tap a verdict to set it; persists to the memo.
  const seat = (who, role, key) => h('div', {}, [
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:6px;', text: `${who} · ${role}` }),
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' }, VERDICTS.map(v => {
      const active = (content[key] || 'Undecided') === v;
      return h('button', { disabled: UI.savingMemo ? '' : null, style: `display:inline-flex;align-items:center;height:38px;padding:0 13px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;${UI.savingMemo ? 'opacity:.55;' : ''}${active ? 'background:#3F5A4D;color:#fff;border:1px solid #3F5A4D;' : 'background:#fff;border:1px solid #E5DDD0;color:#4A5651;'}`, onclick: () => pickVerdict(key, v), text: v });
    })),
  ]);
  const sections = [
    'Recommendation', 'Evidence summary', 'Buyer & willingness to pay', 'Unit economics verdict',
    'Key risks & unknowns', 'What would change our mind', 'Decision & next step',
  ];
  const memoCard = h('div', { class: 'listcard' });
  sections.forEach(label => memoCard.appendChild(h('div', { class: 'row', style: 'padding:13px 15px;' }, [
    h('div', { class: 'micro', style: 'color:#96501F;margin-bottom:5px;', text: label }),
    h('div', { style: 'font-size:12.5px;line-height:18px;color:#6E6A5E;', text: 'Not yet drafted — the assistant drafts from the evidence ledger; humans edit and sign.' }),
  ])));
  const agreed = agreedVerdict(content);
  const leadV = content.verdict_lead || 'Undecided', fieldV = content.verdict_field || 'Undecided';
  const cosign = h('div', { style: 'padding:14px 15px;' }, [
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:6px;', text: 'Co-signatures' }),
    agreed !== 'Undecided'
      ? h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [chip(`Agreed verdict: ${agreed}`, VERDICT_TONE[agreed]), h('span', { style: 'font-size:11.5px;color:#6E6A5E;', text: '— ready to co-sign' })])
      : h('div', { style: 'font-size:12.5px;line-height:18px;color:#4A5651;', text: (leadV !== 'Undecided' || fieldV !== 'Undecided') ? `The seats disagree (${team.lead}: ${leadV} · ${team.field}: ${fieldV}). Co-signing needs one shared verdict.` : `Not yet co-signed. ${team.lead} and ${team.field} must each pick the same verdict above.` }),
  ]);

  const aiSeat = (() => {
    const a = latestAssessment();
    const lean = a?.leaning || 'INSUFFICIENT';
    return h('div', {}, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:6px;', text: 'AI assessment · advisory' }),
      h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [chip(lean, LEANING_TONE[lean] || 'honey'), h('span', { style: 'font-size:11px;color:#6E6A5E;', text: a ? `assessed ${fmtDay(a.created_at)}` : 'no assessment yet' })]),
      h('button', { class: 'btn-link', style: 'font-size:12px;margin-top:6px;', onclick: () => setState({ subDecision: 'brief' }), text: 'Open Decision Brief ›' }),
    ]);
  })();

  memoCard.appendChild(cosign);

  return screenWrap([
    h('div', { class: 'card', style: 'padding:16px;margin-bottom:14px;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:12px;', text: 'Verdict · three seats. Humans decide; the AI argues.' }),
      h('div', { style: 'display:flex;flex-direction:column;gap:14px;' }, [seat(team.lead, 'lead', 'verdict_lead'), seat(team.field, 'field', 'verdict_field'), aiSeat]),
    ]),
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:8px;', text: 'Seven sections · AI drafts, humans edit & sign' }),
    memoCard,
  ], '16px 16px 28px');
}

/* ------------------------------------------------------------ DECISION: ECONOMICS */
const ECON_DEFAULTS = { procedure_cost_usd: 8000, take_rate_pct: 8, cac_usd: 150, consult_to_travel_pct: 20, service_cost_per_case_usd: 200, cases_per_month: 10, monthly_fixed_costs_usd: 2000 };
function renderEconomics() {
  const saved = STATE.economics.find(m => m.model_name === 'base');
  const a = { ...ECON_DEFAULTS, ...(saved?.assumptions || {}) };
  const revenuePerCase = Math.round(a.procedure_cost_usd * (a.take_rate_pct / 100));
  const cacPerCase = a.consult_to_travel_pct ? Math.round(a.cac_usd / (a.consult_to_travel_pct / 100)) : 0;
  const grossMargin = revenuePerCase - a.service_cost_per_case_usd;
  const netMargin = grossMargin - cacPerCase;
  const leadsNeeded = a.consult_to_travel_pct ? Math.round(1 / (a.consult_to_travel_pct / 100)) : 0;
  const monthlyCac = cacPerCase * a.cases_per_month;
  const monthlyRevenue = revenuePerCase * a.cases_per_month;
  const monthlyNet = netMargin * a.cases_per_month - a.monthly_fixed_costs_usd;
  const money = (n) => (n < 0 ? `−$${Math.abs(n).toLocaleString()}` : `$${n.toLocaleString()}`);

  const breakpoints = [
    { ok: cacPerCase <= revenuePerCase, label: 'CAC per closed case vs revenue per case', detail: `CAC ${money(cacPerCase)} ${cacPerCase > revenuePerCase ? '>' : '≤'} revenue ${money(revenuePerCase)}`, pass: cacPerCase <= revenuePerCase, code: '①' },
    { ok: a.consult_to_travel_pct >= 15, label: 'Consult → travel conversion ≥ 15%', detail: `conversion ${a.consult_to_travel_pct}% ${a.consult_to_travel_pct >= 15 ? '≥' : '<'} 15`, pass: a.consult_to_travel_pct >= 15, code: '②' },
    { ok: a.service_cost_per_case_usd <= 300, label: 'Service cost per case ≤ $300', detail: `service ${money(a.service_cost_per_case_usd)} ${a.service_cost_per_case_usd <= 300 ? '≤' : '>'} 300`, pass: a.service_cost_per_case_usd <= 300, code: '③' },
  ];
  const bpCard = h('div', { class: 'card', style: 'padding:15px;margin-bottom:14px;' }, [
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:10px;', text: 'Break-point checks · any red kills patient-pays' }),
    ...breakpoints.map((b, i) => h('div', { style: `display:flex;align-items:flex-start;gap:10px;padding:8px 0;${i < 2 ? 'border-bottom:1px solid #EFE9DD;' : ''}` }, [
      chip(b.pass ? '✓ PASS' : '✗ BROKEN', b.pass ? 'sage' : 'rose'),
      h('div', { style: 'min-width:0;' }, [
        h('div', { style: 'font-size:12.5px;line-height:17px;color:#1F2A28;', text: `${b.code} ${b.label}` }),
        h('div', { class: 'num', style: 'font-size:11px;color:#6E6A5E;margin-top:2px;', text: b.detail }),
      ]),
    ])),
  ]);

  const assumptions = [
    ['Procedure cost', money(a.procedure_cost_usd)], ['Take rate', `${a.take_rate_pct}%`], ['CAC / lead', money(a.cac_usd)],
    ['Consult → travel', `${a.consult_to_travel_pct}%`], ['Service / case', money(a.service_cost_per_case_usd)],
    ['Cases / mo', String(a.cases_per_month)], ['Fixed / mo', money(a.monthly_fixed_costs_usd)],
  ];
  const outputs = [
    ['Revenue / case', money(revenuePerCase), '#1F2A28'], ['CAC / closed', money(cacPerCase), cacPerCase > revenuePerCase ? '#9A3F3F' : '#1F2A28'],
    ['Gross margin', money(grossMargin), grossMargin < 0 ? '#9A3F3F' : '#1F2A28'], ['Net margin', money(netMargin), netMargin < 0 ? '#9A3F3F' : '#1F2A28'],
    ['Leads needed', String(leadsNeeded), '#1F2A28'], ['Monthly CAC', money(monthlyCac), '#1F2A28'],
    ['Monthly revenue', money(monthlyRevenue), '#1F2A28'], ['Monthly net', money(monthlyNet), monthlyNet < 0 ? '#9A3F3F' : '#1F2A28'],
  ];
  const kvCard = (title, rows) => h('div', { class: 'card', style: 'padding:15px;' }, [
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:10px;', text: title }),
    ...rows.map(([l, v, color]) => h('div', { style: 'display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:12px;' }, [
      h('span', { style: 'color:#4A5651;', text: l }),
      h('span', { class: 'num', style: `font-weight:500;${color ? `color:${color};` : ''}`, text: v }),
    ])),
  ]);

  const editBtn = h('button', { class: 'btn btn-line', style: 'width:100%;height:42px;font-size:13px;', onclick: () => openEconForm(a), text: 'Edit assumptions' });

  return screenWrap([
    bpCard,
    h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px;' }, [kvCard('Assumptions', assumptions), kvCard('Derived outputs', outputs)]),
    editBtn,
  ], '16px 16px 28px');
}

/* Editable assumptions — a form sheet of number fields; Save recomputes the
   break-points and outputs (desktop parity). */
const ECON_FIELDS = [
  ['procedure_cost_usd', 'Procedure cost (USD)'], ['take_rate_pct', 'Take rate (%)'], ['cac_usd', 'CAC per lead (USD)'],
  ['consult_to_travel_pct', 'Consult → travel (%)'], ['service_cost_per_case_usd', 'Service cost per case (USD)'],
  ['cases_per_month', 'Cases per month'], ['monthly_fixed_costs_usd', 'Monthly fixed costs (USD)'],
];
function openEconForm(current) {
  // Blank (not the literal "undefined") for a missing assumption, so an absent
  // key doesn't display "undefined" and then silently save as 0.
  const form = {}; ECON_FIELDS.forEach(([k]) => { form[k] = current[k] == null ? '' : String(current[k]); });
  UI.econForm = form;
  setState({ formType: 'econ', editId: null, saving: false });
}
function econFormBody() {
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px;' }, ECON_FIELDS.map(([k, label]) =>
    fieldWrap(label, (() => {
      const el = h('input', { class: 'field', type: 'number', value: UI.econForm[k] ?? '', inputmode: 'decimal' });
      el.addEventListener('input', (e) => { UI.econForm[k] = e.target.value; });
      return el;
    })())));
}
async function saveEconForm() {
  if (UI.saving) return;
  const assumptions = {};
  ECON_FIELDS.forEach(([k]) => { assumptions[k] = Number(UI.econForm[k]) || 0; });
  UI.saving = true; render();
  try {
    const saved = STATE.economics.find(m => m.model_name === 'base');
    if (saved) await data.update('economics', saved.id, { assumptions });
    else await data.create('economics', { model_name: 'base', assumptions });
    STATE.economics = await data.list('economics');
    UI.saving = false; UI.formType = null; render();
  } catch (e) { UI.saving = false; render(); alert('Save failed: ' + e.message); }
}

/* ------------------------------------------------------------ DECISION: ALT MODELS */
function renderAlt() {
  const cards = STATE.segment_cards.filter(c => c.card_type === 'alt_model');
  if (!cards.length) {
    return screenWrap([emptyCard('No alternate models yet', 'If patient-pays breaks at its economics, capture the fallback business models here.')]);
  }
  const models = cards.map(c => ({ name: c.name, who: c.who || '', how: c.how || '', revenue: c.revenue || '', pros: c.pros || '', cons: c.cons || '' }));
  const el = models.map(m => h('div', { class: 'card', style: 'padding:15px;' }, [
    h('div', { class: 'serif', style: 'font-size:16px;margin-bottom:8px;', text: m.name }),
    h('div', { style: 'margin-bottom:10px;' }, [chip(m.who, 'info')]),
    ...[['How it works', m.how], ['Revenue', m.revenue], ['Pros', m.pros], ['Cons', m.cons]].map(([label, body]) => h('div', {}, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:3px;margin-top:0;', text: label }),
      h('div', { style: `font-size:12.5px;line-height:18px;color:${label === 'How it works' || label === 'Revenue' ? '#1F2A28' : '#4A5651'};margin-bottom:9px;`, text: body }),
    ])),
  ]));
  return screenWrap(el, '16px 16px 28px', '12px');
}

/* ------------------------------------------------------------ DECISION: FIELD CHECKS */
function renderFieldChecks() {
  const rows = STATE.field_checks;
  const unverified = rows.filter(r => !r.confirmed).length;
  const kids = [];
  if (unverified) kids.push(h('div', { class: 'banner honey', style: 'margin-bottom:12px;', text: `${unverified} assumption${unverified === 1 ? '' : 's'} still unverified — each one is model risk.` }));
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:10px;' });
  rows.forEach(f => {
    const tone = f.confirmed ? 'sage' : 'honey';
    list.appendChild(h('button', { class: 'card', style: 'padding:14px 15px;text-align:left;cursor:pointer;display:block;width:100%;', onclick: () => openForm('check', f) }, [
      h('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;' }, [
        h('div', { style: 'font-size:13px;line-height:18px;color:#1F2A28;font-weight:500;', text: f.assumption || '' }),
        chip(f.confirmed ? 'Confirmed' : 'Unconfirmed', tone, 'sm'),
      ]),
      f.notes ? h('div', { style: 'font-size:12px;line-height:17px;color:#6E6A5E;margin-top:6px;', text: f.notes }) : null,
      h('div', { style: 'font-size:11px;color:#6E6A5E;margin-top:6px;', text: [f.confirmed_by && `by ${f.confirmed_by}`, f.confirmed_date && fmtDay(f.confirmed_date)].filter(Boolean).join(' · ') }),
    ]));
  });
  kids.push(rows.length ? list : emptyCard('No field checks yet', 'Log the fragile assumptions the model rests on, and verify them.'));
  return screenWrap(kids, '16px 16px 28px');
}

/* ------------------------------------------------------------ DECISION: MVP */
function renderMvp() {
  const fields = [
    'One buyer', 'One pain', 'One journey step', 'One channel', 'One success metric', 'Explicitly out of scope',
  ];
  const card = h('div', { class: 'card', style: 'padding:16px;display:flex;flex-direction:column;gap:14px;' }, [
    ...fields.map(label => h('div', {}, [
      h('div', { class: 'micro', style: 'color:#96501F;margin-bottom:4px;', text: label }),
      h('div', { style: 'font-size:12.5px;line-height:18px;color:#6E6A5E;', text: 'Not yet defined — draft from the evidence, then narrow to one of each.' }),
    ])),
    h('button', { class: 'btn btn-primary tall', onclick: () => setState({ assistantOpen: true }), text: 'Draft scope from evidence' }),
  ]);
  return screenWrap([
    h('div', { style: 'font-size:12px;color:#4A5651;margin-bottom:12px;', text: 'The narrowest thing to build first, if the verdict is GO — one of each.' }),
    card,
  ], '16px 16px 28px');
}

/* ------------------------------------------------------------ DECISION: TESTS */
function renderTests() {
  const tests = [
    { name: 'Fake-door landing test', description: 'A one-page offer for diaspora coordination; measure real intent before building anything.', metrics: ['Unique visitors', 'Email sign-ups', 'Sign-up rate', 'Cost per sign-up'] },
    { name: 'Concierge pilot (5 real cases)', description: 'Hand-run five real coordination cases end-to-end; measure whether families pay and what it costs to serve.', metrics: ['Cases served', 'Paid conversions', 'Avg price paid', 'Hours per case'] },
  ];
  const el = tests.map(t => h('div', { class: 'card', style: 'padding:15px;' }, [
    h('div', { class: 'serif', style: 'font-size:15.5px;line-height:20px;margin-bottom:6px;', text: t.name }),
    h('div', { style: 'font-size:12.5px;line-height:18px;color:#4A5651;margin-bottom:12px;', text: t.description }),
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:6px;', text: 'Metrics' }),
    ...t.metrics.map((m, i) => h('div', { style: `display:flex;justify-content:space-between;gap:8px;padding:7px 0;${i < t.metrics.length - 1 ? 'border-bottom:1px solid #EFE9DD;' : ''}font-size:12.5px;` }, [
      h('span', { style: 'color:#1F2A28;', text: m }), h('span', { class: 'num', style: 'color:#6E6A5E;', text: '—' }),
    ])),
  ]));
  return screenWrap(el, '16px 16px 28px', '12px');
}

/* ------------------------------------------------------------ MORE: LIST */
function moreItem(label, sub, onclick, last) {
  return h('button', { class: 'rowbtn', style: `padding:14px 15px;display:flex;align-items:center;justify-content:space-between;gap:10px;${last ? 'border-bottom:none;' : ''}`, onclick }, [
    h('div', {}, [
      h('div', { style: 'font-size:14px;font-weight:500;color:#1F2A28;', text: label }),
      h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-top:2px;', text: sub }),
    ]),
    h('span', { style: 'color:#96501F;font-size:18px;', text: '›' }),
  ]);
}
function renderMoreList() {
  const open = (v) => setState({ moreScreen: v });
  const group = (label, items) => frag(
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:8px;', text: label }),
    h('div', { class: 'listcard', style: 'margin-bottom:18px;' }, items),
  );
  return screenWrap([
    ...group('Reference', [
      moreItem('Interview scripts', 'Versioned questions, one per segment', () => open('scripts')),
      moreItem('Outreach templates', 'Ready-to-send messages', () => open('templates')),
      moreItem('Operating manual', 'How we run this project', () => open('manual'), true),
    ]),
    ...group('Workspace', [
      moreItem('Reports', 'Print-ready, from live data', () => open('reports')),
      moreItem('Documents', 'Every file the field produced', () => open('documents'), true),
    ]),
    ...group('Settings', [moreItem('Team & workspace', 'Names, data, phase', () => open('settings'), true)]),
    h('div', { style: 'text-align:center;margin-top:4px;' }, [
      h('div', { style: 'display:inline-flex;align-items:center;gap:8px;' }, [
        h('div', { class: 'serif', style: 'width:26px;height:26px;border-radius:8px;background:#3F5A4D;color:#fff;display:flex;align-items:center;justify-content:center;', text: 'M' }),
        h('span', { class: 'serif', style: 'font-size:14px;', text: 'MedTerminal' }),
      ]),
      h('div', { style: 'font-size:11px;color:#6E6A5E;margin-top:6px;', text: 'Research Workspace · v0.4' }),
    ]),
  ], '18px 16px 28px');
}

/* ------------------------------------------------------------ MORE: SCRIPTS */
function renderScripts() {
  const scripts = STATE.scripts;
  const bySeg = {};
  scripts.forEach(s => { const cur = bySeg[s.script_name]; if (!cur || (s.version || 1) > (cur.version || 1)) bySeg[s.script_name] = s; });
  const names = SEGMENT_NAMES.filter(n => bySeg[n]);
  if (!names.length) return screenWrap([emptyCard('No scripts yet', 'Starter scripts seed on first run.')]);
  const seg = names.includes(UI.scriptSeg) ? UI.scriptSeg : names[0];
  const cur = bySeg[seg];
  const tabs = h('div', { class: 'mtscroll', style: 'display:flex;gap:7px;overflow-x:auto;padding:14px 16px 4px;' });
  let activeTab = null;
  names.forEach(n => {
    const btn = h('button', { class: `pill ${n === seg ? 'active' : ''}`, onclick: () => setState({ scriptSeg: n }), text: n });
    if (n === seg) activeTab = btn;
    tabs.appendChild(btn);
  });
  keepActiveInView(tabs, activeTab); // keep the selected segment in frame
  const sections = Array.isArray(cur.content) ? cur.content : [];
  const body = h('div', { style: 'padding:8px 16px 28px;' }, [
    h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-bottom:12px;', text: `Version ${cur.version || 1}${cur.revert_note ? ` · ${cur.revert_note}` : ''}` }),
    h('div', { class: 'card', style: 'padding:16px;display:flex;flex-direction:column;gap:14px;' }, sections.map(sec => h('div', {}, [
      h('div', { class: 'micro', style: 'color:#96501F;margin-bottom:4px;', text: sec.title || '' }),
      h('div', { style: 'font-size:12.5px;line-height:18px;color:#1F2A28;', text: sec.body || sec.text || '' }),
    ]))),
  ]);
  return h('div', { class: 'screen' }, [tabs, body]);
}

/* ------------------------------------------------------------ MORE: TEMPLATES */
function renderTemplates() {
  const templates = STATE.scripts.filter(s => s.script_type === 'outreach_template');
  const list = templates.length ? templates : [];
  const kids = [h('div', { style: 'font-size:12px;line-height:17px;color:#4A5651;margin-bottom:14px;', text: 'Ready to send with light personalisation. Replace [name] / [mutual contact] / [X].' })];
  const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:12px;' });
  (list.length ? list : []).forEach(t => {
    const c = t.content || {};
    const card = h('div', { class: 'card', style: 'padding:15px;' }, [
      h('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;' }, [
        h('div', { class: 'serif', style: 'font-size:15px;line-height:20px;', text: t.script_name || c.name || 'Template' }),
        h('button', { class: 'btn btn-line', style: 'height:30px;padding:0 12px;font-size:11.5px;border-radius:9px;', onclick: async (e) => { try { await navigator.clipboard.writeText(templateText(t)); e.target.textContent = 'Copied!'; } catch { e.target.textContent = 'Copy failed'; } setTimeout(() => { e.target.textContent = 'Copy'; }, 1500); }, text: 'Copy' }),
      ]),
      c.subject ? h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-bottom:8px;' }, [h('strong', { style: 'color:#4A5651;', text: 'Subject: ' }), c.subject]) : null,
      h('div', { style: 'font-size:12.5px;line-height:18px;color:#1F2A28;white-space:pre-line;', text: c.body || '' }),
      c.ask ? h('div', { style: 'font-size:11.5px;color:#96501F;margin-top:10px;' }, [h('strong', { text: 'Ask: ' }), c.ask]) : null,
    ]);
    wrap.appendChild(card);
  });
  kids.push(list.length ? wrap : emptyCard('No templates yet', 'Outreach templates seed on first run.'));
  return screenWrap(kids, '14px 16px 28px');
}
function templateText(t) { const c = t.content || {}; return (c.subject ? `Subject: ${c.subject}\n\n` : '') + (c.body || '') + (c.ask ? `\n\nAsk: ${c.ask}` : ''); }

/* ------------------------------------------------------------ MORE: MANUAL */
function renderManual() {
  const secs = STATE.segment_cards.filter(c => c.card_type === 'manual');
  const list = secs.length ? secs.map(s => ({ h: s.name, body: s.body || '' })) : MANUAL_FALLBACK;
  return screenWrap(list.map(m => h('div', {}, [
    h('div', { class: 'serif', style: 'font-size:16px;color:#3F5A4D;margin-bottom:6px;', text: m.h }),
    h('div', { style: 'font-size:13px;line-height:20px;color:#1F2A28;white-space:pre-line;', text: m.body }),
  ])), '16px 16px 28px', '18px');
}
const MANUAL_FALLBACK = [
  { h: 'What this project is', body: 'A six-phase qualitative programme deciding whether a patient-side medical-tourism service (Kenya → India) is viable enough to build. This app is the tool that runs the decision, not the product itself.' },
  { h: 'The same-day tag rule', body: 'Every interview must be tagged into the theme matrix the same day it happens. Untagged interviews are lost interviews — the red warnings never get weakened.' },
  { h: 'Who does what', body: 'Young leads analysis and synthesis. Simon runs the field interviews. Owner and interviewer dropdowns come from these two names plus "Joint".' },
  { h: 'How decisions get made', body: 'Hypotheses, kill criteria, and evidence links are first-class records. The AI argues; humans decide. Any AI-proposed write goes through human confirmation.' },
  { h: 'Data & privacy', body: 'De-identify everything — initials, not names. Never upload consent forms or identity documents. The app is the sole repository the assistant can search.' },
  { h: 'Phases & gating', body: 'The nav unlocks each group as the programme advances. The current phase is set in Settings.' },
];

/* ------------------------------------------------------------ MORE: REPORTS */
/* Report templates — deterministic generators that pull live numbers from the
   workspace (the AI never invents figures). Each returns the canonical report
   shape { title, sections:[{ title, body }] } so a report is viewable on either
   front end. */
function todayLong() { const d = new Date(); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function topThemesByCount(n = 5) { return rankThemes(STATE.matrix).slice().sort((a, b) => b.count - a.count).slice(0, n); }

function buildWeekly() {
  const recent = STATE.interviews.filter(r => (daysSince(r.date) ?? 99) <= 7);
  const overdue = STATE.interviews.filter(isOverdue);
  const stalled = STATE.outreach.filter(isStalled);
  const booked = STATE.outreach.filter(r => r.status === 'Booked');
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const tagged = STATE.interviews.length ? Math.round(STATE.interviews.filter(isTagged).length / STATE.interviews.length * 100) : null;
  const taggedText = tagged == null ? 'n/a — no interviews logged yet' : `${tagged}% (the hard rule is 100%)`;
  return { title: `Weekly field update — ${todayLong()}`, sections: [
    { title: 'Where we are', body: `Phase ${CURRENT_PHASE} — ${phase?.long || ''}. ${STATE.interviews.length} interviews logged, ${STATE.matrix.length} quotes tagged, ${STATE.outreach.length} contacts in outreach. Same-day tagging: ${taggedText}.` },
    { title: "This week's interviews", body: recent.length ? recent.map(r => `- ${r.interview_id} · ${r.segment} · ${fmtDay(r.date)} — ${r.brief_topic || 'no topic recorded'}`).join('\n') : 'No interviews in the last 7 days.' },
    { title: 'Top themes so far', body: topThemesByCount().map((t, i) => `${i + 1}. ${t.tag} (${t.count} mentions, ${t.wtpRate}% WTP)`).join('\n') || 'No themes tagged yet.' },
    { title: 'Blockers', body: [
      overdue.length ? `Same-day-tag rule breached: ${overdue.map(r => r.interview_id).join(', ')} untagged past 24h.` : null,
      stalled.length ? `${stalled.length} outreach contact(s) stalled: ${stalled.map(r => r.name).join(', ')}.` : null,
    ].filter(Boolean).join('\n') || 'No blockers.' },
    { title: 'Next week', body: booked.length ? `Booked interviews to run: ${booked.map(r => `${r.name} (${r.segment})`).join(', ')}.` : 'No interviews booked — priority is converting replied contacts to bookings.' },
  ] };
}

function buildPhaseExit() {
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const criteria = STATE.deliverables.filter(d => d.phase === CURRENT_PHASE);
  const done = criteria.filter(d => d.status === 'Complete' || d.status === 'Done');
  const blocked = criteria.filter(d => d.status === 'Blocked');
  const verdict = blocked.length ? 'HOLD — blocked criteria must clear first'
    : (criteria.length && done.length === criteria.length) ? 'READY to exit'
    : 'EXTEND — criteria still open';
  return { title: `Phase ${CURRENT_PHASE} exit brief — ${phase?.long || ''}`, sections: [
    { title: 'Recommendation', body: verdict },
    { title: 'Exit criteria', body: criteria.map(d => `- [${d.status}] ${d.deliverable}${d.evidence ? ` — ${d.evidence}` : ''}`).join('\n') || 'No criteria defined for this phase.' },
    { title: 'Segment coverage', body: SEGMENTS.map(s => `- ${s.name}: ${STATE.interviews.filter(r => r.segment === s.name).length}/${s.target} interviews`).join('\n') },
    { title: 'What remains uncertain', body: STATE.field_checks.filter(r => !r.confirmed).map(r => `- ${r.assumption}`).join('\n') || 'No open field checks.' },
  ] };
}

function buildInvestorMemo() {
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const wtp = STATE.matrix.filter(r => r.wtp === 'Y' && +r.severity >= 4);
  const killed = STATE.kill_list;
  return { title: `MedTerminal — research memo, ${todayLong()}`, sections: [
    { title: 'Executive summary', body: `A six-phase discovery programme testing whether a patient-side medical-travel service for the Kenya→India corridor is worth building. Currently Phase ${CURRENT_PHASE} (${phase?.long || ''}) with ${STATE.interviews.length} interviews across ${new Set(STATE.interviews.map(r => r.segment)).size} segments.` },
    { title: 'The wedge being tested', body: 'Patient-side coordination for Kenyan families seeking treatment in India: discovery, trustworthy quotes, document handling, and money movement — the work currently done informally by brokers with opaque commissions.' },
    { title: 'Strongest willingness-to-pay evidence', body: wtp.slice(0, 5).map(r => `"${(r.quote || '').slice(0, 200)}" — ${r.segment}, ${r.interview_id}`).join('\n\n') || 'Evidence still accumulating.' },
    { title: 'What we have ruled out', body: killed.length ? killed.map(k => `- ${k.hypothesis || '—'}${k.killed_date ? ` (killed ${fmtDay(k.killed_date)})` : ''}`).join('\n') : 'Nothing killed yet.' },
    { title: 'Honest caveats', body: 'Sample sizes are small and skewed to accessible contacts. Willingness-to-pay statements are unvalidated by actual payment. Economics are modelled, not observed.' },
  ] };
}

function buildDossier() {
  const hyps = [...STATE.hypotheses].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const line = (hy) => {
    const ls = STATE.evidence_links.filter(l => l.hypothesis_id === hy.id);
    const s = ls.filter(l => l.direction === 'supports').length;
    const c = ls.filter(l => l.direction === 'contradicts').length;
    return `${hy.code} · ${hy.title} [${hy.status || 'open'}] — ${s} supporting, ${c} contradicting\n${hy.description || ''}`;
  };
  const a = latestAssessment();
  return { title: `Evidence dossier — ${todayLong()}`, sections: [
    { title: 'Current leaning', body: a ? `${a.leaning} (assessed ${fmtDay(a.created_at)}). Advisory — the humans hold the verdict.` : 'No AI assessment has been run yet.' },
    { title: 'Buyer hypotheses', body: hyps.filter(x => x.kind === 'buyer_hypothesis').map(line).join('\n\n') || 'No hypotheses defined.' },
    { title: 'Kill criteria', body: hyps.filter(x => x.kind === 'kill_criterion').map(line).join('\n\n') || 'No kill criteria defined.' },
    { title: 'Evidence base', body: `${STATE.evidence_links.length} evidence link(s) across ${STATE.matrix.length} tagged quotes and ${STATE.interviews.length} interviews.` },
  ] };
}

const REPORT_DEFS = [
  { type: 'weekly_status', name: 'Weekly field update', description: 'What moved this week — interviews, themes, and what needs attention.', build: buildWeekly },
  { type: 'phase_exit', name: 'Phase-exit brief', description: 'Did we meet the exit criteria for the current phase? Evidence attached.', build: buildPhaseExit },
  { type: 'investor_briefing', name: 'Investor / partner memo', description: 'The decision so far, framed for someone who was not in the room.', build: buildInvestorMemo },
  { type: 'evidence_dossier', name: 'Full evidence dossier', description: 'Every hypothesis, kill criterion, and the evidence behind them.', build: buildDossier },
];

/* Render a saved or draft report as a read sheet body. Deterministic template
   sections keep their exact layout via pre-line text; the assistant-drafted
   narrative goes through the markdown renderer so headings/bullets render
   instead of leaking "#". Model output never touches innerHTML. */
function reportReader(report) {
  const content = report.content || {};
  const wrap = h('div', {});
  wrap.appendChild(h('div', { style: 'font-size:11px;color:#6E6A5E;margin-bottom:6px;', text: `Generated ${fmtDay(report.created_at)}${content.assistant_drafted ? ' · assistant-drafted, human-reviewed' : ' · from live data'}` }));
  (content.sections || []).forEach(s => {
    wrap.appendChild(h('div', { class: 'micro', style: 'color:#96501F;margin:16px 0 6px;', text: s.title || '' }));
    if (!s.body) return;
    if (/^Narrative/.test(s.title || '')) wrap.appendChild(renderRich(s.body));
    else wrap.appendChild(h('div', { style: 'font-size:13px;line-height:20px;color:#1F2A28;white-space:pre-line;', text: s.body }));
  });
  return wrap;
}

async function generateFromTemplate(def) {
  if (UI.busy) return;
  setState({ busy: `report:tpl:${def.type}` });
  try {
    const content = def.build();
    await data.create('reports', { report_type: def.type, title: content.title, content, version: 1 });
    STATE.reports = await data.list('reports');
    UI.busy = null;
    openReader(content.title, () => reportReader({ content, created_at: todayISO() }));
  } catch (e) { UI.busy = null; render(); alert('Generate failed: ' + e.message); }
}

/* Assistant draft: narrative from the drafting endpoint, every data section from
   the deterministic template. Lands in a preview — nothing is saved until the
   human taps Save (per the AI-write rule).
   Guard: with no interviews logged, a "narrative" can only be invented, so we
   refuse rather than let the assistant fabricate. The template path (which
   honestly reports the emptiness) stays available. */
async function draftReportWithAssistant(def) {
  if (!aiAvailable || UI.busy) return;
  if (!STATE.interviews.length) {
    alert('Not enough field data yet.\n\nThere are no interviews logged, so the assistant would have to invent a narrative. Log interviews and tag quotes first, or use “From template” for an honest data-only report.');
    return;
  }
  setState({ busy: `report:draft:${def.type}` });
  try {
    const content = def.build();
    const { text } = await draftSectionRequest({
      section_label: def.name,
      placeholder: def.description,
      doc_kind: `the narrative summary of a "${def.name}" for someone who wasn't in the room`,
      phase: CURRENT_PHASE, segments: SEGMENTS, localData: aiDataSlices(STATE),
    });
    content.sections = [{ title: 'Narrative — assistant-drafted, human-reviewed', body: (text || '').trim() }, ...content.sections];
    content.assistant_drafted = true;
    UI.busy = null;
    openReportPreview(def, content);
  } catch (e) { UI.busy = null; render(); alert('Draft failed: ' + e.message); }
}

function openReportPreview(def, content) {
  openReader(content.title, () => h('div', {}, [
    h('div', { class: 'banner honey', style: 'margin-bottom:12px;', text: 'Assistant draft — review, then save. Nothing is stored until you save.' }),
    reportReader({ content, created_at: todayISO() }),
    h('div', { style: 'display:flex;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid #EFE9DD;' }, [
      h('button', { class: 'btn btn-primary tall', style: 'flex:1;', onclick: async () => {
        try {
          await data.create('reports', { report_type: def.type, title: content.title, content, version: 1 });
          STATE.reports = await data.list('reports');
          closeReader();
        } catch (e) { alert('Save failed: ' + e.message); }
      }, text: 'Save report' }),
      h('button', { class: 'btn btn-line tall', style: 'flex:0 0 auto;', onclick: closeReader, text: 'Discard' }),
    ]),
  ]));
}

function renderReports() {
  // Busy is encoded "report:<action>:<type>" so only the button that was
  // actually tapped shows "Working…" — not every card.
  const rb = String(UI.busy || '').split(':');
  const anyBusy = rb[0] === 'report';
  const busyAction = anyBusy ? rb[1] : null;
  const busyType = anyBusy ? rb[2] : null;
  const gen = h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-bottom:20px;' }, REPORT_DEFS.map(def => {
    const draftWorking = anyBusy && busyAction === 'draft' && busyType === def.type;
    const tplWorking = anyBusy && busyAction === 'tpl' && busyType === def.type;
    return h('div', { class: 'card', style: 'padding:15px;' }, [
      h('div', { class: 'serif', style: 'font-size:15px;margin-bottom:4px;', text: def.name }),
      h('div', { style: 'font-size:12px;line-height:17px;color:#4A5651;margin-bottom:11px;', text: def.description }),
      h('div', { style: 'display:flex;gap:8px;' }, [
        aiAvailable
          ? h('button', { class: 'btn btn-primary', style: `height:36px;${anyBusy ? 'opacity:.6;' : ''}`, disabled: anyBusy ? '' : null, onclick: () => draftReportWithAssistant(def), text: draftWorking ? 'Working…' : 'Draft with assistant' })
          : null,
        h('button', { class: `btn ${aiAvailable ? 'btn-line' : 'btn-primary'}`, style: `height:36px;${anyBusy ? 'opacity:.6;' : ''}`, disabled: anyBusy ? '' : null, onclick: () => generateFromTemplate(def), text: tplWorking ? 'Working…' : 'From template' }),
      ]),
    ]);
  }));
  const generated = STATE.reports;
  return screenWrap([
    aiAvailable ? null : h('div', { class: 'banner info', style: 'margin-bottom:14px;', text: 'Reports generate from live data using structured templates. Assistant-drafted narrative becomes available when the assistant is connected.' }),
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:8px;', text: 'Generate a report' }),
    gen,
    h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:8px;', text: 'Generated reports' }),
    generated.length
      ? h('div', { class: 'listcard' }, [...generated].reverse().map(r => h('div', { class: 'row', style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;' }, [
          h('div', { style: 'min-width:0;' }, [
            h('div', { style: 'font-size:13.5px;font-weight:500;color:#1F2A28;', text: (r.content && r.content.title) || r.title || r.report_type }),
            h('div', { style: 'font-size:11px;color:#6E6A5E;margin-top:3px;', text: fmtDay(r.created_at) }),
          ]),
          h('button', { class: 'btn btn-line', style: 'height:30px;padding:0 12px;font-size:11.5px;border-radius:9px;flex-shrink:0;', onclick: () => openReader((r.content && r.content.title) || r.title || 'Report', () => reportReader(r)), text: 'View' }),
        ])))
      : h('div', { class: 'card', style: 'padding:40px 24px;text-align:center;' }, [
          h('div', { class: 'serif', style: 'font-size:16px;color:#4A5651;', text: 'No reports generated yet' }),
          h('div', { style: 'font-size:12.5px;color:#6E6A5E;margin-top:4px;', text: 'Generate one above — it pulls live numbers from the workspace.' }),
        ]),
  ], '16px 16px 28px');
}

/* ------------------------------------------------------------ MORE: DOCUMENTS */
function renderDocuments() {
  const docs = STATE.documents;
  const list = h('div', { class: 'listcard' });
  docs.forEach(d => list.appendChild(h('div', { class: 'row', style: 'padding:14px 15px;' }, [
    h('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;' }, [
      h('div', { style: 'min-width:0;' }, [
        h('div', { style: 'font-size:13.5px;font-weight:500;color:#1F2A28;', text: d.filename || '—' }),
        h('div', { style: 'font-size:11px;color:#6E6A5E;margin-top:3px;', text: [d.segment, d.interview_id, fmtDay(d.created_at)].filter(Boolean).join(' · ') }),
      ]),
      h('button', { class: 'btn btn-line', style: 'height:36px;padding:0 13px;font-size:11.5px;border-radius:9px;flex-shrink:0;', onclick: () => viewDocument(d), text: 'View' }),
    ]),
    d.description ? h('div', { style: 'font-size:12px;line-height:17px;color:#4A5651;margin-top:8px;', text: d.description }) : null,
  ])));
  return screenWrap([
    h('div', { class: 'banner info', style: 'margin-bottom:14px;', text: 'Upload field notes, price lists, photos and scans. De-identify first (initials, not names). Never upload consent forms or identity documents.' }),
    docs.length ? list : emptyCard('No documents yet', 'Upload the files the field produced — they become searchable evidence.'),
  ], '14px 16px 28px');
}

/* ------------------------------------------------------------ MORE: SETTINGS */
function renderSettings() {
  const team = getTeam();
  const dataMode = isLocalMode ? 'Local demo' : 'Live backend';
  const ai = aiAvailable ? 'Connected via worker' : 'Off';
  const infoRow = (label, sub) => h('div', {}, [
    h('div', { style: 'font-size:11.5px;color:#4A5651;margin-bottom:4px;', text: label }),
    h('div', { style: 'height:42px;border-radius:10px;border:1px solid #E5DDD0;background:#fff;display:flex;align-items:center;padding:0 12px;font-size:14px;', text: sub }),
  ]);
  return screenWrap([
    h('div', { class: 'card', style: 'padding:16px;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;', text: 'Team' }),
      h('div', { style: 'font-size:12.5px;line-height:18px;color:#4A5651;margin:6px 0 14px;', text: 'Display names used everywhere — interviewer and owner dropdowns. Changes apply immediately.' }),
      h('div', { style: 'margin-bottom:12px;' }, [infoRow('Project lead (analysis & synthesis)', team.lead)]),
      infoRow('Field coordinator (runs the interviews)', team.field),
    ]),
    h('div', { class: 'card', style: 'padding:16px;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:6px;', text: 'Current phase' }),
      h('div', { class: 'serif', style: 'font-size:16px;', text: `Phase ${CURRENT_PHASE} — ${(PHASES.find(p => p.n === CURRENT_PHASE) || {}).long || ''}` }),
      h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-top:6px;', text: 'The nav unlocks the matching group automatically as phases advance.' }),
    ]),
    h('div', { class: 'card', style: 'padding:16px;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:10px;', text: 'Data' }),
      h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;' }, [h('span', { style: 'font-size:12.5px;color:#4A5651;', text: 'Mode:' }), chip(dataMode, 'sage', 'sm')]),
      h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [h('span', { style: 'font-size:12.5px;color:#4A5651;', text: 'Assistant:' }), chip(ai, aiAvailable ? 'sage' : 'line', 'sm')]),
    ]),
    h('div', { class: 'card', style: 'padding:16px;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:6px;', text: 'Assistant API key' }),
      h('div', { style: 'font-size:12.5px;line-height:18px;color:#4A5651;margin-bottom:12px;', text: 'The assistant runs on your Claude API key, held on the server and shared by the whole team. Set or replace it on the admin page.' }),
      h('a', { class: 'btn btn-primary', style: 'width:100%;height:42px;font-size:13px;text-decoration:none;', href: './admin.html', text: 'Manage API key' }),
    ]),
    h('div', { class: 'card', style: 'padding:16px;' }, [
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:6px;', text: 'Data management' }),
      h('div', { style: 'font-size:12.5px;line-height:18px;color:#4A5651;margin-bottom:12px;', text: 'Back up, restore, or reset the workspace. Every export is a single JSON file.' }),
      h('button', { class: 'btn btn-line', style: 'width:100%;height:42px;font-size:13px;color:#1F2A28;', onclick: (e) => exportEverything(e.currentTarget), text: 'Export everything (backup)' }),
    ]),
  ], '16px 16px 28px', '14px');
}

/* ----------------------------------------------------------------- helpers */
function emptyCard(title, sub) {
  return h('div', { class: 'card', style: 'padding:40px 24px;text-align:center;' }, [
    h('div', { class: 'serif', style: 'font-size:16px;color:#4A5651;', text: title }),
    h('div', { style: 'font-size:12.5px;color:#6E6A5E;margin-top:4px;', text: sub }),
  ]);
}

/* =====================================================================
   INTERVIEW DETAIL OVERLAY
   ===================================================================== */
function renderDetail() {
  const r = STATE.interviews.find(x => x.id === UI.selectedId);
  if (!r) return h('div');
  const tone = isTagged(r) ? 'sage' : 'rose';
  const overlay = h('div', { class: 'overlay detail' }, [
    h('div', { class: 'overlay-head', style: 'position:relative;' }, [
      h('button', { class: 'btn-link', style: 'display:block;margin-bottom:8px;', onclick: () => setState({ selectedId: null }), text: '‹ Interviews' }),
      h('span', { class: `chip ${tone}`, style: 'position:absolute;top:30px;right:16px;', text: isTagged(r) ? 'tagged' : 'untagged' }),
      h('div', { class: 'serif', style: 'font-size:20px;line-height:25px;padding-right:80px;', text: `${r.interview_id || '—'} · ${r.segment || '—'}` }),
      h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-top:6px;', text: `${fmtDay(r.date)} · ${r.format || '—'} · ${r.interviewer || '—'} · initials ${r.initials || '—'} · recorded ${r.recorded || '—'}` }),
    ]),
    h('div', { class: 'overlay-body mtscroll' }, [
      h('div', { style: 'display:flex;gap:8px;margin-bottom:14px;' }, [
        h('button', { class: 'btn btn-line', style: 'height:34px;flex:1;', onclick: () => openForm('interview', r), text: 'Edit' }),
        h('button', { class: 'btn', style: 'height:34px;flex:1;background:#fff;border:1px solid #ECC9C9;color:#9A3F3F;font-size:12.5px;', onclick: () => deleteEntry('interview', r.id), text: 'Delete' }),
      ]),
      isOverdue(r) ? h('div', { class: 'banner rose', style: 'justify-content:space-between;margin-bottom:14px;' }, [
        h('span', { text: `Untagged ${daysSince(r.date)} days. Untagged interviews are lost interviews.` }),
        h('button', { class: 'btn btn-line', style: 'height:30px;padding:0 11px;font-size:11.5px;border-radius:9px;border-color:#ECC9C9;color:#9A3F3F;', onclick: () => markTagged(r), text: 'Mark tagged' }),
      ]) : null,
      r.brief_topic ? h('div', {}, [
        h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:4px;', text: 'Topic' }),
        h('div', { style: 'font-size:13.5px;line-height:20px;color:#1F2A28;margin-bottom:16px;', text: r.brief_topic }),
      ]) : null,
      h('div', { class: 'micro', style: 'color:#6E6A5E;margin-bottom:6px;', text: 'Field notes' }),
      h('div', { style: 'font-size:13px;line-height:21px;color:#4A5651;white-space:pre-line;', text: r.notes_markdown || 'No notes yet.' }),
    ]),
  ]);
  return overlay;
}
async function markTagged(r) {
  try { await data.update('interviews', r.id, { tagged_same_day: 'Y' }); STATE.interviews = await data.list('interviews'); render(); }
  catch (e) { alert('Update failed: ' + e.message); }
}

/* =====================================================================
   READER SHEET — the mobile way to "open a card and read its content".
   A rise-up, read-only overlay built from a supplied render function.
   ===================================================================== */
function openReader(title, build) { setState({ reader: { title, build } }); }
function closeReader() { setState({ reader: null }); }

/* View an uploaded document in-app: images render inline, text shows verbatim,
   other binaries offer an open/download link (an anchor click keeps the user
   gesture, so no popup-blocker issues). Uses data.getFile — never fetch direct. */
async function viewDocument(doc) {
  let blob = null;
  try { blob = await data.getFile(doc.id, doc); }
  catch (e) { alert('Could not open the file: ' + e.message); return; }
  openReader(doc.filename || 'Document', () => {
    const wrap = h('div', {});
    const meta = [doc.segment, doc.interview_id, fmtDay(doc.created_at)].filter(Boolean).join(' · ');
    if (meta) wrap.appendChild(h('div', { style: 'font-size:11px;color:#6E6A5E;margin-bottom:10px;', text: meta }));
    if (doc.description) wrap.appendChild(h('div', { style: 'font-size:12.5px;line-height:18px;color:#4A5651;margin-bottom:12px;', text: doc.description }));
    const mime = (blob && blob.type) || doc.mime_type || '';
    if (doc.text_content != null) {
      wrap.appendChild(h('div', { style: 'font-size:13px;line-height:20px;color:#1F2A28;white-space:pre-line;', text: doc.text_content }));
    } else if (!blob) {
      wrap.appendChild(h('div', { style: 'font-size:13px;color:#9A3F3F;', text: 'This file has no stored content to display here. It may live only in the team’s browser (local mode).' }));
    } else {
      const url = URL.createObjectURL(blob);
      if (mime.startsWith('image/')) {
        wrap.appendChild(h('img', { src: url, alt: doc.filename || 'document', style: 'max-width:100%;border-radius:10px;' }));
      } else {
        wrap.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener', download: doc.filename || '', class: 'btn btn-primary tall', style: 'text-decoration:none;', text: 'Open / download file' }));
      }
    }
    return wrap;
  });
}

/* Manually write/edit the state-of-the-field paragraph (stored on the phase-3
   'State of the field' deliverable). Mirrors the desktop capability. */
function openStateEditor() {
  const rec = STATE.deliverables.find(d => d.phase === 3 && d.deliverable === 'State of the field');
  UI.stateDraft = rec?.evidence || '';
  openReader('State of the field', () => {
    const ta = h('textarea', { class: 'field', rows: '10', style: 'width:100%;min-height:220px;', placeholder: 'One dated paragraph on where the research stands…',
      oninput: (e) => { UI.stateDraft = e.target.value; } });
    ta.value = UI.stateDraft;
    return h('div', {}, [
      h('div', { style: 'font-size:12px;color:#6E6A5E;margin-bottom:10px;', text: 'One paragraph on where the research stands. Humans own the words; the assistant only drafts.' }),
      ta,
      h('div', { style: 'display:flex;gap:8px;margin-top:16px;' }, [
        h('button', { class: 'btn btn-primary tall', style: 'flex:1;', onclick: () => saveStateOfField(rec), text: 'Save' }),
        h('button', { class: 'btn btn-line tall', style: 'flex:0 0 auto;', onclick: closeReader, text: 'Cancel' }),
      ]),
    ]);
  });
}
async function saveStateOfField(rec) {
  const text = (UI.stateDraft || '').trim();
  if (!text) { alert('Write something first, or tap Cancel.'); return; }
  try {
    if (rec) await data.update('deliverables', rec.id, { evidence: text });
    else await data.create('deliverables', { phase: 3, deliverable: 'State of the field', status: 'In progress', evidence: text });
    STATE.deliverables = await data.list('deliverables');
    closeReader();
  } catch (e) { alert('Save failed: ' + e.message); }
}

/* Export the whole workspace as one self-contained JSON backup (binary docs
   embedded as base64). Mirrors desktop Settings' export. */
async function exportEverything(btn) {
  if (UI.busy === 'export') return;
  if (btn) btn.textContent = 'Exporting…';
  UI.busy = 'export';
  try {
    const dump = { schema_version: SCHEMA_VERSION, app: 'MedTerminal', exported_at: new Date().toISOString(), tables: {} };
    for (const t of TABLES) dump.tables[t] = await data.list(t).catch(() => []);
    for (const doc of dump.tables.documents || []) {
      if (doc.text_content != null) continue;
      try {
        const blob = await data.getFile(doc.id, doc);
        if (blob && blob.size > 0) { doc.file_base64 = await blobToBase64(blob); doc.file_mime = blob.type || doc.mime_type; }
      } catch { /* best-effort — a missing blob shouldn't fail the whole export */ }
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `medterminal-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    UI.busy = null;
    if (btn) btn.textContent = 'Export everything (backup)';
  } catch (e) { UI.busy = null; if (btn) btn.textContent = 'Export everything (backup)'; alert('Export failed: ' + e.message); }
}
function renderReader() {
  return h('div', { class: 'overlay rise' }, [
    h('div', { class: 'overlay-head', style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;' }, [
      h('div', { class: 'serif', style: 'font-size:19px;line-height:24px;flex:1;padding-right:8px;', text: UI.reader.title }),
      h('button', { class: 'icon-btn', style: 'width:34px;height:34px;color:#4A5651;font-size:15px;', onclick: closeReader, text: '✕' }),
    ]),
    h('div', { class: 'overlay-body mtscroll' }, [UI.reader.build()]),
  ]);
}

/* Tiny markdown → DOM (headings, bullets, **bold**, paragraphs). Text always
   via textContent — model output never touches innerHTML. */
/* Rich markdown → DOM for assistant replies and AI drafts. Handles headings,
   bullet/numbered lists, blockquote callouts, and horizontal rules (which are
   dropped as a hairline, never printed as "----"); inline it renders bold,
   italic, and code, and turns the decision tokens GO / PIVOT / NO-GO /
   INSUFFICIENT into colored pills so attention lands where it should.
   A line-driven parser (not block-split) so a heading immediately followed by
   a list — the model's usual shape — parses correctly. */
function renderRich(text) {
  const root = h('div', { style: 'display:flex;flex-direction:column;gap:9px;' });
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let para = [];
  let list = null; // { type:'ul'|'ol', el }
  const flushPara = () => {
    if (para.length) {
      root.appendChild(h('p', { style: 'font-size:13px;line-height:20px;color:#1F2A28;margin:0;' }, mdInline(para.join(' '))));
      para = [];
    }
  };
  const flushList = () => { if (list) { root.appendChild(list.el); list = null; } };
  const flushAll = () => { flushPara(); flushList(); };

  for (const rawLine of lines) {
    const t = rawLine.replace(/\s+$/, '').trim();
    if (!t) { flushAll(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,}|—{2,}|={3,})$/.test(t)) {
      flushAll(); root.appendChild(h('div', { style: 'height:1px;background:#EFE9DD;margin:3px 0;' })); continue;
    }
    const head = t.match(/^(#{1,6})\s+(.*)$/);
    if (head) {
      flushAll();
      root.appendChild(h('div', { class: 'serif', style: 'font-size:15px;line-height:21px;color:#1F2A28;margin-top:1px;' }, mdInline(head[2])));
      continue;
    }
    const bq = t.match(/^>\s?(.*)$/);
    if (bq) {
      flushPara(); flushList();
      root.appendChild(h('div', { style: 'border-left:3px solid #ECDCB6;background:#FBF3DF;padding:8px 11px;border-radius:8px;font-size:12.5px;line-height:19px;color:#5A4A24;' }, mdInline(bq[1])));
      continue;
    }
    const bullet = t.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', el: h('ul', { style: 'margin:0;padding-left:1.15em;display:flex;flex-direction:column;gap:5px;' }) }; }
      list.el.appendChild(h('li', { style: 'font-size:13px;line-height:19px;color:#1F2A28;' }, mdInline(bullet[1])));
      continue;
    }
    const num = t.match(/^\d+[.)]\s+(.*)$/);
    if (num) {
      flushPara();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', el: h('ol', { style: 'margin:0;padding-left:1.4em;display:flex;flex-direction:column;gap:5px;' }) }; }
      list.el.appendChild(h('li', { style: 'font-size:13px;line-height:19px;color:#1F2A28;' }, mdInline(num[1])));
      continue;
    }
    flushList();
    para.push(t);
  }
  flushAll();
  return root;
}

/* Kept as the public name the drafts/reader call; now the rich renderer. */
function renderMarkdown(text) { return renderRich(text); }

const LEANING_PILL = {
  'GO':           { bg: '#E6EDE7', tx: '#3F5A4D' },
  'NO-GO':        { bg: '#F6E3E3', tx: '#9A3F3F' },
  'PIVOT':        { bg: '#F5E9CF', tx: '#755A1E' },
  'INSUFFICIENT': { bg: '#F5E9CF', tx: '#755A1E' },
};

/* Inline: **bold**, *italic* / _italic_, `code`, then leaning-token pills in
   the remaining plain runs. Order in the regex puts NO-GO before GO so the
   longer token wins. */
function mdInline(text) {
  const nodes = [];
  const src = String(text);
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|(?<![A-Za-z0-9])_[^_\n]+_(?![A-Za-z0-9])|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    colorizeInto(nodes, src.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) nodes.push(h('strong', { text: tok.slice(2, -2) }));
    else if (tok.startsWith('`')) nodes.push(h('code', { style: 'font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#EFEAE0;border-radius:4px;padding:1px 5px;', text: tok.slice(1, -1) }));
    else nodes.push(h('em', { text: tok.slice(1, -1) }));
    last = re.lastIndex;
  }
  colorizeInto(nodes, src.slice(last));
  return nodes;
}
function colorizeInto(nodes, s) {
  if (!s) return;
  const re = /\b(NO-GO|GO|PIVOT|INSUFFICIENT)\b/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(document.createTextNode(s.slice(last, m.index)));
    const p = LEANING_PILL[m[1]];
    nodes.push(h('span', { style: `background:${p.bg};color:${p.tx};font-weight:600;padding:1px 7px;border-radius:999px;font-size:11.5px;white-space:nowrap;`, text: m[1] }));
    last = m.index + m[0].length;
  }
  if (last < s.length) nodes.push(document.createTextNode(s.slice(last)));
}

/* Run a fresh AI assessment (append-only) — mobile mirror of the desktop
   "Regenerate brief". Appends to the trajectory; never rewrites history. */
async function runAssessment() {
  const res = await assessmentRequest({ trigger: 'manual', phase: CURRENT_PHASE, segments: SEGMENTS, localData: aiDataSlices(STATE) });
  let record = res.assessment;
  if (!res.persisted && record) record = await data.create('ai_assessments', record);
  STATE.ai_assessments = await data.list('ai_assessments');
  return record;
}

/* =====================================================================
   ASSISTANT OVERLAY
   ===================================================================== */
/* First-open greeting, built from the live workspace (not hardcoded). */
function assistantSeed() {
  const overdue = STATE.interviews.filter(isOverdue).map(r => r.interview_id);
  if (overdue.length) {
    const which = overdue.join(', ');
    return `I've read the workspace. ${overdue.length} interview${overdue.length === 1 ? ' is' : 's are'} still untagged past 24h (${which}), which breaches the same-day hard rule. Want me to summarise ${overdue.length === 1 ? 'it' : 'them'} so you can tag fast?`;
  }
  return "I've read the workspace — every interview is tagged and nothing is overdue. Ask me for a strategy read, ask me to stress-test the economics or steel-man the risk, or ask what to do next.";
}

/* Short chips send a fuller, analyst-grade instruction so a tap yields real
   strategic reasoning rather than a one-liner. Mirrors the desktop QUICK_PROMPTS. */
const STRATEGY_PROMPTS = [
  ['Strategy read', 'Give me your current strategy read on whether this is viable enough to build. Reason across demand, willingness to pay, unit economics, trust/moat, and execution risk — pull the interviews, matrix, segment cards, economics, and evidence links first. Land on a leaning, say what it hinges on, and name the single most valuable piece of evidence we still lack.'],
  ['Biggest risk', 'Argue the strongest case AGAINST building this. What is the most likely reason it fails, which kill criterion is closest to tripping, and what in our own data supports the bear case? Cite it.'],
  ['Economics', 'Stress-test the unit economics. Pull the economics rows, name the single assumption the case rests on, and tell me what must be true at the break-point for this to work. Flag any number with no evidence behind it.'],
  ['Compare segments', 'Compare the segments strategically using the segment cards and matrix. Which segment has the sharpest, best-paid pain — and which should we drop? Cite the pains and WTP per segment.'],
  ['What now?', 'What is the single most important thing I should do today to de-risk the decision, given the state of the project? Be specific — name a person, a deliverable, or an interview.'],
];

function renderAssistant() {
  if (!UI.messages.length) UI.messages.push({ role: 'bot', text: assistantSeed() });
  const msgs = h('div', { class: 'overlay-body mtscroll', style: 'display:flex;flex-direction:column;gap:11px;' });
  UI.messages.forEach(m => {
    const bot = m.role === 'bot';
    const typing = bot && m.text === TYPING; // the pending-answer placeholder
    const rich = bot && !typing;             // real bot replies get markdown formatting
    const bubble = h('div', {
      style: `max-width:88%;align-self:${bot ? 'flex-start' : 'flex-end'};background:${bot ? '#FAF7F1' : '#E6EDE7'};border:1px solid ${bot ? '#EFE9DD' : '#D4DFD5'};color:#1F2A28;padding:11px 13px;border-radius:14px;font-size:13.5px;line-height:20px;${(rich || typing) ? '' : 'white-space:pre-wrap;'}`,
    });
    if (typing) bubble.appendChild(typingDots());
    else if (rich) bubble.appendChild(renderRich(m.text));
    else bubble.textContent = m.text;
    msgs.appendChild(bubble);
  });
  const quick = h('div', { style: 'padding:0 16px 8px;display:flex;flex-wrap:wrap;gap:7px;' },
    STRATEGY_PROMPTS.map(([label, prompt]) => h('button', { class: 'pill', style: 'height:31px;font-size:11.5px;', onclick: () => sendChat(prompt), text: label })));
  // Textarea (not input) so long questions wrap and stay readable instead of
  // scrolling off the left edge. Grows with content up to a few lines.
  const input = h('textarea', { class: 'field', rows: '1', style: 'flex:1;min-height:44px;max-height:132px;border-radius:12px;overflow-y:auto;', placeholder: 'Ask about the project state…',
    oninput: (e) => { UI.chatInput = e.target.value; autoGrow(e.target); } });
  input.value = UI.chatInput;
  requestAnimationFrame(() => autoGrow(input)); // size a restored draft on mount
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(input.value); } });

  return h('div', { class: 'overlay rise' }, [
    h('div', { class: 'overlay-head', style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;' }, [
      h('div', {}, [
        h('div', { class: 'serif', style: 'font-size:19px;line-height:24px;', text: 'Research assistant' }),
        h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-top:2px;', text: 'Reasons from your research · strategy analyst' }),
      ]),
      h('div', { style: 'display:flex;align-items:center;gap:8px;flex-shrink:0;' }, [
        UI.messages.some(m => m.role === 'user')
          ? h('button', { class: 'btn-link', style: 'font-size:12.5px;', onclick: () => clearChat(), text: 'Clear' })
          : null,
        h('button', { class: 'icon-btn', style: 'width:34px;height:34px;color:#4A5651;font-size:15px;', onclick: () => setState({ assistantOpen: false }), text: '✕' }),
      ]),
    ]),
    msgs, quick,
    h('div', { style: 'padding:10px 16px 22px;border-top:1px solid #EFE9DD;display:flex;gap:8px;align-items:center;background:#F5F1EA;' }, [
      input, h('button', { class: 'btn btn-primary', style: 'height:42px;padding:0 18px;border-radius:12px;font-size:13px;', onclick: () => sendChat(input.value), text: 'Send' }),
    ]),
  ]);
}
/* Sentinel for the "assistant is answering" placeholder message. Rendered as
   animated dots, and filtered out of the history sent to the worker. */
const TYPING = ' typing';

/* Grow a chat textarea to fit its content, up to the CSS max-height. */
function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 132) + 'px';
}

/* Three bouncing dots so it's clear the assistant is thinking. */
function typingDots() {
  return h('div', { class: 'typing', role: 'status', 'aria-label': 'Assistant is thinking' },
    [0, 1, 2].map(() => h('span', { class: 'typing-dot' })));
}

/* Wipe the conversation. Next render re-seeds the opening message, so the
   panel returns to its fresh state rather than going blank. */
function clearChat() {
  UI.messages = [];
  UI.chatInput = '';
  render();
}

async function sendChat(text) {
  const msg = (text || '').trim();
  if (!msg) return;
  UI.messages.push({ role: 'user', text: msg });
  UI.chatInput = '';
  if (!aiAvailable) {
    UI.messages.push({ role: 'bot', text: "The assistant connects when AI_MODE is 'worker'. Everything else in the workspace works without it." });
    UI.chatToBottom = true; render(); return;
  }
  // Hold the placeholder by identity, not index: if the user sends again or taps
  // Clear while this request is in flight, index-based writes would attach the
  // answer to the wrong bubble (or to a bogus `-1`). Replacing the exact object
  // — and bailing if it's gone (cleared) — keeps answers with their questions.
  const placeholder = { role: 'bot', text: TYPING };
  UI.messages.push(placeholder);
  UI.chatToBottom = true; // reveal the user's message + the thinking indicator
  render();
  try {
    // The worker expects a Claude-style messages array ({role, content}); map
    // ours (bot->assistant, text->content) and drop the typing placeholder.
    const history = UI.messages
      .filter(m => m.text !== TYPING)
      .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }));
    const res = await chatRequest({ messages: history, tools: true, localData: aiDataSlices(STATE) });
    const idx = UI.messages.indexOf(placeholder);
    if (idx === -1) return; // conversation was cleared mid-flight — drop the result
    UI.messages[idx] = { role: 'bot', text: res.text || '(empty reply)' };
  } catch (e) {
    const idx = UI.messages.indexOf(placeholder);
    if (idx === -1) return;
    UI.messages[idx] = { role: 'bot', text: `Couldn't reach the assistant. ${e.message}` };
  }
  // If the panel was closed while the assistant was thinking, badge the header
  // icon so it's clear a reply (or error) is waiting to be read.
  if (!UI.assistantOpen) UI.assistantUnread = true;
  render(); // leave scroll where it is so the answer is read from its top
}

/* =====================================================================
   ENTRY FORM OVERLAY  (6 forms, segmented/pill controls per the spec)
   ===================================================================== */
/* Build the form model from an existing record (edit) or blank (create). */
function formFromRecord(type, r) {
  const team = getTeam();
  const today = new Date().toISOString().slice(0, 10);
  const base = { interviewer: team.field, segment: '', format: '', recorded: 'N', tagged_same_day: 'N', channel: '', status: 'Cold', owner: '', interview_id: '', theme_tag: '', severity: '', wtp: '', confirmed: 'No', date: today, killed_date: today };
  if (!r) return base;
  if (type === 'interview') return { ...base, date: r.date || '', interviewer: r.interviewer || '', segment: r.segment || '', initials: r.initials || '', format: r.format || '', recorded: r.recorded || 'N', tagged_same_day: r.tagged_same_day || 'N', brief_topic: r.brief_topic || '', notes_markdown: r.notes_markdown || '' };
  if (type === 'contact') return { ...base, name: r.name || '', segment: r.segment || '', organisation: r.organisation || '', country: r.country || '', channel: r.channel || '', status: r.status || 'Cold', owner: r.owner || '', first_contact: r.first_contact || '', notes: r.notes || '' };
  if (type === 'quote') return { ...base, interview_id: r.interview_id || '', quote: r.quote || '', theme_tag: r.theme_tag || '', segment: r.segment || '', severity: r.severity ? String(r.severity) : '', wtp: r.wtp || '' };
  if (type === 'check') return { ...base, assumption: r.assumption || '', confirmed: r.confirmed ? 'Yes' : 'No', confirmed_by: r.confirmed_by || '', notes: r.notes || '' };
  return base;
}

function openForm(type, existing = null) {
  UI.form = formFromRecord(type, existing);
  UI.editId = existing ? existing.id : null;
  setState({ formType: type, saving: false });
}
function closeForm() { UI.editId = null; setState({ formType: null }); }

const FORM_TITLES = { interview: 'Log interview', contact: 'Add contact', quote: 'Add quote', kill: 'Kill a hypothesis', check: 'Add field check', upload: 'Upload document', econ: 'Edit assumptions' };
const EDIT_TITLES = { interview: 'Edit interview', contact: 'Edit contact', quote: 'Edit quote', check: 'Edit field check' };
const ENTRY_NOUN = { interview: 'interview', contact: 'contact', quote: 'quote', check: 'field check' };

function fieldWrap(label, control) {
  return h('div', {}, [h('div', { class: 'micro fieldlabel', style: 'color:#4A5651;', text: label }), control]);
}
function textField(key, placeholder, type = 'text') {
  const el = h('input', { class: 'field', type, placeholder: placeholder || '', value: UI.form[key] || '', oninput: (e) => { UI.form[key] = e.target.value; } });
  return el;
}
function areaField(key, placeholder, rows = 4) {
  const el = h('textarea', { class: 'field', rows: String(rows), placeholder: placeholder || '' });
  el.value = UI.form[key] || '';
  el.addEventListener('input', (e) => { UI.form[key] = e.target.value; });
  return el;
}
function segControl(key, options) {
  const row = h('div', { class: 'seg' });
  options.forEach(o => row.appendChild(h('button', { type: 'button', class: `seg-btn ${UI.form[key] === o ? 'active' : ''}`, onclick: () => { UI.form[key] = o; render(); }, text: o })));
  return row;
}
function pillControl(key, options) {
  const row = h('div', { class: 'mtscroll', style: 'display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;' });
  let activeBtn = null;
  options.forEach(o => {
    const btn = h('button', { type: 'button', class: `pill tall ${UI.form[key] === o ? 'active' : ''}`, onclick: () => { UI.form[key] = o; render(); }, text: o });
    if (UI.form[key] === o) activeBtn = btn;
    row.appendChild(btn);
  });
  keepActiveInView(row, activeBtn); // keep the chosen option in frame
  return row;
}

function renderForm() {
  const type = UI.formType;
  const editing = !!UI.editId;
  const kids = [formBody(type)];
  // Deleting is available while editing (not for append-only kills / uploads).
  if (editing && ENTRY_NOUN[type]) {
    kids.push(h('button', {
      class: 'btn', style: 'width:100%;height:44px;margin-top:22px;background:#fff;border:1px solid #ECC9C9;color:#9A3F3F;font-size:13px;',
      onclick: () => deleteEntry(type, UI.editId), text: `Delete ${ENTRY_NOUN[type]}`,
    }));
  }
  const body = h('div', { class: 'overlay-body mtscroll' }, kids);
  return h('div', { class: 'overlay form' }, [
    h('div', { class: 'overlay-head', style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 12px;' }, [
      h('button', { class: 'btn-link lg', onclick: closeForm, text: 'Cancel' }),
      h('div', { class: 'serif', style: 'font-size:17px;flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', text: (editing && EDIT_TITLES[type]) || FORM_TITLES[type] }),
      h('button', { class: 'btn btn-primary', style: `height:36px;padding:0 15px;font-size:13px;${UI.saving ? 'opacity:.6;' : ''}`, disabled: UI.saving ? '' : null, onclick: () => (type === 'econ' ? saveEconForm() : saveForm(type)), text: UI.saving ? 'Saving…' : 'Save' }),
    ]),
    body,
  ]);
}

function formBody(type) {
  const col = (kids) => h('div', { style: 'display:flex;flex-direction:column;gap:16px;' }, kids);
  if (type === 'econ') return econFormBody();
  const interviewers = interviewerOptions(), owners = ownerOptions();
  const interviewIds = STATE.interviews.map(i => i.interview_id).filter(Boolean);
  if (type === 'interview') return col([
    h('div', { class: 'banner honey', text: 'Hard rule: tag this interview in the matrix the same day. Untagged interviews are lost interviews.' }),
    fieldWrap('Date', textField('date', '', 'date')),
    fieldWrap('Interviewer', segControl('interviewer', interviewers)),
    fieldWrap('Segment', pillControl('segment', SEGMENT_NAMES)),
    fieldWrap('Initials', textField('initials', 'e.g. AM')),
    fieldWrap('Format', segControl('format', ['In-person', 'Video', 'Phone'])),
    h('div', { style: 'display:flex;gap:12px;' }, [
      h('div', { style: 'flex:1;' }, [fieldWrap('Recorded', segControl('recorded', ['Y', 'N']))]),
      h('div', { style: 'flex:1;' }, [fieldWrap('Tagged same-day', segControl('tagged_same_day', ['Y', 'N']))]),
    ]),
    fieldWrap('Brief topic', textField('brief_topic', 'One line on the conversation')),
    fieldWrap('Field notes — the assistant reads these', areaField('notes_markdown', 'Full debrief. Blank lines separate paragraphs.', 6)),
  ]);
  if (type === 'contact') return col([
    fieldWrap('Name', textField('name', 'Full name')),
    fieldWrap('Segment', pillControl('segment', SEGMENT_NAMES)),
    h('div', { style: 'display:flex;gap:12px;' }, [
      h('div', { style: 'flex:1;' }, [fieldWrap('Organisation', textField('organisation', 'Org / —'))]),
      h('div', { style: 'flex:1;' }, [fieldWrap('Country', textField('country', 'Country'))]),
    ]),
    fieldWrap('Channel', pillControl('channel', CHANNELS)),
    fieldWrap('Status', pillControl('status', OUTREACH_STATUSES)),
    fieldWrap('Owner', segControl('owner', owners)),
    fieldWrap('First contact', textField('first_contact', '', 'date')),
    fieldWrap('Notes', areaField('notes', 'Context, referral source, next step', 4)),
  ]);
  if (type === 'quote') return col([
    fieldWrap('Interview', pillControl('interview_id', interviewIds)),
    fieldWrap('Quote / observation', areaField('quote', 'Paste the verbatim quote', 4)),
    fieldWrap('Theme tag', pillControl('theme_tag', THEMES)),
    fieldWrap('Segment', pillControl('segment', SEGMENT_NAMES)),
    fieldWrap('Severity (1–5)', segControl('severity', ['1', '2', '3', '4', '5'])),
    fieldWrap('Willingness to pay', segControl('wtp', ['Y', 'Maybe', 'N'])),
  ]);
  if (type === 'kill') return col([
    h('div', { class: 'banner rose', text: 'Append-only. Once recorded, a killed hypothesis cannot be edited or removed — that is the point.' }),
    fieldWrap('Hypothesis', areaField('hypothesis', 'The hypothesis the evidence has falsified', 3)),
    fieldWrap('Evidence that killed it', areaField('evidence', 'Which interviews / data falsified it', 4)),
    fieldWrap('Date', textField('killed_date', '', 'date')),
  ]);
  if (type === 'check') return col([
    fieldWrap('Assumption', areaField('assumption', 'A fragile assumption that needs field verification', 3)),
    fieldWrap('Confirmed?', segControl('confirmed', ['No', 'Yes'])),
    fieldWrap('Confirmed by', segControl('confirmed_by', owners)),
    fieldWrap('Notes', areaField('notes', 'How it was verified, or what is still needed', 4)),
  ]);
  if (type === 'upload') {
    const chosen = UI.form._filename;
    const fileInput = h('input', { type: 'file', accept: 'image/*,application/pdf,text/plain,text/csv,text/markdown,.txt,.csv,.md,.json', style: 'display:none;' });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { alert('That file is larger than 10 MB. Choose a smaller one.'); e.target.value = ''; return; }
      UI.form._file = file; UI.form._filename = file.name; render();
    });
    return col([
      h('div', { class: 'banner info', text: 'De-identify first (initials, not names). PDF, text, CSV or image, up to 10 MB. Never upload consent forms or identity documents.' }),
      h('label', { style: `display:block;border:1.5px dashed ${chosen ? '#B7C9B4' : '#D4C7B4'};border-radius:14px;background:${chosen ? '#EEF4EC' : '#FAF7F1'};padding:24px 16px;text-align:center;cursor:pointer;` }, [
        h('div', { style: `width:44px;height:44px;border-radius:12px;background:#fff;border:1px solid #E5DDD0;display:inline-flex;align-items:center;justify-content:center;color:#3F5A4D;margin-bottom:10px;font-size:18px;`, text: chosen ? '✓' : '↑' }),
        h('div', { style: 'font-size:13.5px;font-weight:500;color:#1F2A28;word-break:break-word;', text: chosen || 'Tap to choose a file' }),
        h('div', { style: 'font-size:11.5px;color:#6E6A5E;margin-top:3px;', text: chosen ? 'Tap to replace' : 'PDF, text, CSV or image · up to 10 MB' }),
        fileInput,
      ]),
      fieldWrap('Segment', pillControl('segment', SEGMENT_NAMES)),
      fieldWrap('Linked interview (optional)', pillControl('interview_id', interviewIds)),
      fieldWrap('Short description (searchable)', areaField('description', 'Say what this is', 3)),
    ]);
  }
  return h('div');
}

async function saveForm(type) {
  if (UI.saving) return; // already in flight — ignore repeat taps (no double-save)
  const f = UI.form;
  let table, record;
  if (type === 'interview') { table = 'interviews'; record = pick(f, ['date', 'interviewer', 'segment', 'initials', 'format', 'recorded', 'tagged_same_day', 'brief_topic', 'notes_markdown']); if (!record.segment) { alert('Choose a segment for this interview.'); return; } }
  else if (type === 'contact') { table = 'outreach'; record = pick(f, ['name', 'segment', 'organisation', 'country', 'channel', 'status', 'owner', 'first_contact', 'notes']); if (!(record.name || '').trim()) { alert('A contact needs a name.'); return; } }
  else if (type === 'quote') { table = 'matrix'; record = pick(f, ['interview_id', 'quote', 'theme_tag', 'segment', 'severity', 'wtp']); if (!(record.quote || '').trim()) { alert('A quote needs its text.'); return; } if (!record.interview_id) { alert('Link this quote to an interview.'); return; } record.severity = record.severity ? Number(record.severity) : null; if (!record.wtp) record.wtp = null; }
  else if (type === 'kill') { table = 'kill_list'; record = pick(f, ['hypothesis', 'evidence', 'killed_date']); if (!record.hypothesis || !record.evidence) { alert('Hypothesis and evidence are both required.'); return; } }
  else if (type === 'check') { table = 'field_checks'; record = { assumption: f.assumption || '', confirmed: f.confirmed === 'Yes', confirmed_by: f.confirmed_by || null, notes: f.notes || '' }; }
  else if (type === 'upload') {
    const file = f._file;
    if (!file && !UI.editId) { alert('Choose a file to upload first.'); return; }
    table = 'documents';
    record = { filename: file ? file.name : (f.description ? f.description.slice(0, 40) : 'Document'),
      mime_type: file ? (file.type || null) : null, size_bytes: file ? file.size : null,
      segment: f.segment || null, interview_id: f.interview_id || null, description: f.description || '' };
  }
  else return;
  // normalise blank date/enum fields to null
  ['date', 'first_contact', 'killed_date'].forEach(k => { if (record[k] === '') record[k] = null; });
  ['segment', 'interview_id', 'theme_tag', 'channel', 'owner', 'format', 'confirmed_by'].forEach(k => { if (record[k] === '') record[k] = null; });

  UI.saving = true; render(); // disable the button + show "Saving…" while the write is in flight
  try {
    let created = null;
    if (UI.editId) await data.update(table, UI.editId, record);
    else created = await data.create(table, record);
    // Upload: persist the actual file bytes (and searchable text for text files)
    // — without this the document record would exist but the file would be lost.
    if (type === 'upload' && f._file && created && created.id) {
      const file = f._file;
      const isText = /^text\//.test(file.type) || /\.(txt|csv|md|json)$/i.test(file.name);
      if (isText) {
        try { const text = await file.text(); await data.update('documents', created.id, { text_content: text.slice(0, 200000) }); } catch { /* keep the blob even if text extraction fails */ }
      }
      await data.putFile(created.id, file);
    }
    const refresh = { interview: 'interviews', contact: 'outreach', quote: 'matrix', kill: 'kill_list', check: 'field_checks', upload: 'documents' }[type];
    STATE[refresh] = await data.list(refresh);
    UI.saving = false; UI.formType = null; UI.editId = null; render(); // close as soon as the write lands
  } catch (e) { UI.saving = false; render(); alert('Save failed: ' + e.message); }
}
function pick(obj, keys) { const o = {}; keys.forEach(k => { o[k] = obj[k]; }); return o; }

/* Delete an evidence record and the hypothesis links pointing at it, so the
   board never cites something that no longer exists (mirrors the desktop). */
async function removeLinksFor(evidenceType, evidenceId) {
  const links = STATE.evidence_links.filter(l => l.evidence_type === evidenceType && l.evidence_id === evidenceId);
  for (const l of links) await data.remove('evidence_links', l.id);
  return links.length;
}

async function deleteEntry(type, id) {
  if (!id) return;
  try {
    if (type === 'interview') {
      const r = STATE.interviews.find(x => x.id === id); if (!r) return;
      const quotes = STATE.matrix.filter(q => q.interview_id === r.interview_id);
      const linkCount = STATE.evidence_links.filter(l =>
        (l.evidence_type === 'interview' && l.evidence_id === r.interview_id) ||
        (l.evidence_type === 'matrix' && quotes.some(q => q.id === l.evidence_id))).length;
      const parts = [`Delete interview ${r.interview_id || 'this interview'}?`];
      if (quotes.length) parts.push(`This also deletes its ${quotes.length} tagged quote${quotes.length === 1 ? '' : 's'}.`);
      if (linkCount) parts.push(`${linkCount} hypothesis link${linkCount === 1 ? '' : 's'} will be removed.`);
      parts.push('This cannot be undone.');
      if (!confirm(parts.join(' '))) return;
      for (const q of quotes) { await removeLinksFor('matrix', q.id); await data.remove('matrix', q.id); }
      await removeLinksFor('interview', r.interview_id);
      await data.remove('interviews', id);
      [STATE.interviews, STATE.matrix, STATE.evidence_links] = await Promise.all([data.list('interviews'), data.list('matrix'), data.list('evidence_links')]);
    } else if (type === 'contact') {
      const r = STATE.outreach.find(x => x.id === id);
      if (!confirm(`Delete contact "${(r && r.name) || 'this contact'}"? This cannot be undone.`)) return;
      await data.remove('outreach', id);
      STATE.outreach = await data.list('outreach');
    } else if (type === 'quote') {
      const linkCount = STATE.evidence_links.filter(l => l.evidence_type === 'matrix' && l.evidence_id === id).length;
      if (!confirm(`Delete this quote?${linkCount ? ` ${linkCount} hypothesis link${linkCount === 1 ? '' : 's'} will be removed.` : ''} This cannot be undone.`)) return;
      await removeLinksFor('matrix', id); await data.remove('matrix', id);
      [STATE.matrix, STATE.evidence_links] = await Promise.all([data.list('matrix'), data.list('evidence_links')]);
    } else if (type === 'check') {
      const linkCount = STATE.evidence_links.filter(l => l.evidence_type === 'field_check' && l.evidence_id === id).length;
      if (!confirm(`Delete this field check?${linkCount ? ` ${linkCount} hypothesis link${linkCount === 1 ? '' : 's'} will be removed.` : ''} This cannot be undone.`)) return;
      await removeLinksFor('field_check', id); await data.remove('field_checks', id);
      [STATE.field_checks, STATE.evidence_links] = await Promise.all([data.list('field_checks'), data.list('evidence_links')]);
    } else return;
    UI.formType = null; UI.editId = null; UI.selectedId = null;
    render();
  } catch (e) {
    // A multi-step delete may have committed some removes before failing — resync
    // the affected tables so the UI reflects what actually persisted, not a stale
    // half-deleted list.
    try {
      [STATE.interviews, STATE.matrix, STATE.evidence_links, STATE.outreach, STATE.field_checks] =
        await Promise.all(['interviews', 'matrix', 'evidence_links', 'outreach', 'field_checks'].map(t => data.list(t)));
    } catch { /* ignore — best effort */ }
    UI.formType = null; UI.editId = null; UI.selectedId = null;
    render();
    alert('Delete failed: ' + e.message);
  }
}
