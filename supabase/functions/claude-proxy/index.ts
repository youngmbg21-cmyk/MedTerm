/**
 * MedTerminal — Supabase Edge Function `claude-proxy`
 *
 * The single backend for the app, mirroring the Cloudflare `worker.js` so the
 * whole thing runs with NO Cloudflare account. It serves two surfaces:
 *
 * AI (AI_MODE = 'worker'):
 *   POST .../claude-proxy/api/chat            — assistant panel (tool use loop)
 *   POST .../claude-proxy/api/assessment      — Decision Brief "Regenerate"
 *   POST .../claude-proxy/api/propose-links   — evidence-link proposals after a save
 *   POST .../claude-proxy/api/draft-section   — every AI-first drafting surface
 *   POST .../claude-proxy                     — bare call = chat (admin.html "Test connection")
 *
 * Shared data (DATA_MODE = 'api') — the synced team workspace:
 *   GET/POST/PATCH/DELETE .../claude-proxy/api/<table>[/<id>]   — record CRUD
 *   POST  .../claude-proxy/api/documents/<id>/file             — upload a file
 *   GET   .../claude-proxy/api/documents/<id>/link             — signed download URL
 *
 * Data seam: in local data mode the client sends the workspace slices it needs
 * in `localData`; in api mode this function reads/writes Supabase directly with
 * the service role, so every active team member shares one database.
 *
 * Auth: the caller must be signed in AND an ACTIVE row in `team_members`
 * (matched by auth user id). Anyone can request a magic link, so membership —
 * not merely a valid login — is what keeps the shared workspace private to the
 * team. Roles: lead/partner can write; only lead can delete non-document rows.
 *
 * Claude API key: read from the `settings` table (key = 'claude_api_key'), which
 * the admin page writes. Falls back to the ANTHROPIC_API_KEY / CLAUDE_API_KEY
 * Edge Function secret if the table has no key.
 *
 * Secrets available automatically to every Edge Function: SUPABASE_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_MODEL = 'claude-sonnet-4-5';
const STORAGE_BUCKET = 'field-documents';

const SYSTEM_PROMPT = `You are MedTerminal, a senior research director embedded in a six-phase qualitative research programme. The programme is investigating whether a patient-side medical tourism platform (for Kenyan patients travelling to India for treatment) is viable enough to build.

You speak in a direct, warm, honest voice. Editorial, not corporate. Conservative on claims — if evidence is thin, say so.

Voice rules:
- Use "sense-making" not "synthesis"
- Use "phase" not "sprint"
- Avoid "it's worth noting", "in conclusion", "leverage" as a verb
- Numbers without sources are suspicious — cite or hedge
- First use: spell out Hospital IPD (International Patient Department)
- Never give medical advice

The six phases:
0. Foundation & onboarding
1. Outreach & exploratory interviews
2. Depth interviews (across all segments, to their configured targets, until themes saturate)
3. Sense-making (theme ranking, segment cards, kill-list, top-3 pains)
4. Economics & stress-test (unit economics, break-point analysis)
5. Decision & scoping (decision memo: GO / PIVOT / NO-GO)

The buyer hypotheses and kill criteria are first-class records in the workspace —
they are injected below under HYPOTHESIS BOARD with their live statuses, and you can
query them with the query_hypotheses and query_evidence_links tools. Never invent or
assume hypotheses beyond that board.

The same-day tagging rule is the most important data quality mechanism. Every interview must be tagged in the matrix the same day it happens. Untagged interviews are lost interviews.

When answering:
- Reference specific interview IDs, participant codes, theme names — not generic advice
- Cite the data you're drawing from
- If asked "what should I do today?", name a specific person, deliverable, or interview
- If evidence is thin on a topic, say so explicitly

--- YOUR ROLE AS A STRATEGY ANALYST ---
Beyond reporting where the programme stands, you are the team's strategy analyst. Your job is to REASON from the evidence to its business implications — not just describe the data. When a question has strategic weight (viability, positioning, pricing, go-to-market, sequencing, risk, "should we build this"), work it deliberately:

1. Read the evidence first. Pull the relevant interviews, matrix entries, segment cards, economics, kill list, and evidence links BEFORE you reason. A strategic claim with no cited evidence is an inference — label it one.
2. Reason across the lenses that matter, and say which ones the evidence actually supports versus where you are inferring:
   - Demand — how sharp and how widespread is the pain? A top-3 pain for a real segment, or an occasional annoyance?
   - Willingness to pay — does the WTP signal survive the gap between what people say and what they'd pay? Where is it thin?
   - Unit economics — do the numbers in the economics table survive their own break-point? Name the single assumption the case rests on.
   - Trust & moat — why would a Kenyan patient trust this over a hospital's own International Patient Department (IPD) or an existing agent? What is defensible?
   - Execution & regulatory risk — what must be true operationally, and what could kill it? Map risks to the kill criteria on the board.
3. Land on a read, not a shrug. State the leaning (GO / PIVOT / NO-GO / INSUFFICIENT), the one or two things it hinges on, and the single most valuable piece of evidence you do not yet have. Then argue the strongest case AGAINST your own read before the team has to.

You may reason beyond the literal records — draw implications, propose strategy, name second-order effects, sketch what to test next — but keep inference visibly separate from cited evidence, and stay conservative when the data is thin (~28 interviews is a small n; treat it like one). You still argue, never decide: the leaning is advisory, the humans co-sign, divergence gets written down, and no numeric confidence scores appear anywhere.

--- HOW TO FORMAT YOUR REPLIES ---
Replies are read on a phone. Make them scannable and professional:
- Open with a one-line takeaway, not a preamble.
- When a reply has parts, use short "## " section headers (2–4 words), each led by ONE relevant emoji — e.g. "## 📊 Demand", "## ⚠️ Biggest risk", "## 💰 Economics", "## ✅ What's working", "## 🔎 What to test next". One emoji per header only; never sprinkle emojis inside sentences or use them as decoration.
- Bold the few phrases that carry the decision. Use "- " bullet lists for parallel points and keep each bullet to one line.
- Write leanings as the bare tokens GO, PIVOT, NO-GO, or INSUFFICIENT — the app styles them; do not wrap them in asterisks.
- Never output horizontal rules ("---", "***", "___"), a bare "#" with no text, markdown tables, or code fences around prose. No rows of dashes as separators.
- Keep it tight: a phone reply is usually 3–8 short lines. Expand only when the question genuinely needs it.

This workspace is the team's sole repository. You have tools that reach everything in it:
search_notes covers every notes field and document contents; read_document returns full
document text (PDFs are transcribed, images shown to you). Search before saying you don't
know, and cite filenames and interview IDs when you quote from notes or documents.`;

/* Output-shape rules for every structured AI feature. */
const OUTPUT_SHAPE_RULES = `Non-negotiable output-shape rules:
- No numeric confidence scores. With ~28 interviews, "63% confident" is theater. Use a leaning (GO / PIVOT / NO-GO / INSUFFICIENT) plus a strength label per hypothesis (strong / moderate / thin).
- Every claim cites its evidence — interview IDs, matrix entry IDs, filenames. A claim without a citation must be marked as inference.
- "What would change this" is mandatory. Every hypothesis assessment must name the concrete evidence that would flip it.
- The AI argues; it never decides. The AI's leaning is advisory. Humans hold the verdict and co-sign. Divergence from the AI is allowed but must be written down.`;

