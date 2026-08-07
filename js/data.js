/* ============================================================
   DATA ACCESS — the only module that talks to storage.
   Screens must never call fetch or localStorage directly.

   Interface:
     data.list(table)              -> array of records
     data.create(table, record)    -> created record
     data.update(table, id, patch) -> updated record
     data.remove(table, id)        -> { deleted: true }
     data.storageInfo()            -> usage estimate for the Settings meter
     data.reset()                  -> local mode only: back to the starting
                                       workspace (competitors, questions,
                                       facts, a couple of example prospects)
     data.startFresh()             -> local mode only: keep the reference
                                       material, wipe everything we recorded
     data.importAll(dump)          -> replace all data with a previous backup

   Records are flat snake_case objects matching sql/schema.sql.
   ============================================================ */
import { DATA_MODE, AI_MODE, WORKER_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { buildSeed, buildFreshSeed, buildQuestions } from './seed.js';

const LS_KEY = 'hati_research_v1';

/* Every table the app knows about — importAll() only trusts these keys,
   so a malformed or hand-edited backup file can't inject arbitrary state.
   Order matters for the api-mode import: parents before children. */
export const KNOWN_TABLES = ['questions', 'competitors', 'competitor_updates',
  'prospects', 'contacts', 'conversations', 'pricing_ideas', 'pricing_reactions',
  'market_facts', 'insights', 'briefs'];

/* ------------------------------------------------------------
   Local adapter — localStorage, seeded on first run.
   ------------------------------------------------------------ */
function makeId() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function buildDb(seedFn) {
  const seed = seedFn();
  const db = {};
  const base = Date.now();
  let i = 0;
  for (const [table, rows] of Object.entries(seed)) {
    db[table] = rows.map(r => ({
      // A seed row may declare its own id so other seed rows can point at it.
      id: r.id || makeId(),
      // stagger created_at so insertion order survives a created_at sort
      created_at: new Date(base - (rows.length - (i++)) * 60000).toISOString(),
      ...r,
    }));
  }
  KNOWN_TABLES.forEach(t => { if (!Array.isArray(db[t])) db[t] = []; });
  return db;
}

const seedDb = () => buildDb(buildSeed);
const freshDb = () => buildDb(buildFreshSeed);

let localDb = null;

/* One-time, idempotent catch-up for workspaces created before a table
   existed. Anything the founders typed is never touched. */
function migrateLocalDb(db) {
  let changed = false;
  KNOWN_TABLES.forEach(t => {
    if (!Array.isArray(db[t])) { db[t] = []; changed = true; }
  });
  // The five questions are the spine of the workspace. An empty board would
  // leave every insight with nothing to attach to, so restore the stock set.
  if (!db.questions.length) { db.questions = buildQuestions().map(q => ({ created_at: new Date().toISOString(), ...q })); changed = true; }
  return changed;
}

function loadLocalDb() {
  if (localDb) return localDb;
  try {
    localDb = JSON.parse(localStorage.getItem(LS_KEY));
  } catch { localDb = null; }
  if (!localDb || typeof localDb !== 'object') {
    localDb = seedDb();
    persistLocal();
  } else if (migrateLocalDb(localDb)) {
    persistLocal();
  }
  return localDb;
}

function persistLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(localDb));
}

