/* ============================================================
   CONFIG — Supabase backend
   ============================================================ */
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

export const PHASE_INFO = {
  current: 0,
  label: 'Phase 0 — Foundation & onboarding',
  exitCriteria: [
    { id: 'pre-work', label: "Simon's pre-work completed" },
    { id: 'workspace', label: 'Workspace live, both have written content' },
    { id: 'scripts-v1', label: 'Interview scripts v1 drafted' },
    { id: 'wedge-locked', label: 'Wedge brief signed and dated' },
    { id: 'simon-explains', label: 'Simon can explain the project unaided' },
    { id: 'two-changes', label: 'Simon has flagged ≥2 plan changes' }
  ]
};

/* ============================================================
   STATE
   ============================================================ */
export const STATE = {
  outreach: [],
  interviews: [],
  matrix: [],
  deliverables: [],
  targets: [],
  chatHistory: [],
  reports: [],
  loaded: false,
};

/* ============================================================
   SEGMENTS & CONSTANTS
   ============================================================ */
export const SEGMENTS = ['Patient','Caregiver','Hospital IPD','Aggregator','Agent','Insurance broker','Diaspora family'];
export const OUTREACH_STATUS_OPTIONS = ['Cold','Sent','Replied','Booked','Done','Declined'];
export const OUTREACH_FIELDS = ['Name','Segment','Organisation','Country','Channel','Status','Owner','First contact','Notes'];

export const THEMES = [
  'Discovery — WhatsApp/personal','Discovery — search/online','Discovery — broker/agent',
  'Trust — doctor reputation','Trust — price clarity','Trust — speed of reply','Trust — accreditation',
  'Friction — slow response','Friction — paperwork','Friction — language','Friction — money transfer','Friction — quote chasing',
  'Pain — financial','Pain — emotional','Pain — coordination','Pain — outcome',
  'Money — willingness to pay','Money — broker commission','Money — insurance',
  'Buyer — family abroad','Buyer — Nairobi family','Buyer — Hospital IPD'
];

/* ============================================================
   API CLIENT — routes through Supabase
   ============================================================ */
export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY };
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': SUPABASE_ANON_KEY,
  };
}

