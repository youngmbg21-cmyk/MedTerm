/* ============================================================
   CONFIG — single source of truth for everything configurable.
   No screen may define its own copy of anything in this file.
   ============================================================ */

/* 'local' — data lives in localStorage, seeded with demo data, zero credentials.
   'api'   — data lives in Supabase via the Cloudflare Worker; requires login. */
export const DATA_MODE = 'local';

/* Only used in 'api' mode, or whenever AI_MODE = 'worker'. */
export const WORKER_URL = 'https://YOUR-WORKER.workers.dev';

/* 'off'    — no AI anywhere (calm disabled states, everything else works).
   'worker' — AI via WORKER_URL, regardless of DATA_MODE. This enables the
              intended production setup: local-first data + live AI. With
              DATA_MODE 'local', the client sends the worker the data slices
              it needs in the request body; nothing is stored server-side.
              Requires the same magic-link sign-in as api mode (identity
              only — the Claude key never reaches the browser). */
export const AI_MODE = 'off';

/* Bumped whenever the exported-backup shape changes incompatibly. Import
   checks this before touching any data — see js/data.js importAll(). */
export const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------
   Phases — the app's spine. CURRENT_PHASE drives nav gating.
   ------------------------------------------------------------ */
export const CURRENT_PHASE = 1;

export const PHASES = [
  { n: 0, name: 'Foundation',   long: 'Foundation & onboarding' },
  { n: 1, name: 'Outreach',     long: 'Outreach & recruitment' },
  { n: 2, name: 'Interviews',   long: 'Qualitative interviews' },
  { n: 3, name: 'Sense-making', long: 'Sense-making' },
  { n: 4, name: 'Economics',    long: 'Economics' },
  { n: 5, name: 'Decision',     long: 'Decision' },
];

/* ------------------------------------------------------------
   Segments — name + interview target, used by every dropdown,
   filter, and the saturation screen. ONE definition.
   ------------------------------------------------------------ */
export const SEGMENTS = [
  { name: 'Patient',          target: 8 },
  { name: 'Caregiver',        target: 6 },
  { name: 'Hospital IPD',     target: 5 },
  { name: 'Aggregator',       target: 3 },
  { name: 'Agent',            target: 4 },
  { name: 'Insurance broker', target: 2 },
  { name: 'Diaspora family',  target: 4 },
];
export const SEGMENT_NAMES = SEGMENTS.map(s => s.name);

/* ------------------------------------------------------------
   Theme taxonomy
   ------------------------------------------------------------ */
export const THEMES = [
  'Discovery — WhatsApp/personal', 'Discovery — search/online', 'Discovery — broker/agent',
  'Trust — doctor reputation', 'Trust — price clarity', 'Trust — speed of reply', 'Trust — accreditation',
  'Friction — slow response', 'Friction — paperwork', 'Friction — language', 'Friction — money transfer', 'Friction — quote chasing',
  'Pain — financial', 'Pain — emotional', 'Pain — coordination', 'Pain — outcome',
  'Money — willingness to pay', 'Money — broker commission', 'Money — insurance',
  'Buyer — family abroad', 'Buyer — Nairobi family', 'Buyer — Hospital IPD',
];

export const OUTREACH_STATUSES = ['Cold', 'Sent', 'Replied', 'Booked', 'Done', 'Declined'];
export const CHANNELS = ['LinkedIn', 'Email', 'In-person', 'Phone', 'WhatsApp', 'Facebook'];

/* Outreach contacts in these statuses with no movement for this many
   days count as "stalled" on the Overview needs-attention panel. */
export const STALL_DAYS = 10;

/* ------------------------------------------------------------
   Team — two roles, editable display names. Nothing outside this
   block may hardcode a person's name.
   ------------------------------------------------------------ */
const TEAM_LS_KEY = 'medterm_team_v1';
const TEAM_DEFAULTS = { lead: 'Young', field: 'Simon' };

let teamCache = null;
const teamListeners = [];

export function getTeam() {
  if (!teamCache) {
    try {
      teamCache = { ...TEAM_DEFAULTS, ...(JSON.parse(localStorage.getItem(TEAM_LS_KEY)) || {}) };
    } catch { teamCache = { ...TEAM_DEFAULTS }; }
  }
  return { ...teamCache };
}

export function setTeam(patch) {
  teamCache = { ...getTeam(), ...patch };
  localStorage.setItem(TEAM_LS_KEY, JSON.stringify(teamCache));
  teamListeners.forEach(fn => { try { fn(getTeam()); } catch { /* listener errors must not break others */ } });
}

export function onTeamChange(fn) { teamListeners.push(fn); }

/* People options for dropdowns. */
export function interviewerOptions() { const t = getTeam(); return [t.lead, t.field]; }
export function ownerOptions()       { const t = getTeam(); return [t.lead, t.field, 'Joint']; }
