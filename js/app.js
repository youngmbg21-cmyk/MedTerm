/* ============================================================
   APP CORE — state, router, nav, shared components.
   Data access lives in data.js. Config lives in config.js.
   ============================================================ */
import { CURRENT_STAGE, STAGES, STALL_DAYS, SEGMENTS, PIPELINE_NAMES } from './config.js';
import { data, isLocalMode } from './data.js';

export { CURRENT_STAGE, STAGES };

/* ------------------------------------------------------------
   STATE — in-memory cache, loaded once, refreshed on demand.
   ------------------------------------------------------------ */
export const STATE = {
  questions: [], insights: [],
  competitors: [], competitor_updates: [],
  prospects: [], contacts: [], conversations: [],
  pricing_ideas: [], pricing_reactions: [],
  market_facts: [],
  chatHistory: [],
  loaded: false,
};

const TABLES = ['questions', 'insights', 'competitors', 'competitor_updates',
  'prospects', 'contacts', 'conversations', 'pricing_ideas', 'pricing_reactions',
  'market_facts'];

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
  el.className = `chip chip-${tone === 'rose' ? 'rose' : tone === 'green' ? 'green' : 'line'}`;
  el.textContent = text;
  if (text === 'Synced') {
    setTimeout(() => {
      el.className = 'chip chip-green';
      const n = STATE.prospects.length + STATE.conversations.length + STATE.insights.length;
      el.textContent = isLocalMode ? `\u2713 ${n} records · this browser` : `\u2713 ${n} records · shared`;
    }, 500);
  }
}

/* ------------------------------------------------------------
   DATE HELPERS
   ------------------------------------------------------------ */
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(then)) return null;
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const today = () => new Date().toISOString().slice(0, 10);