const localAdapter = {
  async list(table) {
    const db = loadLocalDb();
    if (!db[table]) db[table] = [];
    return [...db[table]];
  },
  async create(table, record) {
    const db = loadLocalDb();
    if (!db[table]) db[table] = [];
    const row = { id: makeId(), created_at: new Date().toISOString(), ...record };
    db[table].push(row);
    persistLocal();
    return { ...row };
  },
  async update(table, id, patch) {
    const db = loadLocalDb();
    const idx = (db[table] || []).findIndex(r => String(r.id) === String(id));
    if (idx < 0) throw new Error(`Record not found: ${table}/${id}`);
    db[table][idx] = { ...db[table][idx], ...patch, updated_at: new Date().toISOString() };
    persistLocal();
    return { ...db[table][idx] };
  },
  async remove(table, id) {
    const db = loadLocalDb();
    db[table] = (db[table] || []).filter(r => String(r.id) !== String(id));
    persistLocal();
    return { deleted: true };
  },
  async reset() {
    localDb = seedDb();
    persistLocal();
  },
  /* Keeps the reference material we did not gather ourselves — the five
     questions, the competitor set, the market facts — and clears everything
     that is a record of our own research. */
  async startFresh() {
    localDb = freshDb();
    persistLocal();
  },
  /**
   * Replace ALL local data with a previously exported backup. Only known
   * tables are trusted (see KNOWN_TABLES); anything else in the file is
   * ignored. The caller (Settings) validates schema_version and gets typed
   * confirmation first — this method assumes that decision is already made.
   */
  async importAll(dump) {
    const db = {};
    for (const table of KNOWN_TABLES) {
      const rows = Array.isArray(dump.tables?.[table]) ? dump.tables[table] : [];
      db[table] = rows.map(row => ({ ...row, id: row.id || makeId() }));
    }
    migrateLocalDb(db);
    localDb = db;
    persistLocal();
  },
  /* Rough storage usage for the Settings meter. */
  async storageInfo() {
    const recordsBytes = (localStorage.getItem(LS_KEY) || '').length * 2; // UTF-16
    let quota = null;
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate().catch(() => null);
      if (est) quota = est.quota ?? null;
    }
    return { recordsBytes, recordsLimit: 5 * 1024 * 1024, quota };
  },
};

/* ------------------------------------------------------------
   API adapter — the Supabase Edge Function → Supabase tables.
   Sends the Supabase session JWT as a Bearer token.
   ------------------------------------------------------------ */
/* Read the persisted Supabase session straight from localStorage. supabase-js
   stores it there at login under `sb-<ref>-auth-token`; reading it directly
   means a routine read/write never has to load supabase-js from a CDN at
   request time (that runtime import proved flaky in the field — a transient
   esm.sh hiccup surfaced as "Importing a module script failed" on save). */
function readStoredSession() {
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    let raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) { raw = localStorage.getItem(k); break; }
      }
    }
    if (!raw) return null;
    // supabase-js v2 may store the session base64-encoded behind a `base64-`
    // prefix; decode that before parsing so we don't silently miss the token.
    if (raw.startsWith('base64-')) {
      try { raw = atob(raw.slice(7)); } catch { /* fall through to JSON.parse */ }
    }
    const p = JSON.parse(raw);
    return p && p.access_token ? p : (p?.currentSession || p?.session || null);
  } catch { return null; }
}

async function getAccessToken() {
  // Primary path: ask supabase-js for the session. getSession() returns a
  // currently-valid token and transparently refreshes an expired one, so this
  // is what avoids the 401 UNAUTHORIZED_ASYMMETRIC_JWT that a stale cached
  // token produces. Only if the CDN client fails to load do we fall back to
  // whatever token is cached in localStorage.
  try {
    const { getSession } = await import('./auth.js');
    const fresh = await getSession();
    if (fresh?.access_token) return fresh.access_token;
  } catch { /* CDN import failed — fall back to the cached token below */ }
  const cached = readStoredSession();
  return cached?.access_token || null;
}