export async function api(path, opts = {}) {
  const headers = await getAuthHeaders();
  const url = `${SUPABASE_URL}/functions/v1/claude-proxy`;

  // Chat calls go to the Edge Function
  if (path === '/api/chat') {
    const res = await fetch(url, {
      ...opts,
      headers: { ...headers, ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  // Data calls go directly to Supabase REST via the JS client
  const table = path.replace('/api/', '').split('/')[0];
  const recordId = path.replace('/api/', '').split('/')[1] || null;
  const method = opts.method || 'GET';

  if (method === 'GET') {
    const query = recordId
      ? supabase.from(table).select('*').eq('id', recordId)
      : supabase.from(table).select('*').order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { records: data || [] };
  }

  if (method === 'POST') {
    const body = JSON.parse(opts.body);
    const row = body.fields || body;
    const { data, error } = await supabase.from(table).insert(row).select();
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  }

  if (method === 'PATCH' && recordId) {
    const body = JSON.parse(opts.body);
    const fields = body.fields || body;
    const { data, error } = await supabase.from(table).update(fields).eq('id', recordId).select();
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  }

  if (method === 'DELETE' && recordId) {
    const { error } = await supabase.from(table).delete().eq('id', recordId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  }

  throw new Error(`Unsupported: ${method} ${path}`);
}

export async function loadAllData(showStatus = false) {
  setSync('Loading…');
  try {
    const [o, i, m, d, s, kl, fc, rp] = await Promise.all([
      api('/api/outreach').catch(() => ({ records: [] })),
      api('/api/interviews').catch(() => ({ records: [] })),
      api('/api/matrix').catch(() => ({ records: [] })),
      api('/api/deliverables').catch(() => ({ records: [] })),
      api('/api/scripts').catch(() => ({ records: [] })),
      api('/api/kill_list').catch(() => ({ records: [] })),
      api('/api/field_checks').catch(() => ({ records: [] })),
      api('/api/reports').catch(() => ({ records: [] })),
    ]);
    STATE.outreach = o.records || [];
    STATE.interviews = i.records || [];
    STATE.matrix = m.records || [];
    STATE.deliverables = d.records || [];
    STATE.scripts = s.records || [];
    STATE.killList = kl.records || [];
    STATE.fieldChecks = fc.records || [];
    STATE.reports = rp.records || [];
    STATE.loaded = true;
    setSync('Synced');
    renderCurrentRoute();
  } catch (e) {
    setSync('Offline · using cache', 'rose');
    console.error(e);
  }
}

export function setSync(text, tone='line') {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = `chip chip-${tone === 'rose' ? 'rose' : tone === 'sage' ? 'sage' : 'line'}`;
  el.textContent = text;
  if (text === 'Synced') {
    setTimeout(() => {
      el.className = 'chip chip-sage';
      el.textContent = `✓ ${STATE.outreach.length + STATE.interviews.length + STATE.matrix.length} records`;
    }, 600);
  }
}

/* ============================================================
   ROUTER
   ============================================================ */
const ROUTES = {};

export function registerRoute(name, title, renderFn) {
  ROUTES[name] = { title, render: renderFn };
}

export function go(route) {
  if (!ROUTES[route]) route = 'dashboard';
  location.hash = route;
}

export function renderCurrentRoute() {
  const route = (location.hash || '#dashboard').slice(1);
  const r = ROUTES[route] || ROUTES.dashboard;
  if (!r) return;
  document.getElementById('page-title').textContent = r.title;
  document.querySelectorAll('[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  const page = document.getElementById('page');
  page.innerHTML = '';
  page.classList.add('fade-in');
  r.render(page);
  setTimeout(() => page.classList.remove('fade-in'), 300);
}

/* ============================================================
   DOM HELPERS
   ============================================================ */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  });
  return el;
}

export function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function statusChip(status) {
  const map = {
    'Cold': 'chip-line', 'Sent': 'chip-honey', 'Replied': 'chip-honey',
    'Booked': 'chip-sage', 'Done': 'chip-sage', 'Declined': 'chip-rose',
    'In progress': 'chip-honey', 'Complete': 'chip-sage', 'Blocked': 'chip-rose',
    'Not started': 'chip-line'
  };
  return `<span class="chip ${map[status] || 'chip-line'}">${esc(status) || '—'}</span>`;
}

export function severityDots(sev) {
  if (!sev) return '<span style="color:var(--ink-mute);">—</span>';
  const n = parseInt(sev, 10) || 0;
  let html = '<span class="inline-flex gap-0.5">';
  for (let i = 1; i <= 5; i++) {
    html += `<i style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${i<=n ? (n>=4?'var(--rose)':n>=3?'var(--honey)':'var(--sage)') : 'var(--line)'};"></i>`;
  }
  return html + '</span>';
}

/* ============================================================
   MODAL + FORM HELPERS
   ============================================================ */
let currentModalFields = [];

export function openModal(title, fields, onSubmit) {
  currentModalFields = fields;
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const form = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const data = {};
    fields.forEach(f => {
      const el = form.querySelector(`[name="${f.key}"]`);
      if (el && el.value !== '') data[f.key] = el.value;
    });
    onSubmit(data);
  }});
  form.appendChild(h('div', { class: 'serif text-xl mb-5', text: title }));
  fields.forEach(f => form.appendChild(f.el));
  form.appendChild(h('div', { class: 'flex gap-3 mt-5 justify-end pt-4 border-t', style: 'border-color:var(--line-soft);' }, [
    h('button', { type: 'button', class: 'btn btn-line', onclick: closeModal }, 'Cancel'),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save')
  ]));

  const modal = h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); } }, [
    h('div', { class: 'modal p-6' }, [form])
  ]);
  root.appendChild(modal);
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  currentModalFields = [];
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
    if (value) input.textContent = value;
  } else {
    input = h('input', { class: 'input', name: key, type: inputType || 'text', value: value || '' });
  }
  wrap.appendChild(input);
  return { key, el: wrap };
}
