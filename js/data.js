/* ============================================================
   DATA ACCESS — the only module that talks to storage.
   Screens must never call fetch, localStorage, or IndexedDB directly.

   Interface:
     data.list(table)              -> array of records
     data.create(table, record)    -> created record
     data.update(table, id, patch) -> updated record
     data.remove(table, id)        -> { deleted: true }
     data.putFile(id, blob)        -> void
     data.getFile(id, record)      -> Blob | null
     data.storageInfo()            -> usage estimate for the Settings meter
     data.reset()                  -> local mode only: re-seed demo data
     data.startFresh()             -> local mode only: wipe research data,
                                       keep the stock scripts + a blank
                                       deliverables checklist
     data.importAll(dump)          -> local mode only: replace all local
                                       data with a previously exported backup

   Records are flat snake_case objects matching sql/schema.sql.
   ============================================================ */
import { DATA_MODE, AI_MODE, WORKER_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SEGMENT_NAMES } from './config.js';
import { buildSeed, buildFreshFieldworkSeed, buildHypotheses, buildScripts } from './seed.js';

const LS_KEY = 'medterm_data_v1';
const IDB_NAME = 'medterm_files_v1';

/* Every table the app knows about — importAll() only trusts these keys,
   so a malformed or hand-edited backup file can't inject arbitrary state. */
const KNOWN_TABLES = ['outreach', 'interviews', 'matrix', 'deliverables', 'scripts',
  'kill_list', 'field_checks', 'economics', 'segment_cards', 'decision_memos',
  'reports', 'documents', 'hypotheses', 'evidence_links', 'ai_assessments'];

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