async function workerFetch(path, opts = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      // Supabase Edge Functions expect the anon key as `apikey`.
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

const apiAdapter = {
  // Table paths are always lowercase — the function's routes are lowercase.
  async list(table) {
    const out = await workerFetch(`/api/${table.toLowerCase()}`);
    return out.records || [];
  },
  async create(table, record) {
    return workerFetch(`/api/${table.toLowerCase()}`, {
      method: 'POST', body: JSON.stringify(record),
    });
  },
  async update(table, id, patch) {
    return workerFetch(`/api/${table.toLowerCase()}/${id}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    });
  },
  async remove(table, id) {
    return workerFetch(`/api/${table.toLowerCase()}/${id}`, { method: 'DELETE' });
  },
  async reset() {
    throw new Error('Reset is only available in local mode. On the shared backend, clearing the team\'s data is a deliberate operation done in Supabase — it must not be one click in the app.');
  },
  async startFresh() {
    throw new Error('Starting fresh is only available in local mode. On the shared backend, clearing the team\'s data is a deliberate operation done in Supabase — it must not be one click in the app.');
  },
  /* Shared-mode replace-all, orchestrated from the client (there is no
     dedicated endpoint for it). It wipes the shared data and rebuilds it from
     the backup, so the caller MUST download a safety export first (settings.js
     does) and gate it behind a typed confirmation.
       - Delete children before parents and create parents before children so
         foreign keys never block.
       - Preserve every id, so cross-record references survive.
     NOT atomic: a mid-way failure leaves partial state — the safety export is
     the recovery. */
  async importAll(dump) {
    const delOrder = ['briefs', 'insights', 'pricing_reactions', 'conversations', 'contacts',
      'competitor_updates', 'prospects', 'competitors', 'pricing_ideas',
      'market_facts', 'questions'];
    const createOrder = ['questions', 'competitors', 'prospects', 'pricing_ideas',
      'market_facts', 'contacts', 'conversations', 'competitor_updates',
      'pricing_reactions', 'insights', 'briefs'];

    for (const table of delOrder) {
      const existing = await apiAdapter.list(table);
      for (const row of existing) {
        if (row && row.id != null) await apiAdapter.remove(table, row.id);
      }
    }
    for (const table of createOrder) {
      const rows = Array.isArray(dump.tables?.[table]) ? dump.tables[table] : [];
      for (const row of rows) await apiAdapter.create(table, row); // id preserved in the body
    }
  },
  async storageInfo() {
    return { recordsBytes: null, recordsLimit: null, quota: null };
  },
};

export const data = DATA_MODE === 'api' ? apiAdapter : localAdapter;
export const isLocalMode = DATA_MODE !== 'api';

/* ------------------------------------------------------------
   AI endpoints — gated on AI_MODE, NOT on the data mode. The
   Edge Function holds every secret; these are the only paths to it.
   ------------------------------------------------------------ */
export const aiAvailable = AI_MODE === 'worker';

const AI_OFF_MESSAGE = 'The assistant connects when AI_MODE is set to \'worker\' in js/config.js — see HANDOFF.md.';

/* In local data mode the backend has no database to read, so AI requests
   carry the relevant workspace slices in the body. Pure function of the
   caller's state (screens pass STATE) — data.js never imports app.js. */
export function aiDataSlices(state) {
  if (!isLocalMode) return undefined; // shared mode: the function reads Supabase itself
  return {
    questions: state.questions,
    insights: state.insights,
    competitors: state.competitors,
    competitor_updates: state.competitor_updates,
    prospects: state.prospects,
    contacts: state.contacts,
    conversations: state.conversations,
    pricing_ideas: state.pricing_ideas,
    pricing_reactions: state.pricing_reactions,
    market_facts: state.market_facts,
  };
}

/* Chat goes through the backend whenever AI_MODE is 'worker'. */
export async function chatRequest(payload) {
  if (!aiAvailable) throw new Error(AI_OFF_MESSAGE);
  return workerFetch('/api/chat', { method: 'POST', body: JSON.stringify(payload) });
}

/* Draft one written section from the evidence — POST /api/draft-section.
   The draft always lands in an editable box; nothing is ever auto-saved. */
export async function draftSectionRequest(payload) {
  if (!aiAvailable) throw new Error(AI_OFF_MESSAGE);
  return workerFetch('/api/draft-section', { method: 'POST', body: JSON.stringify(payload) });
}