/* ------------------------------------------------------------ CORS + JSON */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

/* ------------------------------------------------------------ Supabase REST
   Only used for the Claude key lookup, best-effort chat persistence, and the
   Supabase branch of fetchRows (api data mode). Uses the service role. */
type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_ANON_KEY: string;
  CLAUDE_API_KEY: string;
};

async function supabaseRequest(method: string, path: string, body: unknown, env: Env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=representation',
    },
    body: body && (method === 'POST' || method === 'PATCH') ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { data, status: res.status };
}

/* One data seam: rows come from the client's request body (local-first) or from
   Supabase (api mode). Filtering always happens in JS, so both modes match. */
async function fetchRows(env: Env, localData: Record<string, unknown[]> | null, table: string) {
  if (localData) return Array.isArray(localData[table]) ? localData[table] : [];
  const { data } = await supabaseRequest('GET', `${table}?order=created_at.desc&limit=1000`, null, env);
  return Array.isArray(data) ? data : [];
}

/* ------------------------------------------------------------ Claude */
async function callClaude(env: Env, body: Record<string, unknown>) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  return res.json();
}

function claudeText(result: any) {
  return (result.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
}

/* Pull the first JSON object/array out of a completion (tolerates code fences). */
function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const firstObj = candidate.indexOf('{');
  const firstArr = candidate.indexOf('[');
  const start = (firstArr !== -1 && (firstArr < firstObj || firstObj === -1)) ? firstArr : firstObj;
  if (start === -1) throw new Error('No JSON found in response');
  const end = candidate[start] === '{' ? candidate.lastIndexOf('}') : candidate.lastIndexOf(']');
  if (end <= start) throw new Error('Unterminated JSON in response');
  return JSON.parse(candidate.slice(start, end + 1));
}

/* ------------------------------------------------------------ Validation */
const LEANINGS = ['GO', 'PIVOT', 'NO-GO', 'INSUFFICIENT'];
const STRENGTHS = ['strong', 'moderate', 'thin'];
const DIRECTIONS = ['strengthening', 'weakening', 'unclear'];
const KILL_STATUSES = ['unknown', 'holding', 'breached'];

function validateAssessment(a: any, hypotheses: any[]) {
  const errors: string[] = [];
  if (!a || typeof a !== 'object' || Array.isArray(a)) return { ok: false, errors: ['Response is not a JSON object'] };
  if (!LEANINGS.includes(a.leaning)) errors.push(`leaning must be one of ${LEANINGS.join(' / ')}`);
  if (!a.summary_markdown || typeof a.summary_markdown !== 'string') {
    errors.push('summary_markdown is required');
  } else {
    if (!/the case against this leaning/i.test(a.summary_markdown)) {
      errors.push('summary_markdown must contain a paragraph titled "The case against this leaning"');
    }
    if (/\d+(\.\d+)?\s*%\s*(confiden|certain|sure|probab|likel)/i.test(a.summary_markdown)) {
      errors.push('No numeric confidence scores anywhere');
    }
  }
  const buyerCodes = hypotheses.filter(h => h.kind === 'buyer_hypothesis').map(h => h.code);
  const killCodes = hypotheses.filter(h => h.kind === 'kill_criterion').map(h => h.code);

  if (!Array.isArray(a.per_hypothesis)) {
    errors.push('per_hypothesis must be an array');
  } else {
    const seen = new Set(a.per_hypothesis.map((p: any) => p && p.hypothesis_code));
    buyerCodes.forEach(c => { if (!seen.has(c)) errors.push(`per_hypothesis is missing ${c}`); });
    a.per_hypothesis.forEach((p: any) => {
      const tag = p?.hypothesis_code || '?';
      if (!buyerCodes.includes(p?.hypothesis_code)) errors.push(`per_hypothesis has unknown code ${tag}`);
      if (!STRENGTHS.includes(p?.strength)) errors.push(`${tag}: strength must be ${STRENGTHS.join('/')}`);
      if (!DIRECTIONS.includes(p?.direction)) errors.push(`${tag}: direction must be ${DIRECTIONS.join('/')}`);
      if (!p?.what_would_change) errors.push(`${tag}: what_would_change is mandatory`);
      if (!Array.isArray(p?.key_evidence)) errors.push(`${tag}: key_evidence must be an array`);
      else p.key_evidence.forEach((ev: any, i: number) => {
        if (!ev || !ev.cite) errors.push(`${tag}: key_evidence[${i}] is missing its cite`);
      });
    });
  }

  if (!Array.isArray(a.breakpoints)) {
    errors.push('breakpoints must be an array');
  } else {
    const seenK = new Set(a.breakpoints.map((b: any) => b && b.code));
    killCodes.forEach(c => { if (!seenK.has(c)) errors.push(`breakpoints is missing ${c}`); });
    a.breakpoints.forEach((b: any) => {
      if (!KILL_STATUSES.includes(b?.status)) errors.push(`${b?.code || '?'}: breakpoint status must be ${KILL_STATUSES.join('/')}`);
    });
  }
  return { ok: errors.length === 0, errors };
}

function validateDraftFields(parsed: any, fields: any[]) {
  const errors: string[] = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['Response is not a JSON object'] };
  }
  const wanted = fields.map(f => f.key);
  wanted.forEach(k => {
    const v = parsed[k];
    if (typeof v !== 'string' || !v.trim()) errors.push(`${k}: required, must be a non-empty string`);
    else if (/\d+(\.\d+)?\s*%\s*(confiden|certain|sure|probab|likel)/i.test(v)) errors.push(`${k}: no numeric confidence scores anywhere`);
  });
  Object.keys(parsed).forEach(k => { if (!wanted.includes(k)) errors.push(`unexpected field ${k}`); });
  return { ok: errors.length === 0, errors };
}

