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
const IDB_NAME = 'medterm_files_v1';

/* ------------------------------------------------------------
   IndexedDB blob store — local-mode home for uploaded files.
   (localStorage is far too small for files.)
   ------------------------------------------------------------ */
function openFileDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(id, blob) {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(id) {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('files').objectStore('files').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(id) {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear() {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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
    if (table === 'documents') await idbDelete(id).catch(() => {});
    return { deleted: true };
  },
  async reset() {
    localDb = seedDb();
    persistLocal();
    await idbClear().catch(() => {});
  },

  /* File blobs live in IndexedDB, keyed by the document record's id. */
  async putFile(id, blob) { await idbPut(id, blob); },
  async getFile(id, record) {
    const blob = await idbGet(id);
    if (blob) return blob;
    // Seeded text documents have no stored blob — rebuild from text_content.
    if (record?.text_content != null) {
      return new Blob([record.text_content], { type: record.mime_type || 'text/plain' });
    }
    return null;
  },

  /* Rough storage usage for the Settings meter. */
  async storageInfo() {
    const recordsBytes = (localStorage.getItem(LS_KEY) || '').length * 2; // UTF-16
    let filesBytes = null, quota = null;
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate().catch(() => null);
      if (est) { filesBytes = est.usage ?? null; quota = est.quota ?? null; }
    }
    return { recordsBytes, recordsLimit: 5 * 1024 * 1024, filesBytes, quota };
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

  /* Files go to Supabase Storage through the Worker (base64 JSON keeps the
     Worker simple; fine for field documents up to ~10 MB). */
  async putFile(id, blob) {
    const base64 = await blobToBase64(blob);
    await workerFetch(`/api/documents/${id}/file`, {
      method: 'POST',
      body: JSON.stringify({ base64, mime_type: blob.type }),
    });
  },
  async getFile(id, record) {
    const { url } = await workerFetch(`/api/documents/${id}/link`);
    if (!url && record?.text_content != null) {
      return new Blob([record.text_content], { type: record.mime_type || 'text/plain' });
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`File fetch failed: ${res.status}`);
    return res.blob();
  },
  async storageInfo() {
    return { recordsBytes: null, recordsLimit: null, filesBytes: null, quota: null };
  },
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export const data = DATA_MODE === 'api' ? apiAdapter : localAdapter;
export const isLocalMode = DATA_MODE !== 'api';

/* Chat goes through the Worker in api mode; unavailable locally. */
export async function chatRequest(payload) {
  if (isLocalMode) throw new Error('The assistant connects when API keys are added.');
  return workerFetch('/api/chat', { method: 'POST', body: JSON.stringify(payload) });
}