function buildDb(seedFn) {
  const seed = seedFn();
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

const seedDb = () => buildDb(buildSeed);
const freshFieldworkDb = () => buildDb(buildFreshFieldworkSeed);

/* Exported for Settings' export-everything, which embeds binary document
   blobs as base64 so a single JSON file is a complete, restorable backup. */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

let localDb = null;

/* Stock scripts that were replaced when scripts became one-per-segment.
   Only untouched version-1 copies are retired — any lineage the team has
   edited (version > 1 exists) is never touched. */
const LEGACY_STOCK_SCRIPTS = ['Patient / caregiver', 'Agent / facilitator'];

/* One-time, idempotent catch-up for local workspaces created before the
   current seed: retire superseded stock scripts, upgrade untouched stock
   scripts to the current starter content AS A NEW VERSION (the old one
   stays in history, revertible), and backfill a starter script for any
   config segment that has none. Field data is never touched. */
function migrateLocalDb(db) {
  let changed = false;

  // Tables added to the app after this workspace was created are missing
  // from the stored blob — they start as empty arrays.
  KNOWN_TABLES.forEach(t => {
    if (!Array.isArray(db[t])) { db[t] = []; changed = true; }
  });

  // Workspaces created before the decision engine have an empty hypothesis
  // board, which blocks every AI assessment — backfill the stock framework
  // (H1–H3, K1–K3). A board with any records is the team's and is never touched.
  if (!db.hypotheses.length) {
    db.hypotheses = buildHypotheses();
    changed = true;
  }

  const versionsOf = (name) => db.scripts.filter(s => s.script_name === name);

  LEGACY_STOCK_SCRIPTS.forEach(name => {
    const versions = versionsOf(name);
    if (versions.length === 1 && (versions[0].version || 1) === 1) {
      db.scripts = db.scripts.filter(s => s.script_name !== name);
      changed = true;
    }
  });

  buildScripts().forEach(stock => {
    if (!SEGMENT_NAMES.includes(stock.script_name)) return;
    const versions = versionsOf(stock.script_name)
      .sort((a, b) => (b.version || 0) - (a.version || 0));
    if (!versions.length) {
      db.scripts.push({ id: makeId(), created_at: new Date().toISOString(), ...stock });
      changed = true;
    } else if (versions.length === 1 && (versions[0].version || 1) === 1
        && JSON.stringify(versions[0].content) !== JSON.stringify(stock.content)) {
      db.scripts.push({
        id: makeId(), created_at: new Date().toISOString(),
        script_name: stock.script_name, version: 2, content: stock.content,
        revert_note: 'Starter questions updated (aftercare + kill-criteria coverage)',
      });
      changed = true;
    }
  });
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

  /* Wipes every research input but keeps the stock scripts and a blank
     deliverables checklist — see buildFreshFieldworkSeed() in seed.js. */
  async startFresh() {
    localDb = freshFieldworkDb();
    persistLocal();
    await idbClear().catch(() => {});
  },

  /**
   * Replace ALL local data with a previously exported backup. Only known
   * tables are trusted (see KNOWN_TABLES); anything else in the file is
   * ignored. Binary files embedded as `file_base64` are decoded back into
   * IndexedDB and stripped from the record before it's written to
   * localStorage, so the main data blob doesn't balloon with duplicate
   * base64 text. The caller (Settings) is responsible for validating
   * schema_version and getting typed confirmation before calling this —
   * this method assumes the decision to import has already been made.
   */
  async importAll(dump) {
    await idbClear().catch(() => {});
    const db = {};
    for (const table of KNOWN_TABLES) {
      const rows = Array.isArray(dump.tables?.[table]) ? dump.tables[table] : [];
      db[table] = [];
      for (const row of rows) {
        const clean = { ...row };
        // Assign the id ONCE up front: a document blob must be stored under the
        // same id the record carries, or getFile() later can't find it.
        if (!clean.id) clean.id = makeId();
        if (table === 'documents' && clean.file_base64) {
          const blob = base64ToBlob(clean.file_base64, clean.file_mime || clean.mime_type);
          await idbPut(clean.id, blob).catch(() => {});
          delete clean.file_base64;
          delete clean.file_mime;
        }
        db[table].push(clean);
      }
    }
    // Backups made before the decision engine carry no hypotheses — restore
    // the stock framework rather than leaving the hypothesis board empty.
    if (!db.hypotheses.length) db.hypotheses = buildHypotheses();
    // Backups made before scripts became one-per-segment get the same
    // catch-up as live workspaces (legacy stock retired, starters filled in).
    migrateLocalDb(db);
    localDb = db;
    persistLocal();
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
    const p = JSON.parse(raw);
    return p && p.access_token ? p : (p?.currentSession || p?.session || null);
  } catch { return null; }
}

async function getAccessToken() {
  // Fast path: a valid cached token (60s expiry guard) — no CDN import needed.
  const session = readStoredSession();
  const exp = session?.expires_at; // seconds since epoch
  if (session?.access_token && (!exp || exp * 1000 - 60000 > Date.now())) {
    return session.access_token;
  }
  // Slow path: token missing/expired — load supabase-js to refresh or prompt
  // login. Only here do we depend on the CDN client.
  try {
    const { getSession } = await import('./auth.js');
    const fresh = await getSession();
    return fresh?.access_token || null;
  } catch { return session?.access_token || null; }
}

async function workerFetch(path, opts = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      // Supabase Edge Functions expect the anon key as `apikey`; a plain
      // Cloudflare Worker ignores it. Harmless either way.
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
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
  async startFresh() {
    throw new Error('Starting fresh is only available in local demo mode. On the live backend, clearing team data is a deliberate operation performed directly in Supabase — it must not be one click in the app, since it would affect the whole team.');
  },
  async importAll() {
    throw new Error('Import is only available in local demo mode. On the live backend, data is already shared and backed up by Supabase — importing a file here could silently overwrite live team data.');
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

export const data = DATA_MODE === 'api' ? apiAdapter : localAdapter;
export const isLocalMode = DATA_MODE !== 'api';

/* ------------------------------------------------------------
   AI endpoints — gated on AI_MODE, NOT on the data mode. The
   worker holds every secret; these are the only paths to it.
   ------------------------------------------------------------ */
export const aiAvailable = AI_MODE === 'worker';

const AI_OFF_MESSAGE = 'The assistant connects when AI_MODE is set to \'worker\' in js/config.js — see HANDOFF.md.';

/* In local data mode the worker has no database to read, so AI requests
   carry the relevant workspace slices in the body. Pure function of the
   caller's state (screens pass STATE) — data.js never imports app.js. */
export function aiDataSlices(state) {
  if (!isLocalMode) return undefined; // api mode: the worker reads Supabase itself
  return {
    hypotheses: state.hypotheses,
    evidence_links: state.evidence_links,
    ai_assessments: state.ai_assessments,
    interviews: state.interviews,
    matrix: state.matrix,
    outreach: state.outreach,
    deliverables: state.deliverables,
    field_checks: state.field_checks,
    economics: state.economics,
    kill_list: state.kill_list,
    documents: state.documents,
    scripts: state.scripts,
  };
}

/* Chat goes through the Worker whenever AI_MODE is 'worker'. */
export async function chatRequest(payload) {
  if (!aiAvailable) throw new Error(AI_OFF_MESSAGE);
  return workerFetch('/api/chat', { method: 'POST', body: JSON.stringify(payload) });
}

/* Structured assessment pipeline — POST /api/assessment.
   Returns the assessment record; in local data mode the caller persists it
   through data.create('ai_assessments', …). */
export async function assessmentRequest(payload) {
  if (!aiAvailable) throw new Error(AI_OFF_MESSAGE);
  return workerFetch('/api/assessment', { method: 'POST', body: JSON.stringify(payload) });
}

/* 0–2 proposed evidence links for a just-saved record — POST /api/propose-links. */
export async function proposeLinksRequest(payload) {
  if (!aiAvailable) throw new Error(AI_OFF_MESSAGE);
  return workerFetch('/api/propose-links', { method: 'POST', body: JSON.stringify(payload) });
}

/* Draft one decision-memo section from the evidence ledger — POST /api/draft-section. */
export async function draftSectionRequest(payload) {
  if (!aiAvailable) throw new Error(AI_OFF_MESSAGE);
  return workerFetch('/api/draft-section', { method: 'POST', body: JSON.stringify(payload) });
}