/* Kenyan shillings, written the way the founders write them. */
export function fmtKES(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '—';
  if (Math.abs(v) >= 1e6) return `KES ${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
  if (Math.abs(v) >= 1000) return `KES ${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return `KES ${v.toLocaleString('en-KE')}`;
}

/* ------------------------------------------------------------
   THE TWO DATA-QUALITY RULES
   These are the equivalent of a lab notebook rule. They are the
   reason this workspace is trustworthy, and nothing may weaken
   them: the app shows them in red, on the Overview, every day.
   ------------------------------------------------------------ */

/* 1 · A market or regulatory fact with no source link is a rumour.
       The form refuses to save one; this catches anything that got
       in another way (an import, an older record). */
export function factNeedsSource(fact) {
  return !fact || !String(fact.source_url || '').trim();
}

/* 2 · A conversation nobody wrote a finding from is a wasted
       conversation. After a day, say so. */
export function conversationUnmined(conv, insights = STATE.insights) {
  if (!conv) return false;
  const has = insights.some(i => i.source_kind === 'Conversation' && String(i.source_id) === String(conv.id));
  return !has && (daysSince(conv.date) ?? 0) >= 1;
}

/* A prospect we said we would chase and then didn't. */
export function isStalled(prospect) {
  return ['Contacted', 'Talked', 'Interested'].includes(prospect.status) &&
    (daysSince(prospect.last_touch || prospect.first_contact) ?? 0) >= STALL_DAYS;
}

/* ------------------------------------------------------------
   SHARED ANALYSIS HELPERS — one formula, one rollup, so no two
   screens ever disagree about the same number.
   ------------------------------------------------------------ */

/* Every insight attached to a question, split by which way it points. */
export function evidenceFor(questionId, insights = STATE.insights) {
  const mine = insights.filter(i => String(i.question_id) === String(questionId));
  return {
    all: mine,
    supports:   mine.filter(i => i.direction === 'Supports'),
    challenges: mine.filter(i => i.direction === 'Challenges'),
    context:    mine.filter(i => i.direction === 'Context'),
  };
}

/* Where a question stands, in words. Never a score — the whole point is that
   two founders read the same sentence and argue about the evidence, not the
   number. "Thin" is the honest default. */
export function evidenceWeight(questionId, insights = STATE.insights) {
  const e = evidenceFor(questionId, insights);
  const n = e.supports.length + e.challenges.length;
  if (n === 0) return { label: 'No evidence', tone: 'line' };
  if (n < 3)  return { label: 'Thin', tone: 'gold' };
  if (e.supports.length && e.challenges.length &&
      Math.min(e.supports.length, e.challenges.length) / n >= 0.34) {
    return { label: 'Contested', tone: 'violet' };
  }
  return { label: 'Building', tone: 'green' };
}

/* Prospects per pipeline stage, in config order. */
export function pipelineCounts(rows = STATE.prospects) {
  return PIPELINE_NAMES.map(name => ({ label: name, value: rows.filter(r => r.status === name).length }));
}

/* Conversations logged per segment vs. the target we set ourselves. */
export function segmentCoverageRows() {
  const byProspect = Object.fromEntries(STATE.prospects.map(p => [String(p.id), p]));
  return SEGMENTS.map(s => ({
    label: s.name,
    value: STATE.conversations.filter(c => (byProspect[String(c.prospect_id)] || {}).segment === s.name).length,
    target: s.target,
  }));
}

export const prospectName = (id) => (STATE.prospects.find(p => String(p.id) === String(id)) || {}).company || '—';
export const questionShort = (id) => (STATE.questions.find(q => String(q.id) === String(id)) || {}).short || '—';

/* ------------------------------------------------------------
   ROUTER — routes carry a group and the one question they answer.
   ------------------------------------------------------------ */
const ROUTES = {};

/* Old route names kept working, so a bookmark or a link somebody pasted into
   WhatsApp six weeks ago still lands on the right screen after a rename. */
const ROUTE_ALIASES = { insights: 'findings' };

export function registerRoute(name, title, renderFn, question = '') {
  ROUTES[name] = { title, question, render: renderFn };
}

/* go('sheet?prospect=abc') works: the query part is carried through rather
   than being treated as part of the route name. */
export function go(target) {
  const qi = String(target).indexOf('?');
  let route = qi < 0 ? target : target.slice(0, qi);
  const query = qi < 0 ? '' : target.slice(qi);
  route = ROUTE_ALIASES[route] || route;
  if (!ROUTES[route]) { route = 'overview'; return void (location.hash = route); }
  location.hash = route + query;
}

/* The screen's single primary action lives top-right in the app header.
   Screens set it via setPageActions(); it clears on every route render. */
export function setPageActions(...nodes) {
  const slot = document.getElementById('page-actions');
  if (!slot) return;
  slot.innerHTML = '';
  nodes.filter(Boolean).forEach(n => slot.appendChild(n));
}

/* A route may carry a query — `#conversations?prospect=abc` — so one screen
   can hand off to another with context. Screens read it through routeParams(). */
let currentParams = new URLSearchParams();
export function routeParams() { return currentParams; }

export function renderCurrentRoute() {
  const raw = (location.hash || '#overview').slice(1);
  const qi = raw.indexOf('?');
  let route = qi < 0 ? raw : raw.slice(0, qi);
  currentParams = new URLSearchParams(qi < 0 ? '' : raw.slice(qi + 1));
  /* An old link renders the right screen AND corrects the address bar, so the
     name in the URL is never one the app no longer uses. replaceState rather
     than assigning location.hash: no extra history entry, and Back still goes
     where the reader expects. */
  if (ROUTE_ALIASES[route]) {
    route = ROUTE_ALIASES[route];
    history.replaceState(null, '', `#${route}${qi < 0 ? '' : '?' + raw.slice(qi + 1)}`);
  }
  const r = ROUTES[route] || ROUTES.overview;
  if (!r) return;
  document.getElementById('page-title').textContent = r.title;
  const q = document.getElementById('page-question');
  if (q) q.textContent = r.question || '';
  setPageActions(); // screens re-add their primary action during render
  if (!ROUTES[route]) route = 'overview';
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
   NAV — four screens you work in, and a reference shelf you visit
   occasionally.

     Overview          what to do today
     Prospects         who we are lining up
     Conversations     the interview sheets — where the work happens
     Where we stand    the five questions, filling up on their own
     ── Reference ──
     All findings · Pricing options · Competitors · Market & rules

   The four at the top are the loop: line someone up, meet them and
   fill in the sheet, watch the questions move. Everything the sheet
   needs — the priced options it reads out, the findings it produces
   — is captured inside the sheet, so the reference shelf is for
   setting things up and for desk research, not for daily use.

   Section headings are labels, not buttons: a screen you cannot see
   is a screen you forget exists.
   ------------------------------------------------------------ */
const NAV = [
  { type: 'route', route: 'overview', label: 'Overview' },
  { type: 'route', route: 'prospects', label: 'Prospects' },
  { type: 'route', route: 'conversations', label: 'Conversations' },
  { type: 'route', route: 'questions', label: 'Where we stand' },
  { type: 'section', label: 'Reference' },
  { type: 'route', route: 'findings', label: 'All findings' },
  { type: 'route', route: 'pricing', label: 'Pricing options' },
  { type: 'route', route: 'competitors', label: 'Competitors' },
  { type: 'route', route: 'market', label: 'Market & rules' },
];

export function buildNav() {
  const nav = document.getElementById('nav-root');
  nav.innerHTML = '';

  NAV.forEach(item => {
    if (item.type === 'section') {
      nav.appendChild(h('div', { class: 'nav-section micro', text: item.label }));
      return;
    }
    nav.appendChild(h('a', { class: 'nav-item', 'data-route': item.route, href: `#${item.route}` }, [
      h('span', { class: 'dot' }), item.label,
    ]));
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

/* Scroll lock — while an overlay (modal, drawer, chat) owns the screen, the
   page beneath must stay still: no rubber-band, no sideways drift behind a
   fixed layer. A depth counter keeps it correct when overlays overlap (e.g. a
   modal opened while the chat panel is open) — the page only unlocks once the
   last overlay closes. The visual containment lives in css/theme.css. */
let scrollLockDepth = 0;
let lockedScrollY = 0;
export function lockScroll() {
  scrollLockDepth += 1;
  if (scrollLockDepth > 1) return;
  /* position:fixed, not overflow:hidden — iOS Safari ignores overflow on the
     body for touch drags, which let the page creep behind open panes. Pinning
     the body at its current offset makes it immovable; the offset is restored
     on unlock so the user never notices the swap. */
  lockedScrollY = window.scrollY;
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.classList.add('scroll-locked');
}
export function unlockScroll() {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1);
  if (scrollLockDepth > 0) return;
  document.body.classList.remove('scroll-locked');
  document.body.style.top = '';
  window.scrollTo(0, lockedScrollY);
}

export function openSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb.classList.contains('open')) return;
  sb.classList.add('open');
  document.getElementById('mobile-overlay').classList.add('open');
  lockScroll();
  drawerReturnFocus = document.activeElement;
  const first = sb.querySelector('a, button');
  if (first) first.focus();
}

export function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb.classList.contains('open')) return;
  sb.classList.remove('open');
  document.getElementById('mobile-overlay').classList.remove('open');
  unlockScroll();
  if (drawerReturnFocus && typeof drawerReturnFocus.focus === 'function') drawerReturnFocus.focus();
  drawerReturnFocus = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Escape closes an open modal first (none had keyboard dismissal), then the sidebar.
  const root = document.getElementById('modal-root');
  if (root && root.innerHTML !== '') { root.innerHTML = ''; return; }
  closeSidebar();
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
   SHARED COMPONENTS — the building blocks every screen uses.
   Semantic colour: green = done/on-track · gold = attention ·
   rose = blocked/breach · info = neutral · violet = tags ·
   bronze = editorial accent.
   ------------------------------------------------------------ */

/* 1 · Metric card */
export function kpiCard(label, value, sub, tone) {
  const toneColor = { rose: 'var(--rose-text)', gold: 'var(--gold-text)', green: 'var(--green-text)', info: 'var(--info-text)', violet: 'var(--violet-text)' }[tone];
  const num = h('div', { class: 'kpi-num num', text: String(value) });
  if (toneColor) num.style.color = toneColor;
  const card = h('div', { class: 'card kpi' }, [num, h('div', { class: 'kpi-label', text: label })]);
  if (sub) card.appendChild(h('div', { class: 'text-xs mt-2 t-mute', text: sub }));
  return card;
}

/* 2 · Pill chip with semantic tone */
export function chip(text, tone = 'line') {
  return h('span', { class: `chip chip-${tone}`, text });
}

/* 3 · Progress bar */
export function progressBar(pct, color) {
  const fill = h('i');
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (color) fill.style.background = color;
  return h('div', { class: 'bar-wrap' }, [fill]);
}

/* 4 · Quote block — what somebody actually said, set apart from UI chrome.
   Evidence should never look like a form field. */
export function quoteBlock(quote, cite, chips = []) {
  const block = h('div', { class: 'quote-block' });
  if (chips.length) block.appendChild(h('div', { class: 'flex flex-wrap gap-1.5 mb-2' }, chips.filter(Boolean)));
  block.appendChild(h('div', { class: 'quote-text', text: quote ? `\u201c${quote}\u201d` : '(no quote recorded)' }));
  if (cite) block.appendChild(h('div', { class: 'quote-cite mt-2', text: cite }));
  return block;
}

/* A titled card with an optional right-hand tools slot. The one card shape. */
export function sectionCard(title, sub, body, tools) {
  const head = h('div', { class: 'flex items-start justify-between gap-3 mb-3' }, [
    h('div', {}, [
      h('div', { class: 'card-title', text: title }),
      sub ? h('div', { class: 'text-2nd t-mute mt-0.5', text: sub }) : null,
    ].filter(Boolean)),
    tools || null,
  ].filter(Boolean));
  return h('div', { class: 'card card-pad' }, [head, body].filter(Boolean));
}

/* 5a · Loading state — the one loading pattern app-wide */
export function loadingState(lines = 3) {
  const box = h('div', { class: 'loading-state' });
  for (let i = 0; i < lines; i++) {
    const l = h('div', { class: 'skeleton-line' });
    l.style.width = `${85 - i * 18}%`; // dynamic value — sanctioned inline style
    box.appendChild(l);
  }
  return box;
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

/* 6 · Attention banners are plain divs with .banner .banner-{rose|gold|info} —
   see theme.css. Rose = data-quality breach, gold = attention, info = calm note. */

/* ------------------------------------------------------------
   7 · THE RECORD CARD — a summary line that always shows, and a
   detail body one tap away.

   Every list screen used to render every record fully open. With
   four seeded prospects that reads fine; with twenty real ones the
   screen is six thousand pixels tall and "who has gone quiet?"
   becomes a scrolling exercise. The summary row therefore has to
   carry enough to decide whether to open the card at all —
   chips, the name, one line of context — and the rest waits.

   Records that breach a data-quality rule (a conversation with no
   finding, a fact with no source) open themselves and stay flagged:
   the two rules of this workspace are never one tap away.

   Open/closed state is held here rather than in the screen, so it
   survives the re-render that follows every save.
   ------------------------------------------------------------ */
const opened = new Set();
const closed = new Set();

export function expandableCard({ key, summary, detail, tools, flagged = false, defaultOpen = false }) {
  /* An explicit tap always wins over the default; otherwise flagged and
     short-list records start open. */
  const isOpen = closed.has(key) ? false : (opened.has(key) || defaultOpen);

  const chevron = h('span', { class: `rec-chevron${isOpen ? ' open' : ''}`, text: '›', 'aria-hidden': 'true' });
  const toggle = h('button', {
    class: 'rec-toggle', type: 'button', 'aria-expanded': String(isOpen),
    onclick: () => {
      if (isOpen) { opened.delete(key); closed.add(key); }
      else { closed.delete(key); opened.add(key); }
      renderCurrentRoute();
    },
  }, [chevron, summary]);

  const card = h('div', { class: `card card-pad mb-3${flagged ? ' card-flagged' : ''}` }, [
    h('div', { class: 'rec-head' }, [toggle, tools || null].filter(Boolean)),
  ]);
  if (isOpen && detail) card.appendChild(h('div', { class: 'rec-body' }, [detail]));
  return card;
}

/* How a screen decides whether its records start open: a short list is easier
   read whole than clicked through, a long one is not. */
export const OPEN_BY_DEFAULT_UP_TO = 3;

/* ------------------------------------------------------------
   MODAL + FORM HELPERS
   ------------------------------------------------------------ */
/* Several screens (documents viewer, reports, scripts, settings, decision
   brief) compose their own dialog straight into #modal-root rather than
   through openModal. The page freeze therefore watches the mount point
   itself: any pane mounted there locks the page, and the lock releases when
   the root empties — no call site can forget to lock or leak an unlock. */
const modalRootEl = document.getElementById('modal-root');
let modalLockHeld = false;
new MutationObserver(() => {
  const open = modalRootEl.children.length > 0;
  if (open && !modalLockHeld) { lockScroll(); modalLockHeld = true; }
  else if (!open && modalLockHeld) { unlockScroll(); modalLockHeld = false; }
}).observe(modalRootEl, { childList: true });

export function openModal(title, fields, onSubmit, submitLabel = 'Save', { danger } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.disabled) return; // in-flight — ignore a double submit
    const out = {};
    fields.forEach(f => {
      const el = form.querySelector(`[name="${f.key}"]`);
      if (!el) return;
      // A cleared date/number input submits '' — Postgres rejects '' for
      // typed columns (22007/22P02), so it must become NULL before data.js.
      out[f.key] = el.value === '' && (el.type === 'date' || el.type === 'number')
        ? null : el.value;
    });
    if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.label = submitBtn.textContent; submitBtn.textContent = 'Saving…'; }
    try {
      await onSubmit(out);
    } finally {
      // If the handler didn't close the modal (validation kept it open, or an
      // error), restore the button so the user can retry — otherwise it's gone.
      if (submitBtn && document.getElementById('modal-root').contains(form)) {
        submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.label || submitLabel;
      }
    }
  } });
  /* Destructive confirmations are visually distinct: rose header rule + rose action */
  form.appendChild(h('div', { class: `modal-title serif${danger ? ' modal-title-danger' : ''}`, text: title }));
  fields.forEach(f => form.appendChild(f.el));
  form.appendChild(h('div', { class: 'flex gap-3 mt-5 justify-end pt-4 border-t b-soft' }, [
    h('button', { type: 'button', class: 'btn btn-line', onclick: closeModal }, 'Cancel'),
    h('button', { type: 'submit', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}` }, submitLabel),
  ]));

  root.appendChild(h('div', {
    class: 'modal-bg fade-in',
    onclick: (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); },
  }, [h('div', { class: 'modal' }, [form])]));
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function formField(label, key, type, value, options, inputType, attrs = {}) {
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
    input = h('input', { class: 'input', name: key, type: inputType || 'text', value: value ?? '', ...attrs });
  }
  wrap.appendChild(input);
  return { key, el: wrap };
}
