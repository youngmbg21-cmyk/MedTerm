/* ============================================================
   DATA ACCESS — the only module that talks to storage.
   Screens must never call fetch or localStorage directly.

   Interface:
     data.list(table)            -> array of records
     data.create(table, record)  -> created record
     data.update(table, id, patch) -> updated record
     data.remove(table, id)      -> { deleted: true }
     data.reset()                -> local mode only: re-seed demo data

   Records are flat snake_case objects matching sql/schema.sql.
   ============================================================ */
import { DATA_MODE, WORKER_URL } from './config.js';
import { buildSeed } from './seed.js';

const LS_KEY = 'medterm_data_v1';

/* ------------------------------------------------------------
   Local adapter — localStorage, seeded on first run.
   ------------------------------------------------------------ */
function makeId() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function seedDb() {
  const seed = buildSeed();
  const db = {};
  const base = Date.now();
  let i = 0;
  for (const [table, rows] of Object.entries(seed)) {
    db[table] = rows.map(r => ({
      id: makeId(),
      // stagger created_at so insertion order survives a created_at sort
      created_at: new Date(base - (rows.length - (i++)) * 60000).toISOString(),
      ...r,
    }));
  }
  return db;
}

let localDb = null;

function loadLocalDb() {
  if (localDb) return localDb;
  try {
    localDb = JSON.parse(localStorage.getItem(LS_KEY));
  } catch { localDb = null; }
  if (!localDb || typeof localDb !== 'object') {
    localDb = seedDb();
    persistLocal();
  }
  return localDb;
}

function persistLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(localDb));
}

function nextInterviewId(rows) {
  const max = rows.reduce((m, r) => {
    const n = parseInt((r.interview_id || '').replace('INT-', ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return 'INT-' + String(max + 1).padStart(3, '0');
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
    if (table === 'interviews' && !row.interview_id) {
      row.interview_id = nextInterviewId(db[table]);
    }
    db[table].push(row);
    persistLocal();
    return { ...row };
  },
  async update(table, id, patch) {
    const db = loadLocalDb();
    const idx = (db[table] || []).findIndex(r => r.id === id);
    if (idx < 0) throw new Error(`Record not found: ${table}/${id}`);
    db[table][idx] = { ...db[table][idx], ...patch, updated_at: new Date().toISOString() };
    persistLocal();
    return { ...db[table][idx] };
  },
  async remove(table, id) {
    const db = loadLocalDb();
    db[table] = (db[table] || []).filter(r => r.id !== id);
    persistLocal();
    return { deleted: true };
  },
  async reset() {
    localDb = seedDb();
    persistLocal();
  },
};

/* ------------------------------------------------------------
   API adapter — Cloudflare Worker → Supabase.
   Sends the Supabase session JWT as a Bearer token.
   Untestable without secrets; kept ready for go-live.
   ------------------------------------------------------------ */
async function getAccessToken() {
  // Lazy import so local mode never loads the Supabase CDN client.
  const { getSession } = await import('./auth.js');
  const session = await getSession();
  return session?.access_token || null;
}

async function workerFetch(path, opts = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

const apiAdapter = {
  // Table paths are always lowercase — the Worker's routes are lowercase.
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
    throw new Error('Reset is only available in local demo mode.');
  },
};

export const data = DATA_MODE === 'api' ? apiAdapter : localAdapter;
export const isLocalMode = DATA_MODE !== 'api';

/* Chat goes through the Worker in api mode; unavailable locally. */
export async function chatRequest(payload) {
  if (isLocalMode) throw new Error('The assistant connects when API keys are added.');
  return workerFetch('/api/chat', { method: 'POST', body: JSON.stringify(payload) });
}