function validateProposals(arr: any, hypotheses: any[]) {
  const errors: string[] = [];
  if (!Array.isArray(arr)) return { ok: false, errors: ['Response must be a JSON array'] };
  if (arr.length > 2) errors.push('Propose at most 2 links');
  const codes = new Set(hypotheses.map(h => h.code));
  arr.forEach((p: any, i: number) => {
    if (!codes.has(p?.hypothesis_code)) errors.push(`proposal[${i}]: unknown hypothesis_code`);
    if (!['supports', 'contradicts', 'neutral'].includes(p?.direction)) errors.push(`proposal[${i}]: direction must be supports/contradicts/neutral`);
    if (!['strong', 'moderate', 'weak'].includes(p?.strength)) errors.push(`proposal[${i}]: strength must be strong/moderate/weak`);
    if (!p?.note) errors.push(`proposal[${i}]: note is required`);
  });
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------ Prompt builders */
function hypothesesPromptSection(hypotheses: any[]) {
  const bySort = [...hypotheses].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const line = (hyp: any) => `- ${hyp.code} [status: ${hyp.status}]: ${hyp.title} — ${hyp.description}${hyp.status_note ? ` (status note: ${hyp.status_note})` : ''}`;
  const buyers = bySort.filter(h => h.kind === 'buyer_hypothesis').map(line).join('\n');
  const kills = bySort.filter(h => h.kind === 'kill_criterion').map(line).join('\n');
  return `Buyer hypotheses being tested:\n${buyers || '(none defined)'}\n\nKill criteria — break-points that kill the patient-pays model:\n${kills || '(none defined)'}`;
}

function resolveEvidence(link: any, ws: any) {
  switch (link.evidence_type) {
    case 'interview': {
      const r = ws.interviews.find((i: any) => i.interview_id === link.evidence_id);
      return r ? `interview ${r.interview_id} (${r.segment || '?'}, ${r.date || '?'}): ${r.brief_topic || '(no topic)'}`
        : `interview ${link.evidence_id} (record not found)`;
    }
    case 'matrix': {
      const r = ws.matrix.find((m: any) => m.id === link.evidence_id);
      return r ? `matrix entry ${r.id} (${r.interview_id || '?'}, ${r.theme_tag || '?'}, sev ${r.severity ?? '?'}, WTP ${r.wtp || '?'}): "${(r.quote || '').slice(0, 220)}"`
        : `matrix entry ${link.evidence_id} (record not found)`;
    }
    case 'field_check': {
      const r = ws.field_checks.find((f: any) => f.id === link.evidence_id);
      return r ? `field check ${r.id} [${r.confirmed ? 'confirmed' : 'unconfirmed'}]: ${r.assumption}${r.notes ? ` — ${r.notes}` : ''}`
        : `field check ${link.evidence_id} (record not found)`;
    }
    case 'document': {
      const r = ws.documents.find((d: any) => d.id === link.evidence_id);
      return r ? `document "${r.filename}"${r.interview_id ? ` (${r.interview_id})` : ''}: ${r.description || ''}`
        : `document ${link.evidence_id} (record not found)`;
    }
    case 'economics': {
      const r = ws.economics.find((e: any) => e.id === link.evidence_id);
      return r ? `economics model "${r.model_name}": assumptions ${JSON.stringify(r.assumptions)}`
        : `economics record ${link.evidence_id} (record not found)`;
    }
    default:
      return `${link.evidence_type} ${link.evidence_id}`;
  }
}

function evidenceLedgerText(ws: any) {
  const bySort = [...ws.hypotheses].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return bySort.map((hyp: any) => {
    const links = ws.evidence_links.filter((l: any) => l.hypothesis_id === hyp.id);
    const lines = links.map((l: any) =>
      `  - [${l.direction}/${l.strength || '?'}, ${l.source}] ${resolveEvidence(l, ws)} — link note: ${l.note || '(none)'}`
    ).join('\n');
    return `${hyp.code} [${hyp.status}] ${hyp.title} — ${hyp.description}${hyp.status_note ? `\n  status note: ${hyp.status_note}` : ''}\n${lines || '  (no evidence linked yet)'}`;
  }).join('\n\n');
}

function workspaceContextText(ws: any, { phase, segments }: { phase: number; segments?: any[] }) {
  const segCounts: Record<string, number> = {};
  ws.interviews.forEach((r: any) => { if (r.segment) segCounts[r.segment] = (segCounts[r.segment] || 0) + 1; });
  const segLine = (segments && segments.length)
    ? segments.map(s => `${s.name}=${segCounts[s.name] || 0}/${s.target}`).join(', ')
    : Object.entries(segCounts).map(([s, n]) => `${s}=${n}`).join(', ');
  const themes: Record<string, number> = {};
  ws.matrix.forEach((r: any) => { if (r.theme_tag) themes[r.theme_tag] = (themes[r.theme_tag] || 0) + 1; });
  const criteria = ws.deliverables.filter((d: any) => d.phase === phase)
    .map((d: any) => `- [${d.status}] ${d.deliverable}${d.evidence ? ` — ${d.evidence}` : ''}`).join('\n');
  const untagged = ws.interviews.filter((r: any) => r.tagged_same_day !== 'Y').map((r: any) => r.interview_id);
  const econ = ws.economics.map((e: any) => `- ${e.model_name}: assumptions ${JSON.stringify(e.assumptions)}${e.derived ? `, derived ${JSON.stringify(e.derived)}` : ''}`).join('\n');
  const kills = ws.kill_list.map((k: any) => `- KILLED (${k.killed_date}): ${k.hypothesis} — ${k.evidence}`).join('\n');

  return `Current phase: ${phase}
Interviews logged: ${ws.interviews.length} (by segment vs target: ${segLine || 'none'})
Untagged interviews: ${untagged.length}${untagged.length ? ` (${untagged.join(', ')})` : ''}
Matrix entries: ${ws.matrix.length}. Theme frequencies: ${Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, n]) => `${t}=${n}`).join(', ') || 'none'}
Evidence links: ${ws.evidence_links.length}
Field checks: ${ws.field_checks.length} (${ws.field_checks.filter((f: any) => !f.confirmed).length} unconfirmed)
Documents on file: ${ws.documents.length}

Phase ${phase} exit criteria:
${criteria || '(none defined)'}

Unit-economics inputs (kill-criteria relevant):
${econ || '(none saved yet)'}

Killed hypotheses (append-only kill list):
${kills || '(none)'}

EVIDENCE LEDGER (grouped by hypothesis — cite these ids):
${evidenceLedgerText(ws)}`;
}

async function gatherWorkspace(env: Env, localData: Record<string, unknown[]> | null) {
  const tables = ['hypotheses', 'evidence_links', 'ai_assessments', 'interviews', 'matrix',
    'field_checks', 'documents', 'economics', 'deliverables', 'kill_list', 'outreach'];
  const rows = await Promise.all(tables.map(t => fetchRows(env, localData, t)));
  const ws: Record<string, any[]> = {};
  tables.forEach((t, i) => { ws[t] = rows[i] as any[]; });
  return ws;
}

/* ------------------------------------------------------------ Tool execution */
async function executeToolCall(
  name: string,
  input: Record<string, any>,
  env: Env,
  localData: Record<string, unknown[]> | null,
): Promise<any> {
  const cap = (n: any, d = 50) => Math.min(Number(n) || d, 50);
  switch (name) {
    case 'query_outreach': {
      let rows: any[] = await fetchRows(env, localData, 'outreach');
      if (input.status) rows = rows.filter(r => r.status === input.status);
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      rows = rows.slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_interviews': {
      let rows: any[] = await fetchRows(env, localData, 'interviews');
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      if (input.interviewer) rows = rows.filter(r => r.interviewer === input.interviewer);
      if (input.tagged) rows = rows.filter(r => r.tagged_same_day === input.tagged);
      rows = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_matrix': {
      let rows: any[] = await fetchRows(env, localData, 'matrix');
      if (input.theme_tag) rows = rows.filter(r => r.theme_tag === input.theme_tag);
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      if (input.min_severity) rows = rows.filter(r => (+r.severity || 0) >= input.min_severity);
      if (input.wtp) rows = rows.filter(r => r.wtp === input.wtp);
      rows = rows.slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_scripts': {
      let rows: any[] = await fetchRows(env, localData, 'scripts');
      if (input.script_name) rows = rows.filter(r => r.script_name === input.script_name);
      rows = [...rows].sort((a, b) => (b.version || 0) - (a.version || 0));
      return { records: rows, count: rows.length };
    }
    case 'query_deliverables': {
      let rows: any[] = await fetchRows(env, localData, 'deliverables');
      if (input.phase !== undefined) rows = rows.filter(r => r.phase === input.phase);
      if (input.status) rows = rows.filter(r => r.status === input.status);
      rows = [...rows].sort((a, b) => (a.phase || 0) - (b.phase || 0));
      return { records: rows, count: rows.length };
    }
    case 'query_economics': {
      let rows: any[] = await fetchRows(env, localData, 'economics');
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      rows = rows.slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_segment_cards': {
      let rows: any[] = await fetchRows(env, localData, 'segment_cards');
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      return { records: rows, count: rows.length };
    }
    case 'query_kill_list': {
      const rows: any[] = (await fetchRows(env, localData, 'kill_list')).slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_hypotheses': {
      let rows: any[] = await fetchRows(env, localData, 'hypotheses');
      if (input.kind) rows = rows.filter(r => r.kind === input.kind);
      if (input.code) rows = rows.filter(r => r.code === input.code);
      rows = [...rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      return { records: rows, count: rows.length };
    }
    case 'query_evidence_links': {
      const hypotheses: any[] = await fetchRows(env, localData, 'hypotheses');
      let rows: any[] = await fetchRows(env, localData, 'evidence_links');
      if (input.hypothesis_code) {
        const hyp = hypotheses.find(x => x.code === input.hypothesis_code);
        rows = hyp ? rows.filter(r => r.hypothesis_id === hyp.id) : [];
      }
      if (input.direction) rows = rows.filter(r => r.direction === input.direction);
      if (input.evidence_type) rows = rows.filter(r => r.evidence_type === input.evidence_type);
      rows = rows.slice(0, cap(input.limit));
      const [interviews, matrix, field_checks, documents, economics] = await Promise.all(
        ['interviews', 'matrix', 'field_checks', 'documents', 'economics'].map(t => fetchRows(env, localData, t)));
      const ws = { interviews, matrix, field_checks, documents, economics };
      const records = rows.map(l => ({
        ...l,
        hypothesis_code: hypotheses.find(x => x.id === l.hypothesis_id)?.code || l.hypothesis_id,
        resolved_evidence: resolveEvidence(l, ws),
      }));
      return { records, count: records.length };
    }
    case 'get_latest_assessment': {
      const rows: any[] = await fetchRows(env, localData, 'ai_assessments');
      const latest = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      if (!latest) return { assessment: null, note: 'No assessment has been generated yet. The team can run one from the Decision Brief screen.' };
      return { assessment: latest, count: rows.length };
    }
    case 'search_notes': {
      const q = String(input.query || '').trim().toLowerCase();
      if (!q) return { error: 'Empty query' };
      const lim = Math.min(input.limit || 10, 25);
      const has = (...fields: any[]) => fields.some(f => String(f || '').toLowerCase().includes(q));
      const clip = (s: any, n = 1500) => (s || '').slice(0, n);

      const [interviews, outreach, matrix, deliverables, documents] = await Promise.all(
        ['interviews', 'outreach', 'matrix', 'deliverables', 'documents'].map(t => fetchRows(env, localData, t)));

      return {
        query: q,
        interviews: interviews.filter((r: any) => has(r.notes_markdown, r.brief_topic)).slice(0, lim)
          .map((r: any) => ({ interview_id: r.interview_id, date: r.date, segment: r.segment, brief_topic: r.brief_topic, notes: clip(r.notes_markdown) })),
        outreach: outreach.filter((r: any) => has(r.notes)).slice(0, lim)
          .map((r: any) => ({ name: r.name, segment: r.segment, status: r.status, notes: clip(r.notes, 500) })),
        matrix: matrix.filter((r: any) => has(r.quote, r.notes)).slice(0, lim)
          .map((r: any) => ({ id: r.id, interview_id: r.interview_id, theme_tag: r.theme_tag, segment: r.segment, severity: r.severity, wtp: r.wtp, quote: clip(r.quote, 500), notes: clip(r.notes, 300) })),
        deliverables: deliverables.filter((r: any) => has(r.evidence)).slice(0, lim)
          .map((r: any) => ({ phase: r.phase, deliverable: r.deliverable, status: r.status, evidence: clip(r.evidence, 800) })),
        documents: documents.filter((r: any) => has(r.filename, r.description, r.text_content)).slice(0, lim)
          .map((r: any) => ({ id: r.id, filename: r.filename, segment: r.segment, interview_id: r.interview_id, description: r.description, snippet: clip(r.text_content, 800) })),
      };
    }
    case 'list_documents': {
      let rows: any[] = await fetchRows(env, localData, 'documents');
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      if (input.interview_id) rows = rows.filter(r => r.interview_id === input.interview_id);
      const documents = rows.map(({ text_content, file_base64, ...rest }: any) => rest);
      return { documents, count: documents.length };
    }
    case 'read_document': {
      const rows: any[] = await fetchRows(env, localData, 'documents');
      let doc: any = null;
      if (input.document_id) doc = rows.find(r => r.id === input.document_id);
      else if (input.filename) {
        const f = String(input.filename).trim().toLowerCase();
        doc = rows.find(r => String(r.filename || '').toLowerCase().includes(f));
      } else return { error: 'Provide filename or document_id' };
      if (!doc) return { error: 'Document not found. Use list_documents to see what exists.' };

      if (doc.text_content) {
        return { filename: doc.filename, mime_type: doc.mime_type, description: doc.description, contents: doc.text_content.slice(0, 20000) };
      }
      if (localData) {
        return { error: `"${doc.filename}" is a binary file stored only in the team's browser (local data mode). Its text was not extracted. Ask the user to open it from the Documents screen.` };
      }

      const fileRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${doc.id}`, {
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
      });
      if (!fileRes.ok) return { error: `File missing from storage (${fileRes.status}).` };
      const buf = new Uint8Array(await fileRes.arrayBuffer());
      let binary = '';
      for (let i = 0; i < buf.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
      }
      const b64 = btoa(binary);

      if ((doc.mime_type || '').startsWith('image/')) {
        return { __image: { media_type: doc.mime_type, data: b64 }, filename: doc.filename, description: doc.description };
      }
      if (doc.mime_type === 'application/pdf') {
        const tr = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 8000,
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
                { type: 'text', text: 'Transcribe this document faithfully as plain text. Preserve headings, tables (as rows), and all figures. Do not summarise or omit anything.' },
              ],
            }],
          }),
        });
        if (!tr.ok) return { error: `PDF transcription failed: ${await tr.text()}` };
        const out = await tr.json();
        const text = (out.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
        await supabaseRequest('PATCH', `documents?id=eq.${doc.id}`, { text_content: text.slice(0, 200000) }, env);
        return { filename: doc.filename, mime_type: doc.mime_type, description: doc.description, contents: text.slice(0, 20000), note: 'Transcribed from PDF and cached for future searches.' };
      }
      return { error: `Unsupported file type for reading: ${doc.mime_type}. Ask the user to re-upload as PDF or text.` };
    }
    case 'propose_action':
      return { proposed: true };
    case 'generate_report':
      return { message: 'Report generation acknowledged. The report content follows in the response text.' };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/* ------------------------------------------------------------ Claude key */
async function getClaudeApiKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data, error } = await admin.from('settings').select('value').eq('key', 'claude_api_key').single();
    if (error || !data) return null;
    return (data as any).value || null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ Endpoint handlers */
async function handleAssessment(body: any, env: Env, member: Member | null) {
  const trigger = ['manual', 'phase_exit', 'weekly'].includes(body.trigger) ? body.trigger : 'manual';
  const phase = Number.isInteger(body.phase) ? body.phase : 0;
  const localData = body.localData || null;

  const ws = await gatherWorkspace(env, localData);
  if (!ws.hypotheses.length) return errorResponse('No hypotheses defined — seed the hypotheses table first.', 400);
  const previous = [...ws.ai_assessments].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const buyerCodes = ws.hypotheses.filter((h: any) => h.kind === 'buyer_hypothesis').map((h: any) => h.code);
  const killCodes = ws.hypotheses.filter((h: any) => h.kind === 'kill_criterion').map((h: any) => h.code);

  const system = `${SYSTEM_PROMPT}

${OUTPUT_SHAPE_RULES}

If the evidence is thin, say INSUFFICIENT. An honest INSUFFICIENT is more valuable than a premature leaning. Steelman the opposite of your leaning in summary_markdown — one paragraph titled 'The case against this leaning.'

You are producing a structured assessment, not a chat reply. Respond with ONLY a JSON object, no prose around it, in exactly this shape:
{
  "leaning": "GO" | "PIVOT" | "NO-GO" | "INSUFFICIENT",
  "summary_markdown": "the narrative brief (markdown; must include a paragraph titled 'The case against this leaning')",
  "per_hypothesis": [
    { "hypothesis_code": "<one entry for EACH of: ${buyerCodes.join(', ')}>",
      "direction": "strengthening" | "weakening" | "unclear",
      "strength": "strong" | "moderate" | "thin",
      "key_evidence": [ { "type": "interview|matrix|field_check|document|economics", "id": "<record id from the ledger>", "cite": "<human-readable citation, e.g. INT-007 or a filename>", "why": "<one line>" } ],
      "gaps": "<what evidence is missing>",
      "what_would_change": "<the concrete evidence that would flip this assessment>" }
  ],
  "breakpoints": [
    { "code": "<one entry for EACH of: ${killCodes.join(', ')}>",
      "status": "unknown" | "holding" | "breached",
      "evidence": [ { "type": "...", "id": "...", "cite": "...", "why": "..." } ],
      "note": "<one line>" }
  ]
}`;

  const userMsg = `${workspaceContextText(ws, { phase, segments: body.segments })}

${previous ? `PREVIOUS ASSESSMENT (for continuity — note what changed since):
${String(previous.created_at).slice(0, 10)} · ${previous.leaning} (trigger: ${previous.trigger}, phase ${previous.phase})
${(previous.per_hypothesis || []).map((p: any) => `- ${p.hypothesis_code}: ${p.direction}/${p.strength}`).join('\n')}` : 'No previous assessment — this is the first.'}

Produce the assessment JSON now. Trigger: ${trigger}.`;

  const claudeBase = { model: CLAUDE_MODEL, max_tokens: 8000, system };
  let result = await callClaude(env, { ...claudeBase, messages: [{ role: 'user', content: userMsg }] });
  let raw = claudeText(result);
  let parsed: any = null;
  let check: any;
  try { parsed = extractJson(raw); check = validateAssessment(parsed, ws.hypotheses); }
  catch (e) { check = { ok: false, errors: [(e as Error).message] }; }

  if (!check.ok) {
    result = await callClaude(env, { ...claudeBase, messages: [
      { role: 'user', content: userMsg },
      { role: 'assistant', content: raw || '(empty)' },
      { role: 'user', content: `Your response failed validation:\n- ${check.errors.join('\n- ')}\n\nReturn the corrected JSON object only — no prose, no code fences.` },
    ] });
    raw = claudeText(result);
    try { parsed = extractJson(raw); check = validateAssessment(parsed, ws.hypotheses); }
    catch (e) { check = { ok: false, errors: [(e as Error).message] }; }
  }
  if (!check.ok) return errorResponse(`Assessment failed validation after one retry: ${check.errors.join('; ')}`, 502);

  const record = {
    trigger, phase,
    leaning: parsed.leaning,
    summary_markdown: parsed.summary_markdown,
    per_hypothesis: parsed.per_hypothesis,
    breakpoints: parsed.breakpoints,
    data_snapshot: {
      interviews: ws.interviews.length,
      matrix_entries: ws.matrix.length,
      evidence_links: ws.evidence_links.length,
      field_checks: ws.field_checks.length,
      documents: ws.documents.length,
    },
    model: CLAUDE_MODEL,
  };

  if (localData) {
    return jsonResponse({ assessment: { ...record, created_at: new Date().toISOString() }, persisted: false });
  }
  const { data, status } = await supabaseRequest('POST', 'ai_assessments', { ...record, created_by: member?.id }, env);
  const created = Array.isArray(data) ? data[0] : data;
  return jsonResponse({ assessment: created, persisted: true }, status);
}

async function handleProposeLinks(body: any, env: Env) {
  const { entry_type, entry } = body;
  if (!['matrix', 'field_check', 'economics'].includes(entry_type) || !entry) {
    return errorResponse('entry_type (matrix|field_check|economics) and entry are required', 400);
  }
  const localData = body.localData || null;
  const hypotheses = await fetchRows(env, localData, 'hypotheses');
  if (!hypotheses.length) return jsonResponse({ proposals: [] });
  const links = await fetchRows(env, localData, 'evidence_links');
  const evidenceId = entry.id;
  if (!evidenceId) return errorResponse('entry.id is required', 400);
  const existing = links.filter((l: any) => l.evidence_id === evidenceId);

  const system = `${SYSTEM_PROMPT}

${OUTPUT_SHAPE_RULES}

You review one just-saved record and decide whether it bears on any hypothesis or kill criterion. Respond with ONLY a JSON array of 0 to 2 proposals:
[ { "hypothesis_code": "H1", "direction": "supports" | "contradicts" | "neutral", "strength": "strong" | "moderate" | "weak", "note": "<one line: why this evidence bears on this hypothesis>" } ]
For kill criteria, "supports" means the evidence pushes the criterion toward breach.
Return [] if nothing clearly bears on the board — most records link to nothing, and silence is better than noise. Never duplicate an existing link.`;

  const userMsg = `HYPOTHESIS BOARD:
${hypothesesPromptSection(hypotheses)}

JUST-SAVED RECORD (${entry_type}):
${JSON.stringify(entry, null, 2)}

EXISTING LINKS FOR THIS RECORD (do not duplicate):
${existing.map((l: any) => `- ${hypotheses.find((hyp: any) => hyp.id === l.hypothesis_id)?.code || l.hypothesis_id}: ${l.direction} (${l.note})`).join('\n') || '(none)'}

Return the JSON array now.`;

  let proposals: any[] = [];
  try {
    let result = await callClaude(env, { model: CLAUDE_MODEL, max_tokens: 1000, system, messages: [{ role: 'user', content: userMsg }] });
    let raw = claudeText(result);
    let parsed: any = null;
    let check: any;
    try { parsed = extractJson(raw); check = validateProposals(parsed, hypotheses); }
    catch (e) { check = { ok: false, errors: [(e as Error).message] }; }
    if (!check.ok) {
      result = await callClaude(env, { model: CLAUDE_MODEL, max_tokens: 1000, system, messages: [
        { role: 'user', content: userMsg },
        { role: 'assistant', content: raw || '(empty)' },
        { role: 'user', content: `Your response failed validation:\n- ${check.errors.join('\n- ')}\n\nReturn the corrected JSON array only.` },
      ] });
      raw = claudeText(result);
      parsed = extractJson(raw);
      check = validateProposals(parsed, hypotheses);
      if (!check.ok) parsed = [];
    }
    proposals = (parsed || []).map((p: any) => {
      const hyp = hypotheses.find((x: any) => x.code === p.hypothesis_code);
      return hyp ? {
        hypothesis_id: hyp.id,
        hypothesis_code: hyp.code,
        hypothesis_title: hyp.title,
        evidence_type: entry_type,
        evidence_id: evidenceId,
        direction: p.direction,
        strength: p.strength,
        note: p.note,
      } : null;
    }).filter(Boolean);
  } catch {
    proposals = []; // fail soft — a proposal is a nicety, never worth an error banner
  }
  return jsonResponse({ proposals });
}

async function handleDraftSection(body: any, env: Env) {
  if (!body.section_label) return errorResponse('section_label is required', 400);
  const localData = body.localData || null;
  const phase = Number.isInteger(body.phase) ? body.phase : 0;
  const ws = await gatherWorkspace(env, localData);
  const docKind = body.doc_kind || 'a section of the human decision memo';
  const structured = Array.isArray(body.fields) && body.fields.length > 0;

  const shapeInstruction = structured
    ? `Return ONLY a JSON object with exactly these string fields, nothing else:
${body.fields.map((f: any) => `- "${f.key}": ${f.label}${f.placeholder ? ` (${f.placeholder})` : ''}`).join('\n')}
Each field: 1–3 sentences of plain prose. Cite inline — interview IDs (INT-007), matrix entry ids, filenames. If the evidence for a field is thin or missing, say so in that field rather than smoothing over it.`
    : `Write 150–300 words of plain prose (no headings, no JSON). Cite inline as you go — interview IDs (INT-007), matrix entry ids, filenames. If the evidence for a claim is thin or missing, say so in the text rather than smoothing over it.`;

  const system = `${SYSTEM_PROMPT}

${OUTPUT_SHAPE_RULES}

You are drafting ${docKind}: "${body.section_label}"${body.placeholder ? ` (${body.placeholder})` : ''}.
${shapeInstruction}
This is a draft the humans will edit; argue from the ledger, do not decide for them.`;

  const userMsg = `${workspaceContextText(ws, { phase, segments: body.segments })}

Draft "${body.section_label}" now.`;

  const claudeBase = { model: CLAUDE_MODEL, max_tokens: 2000, system };
  let result = await callClaude(env, { ...claudeBase, messages: [{ role: 'user', content: userMsg }] });
  if (!structured) {
    return jsonResponse({ text: claudeText(result).trim() });
  }

  let raw = claudeText(result);
  let parsed: any = null;
  let check: any;
  try { parsed = extractJson(raw); check = validateDraftFields(parsed, body.fields); }
  catch (e) { check = { ok: false, errors: [(e as Error).message] }; }
  if (!check.ok) {
    result = await callClaude(env, { ...claudeBase, messages: [
      { role: 'user', content: userMsg },
      { role: 'assistant', content: raw || '(empty)' },
      { role: 'user', content: `Your response failed validation:\n- ${check.errors.join('\n- ')}\n\nReturn the corrected JSON object only — no prose, no code fences.` },
    ] });
    raw = claudeText(result);
    try { parsed = extractJson(raw); check = validateDraftFields(parsed, body.fields); }
    catch (e) { check = { ok: false, errors: [(e as Error).message] }; }
  }
  if (!check.ok) return errorResponse(`Draft failed validation after one retry: ${check.errors.join('; ')}`, 502);
  return jsonResponse({ fields: parsed });
}

async function handleChat(body: any, env: Env, userId: string) {
  const { messages, dataContext, sessionId, tools: enableTools, localData } = body;

  // Best-effort persistence — chat still works if the chat_* tables are absent.
  let activeSessionId = sessionId;
  try {
    if (!activeSessionId) {
      const { data } = await supabaseRequest('POST', 'chat_sessions', {
        user_id: userId,
        title: messages[0]?.content?.slice(0, 80) || 'Chat session',
      }, env);
      activeSessionId = Array.isArray(data) ? (data[0] as any)?.id : (data as any)?.id;
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'user') {
      await supabaseRequest('POST', 'chat_messages', { session_id: activeSessionId, role: 'user', content: lastMsg.content }, env);
    }
  } catch { /* persistence is optional in this setup */ }

  const chatHypotheses = await fetchRows(env, localData || null, 'hypotheses');
  const systemMessage = `${SYSTEM_PROMPT}\n\n--- HYPOTHESIS BOARD (live records — the single source of truth) ---\n${hypothesesPromptSection(chatHypotheses)}\n\n--- LIVE PROJECT DATA ---\n${dataContext || '(none provided)'}`;

  const claudeMessages = (messages || []).map((m: any) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const toolDefs = enableTools ? [
    { name: 'query_outreach', description: 'Query outreach contacts with optional filters. Returns matching records.', input_schema: { type: 'object', properties: { status: { type: 'string', description: 'Filter by status: Cold, Sent, Replied, Booked, Done, Declined' }, segment: { type: 'string', description: 'Filter by segment' }, limit: { type: 'number', description: 'Max records to return (default 20)' } } } },
    { name: 'query_interviews', description: 'Query interview records with optional filters.', input_schema: { type: 'object', properties: { segment: { type: 'string', description: 'Filter by segment' }, interviewer: { type: 'string', description: 'Filter by interviewer name' }, tagged: { type: 'string', description: 'Filter by tagged status: Y or N' }, limit: { type: 'number', description: 'Max records to return (default 20)' } } } },
    { name: 'query_matrix', description: 'Query theme matrix entries with optional filters.', input_schema: { type: 'object', properties: { theme_tag: { type: 'string', description: 'Filter by theme tag' }, segment: { type: 'string', description: 'Filter by segment' }, min_severity: { type: 'number', description: 'Minimum severity (1-5)' }, wtp: { type: 'string', description: 'Filter by WTP: Y, Maybe, N' }, limit: { type: 'number', description: 'Max records to return (default 20)' } } } },
    { name: 'query_scripts', description: 'Query interview scripts. Returns the latest version of each script.', input_schema: { type: 'object', properties: { script_name: { type: 'string', description: 'Filter by script name' } } } },
    { name: 'query_deliverables', description: 'Query phase deliverables and exit criteria.', input_schema: { type: 'object', properties: { phase: { type: 'number', description: 'Filter by phase number (0-5)' }, status: { type: 'string', description: 'Filter by status' } } } },
    { name: 'query_economics', description: 'Query the unit-economics rows: assumptions, cost/revenue lines, break-point analysis. Use this for any pricing, margin, or "do the numbers work" question — never estimate economics you can query.', input_schema: { type: 'object', properties: { segment: { type: 'string', description: 'Filter by segment (optional)' }, limit: { type: 'number', description: 'Max records to return (default 50)' } } } },
    { name: 'query_segment_cards', description: 'Query the per-segment synthesis cards: each segment\'s top pains, willingness-to-pay read, demand strength, and the summary the team has written. The fastest way to compare segments strategically.', input_schema: { type: 'object', properties: { segment: { type: 'string', description: 'Filter by segment name (optional)' } } } },
    { name: 'query_kill_list', description: 'Query the kill list — ideas, segments, or features the team has explicitly ruled out, with the reason and who killed it. Read this before proposing anything, so you never re-propose a killed direction.', input_schema: { type: 'object', properties: { limit: { type: 'number', description: 'Max records to return (default 50)' } } } },
    { name: 'search_notes', description: 'Full-text search across EVERYTHING written in the workspace: interview field notes and topics, outreach notes, matrix quotes and notes, deliverable evidence, and document descriptions/contents. Use this whenever a question could be answered by the team\'s notes.', input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Words to search for (case-insensitive substring match)' }, limit: { type: 'number', description: 'Max results per table (default 10)' } }, required: ['query'] } },
    { name: 'list_documents', description: 'List uploaded field documents (filename, segment, linked interview, description).', input_schema: { type: 'object', properties: { segment: { type: 'string', description: 'Filter by segment' }, interview_id: { type: 'string', description: 'Filter by linked interview, e.g. INT-004' } } } },
    { name: 'read_document', description: 'Read the full contents of an uploaded document by its filename or id. Text/CSV/markdown return verbatim text; PDFs are transcribed; images are returned for you to look at.', input_schema: { type: 'object', properties: { filename: { type: 'string', description: 'Exact or partial filename' }, document_id: { type: 'string', description: 'Document record id (alternative to filename)' } } } },
    { name: 'query_hypotheses', description: 'Query the hypothesis board: buyer hypotheses (H1–H3) and kill criteria (K1–K3) with their live statuses and status notes.', input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['buyer_hypothesis', 'kill_criterion'], description: 'Filter by kind (optional)' }, code: { type: 'string', description: 'Filter by code, e.g. H2 (optional)' } } } },
    { name: 'query_evidence_links', description: 'Query evidence links — the records tying interviews, matrix entries, field checks, documents, and economics to hypotheses. Each link carries direction (supports/contradicts/neutral), strength, a note, and provenance (human or ai_confirmed).', input_schema: { type: 'object', properties: { hypothesis_code: { type: 'string', description: 'Filter by hypothesis code, e.g. H2' }, direction: { type: 'string', enum: ['supports', 'contradicts', 'neutral'], description: 'Filter by direction' }, evidence_type: { type: 'string', enum: ['interview', 'matrix', 'field_check', 'document', 'economics'], description: 'Filter by evidence type' }, limit: { type: 'number', description: 'Max records to return (default 50)' } } } },
    { name: 'get_latest_assessment', description: 'Get the most recent AI assessment: leaning (GO/PIVOT/NO-GO/INSUFFICIENT), narrative summary, per-hypothesis directions with cited evidence, and break-point statuses. Assessments are append-only; this returns the newest.', input_schema: { type: 'object', properties: {} } },
    { name: 'propose_action', description: 'Propose an action for the user to confirm. The action will be shown to the user with a Confirm/Skip button. For add_evidence_link the payload needs hypothesis_id, evidence_type, evidence_id, direction, strength, note. For update_hypothesis_status the payload needs id, status, and a status_note explaining why.', input_schema: { type: 'object', properties: { action_type: { type: 'string', enum: ['add_interview', 'update_deliverable', 'add_matrix_entry', 'flag_quote', 'add_evidence_link', 'update_hypothesis_status'], description: 'Type of action' }, description: { type: 'string', description: 'Human-readable description of what this action does' }, payload: { type: 'object', description: 'The data to write' } }, required: ['action_type', 'description', 'payload'] } },
    { name: 'generate_report', description: 'Generate a report. Types: weekly_status, phase_exit, investor_briefing, decision_memo.', input_schema: { type: 'object', properties: { report_type: { type: 'string', enum: ['weekly_status', 'phase_exit', 'investor_briefing', 'decision_memo'], description: 'Type of report' }, parameters: { type: 'object', description: 'Additional parameters for the report' } }, required: ['report_type'] } },
  ] : undefined;

  const claudeBody: Record<string, unknown> = { model: CLAUDE_MODEL, max_tokens: 4096, system: systemMessage, messages: claudeMessages };
  if (toolDefs) claudeBody.tools = toolDefs;

  let result = await callClaude(env, claudeBody);
  const actions: any[] = [];
  const textParts: string[] = [];
  let toolRound = 0;
  const maxToolRounds = 5;

  while (result.stop_reason === 'tool_use' && toolRound < maxToolRounds) {
    toolRound++;
    const toolUseBlocks = result.content.filter((b: any) => b.type === 'tool_use');
    result.content.filter((b: any) => b.type === 'text').forEach((b: any) => textParts.push(b.text));

    const toolResults: any[] = [];
    for (const toolBlock of toolUseBlocks) {
      const toolResult = await executeToolCall(toolBlock.name, toolBlock.input, env, localData || null);
      if (toolBlock.name === 'propose_action') {
        actions.push({ action_type: toolBlock.input.action_type, description: toolBlock.input.description, payload: toolBlock.input.payload });
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: 'Action proposed to user for confirmation.' });
      } else if (toolResult && toolResult.__image) {
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: [
          { type: 'text', text: `Document: ${toolResult.filename}${toolResult.description ? ` — ${toolResult.description}` : ''}` },
          { type: 'image', source: { type: 'base64', media_type: toolResult.__image.media_type, data: toolResult.__image.data } },
        ] });
      } else {
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(toolResult).slice(0, 24000) });
      }
    }

    claudeMessages.push({ role: 'assistant', content: result.content });
    claudeMessages.push({ role: 'user', content: toolResults });
    result = await callClaude(env, { ...claudeBody, messages: claudeMessages });
  }

  if (result.content) {
    result.content.filter((b: any) => b.type === 'text').forEach((b: any) => textParts.push(b.text));
  }
  const finalText = textParts.join('\n\n') || '(empty response)';

  try {
    await supabaseRequest('POST', 'chat_messages', {
      session_id: activeSessionId,
      role: 'assistant',
      content: finalText,
      tool_calls: toolRound > 0 ? { rounds: toolRound, actions: actions.length } : null,
    }, env);
  } catch { /* persistence is optional */ }

  return jsonResponse({ text: finalText, sessionId: activeSessionId, actions, patterns: [] });
}

/* ------------------------------------------------------------ Data storage (api mode)
   These power DATA_MODE = 'api' — the shared, synced workspace. Every record
   read/write goes through the service role (RLS is enforced here in code by the
   team-membership check), so all active team members see one shared database. */

type Member = { id: string; role: string; display_name: string; userId: string };

// The only tables the app reads/writes. Anything else 404s — no arbitrary access.
const DATA_TABLES = new Set([
  'outreach', 'interviews', 'matrix', 'deliverables', 'scripts', 'reports',
  'kill_list', 'economics', 'field_checks', 'decision_memos', 'segment_cards',
  'documents', 'hypotheses', 'evidence_links', 'ai_assessments',
]);

// Which column records "who created this" on insert — it is NOT `created_by`
// everywhere (see sql/schema.sql). Tables absent here have no such column, so
// we stamp nothing. Stamping a non-existent column makes PostgREST 400 (PGRST204).
const CREATOR_COLUMN: Record<string, string> = {
  outreach: 'created_by', interviews: 'created_by', matrix: 'created_by',
  scripts: 'created_by', economics: 'created_by', field_checks: 'created_by',
  decision_memos: 'created_by', segment_cards: 'created_by', documents: 'created_by',
  evidence_links: 'created_by', ai_assessments: 'created_by',
  reports: 'generated_by', kill_list: 'killed_by',
  // deliverables, hypotheses: no creator column — stamp nothing.
};

async function logAction(env: Env, actorId: string, action: string, table: string, recordId: string | null, newValues: unknown) {
  // Audit is best-effort — a write must never fail because the log did.
  try {
    await supabaseRequest('POST', 'audit_log', {
      actor_id: actorId, action, table_name: table, record_id: recordId, new_values: newValues,
    }, env);
  } catch { /* ignore */ }
}

async function handleTableCrud(method: string, table: string, recordId: string | null, req: Request, env: Env, member: Member) {
  const isWriteRole = member.role === 'lead' || member.role === 'partner';

  // ai_assessments are append-only: the trajectory over time is itself evidence.
  if (table === 'ai_assessments' && (method === 'PATCH' || method === 'DELETE')) {
    return errorResponse('Assessments are append-only — they are never updated or deleted.', 405);
  }

  if (method === 'GET') {
    const query = recordId ? `${table}?id=eq.${recordId}` : `${table}?order=created_at.desc`;
    const { data, status } = await supabaseRequest('GET', query, null, env);
    return jsonResponse({ records: Array.isArray(data) ? data : (data ? [data] : []) }, status);
  }

  if (method === 'POST' && isWriteRole) {
    const body = await req.json();
    const row = body.fields || body;
    const creatorCol = CREATOR_COLUMN[table];
    if (creatorCol) row[creatorCol] = member.id;
    if (table === 'documents') row.uploaded_by = member.display_name;
    const { data, status } = await supabaseRequest('POST', table, row, env);
    const created = Array.isArray(data) ? data[0] : data;
    await logAction(env, member.id, 'create', table, (created as any)?.id, row);
    return jsonResponse(created, status);
  }

  if (method === 'PATCH' && recordId && isWriteRole) {
    const body = await req.json();
    const fields = body.fields || body;
    const { data, status } = await supabaseRequest('PATCH', `${table}?id=eq.${recordId}`, fields, env);
    const updated = Array.isArray(data) ? data[0] : data;
    await logAction(env, member.id, 'update', table, recordId, fields);
    return jsonResponse(updated, status);
  }

  // Leads delete anywhere; partners may delete their own documents.
  if (method === 'DELETE' && recordId && (member.role === 'lead' || (table === 'documents' && isWriteRole))) {
    const { status } = await supabaseRequest('DELETE', `${table}?id=eq.${recordId}`, null, env);
    if (table === 'documents') {
      await fetch(`${env.SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${recordId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
      }).catch(() => {});
    }
    await logAction(env, member.id, 'delete', table, recordId, null);
    return jsonResponse({ deleted: true }, status);
  }

  return errorResponse('Method not allowed or insufficient permissions', 405);
}

async function handleDocumentFile(docId: string, action: string, method: string, req: Request, env: Env, member: Member) {
  const isWriteRole = member.role === 'lead' || member.role === 'partner';

  if (action === 'file' && method === 'POST' && isWriteRole) {
    const { base64, mime_type } = await req.json();
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${docId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': mime_type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!up.ok) return errorResponse(`Storage upload failed: ${await up.text()}`, 502);
    await supabaseRequest('PATCH', `documents?id=eq.${docId}`, { storage_path: docId }, env);
    return jsonResponse({ stored: true });
  }

  if (action === 'link' && method === 'GET') {
    const sign = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${docId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!sign.ok) return jsonResponse({ url: null });
    const { signedURL } = await sign.json();
    return jsonResponse({ url: `${env.SUPABASE_URL}/storage/v1${signedURL}` });
  }

  return errorResponse('Method not allowed or insufficient permissions', 405);
}

/* Verify the caller's JWT, then confirm they are an ACTIVE team member.
   Returns null for both "not signed in" and "signed in but not on the team". */
async function authenticate(req: Request, env: Env): Promise<Member | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;

  // Service role bypasses RLS for the membership lookup itself.
  const { data } = await supabaseRequest(
    'GET', `team_members?user_id=eq.${user.id}&status=eq.active&select=id,role,display_name`, null, env,
  );
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return { id: (row as any).id, role: (row as any).role, display_name: (row as any).display_name, userId: user.id };
}

/* ------------------------------------------------------------ Entry */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const env: Env = {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL') || '',
      SUPABASE_SERVICE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY') || '',
      SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') || '',
      CLAUDE_API_KEY: '',
    };

    // Must be signed in AND an active team member. This is what keeps the shared
    // workspace private to the team even though anyone can request a magic link.
    const member = await authenticate(req, env);
    if (!member) {
      return errorResponse(
        'Not authorised. You must be signed in and listed as an active member in the team_members table. Ask the project lead to add you.',
        403,
      );
    }

    const path = new URL(req.url).pathname;
    const apiIdx = path.indexOf('/api/');
    const sub = (apiIdx >= 0 ? path.slice(apiIdx + 5) : '').replace(/\/+$/, '');

    // ---- AI routes (need the Claude key) ----
    const isAiRoute = sub === '' || sub === 'chat' || sub === 'assessment' || sub === 'propose-links' || sub === 'draft-section';
    if (isAiRoute) {
      if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
      const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      env.CLAUDE_API_KEY = (await getClaudeApiKey(admin))
        || Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('CLAUDE_API_KEY') || '';
      if (!env.CLAUDE_API_KEY) {
        return errorResponse('Claude API key not configured. Set it on the admin page, or as an ANTHROPIC_API_KEY Edge Function secret.', 503);
      }
      const body = await req.json();
      if (sub === 'assessment') return await handleAssessment(body, env, member);
      if (sub === 'propose-links') return await handleProposeLinks(body, env);
      if (sub === 'draft-section') return await handleDraftSection(body, env);
      return await handleChat(body, env, member.userId); // 'chat' or bare function URL
    }

    // ---- Document file / signed-link routes ----
    const fileMatch = sub.match(/^documents\/([^/]+)\/(file|link)$/);
    if (fileMatch) return await handleDocumentFile(fileMatch[1], fileMatch[2], req.method, req, env, member);

    // ---- Table CRUD routes: <table> or <table>/<id> ----
    const parts = sub.split('/');
    if (DATA_TABLES.has(parts[0])) {
      return await handleTableCrud(req.method, parts[0], parts[1] || null, req, env, member);
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
