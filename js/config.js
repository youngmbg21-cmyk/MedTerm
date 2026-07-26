/* ============================================================
   CONFIG — single source of truth for everything configurable.
   No screen may define its own copy of anything in this file.
   ============================================================ */

/* 'local' — data lives in this browser's storage, seeded with a starting
             workspace, zero credentials. This is the default so the app
             opens and works immediately.
   'api'   — data is shared between Young and Simon through Supabase.
             BEFORE switching this to 'api': run sql/schema.sql in the
             Supabase SQL editor and redeploy the claude-proxy function
             (see HANDOFF.md). Then change the one word below. */
export const DATA_MODE = 'local';

/* Your unique Supabase Connection Credentials */
export const SUPABASE_URL = 'https://qezefhbywzvhgcavnopu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlemVmaGJ5d3p2aGdjYXZub3B1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMzI0OTMsImV4cCI6MjA5ODkwODQ5M30.zCRQEL8V2scNq80d8ibIQynTb-mNtALwOFpTsXLozk4';

/* Routed to your secure Supabase Edge Function to communicate with Claude AI */
export const WORKER_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;

/* Turned 'worker' mode ON to activate your AI features. */
export const AI_MODE = 'worker';

/* Bumped whenever the exported-backup shape changes incompatibly. Import
   checks this before touching any data — see js/data.js importAll(). */
export const SCHEMA_VERSION = 2;

/* ------------------------------------------------------------
   The programme — five stages of going to market. STAGE drives
   nothing except the label on the Overview; every screen is
   always available, because research does not run in a line.
   ------------------------------------------------------------ */
export const CURRENT_STAGE = 1;

export const STAGES = [
  { n: 0, name: 'Setting up',   long: 'Workspace set up, questions agreed' },
  { n: 1, name: 'Talking',      long: 'Discovery conversations with prospects' },
  { n: 2, name: 'Pricing',      long: 'Testing what people will pay' },
  { n: 3, name: 'Deciding',     long: 'Answering the five questions' },
  { n: 4, name: 'Selling',      long: 'First paid pilots' },
];

/* ------------------------------------------------------------
   PIPELINE — the one status ladder a prospect climbs. Used by
   every dropdown, filter and board. ONE definition.
   ------------------------------------------------------------ */
export const PIPELINE = [
  { name: 'To contact', tone: 'line',  hint: 'On the list, not yet approached' },
  { name: 'Contacted',  tone: 'info',  hint: 'Reached out, waiting on a reply' },
  { name: 'Talked',     tone: 'violet', hint: 'Had a real conversation' },
  { name: 'Interested', tone: 'gold',  hint: 'Wants to see more, or asked about price' },
  { name: 'Pilot',      tone: 'green', hint: 'Agreed to try it — paid or unpaid' },
  { name: 'Not a fit',  tone: 'rose',  hint: 'Closed out, with the reason written down' },
];
export const PIPELINE_NAMES = PIPELINE.map(s => s.name);
export const PIPELINE_LIVE = ['To contact', 'Contacted', 'Talked', 'Interested', 'Pilot'];
export const pipelineTone = (s) => (PIPELINE.find(p => p.name === s) || {}).tone || 'line';

/* Prospects in these statuses with no movement for this many days
   count as "going cold" on the Overview needs-attention panel. */
export const STALL_DAYS = 14;

/* ------------------------------------------------------------
   Prospect segments — the three tiers from RESEARCH_BRIEF.md.
   `target` is how many conversations we want in each tier.
   ------------------------------------------------------------ */
export const SEGMENTS = [
  { name: 'Mid-size corporate',  target: 8, hint: 'FMCG, manufacturing, logistics, agri — 100+ live contracts, 1–3 legal staff' },
  { name: 'High-volume, thin legal', target: 5, hint: 'Insurance, SACCO, hospital group, schools, NGOs' },
  { name: 'Law firm / counsel',  target: 4, hint: 'Boutique firms and independent counsel — the services wedge' },
  { name: 'Enterprise',          target: 2, hint: 'Banks, telcos, multinationals — slow, but worth listening to' },
];
export const SEGMENT_NAMES = SEGMENTS.map(s => s.name);

export const SECTORS = ['FMCG / manufacturing', 'Logistics & warehousing', 'Agri-processing',
  'Insurance & brokerage', 'Banking & SACCO', 'Healthcare', 'Education', 'Real estate & property',
  'NGO / donor-funded', 'Professional services', 'Technology', 'Other'];

export const CHANNELS = ['Intro / referral', 'Email', 'LinkedIn', 'WhatsApp', 'Phone',
  'In person', 'Event', 'Inbound'];

/* ------------------------------------------------------------
   Competitors
   ------------------------------------------------------------ */
export const COMPETITOR_TYPES = [
  'Global CLM',
  'E-signature',
  'Regional / African',
  'Kenyan / local',
  'Adjacent tool',
  'Status quo',
];

/* ------------------------------------------------------------
   Pricing
   ------------------------------------------------------------ */
export const PRICING_MODELS = [
  'Per seat / month',
  'Flat workspace / month',
  'Per contract',
  'Onboarding fee (one-off)',
  'Services retainer',
  'Free tier + paid upgrade',
];

export const REACTIONS = [
  { name: 'Too expensive', tone: 'rose' },
  { name: 'About right',   tone: 'green' },
  { name: 'Cheap',         tone: 'gold' },
  { name: 'Wrong shape',   tone: 'violet' },
  { name: 'Could not say', tone: 'line' },
];
export const REACTION_NAMES = REACTIONS.map(r => r.name);
export const reactionTone = (r) => (REACTIONS.find(x => x.name === r) || {}).tone || 'line';

/* ------------------------------------------------------------
   Market & regulation facts. Every fact carries a source link —
   that rule is enforced in the form, not just asked for.
   ------------------------------------------------------------ */
export const FACT_CATEGORIES = [
  'Market size',
  'Data Protection Act',
  'Stamp duty',
  'E-signature law',
  'Tax & procurement',
  'Competitor pricing',
  'Industry data',
  'Other',
];

/* How much weight a fact carries. Deliberately words, never a percentage —
   a number here would be false precision. */
export const FACT_STRENGTH = [
  { name: 'Primary source', tone: 'green',  hint: 'The law, the regulator, the company itself' },
  { name: 'Reported',       tone: 'info',   hint: 'Reputable secondary reporting' },
  { name: 'Estimate',       tone: 'gold',   hint: 'Someone\'s calculation, including ours' },
  { name: 'Needs checking', tone: 'rose',   hint: 'Heard it, have not verified it' },
];
export const FACT_STRENGTH_NAMES = FACT_STRENGTH.map(f => f.name);
export const factStrengthTone = (s) => (FACT_STRENGTH.find(f => f.name === s) || {}).tone || 'line';

/* ------------------------------------------------------------
   Insights — the link between a finding and a question.
   ------------------------------------------------------------ */
export const DIRECTIONS = [
  { name: 'Supports',  tone: 'green' },
  { name: 'Challenges', tone: 'rose' },
  { name: 'Context',   tone: 'info' },
];
export const DIRECTION_NAMES = DIRECTIONS.map(d => d.name);
export const directionTone = (d) => (DIRECTIONS.find(x => x.name === d) || {}).tone || 'line';

/* Where an insight came from. Keeps the ledger honest about whether a
   finding is grounded in a conversation or is someone's hunch. */
export const EVIDENCE_KINDS = ['Conversation', 'Competitor', 'Market fact', 'Pricing test', 'Our own thinking'];

/* A question's standing. Never a score — a leaning plus what would move it. */
export const QUESTION_STATUS = [
  { name: 'Open',      tone: 'line',  hint: 'No real evidence either way yet' },
  { name: 'Leaning',   tone: 'gold',  hint: 'Evidence is pointing somewhere, not enough to act on' },
  { name: 'Answered',  tone: 'green', hint: 'We know enough to decide, and we have written down why' },
  { name: 'Parked',    tone: 'info',  hint: 'Deliberately not chasing this right now' },
];
export const QUESTION_STATUS_NAMES = QUESTION_STATUS.map(q => q.name);
export const questionTone = (s) => (QUESTION_STATUS.find(q => q.name === s) || {}).tone || 'line';

/* ------------------------------------------------------------
   Team — two founders, editable display names. Nothing outside
   this block may hardcode a person's name.
   ------------------------------------------------------------ */
const TEAM_LS_KEY = 'hati_team_v1';
const TEAM_DEFAULTS = { lead: 'Young', partner: 'Simon' };

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
export function teamOptions()  { const t = getTeam(); return [t.lead, t.partner]; }
export function ownerOptions() { const t = getTeam(); return [t.lead, t.partner, 'Both']; }
