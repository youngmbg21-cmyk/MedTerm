/**
 * MedTerminal Cloudflare Worker
 *
 * Proxies all requests between the browser and Supabase/Claude.
 * Holds all secrets — nothing sensitive reaches the frontend.
 *
 * Environment variables (set in wrangler.toml or Cloudflare dashboard):
 *   SUPABASE_URL        — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY — service_role key (full access, never expose to browser)
 *   SUPABASE_ANON_KEY   — anon key (used for auth flows)
 *   CLAUDE_API_KEY       — Anthropic API key
 *   ALLOWED_ORIGIN       — e.g. https://medterminal.netlify.app
 */

const CLAUDE_MODEL = 'claude-sonnet-4-6';
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
2. Depth interviews (target: ~30 interviews across segments until themes saturate)
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

This workspace is the team's sole repository. You have tools that reach everything in it:
search_notes covers every notes field and document contents; read_document returns full
document text (PDFs are transcribed, images shown to you). Search before saying you don't
know, and cite filenames and interview IDs when you quote from notes or documents.`;

/* Output-shape rules for every structured AI feature. Included verbatim in the
   assessment / propose-links / draft-section prompts. */
const OUTPUT_SHAPE_RULES = `Non-negotiable output-shape rules:
- No numeric confidence scores. With ~28 interviews, "63% confident" is theater. Use a leaning (GO / PIVOT / NO-GO / INSUFFICIENT) plus a strength label per hypothesis (strong / moderate / thin).
- Every claim cites its evidence — interview IDs, matrix entry IDs, filenames. A claim without a citation must be marked as inference.
- "What would change this" is mandatory. Every hypothesis assessment must name the concrete evidence that would flip it.
- The AI argues; it never decides. The AI's leaning is advisory. Humans hold the verdict and co-sign. Divergence from the AI is allowed but must be written down.`;

/* Render the live hypothesis board for prompt injection. One source of truth:
   the hypotheses table (or the client's copy of it in local data mode). */
function hypothesesPromptSection(hypotheses) {
  const bySort = [...hypotheses].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const line = (hyp) => `- ${hyp.code} [status: ${hyp.status}]: ${hyp.title} — ${hyp.description}${hyp.status_note ? ` (status note: ${hyp.status_note})` : ''}`;
  const buyers = bySort.filter(h => h.kind === 'buyer_hypothesis').map(line).join('\n');
  const kills = bySort.filter(h => h.kind === 'kill_criterion').map(line).join('\n');
  return `Buyer hypotheses being tested:\n${buyers || '(none defined)'}\n\nKill criteria — break-points that kill the patient-pays model:\n${kills || '(none defined)'}`;
}

/* One data seam for every AI feature: rows come from the client's request body
   (local-first mode) or from Supabase (api mode). Filtering happens in JS either
   way — one code path, and the two-person workspace is small enough for that. */
async function fetchRows(env, localData, table) {
  if (localData) return Array.isArray(localData[table]) ? localData[table] : [];
  const { data } = await supabaseRequest('GET', `${table}?order=created_at.desc&limit=1000`, null, env);
  return Array.isArray(data) ? data : [];
}

// Single Claude API call
async function callClaude(env, body) {
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

function claudeText(result) {
  return (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

/* Pull the first JSON object/array out of a completion (tolerates code fences). */
function extractJson(text) {
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

/* ------------------------------------------------------------
   Assessment validation — pure, so the smoke harness can test it.
   Rejects: bad leaning, missing hypothesis codes, uncited evidence,
   missing what_would_change, missing steelman, numeric confidence.
   ------------------------------------------------------------ */
const LEANINGS = ['GO', 'PIVOT', 'NO-GO', 'INSUFFICIENT'];
const STRENGTHS = ['strong', 'moderate', 'thin'];
const DIRECTIONS = ['strengthening', 'weakening', 'unclear'];
const KILL_STATUSES = ['unknown', 'holding', 'breached'];

function validateAssessment(a, hypotheses) {
  const errors = [];
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
    const seen = new Set(a.per_hypothesis.map(p => p && p.hypothesis_code));
    buyerCodes.forEach(c => { if (!seen.has(c)) errors.push(`per_hypothesis is missing ${c}`); });
    a.per_hypothesis.forEach(p => {
      const tag = p?.hypothesis_code || '?';
      if (!buyerCodes.includes(p?.hypothesis_code)) errors.push(`per_hypothesis has unknown code ${tag}`);
      if (!STRENGTHS.includes(p?.strength)) errors.push(`${tag}: strength must be ${STRENGTHS.join('/')}`);
      if (!DIRECTIONS.includes(p?.direction)) errors.push(`${tag}: direction must be ${DIRECTIONS.join('/')}`);
      if (!p?.what_would_change) errors.push(`${tag}: what_would_change is mandatory`);
      if (!Array.isArray(p?.key_evidence)) errors.push(`${tag}: key_evidence must be an array`);
      else p.key_evidence.forEach((ev, i) => {
        if (!ev || !ev.cite) errors.push(`${tag}: key_evidence[${i}] is missing its cite`);
      });
    });
  }

  if (!Array.isArray(a.breakpoints)) {
    errors.push('breakpoints must be an array');
  } else {
    const seenK = new Set(a.breakpoints.map(b => b && b.code));
    killCodes.forEach(c => { if (!seenK.has(c)) errors.push(`breakpoints is missing ${c}`); });
    a.breakpoints.forEach(b => {
      if (!KILL_STATUSES.includes(b?.status)) errors.push(`${b?.code || '?'}: breakpoint status must be ${KILL_STATUSES.join('/')}`);
    });
  }
  return { ok: errors.length === 0, errors };
}

/* Structured-draft validation — every requested field key present as a
   non-empty string, no extras, no numeric confidence anywhere. Pure, so
   the smoke harness can test it. */
function validateDraftFields(parsed, fields) {
  const errors = [];
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

/* Link-proposal validation — 0–2 proposals, known codes, enum fields, a note. */
function validateProposals(arr, hypotheses) {
  const errors = [];
  if (!Array.isArray(arr)) return { ok: false, errors: ['Response must be a JSON array'] };
  if (arr.length > 2) errors.push('Propose at most 2 links');
  const codes = new Set(hypotheses.map(h => h.code));
  arr.forEach((p, i) => {
    if (!codes.has(p?.hypothesis_code)) errors.push(`proposal[${i}]: unknown hypothesis_code`);
    if (!['supports', 'contradicts', 'neutral'].includes(p?.direction)) errors.push(`proposal[${i}]: direction must be supports/contradicts/neutral`);
    if (!['strong', 'moderate', 'weak'].includes(p?.strength)) errors.push(`proposal[${i}]: strength must be strong/moderate/weak`);
    if (!p?.note) errors.push(`proposal[${i}]: note is required`);
  });
  return { ok: errors.length === 0, errors };
}

// CORS headers
function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(data, status = 200, origin = '', env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env) },
  });
}

function errorResponse(message, status = 400, origin = '', env = {}) {
  return jsonResponse({ error: message }, status, origin, env);
}

// Verify the JWT from the Authorization header and return the user's team member record
async function authenticateRequest(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  // Verify token with Supabase
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;

  const user = await res.json();
  // Look up team member
  const tmRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/team_members?user_id=eq.${user.id}&status=eq.active&select=*`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  if (!tmRes.ok) return null;
  const members = await tmRes.json();
  return members[0] || null;
}

// Supabase REST proxy
async function supabaseRequest(method, path, body, env, token) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${token || env.SUPABASE_SERVICE_KEY}`,
    Prefer: method === 'POST' ? 'return=representation' : 'return=representation',
  };

  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const opts = { method, headers };
  if (body && (method === 'POST' || method === 'PATCH')) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const data = await res.json();
  return { data, status: res.status };
}

/* ------------------------------------------------------------
   Workspace gathering + evidence ledger for the AI endpoints.
   Every claim the model makes must trace back to what's here.
   ------------------------------------------------------------ */
async function gatherWorkspace(env, localData) {
  const tables = ['hypotheses', 'evidence_links', 'ai_assessments', 'interviews', 'matrix',
    'field_checks', 'documents', 'economics', 'deliverables', 'kill_list', 'outreach'];
  const rows = await Promise.all(tables.map(t => fetchRows(env, localData, t)));
  const ws = {};
  tables.forEach((t, i) => { ws[t] = rows[i]; });
  return ws;
}

/* One line describing the record behind an evidence link, with its citable id. */
function resolveEvidence(link, ws) {
  switch (link.evidence_type) {
    case 'interview': {
      const r = ws.interviews.find(i => i.interview_id === link.evidence_id);
      return r ? `interview ${r.interview_id} (${r.segment || '?'}, ${r.date || '?'}): ${r.brief_topic || '(no topic)'}`
        : `interview ${link.evidence_id} (record not found)`;
    }
    case 'matrix': {
      const r = ws.matrix.find(m => m.id === link.evidence_id);
      return r ? `matrix entry ${r.id} (${r.interview_id || '?'}, ${r.theme_tag || '?'}, sev ${r.severity ?? '?'}, WTP ${r.wtp || '?'}): "${(r.quote || '').slice(0, 220)}"`
        : `matrix entry ${link.evidence_id} (record not found)`;
    }
    case 'field_check': {
      const r = ws.field_checks.find(f => f.id === link.evidence_id);
      return r ? `field check ${r.id} [${r.confirmed ? 'confirmed' : 'unconfirmed'}]: ${r.assumption}${r.notes ? ` — ${r.notes}` : ''}`
        : `field check ${link.evidence_id} (record not found)`;
    }
    case 'document': {
      const r = ws.documents.find(d => d.id === link.evidence_id);
      return r ? `document "${r.filename}"${r.interview_id ? ` (${r.interview_id})` : ''}: ${r.description || ''}`
        : `document ${link.evidence_id} (record not found)`;
    }
    case 'economics': {
      const r = ws.economics.find(e => e.id === link.evidence_id);
      return r ? `economics model "${r.model_name}": assumptions ${JSON.stringify(r.assumptions)}`
        : `economics record ${link.evidence_id} (record not found)`;
    }
    default:
      return `${link.evidence_type} ${link.evidence_id}`;
  }
}

/* The full evidence ledger, grouped by hypothesis, every line citable. */
function evidenceLedgerText(ws) {
  const bySort = [...ws.hypotheses].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return bySort.map(hyp => {
    const links = ws.evidence_links.filter(l => l.hypothesis_id === hyp.id);
    const lines = links.map(l =>
      `  - [${l.direction}/${l.strength || '?'}, ${l.source}] ${resolveEvidence(l, ws)} — link note: ${l.note || '(none)'}`
    ).join('\n');
    return `${hyp.code} [${hyp.status}] ${hyp.title} — ${hyp.description}${hyp.status_note ? `\n  status note: ${hyp.status_note}` : ''}\n${lines || '  (no evidence linked yet)'}`;
  }).join('\n\n');
}

/* Compact context the assessment / draft prompts share. */
function workspaceContextText(ws, { phase, segments }) {
  const segCounts = {};
  ws.interviews.forEach(r => { if (r.segment) segCounts[r.segment] = (segCounts[r.segment] || 0) + 1; });
  const segLine = (segments && segments.length)
    ? segments.map(s => `${s.name}=${segCounts[s.name] || 0}/${s.target}`).join(', ')
    : Object.entries(segCounts).map(([s, n]) => `${s}=${n}`).join(', ');
  const themes = {};
  ws.matrix.forEach(r => { if (r.theme_tag) themes[r.theme_tag] = (themes[r.theme_tag] || 0) + 1; });
  const criteria = ws.deliverables.filter(d => d.phase === phase)
    .map(d => `- [${d.status}] ${d.deliverable}${d.evidence ? ` — ${d.evidence}` : ''}`).join('\n');
  const untagged = ws.interviews.filter(r => r.tagged_same_day !== 'Y').map(r => r.interview_id);
  const econ = ws.economics.map(e => `- ${e.model_name}: assumptions ${JSON.stringify(e.assumptions)}${e.derived ? `, derived ${JSON.stringify(e.derived)}` : ''}`).join('\n');
  const kills = ws.kill_list.map(k => `- KILLED (${k.killed_date}): ${k.hypothesis} — ${k.evidence}`).join('\n');

  return `Current phase: ${phase}
Interviews logged: ${ws.interviews.length} (by segment vs target: ${segLine || 'none'})
Untagged interviews: ${untagged.length}${untagged.length ? ` (${untagged.join(', ')})` : ''}
Matrix entries: ${ws.matrix.length}. Theme frequencies: ${Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, n]) => `${t}=${n}`).join(', ') || 'none'}
Evidence links: ${ws.evidence_links.length}
Field checks: ${ws.field_checks.length} (${ws.field_checks.filter(f => !f.confirmed).length} unconfirmed)
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

// Audit log helper
async function logAction(env, actorId, action, tableName, recordId, oldValues, newValues) {
  await supabaseRequest('POST', 'audit_log', {
    actor_id: actorId,
    action,
    table_name: tableName,
    record_id: recordId,
    old_values: oldValues,
    new_values: newValues,
  }, env);
}

// Route handler
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const path = url.pathname;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
  }

  // --- Auth endpoints (no authentication required) ---
  if (path === '/auth/magic-link' && request.method === 'POST') {
    const { email } = await request.json();
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/magiclink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    return jsonResponse(data, res.status, origin, env);
  }

  if (path === '/auth/session' && request.method === 'POST') {
    const body = await request.json();
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=magiclink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return jsonResponse(data, res.status, origin, env);
  }

  if (path === '/auth/me' && request.method === 'GET') {
    const member = await authenticateRequest(request, env);
    if (!member) return errorResponse('Not authenticated', 401, origin, env);
    return jsonResponse(member, 200, origin, env);
  }

  // --- All other endpoints require authentication ---
  const member = await authenticateRequest(request, env);
  if (!member) return errorResponse('Not authenticated', 401, origin, env);

  const isWriteRole = member.role === 'lead' || member.role === 'partner';
  const isAdmin = member.role === 'admin' || member.role === 'lead';

  // --- Structured assessment pipeline (NOT the chat loop) ---
  // Accepts { trigger, phase, segments?, localData? }. With localData the
  // workspace rides in the body (local-first data mode) and the record is
  // returned for the client to persist through data.js; otherwise the worker
  // reads Supabase and inserts the record itself. Append-only either way.
  if (path === '/api/assessment' && request.method === 'POST') {
    if (!isWriteRole) return errorResponse('Insufficient permissions', 403, origin, env);
    const body = await request.json();
    const trigger = ['manual', 'phase_exit', 'weekly'].includes(body.trigger) ? body.trigger : 'manual';
    const phase = Number.isInteger(body.phase) ? body.phase : 0;
    const localData = body.localData || null;

    const ws = await gatherWorkspace(env, localData);
    if (!ws.hypotheses.length) return errorResponse('No hypotheses defined — seed the hypotheses table first.', 400, origin, env);
    const previous = [...ws.ai_assessments]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

    const buyerCodes = ws.hypotheses.filter(h => h.kind === 'buyer_hypothesis').map(h => h.code);
    const killCodes = ws.hypotheses.filter(h => h.kind === 'kill_criterion').map(h => h.code);

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
${(previous.per_hypothesis || []).map(p => `- ${p.hypothesis_code}: ${p.direction}/${p.strength}`).join('\n')}` : 'No previous assessment — this is the first.'}

Produce the assessment JSON now. Trigger: ${trigger}.`;

    const claudeBase = { model: CLAUDE_MODEL, max_tokens: 8000, system };
    let result = await callClaude(env, { ...claudeBase, messages: [{ role: 'user', content: userMsg }] });
    let raw = claudeText(result);
    let parsed = null;
    let check;
    try { parsed = extractJson(raw); check = validateAssessment(parsed, ws.hypotheses); }
    catch (e) { check = { ok: false, errors: [e.message] }; }

    if (!check.ok) {
      // One retry with the validation errors — then give up loudly.
      result = await callClaude(env, { ...claudeBase, messages: [
        { role: 'user', content: userMsg },
        { role: 'assistant', content: raw || '(empty)' },
        { role: 'user', content: `Your response failed validation:\n- ${check.errors.join('\n- ')}\n\nReturn the corrected JSON object only — no prose, no code fences.` },
      ] });
      raw = claudeText(result);
      try { parsed = extractJson(raw); check = validateAssessment(parsed, ws.hypotheses); }
      catch (e) { check = { ok: false, errors: [e.message] }; }
    }
    if (!check.ok) {
      return errorResponse(`Assessment failed validation after one retry: ${check.errors.join('; ')}`, 502, origin, env);
    }

    const record = {
      trigger,
      phase,
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
      // Local-first: the client persists through data.js.
      return jsonResponse({ assessment: { ...record, created_at: new Date().toISOString() }, persisted: false }, 200, origin, env);
    }
    record.created_by = member.id;
    const { data, status } = await supabaseRequest('POST', 'ai_assessments', record, env);
    const created = Array.isArray(data) ? data[0] : data;
    await logAction(env, member.id, 'create', 'ai_assessments', created?.id, null, { trigger, leaning: record.leaning });
    return jsonResponse({ assessment: created, persisted: true }, status, origin, env);
  }

  // --- Evidence-link proposals for a just-saved record ---
  // Accepts { entry_type: 'matrix'|'field_check'|'economics', entry, localData? }.
  // Returns 0–2 proposals; the human confirms or skips in the UI. Fails soft:
  // a proposal is a nicety, never worth an error banner after a save.
  if (path === '/api/propose-links' && request.method === 'POST') {
    if (!isWriteRole) return errorResponse('Insufficient permissions', 403, origin, env);
    const body = await request.json();
    const { entry_type, entry } = body;
    if (!['matrix', 'field_check', 'economics'].includes(entry_type) || !entry) {
      return errorResponse('entry_type (matrix|field_check|economics) and entry are required', 400, origin, env);
    }
    const localData = body.localData || null;
    const hypotheses = await fetchRows(env, localData, 'hypotheses');
    if (!hypotheses.length) return jsonResponse({ proposals: [] }, 200, origin, env);
    const links = await fetchRows(env, localData, 'evidence_links');
    const evidenceId = entry.id;
    if (!evidenceId) return errorResponse('entry.id is required', 400, origin, env);
    const existing = links.filter(l => l.evidence_id === evidenceId);

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
${existing.map(l => `- ${hypotheses.find(hyp => hyp.id === l.hypothesis_id)?.code || l.hypothesis_id}: ${l.direction} (${l.note})`).join('\n') || '(none)'}

Return the JSON array now.`;

    let proposals = [];
    try {
      let result = await callClaude(env, { model: CLAUDE_MODEL, max_tokens: 1000, system, messages: [{ role: 'user', content: userMsg }] });
      let raw = claudeText(result);
      let parsed = null;
      let check;
      try { parsed = extractJson(raw); check = validateProposals(parsed, hypotheses); }
      catch (e) { check = { ok: false, errors: [e.message] }; }
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
      proposals = (parsed || []).map(p => {
        const hyp = hypotheses.find(x => x.code === p.hypothesis_code);
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
      proposals = []; // fail soft — see above
    }
    return jsonResponse({ proposals }, 200, origin, env);
  }

  // --- Draft any evidence-grounded document from the ledger ---
  // The ONE drafting seam for every AI-first surface (memo sections, state of
  // the field, MVP scope, report narratives). Accepts:
  //   { section_label, placeholder?, doc_kind?, phase, segments?, localData?,
  //     fields?: [{ key, label, placeholder? }] }
  // Prose mode (no fields) returns { text }; structured mode returns
  // { fields: { key: text } }, validated with one retry then a loud 502.
  // Drafts land in an edit modal client-side — they are never auto-saved.
  if (path === '/api/draft-section' && request.method === 'POST') {
    if (!isWriteRole) return errorResponse('Insufficient permissions', 403, origin, env);
    const body = await request.json();
    if (!body.section_label) return errorResponse('section_label is required', 400, origin, env);
    const localData = body.localData || null;
    const phase = Number.isInteger(body.phase) ? body.phase : 0;
    const ws = await gatherWorkspace(env, localData);
    const docKind = body.doc_kind || 'a section of the human decision memo';
    const structured = Array.isArray(body.fields) && body.fields.length > 0;

    const shapeInstruction = structured
      ? `Return ONLY a JSON object with exactly these string fields, nothing else:
${body.fields.map(f => `- "${f.key}": ${f.label}${f.placeholder ? ` (${f.placeholder})` : ''}`).join('\n')}
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
      return jsonResponse({ text: claudeText(result).trim() }, 200, origin, env);
    }

    let raw = claudeText(result);
    let parsed = null;
    let check;
    try { parsed = extractJson(raw); check = validateDraftFields(parsed, body.fields); }
    catch (e) { check = { ok: false, errors: [e.message] }; }
    if (!check.ok) {
      // One retry with the validation errors — then give up loudly.
      result = await callClaude(env, { ...claudeBase, messages: [
        { role: 'user', content: userMsg },
        { role: 'assistant', content: raw || '(empty)' },
        { role: 'user', content: `Your response failed validation:\n- ${check.errors.join('\n- ')}\n\nReturn the corrected JSON object only — no prose, no code fences.` },
      ] });
      raw = claudeText(result);
      try { parsed = extractJson(raw); check = validateDraftFields(parsed, body.fields); }
      catch (e) { check = { ok: false, errors: [e.message] }; }
    }
    if (!check.ok) {
      return errorResponse(`Draft failed validation after one retry: ${check.errors.join('; ')}`, 502, origin, env);
    }
    return jsonResponse({ fields: parsed }, 200, origin, env);
  }

  // --- Document files (Supabase Storage) — before the generic table routes ---
  const fileMatch = path.match(/^\/api\/documents\/([^/]+)\/(file|link)$/);
  if (fileMatch) {
    const [, docId, action] = fileMatch;

    if (action === 'file' && request.method === 'POST' && isWriteRole) {
      const { base64, mime_type } = await request.json();
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
      if (!up.ok) return errorResponse(`Storage upload failed: ${await up.text()}`, 502, origin, env);
      await supabaseRequest('PATCH', `documents?id=eq.${docId}`, { storage_path: docId }, env);
      return jsonResponse({ stored: true }, 200, origin, env);
    }

    if (action === 'link' && request.method === 'GET') {
      const sign = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${docId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (!sign.ok) return jsonResponse({ url: null }, 200, origin, env);
      const { signedURL } = await sign.json();
      return jsonResponse({ url: `${env.SUPABASE_URL}/storage/v1${signedURL}` }, 200, origin, env);
    }

    return errorResponse('Method not allowed or insufficient permissions', 405, origin, env);
  }

  // --- CRUD endpoints ---
  // Table mapping
  const tableRoutes = {
    '/api/outreach': 'outreach',
    '/api/interviews': 'interviews',
    '/api/matrix': 'matrix',
    '/api/deliverables': 'deliverables',
    '/api/scripts': 'scripts',
    '/api/reports': 'reports',
    '/api/kill_list': 'kill_list',
    '/api/economics': 'economics',
    '/api/field_checks': 'field_checks',
    '/api/decision_memos': 'decision_memos',
    '/api/segment_cards': 'segment_cards',
    '/api/documents': 'documents',
    '/api/hypotheses': 'hypotheses',
    '/api/evidence_links': 'evidence_links',
    '/api/ai_assessments': 'ai_assessments',
  };

  // Match /api/<table> or /api/<table>/<id>
  const tableMatch = Object.entries(tableRoutes).find(([route]) => path.startsWith(route));

  if (tableMatch) {
    const [route, table] = tableMatch;
    const recordId = path.slice(route.length + 1) || null;

    // ai_assessments are append-only: the trajectory is evidence.
    if (table === 'ai_assessments' && (request.method === 'PATCH' || request.method === 'DELETE')) {
      return errorResponse('Assessments are append-only — they are never updated or deleted.', 405, origin, env);
    }

    if (request.method === 'GET') {
      const query = recordId ? `${table}?id=eq.${recordId}` : `${table}?order=created_at.desc`;
      const { data, status } = await supabaseRequest('GET', query, null, env);
      return jsonResponse({ records: Array.isArray(data) ? data : [data] }, status, origin, env);
    }

    if (request.method === 'POST' && isWriteRole) {
      const body = await request.json();
      const row = body.fields || body;
      row.created_by = member.id;
      if (table === 'documents') row.uploaded_by = member.display_name;
      const { data, status } = await supabaseRequest('POST', table, row, env);
      const created = Array.isArray(data) ? data[0] : data;
      await logAction(env, member.id, 'create', table, created?.id, null, row);
      return jsonResponse(created, status, origin, env);
    }

    if (request.method === 'PATCH' && recordId && isWriteRole) {
      const body = await request.json();
      const fields = body.fields || body;
      const { data, status } = await supabaseRequest(
        'PATCH', `${table}?id=eq.${recordId}`, fields, env
      );
      const updated = Array.isArray(data) ? data[0] : data;
      await logAction(env, member.id, 'update', table, recordId, null, fields);
      return jsonResponse(updated, status, origin, env);
    }

    // Leads can delete anywhere; partners can delete their own documents.
    if (request.method === 'DELETE' && recordId &&
        (member.role === 'lead' || (table === 'documents' && isWriteRole))) {
      const { data, status } = await supabaseRequest(
        'DELETE', `${table}?id=eq.${recordId}`, null, env
      );
      if (table === 'documents') {
        await fetch(`${env.SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${recordId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
        }).catch(() => {});
      }
      await logAction(env, member.id, 'delete', table, recordId, null, null);
      return jsonResponse({ deleted: true }, status, origin, env);
    }

    return errorResponse('Method not allowed or insufficient permissions', 405, origin, env);
  }

  // --- Team management ---
  if (path === '/api/team' && request.method === 'GET') {
    const { data, status } = await supabaseRequest(
      'GET', 'team_members?status=neq.removed&order=created_at.asc', null, env
    );
    return jsonResponse({ records: data }, status, origin, env);
  }

  if (path === '/api/team/invite' && request.method === 'POST' && isAdmin) {
    const { email, display_name, role } = await request.json();
    if (!email || !display_name) return errorResponse('Email and name required', 400, origin, env);

    const row = {
      email,
      display_name,
      role: role || 'partner',
      invited_by: member.id,
      status: 'invited',
    };
    const { data, status } = await supabaseRequest('POST', 'team_members', row, env);
    const created = Array.isArray(data) ? data[0] : data;

    // Send magic link to the invited email
    await fetch(`${env.SUPABASE_URL}/auth/v1/magiclink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email }),
    });

    await logAction(env, member.id, 'invite', 'team_members', created?.id, null, row);
    return jsonResponse(created, status, origin, env);
  }

  if (path === '/api/team/transfer-lead' && request.method === 'POST' && member.role === 'lead') {
    const { target_member_id, confirm } = await request.json();
    if (!confirm) return errorResponse('Confirmation required', 400, origin, env);
    if (!target_member_id) return errorResponse('Target member ID required', 400, origin, env);

    // Demote current lead to partner
    await supabaseRequest('PATCH', `team_members?id=eq.${member.id}`, { role: 'partner' }, env);
    // Promote target to lead
    await supabaseRequest('PATCH', `team_members?id=eq.${target_member_id}`, { role: 'lead' }, env);

    await logAction(env, member.id, 'transfer_lead', 'team_members', target_member_id, { from: member.id }, { to: target_member_id });
    return jsonResponse({ transferred: true }, 200, origin, env);
  }

  if (path.startsWith('/api/team/') && request.method === 'PATCH' && isAdmin) {
    const targetId = path.split('/').pop();
    const body = await request.json();
    const { data, status } = await supabaseRequest('PATCH', `team_members?id=eq.${targetId}`, body, env);
    const updated = Array.isArray(data) ? data[0] : data;
    await logAction(env, member.id, 'update', 'team_members', targetId, null, body);
    return jsonResponse(updated, status, origin, env);
  }

  // --- Audit log ---
  if (path === '/api/audit' && request.method === 'GET') {
    const limit = url.searchParams.get('limit') || 50;
    const { data, status } = await supabaseRequest(
      'GET', `audit_log?order=created_at.desc&limit=${limit}`, null, env
    );
    return jsonResponse({ records: data }, status, origin, env);
  }

  // --- Chat with tool use ---
  if (path === '/api/chat' && request.method === 'POST') {
    const { messages, dataContext, sessionId, tools: enableTools, localData } = await request.json();

    // Persist session if needed
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const { data: sessionData } = await supabaseRequest('POST', 'chat_sessions', {
        user_id: member.id,
        title: messages[0]?.content?.slice(0, 80) || 'Chat session',
      }, env);
      activeSessionId = Array.isArray(sessionData) ? sessionData[0]?.id : sessionData?.id;
    }

    // Save user message
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user') {
        await supabaseRequest('POST', 'chat_messages', {
          session_id: activeSessionId,
          role: 'user',
          content: lastMsg.content,
        }, env);
      }
    }

    // The hypothesis board is injected from the database (or the client's
    // local copy), never hardcoded — one source of truth.
    const chatHypotheses = await fetchRows(env, localData, 'hypotheses');
    const systemMessage = `${SYSTEM_PROMPT}\n\n--- HYPOTHESIS BOARD (live records — the single source of truth) ---\n${hypothesesPromptSection(chatHypotheses)}\n\n--- LIVE PROJECT DATA ---\n${dataContext}`;

    const claudeMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    // Tool definitions for Claude
    const toolDefs = enableTools ? [
      {
        name: 'query_outreach',
        description: 'Query outreach contacts with optional filters. Returns matching records.',
        input_schema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filter by status: Cold, Sent, Replied, Booked, Done, Declined' },
            segment: { type: 'string', description: 'Filter by segment' },
            limit: { type: 'number', description: 'Max records to return (default 20)' },
          },
        },
      },
      {
        name: 'query_interviews',
        description: 'Query interview records with optional filters.',
        input_schema: {
          type: 'object',
          properties: {
            segment: { type: 'string', description: 'Filter by segment' },
            interviewer: { type: 'string', description: 'Filter by interviewer name' },
            tagged: { type: 'string', description: 'Filter by tagged status: Y or N' },
            limit: { type: 'number', description: 'Max records to return (default 20)' },
          },
        },
      },
      {
        name: 'query_matrix',
        description: 'Query theme matrix entries with optional filters.',
        input_schema: {
          type: 'object',
          properties: {
            theme_tag: { type: 'string', description: 'Filter by theme tag' },
            segment: { type: 'string', description: 'Filter by segment' },
            min_severity: { type: 'number', description: 'Minimum severity (1-5)' },
            wtp: { type: 'string', description: 'Filter by WTP: Y, Maybe, N' },
            limit: { type: 'number', description: 'Max records to return (default 20)' },
          },
        },
      },
      {
        name: 'query_scripts',
        description: 'Query interview scripts. Returns the latest version of each script.',
        input_schema: {
          type: 'object',
          properties: {
            script_name: { type: 'string', description: 'Filter by script name' },
          },
        },
      },
      {
        name: 'query_deliverables',
        description: 'Query phase deliverables and exit criteria.',
        input_schema: {
          type: 'object',
          properties: {
            phase: { type: 'number', description: 'Filter by phase number (0-5)' },
            status: { type: 'string', description: 'Filter by status' },
          },
        },
      },
      {
        name: 'search_notes',
        description: 'Full-text search across EVERYTHING written in the workspace: interview field notes and topics, outreach notes, matrix quotes and notes, deliverable evidence, and document descriptions/contents. Use this whenever a question could be answered by the team\'s notes.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Words to search for (case-insensitive substring match)' },
            limit: { type: 'number', description: 'Max results per table (default 10)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_documents',
        description: 'List uploaded field documents (filename, segment, linked interview, description).',
        input_schema: {
          type: 'object',
          properties: {
            segment: { type: 'string', description: 'Filter by segment' },
            interview_id: { type: 'string', description: 'Filter by linked interview, e.g. INT-004' },
          },
        },
      },
      {
        name: 'read_document',
        description: 'Read the full contents of an uploaded document by its filename or id. Text/CSV/markdown return verbatim text; PDFs are transcribed; images are returned for you to look at.',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Exact or partial filename' },
            document_id: { type: 'string', description: 'Document record id (alternative to filename)' },
          },
        },
      },
      {
        name: 'query_hypotheses',
        description: 'Query the hypothesis board: buyer hypotheses (H1–H3) and kill criteria (K1–K3) with their live statuses and status notes.',
        input_schema: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['buyer_hypothesis', 'kill_criterion'], description: 'Filter by kind (optional)' },
            code: { type: 'string', description: 'Filter by code, e.g. H2 (optional)' },
          },
        },
      },
      {
        name: 'query_evidence_links',
        description: 'Query evidence links — the records tying interviews, matrix entries, field checks, documents, and economics to hypotheses. Each link carries direction (supports/contradicts/neutral), strength, a note, and provenance (human or ai_confirmed).',
        input_schema: {
          type: 'object',
          properties: {
            hypothesis_code: { type: 'string', description: 'Filter by hypothesis code, e.g. H2' },
            direction: { type: 'string', enum: ['supports', 'contradicts', 'neutral'], description: 'Filter by direction' },
            evidence_type: { type: 'string', enum: ['interview', 'matrix', 'field_check', 'document', 'economics'], description: 'Filter by evidence type' },
            limit: { type: 'number', description: 'Max records to return (default 50)' },
          },
        },
      },
      {
        name: 'get_latest_assessment',
        description: 'Get the most recent AI assessment: leaning (GO/PIVOT/NO-GO/INSUFFICIENT), narrative summary, per-hypothesis directions with cited evidence, and break-point statuses. Assessments are append-only; this returns the newest.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'propose_action',
        description: 'Propose an action for the user to confirm. The action will be shown to the user with a Confirm/Skip button. For add_evidence_link the payload needs hypothesis_id, evidence_type, evidence_id, direction, strength, note. For update_hypothesis_status the payload needs id, status, and a status_note explaining why.',
        input_schema: {
          type: 'object',
          properties: {
            action_type: { type: 'string', enum: ['add_interview', 'update_deliverable', 'add_matrix_entry', 'flag_quote', 'add_evidence_link', 'update_hypothesis_status'], description: 'Type of action' },
            description: { type: 'string', description: 'Human-readable description of what this action does' },
            payload: { type: 'object', description: 'The data to write' },
          },
          required: ['action_type', 'description', 'payload'],
        },
      },
      {
        name: 'generate_report',
        description: 'Generate a report. Types: weekly_status, phase_exit, investor_briefing, decision_memo.',
        input_schema: {
          type: 'object',
          properties: {
            report_type: { type: 'string', enum: ['weekly_status', 'phase_exit', 'investor_briefing', 'decision_memo'], description: 'Type of report' },
            parameters: { type: 'object', description: 'Additional parameters for the report' },
          },
          required: ['report_type'],
        },
      },
    ] : undefined;

    // First Claude call
    const claudeBody = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemMessage,
      messages: claudeMessages,
    };
    if (toolDefs) claudeBody.tools = toolDefs;

    let result = await callClaude(env, claudeBody);
    const actions = [];
    let textParts = [];
    let toolRound = 0;
    const maxToolRounds = 5;

    // Process tool use loop
    while (result.stop_reason === 'tool_use' && toolRound < maxToolRounds) {
      toolRound++;
      const toolUseBlocks = result.content.filter(b => b.type === 'tool_use');
      const textBlocks = result.content.filter(b => b.type === 'text');
      textBlocks.forEach(b => textParts.push(b.text));

      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const toolResult = await executeToolCall(toolBlock.name, toolBlock.input, env, member, localData);

        if (toolBlock.name === 'propose_action') {
          actions.push({
            action_type: toolBlock.input.action_type,
            description: toolBlock.input.description,
            payload: toolBlock.input.payload,
          });
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: 'Action proposed to user for confirmation.' });
        } else if (toolResult && toolResult.__image) {
          // Images go back as actual image blocks so the model can see them.
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: [
              { type: 'text', text: `Document: ${toolResult.filename}${toolResult.description ? ` — ${toolResult.description}` : ''}` },
              { type: 'image', source: { type: 'base64', media_type: toolResult.__image.media_type, data: toolResult.__image.data } },
            ],
          });
        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(toolResult).slice(0, 24000) });
        }
      }

      // Continue conversation with tool results
      claudeMessages.push({ role: 'assistant', content: result.content });
      claudeMessages.push({ role: 'user', content: toolResults });

      result = await callClaude(env, { ...claudeBody, messages: claudeMessages });
    }

    // Collect final text
    if (result.content) {
      result.content.filter(b => b.type === 'text').forEach(b => textParts.push(b.text));
    }
    const finalText = textParts.join('\n\n') || '(empty response)';

    // Save assistant message
    await supabaseRequest('POST', 'chat_messages', {
      session_id: activeSessionId,
      role: 'assistant',
      content: finalText,
      tool_calls: toolRound > 0 ? { rounds: toolRound, actions: actions.length } : null,
    }, env);

    // Detect patterns for proactive surfacing
    const patterns = detectPatterns();

    return jsonResponse({
      text: finalText,
      sessionId: activeSessionId,
      actions,
      patterns,
    }, 200, origin, env);
  }

  return errorResponse('Not found', 404, origin, env);
}

// Execute a tool call from Claude. Rows come through fetchRows — the client's
// body-provided workspace in local data mode, Supabase otherwise — and every
// filter runs in JS so both modes behave identically.
async function executeToolCall(name, input, env, member, localData) {
  const cap = (n, d = 50) => Math.min(Number(n) || d, 50);
  switch (name) {
    case 'query_outreach': {
      let rows = await fetchRows(env, localData, 'outreach');
      if (input.status) rows = rows.filter(r => r.status === input.status);
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      rows = rows.slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_interviews': {
      let rows = await fetchRows(env, localData, 'interviews');
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      if (input.interviewer) rows = rows.filter(r => r.interviewer === input.interviewer);
      if (input.tagged) rows = rows.filter(r => r.tagged_same_day === input.tagged);
      rows = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_matrix': {
      let rows = await fetchRows(env, localData, 'matrix');
      if (input.theme_tag) rows = rows.filter(r => r.theme_tag === input.theme_tag);
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      if (input.min_severity) rows = rows.filter(r => (+r.severity || 0) >= input.min_severity);
      if (input.wtp) rows = rows.filter(r => r.wtp === input.wtp);
      rows = rows.slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_scripts': {
      let rows = await fetchRows(env, localData, 'scripts');
      if (input.script_name) rows = rows.filter(r => r.script_name === input.script_name);
      rows = [...rows].sort((a, b) => (b.version || 0) - (a.version || 0));
      return { records: rows, count: rows.length };
    }
    case 'query_deliverables': {
      let rows = await fetchRows(env, localData, 'deliverables');
      if (input.phase !== undefined) rows = rows.filter(r => r.phase === input.phase);
      if (input.status) rows = rows.filter(r => r.status === input.status);
      rows = [...rows].sort((a, b) => (a.phase || 0) - (b.phase || 0));
      return { records: rows, count: rows.length };
    }
    case 'query_hypotheses': {
      let rows = await fetchRows(env, localData, 'hypotheses');
      if (input.kind) rows = rows.filter(r => r.kind === input.kind);
      if (input.code) rows = rows.filter(r => r.code === input.code);
      rows = [...rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      return { records: rows, count: rows.length };
    }
    case 'query_evidence_links': {
      const hypotheses = await fetchRows(env, localData, 'hypotheses');
      let rows = await fetchRows(env, localData, 'evidence_links');
      if (input.hypothesis_code) {
        const hyp = hypotheses.find(x => x.code === input.hypothesis_code);
        rows = hyp ? rows.filter(r => r.hypothesis_id === hyp.id) : [];
      }
      if (input.direction) rows = rows.filter(r => r.direction === input.direction);
      if (input.evidence_type) rows = rows.filter(r => r.evidence_type === input.evidence_type);
      rows = rows.slice(0, cap(input.limit));
      // Resolve each link so the model can cite the underlying record.
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
      const rows = await fetchRows(env, localData, 'ai_assessments');
      const latest = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      if (!latest) return { assessment: null, note: 'No assessment has been generated yet. The team can run one from the Decision Brief screen.' };
      return { assessment: latest, count: rows.length };
    }
    case 'search_notes': {
      const q = String(input.query || '').trim().toLowerCase();
      if (!q) return { error: 'Empty query' };
      const lim = Math.min(input.limit || 10, 25);
      const has = (...fields) => fields.some(f => String(f || '').toLowerCase().includes(q));
      const clip = (s, n = 1500) => (s || '').slice(0, n);

      const [interviews, outreach, matrix, deliverables, documents] = await Promise.all(
        ['interviews', 'outreach', 'matrix', 'deliverables', 'documents'].map(t => fetchRows(env, localData, t)));

      return {
        query: q,
        interviews: interviews.filter(r => has(r.notes_markdown, r.brief_topic)).slice(0, lim)
          .map(r => ({ interview_id: r.interview_id, date: r.date, segment: r.segment, brief_topic: r.brief_topic, notes: clip(r.notes_markdown) })),
        outreach: outreach.filter(r => has(r.notes)).slice(0, lim)
          .map(r => ({ name: r.name, segment: r.segment, status: r.status, notes: clip(r.notes, 500) })),
        matrix: matrix.filter(r => has(r.quote, r.notes)).slice(0, lim)
          .map(r => ({ id: r.id, interview_id: r.interview_id, theme_tag: r.theme_tag, segment: r.segment, severity: r.severity, wtp: r.wtp, quote: clip(r.quote, 500), notes: clip(r.notes, 300) })),
        deliverables: deliverables.filter(r => has(r.evidence)).slice(0, lim)
          .map(r => ({ phase: r.phase, deliverable: r.deliverable, status: r.status, evidence: clip(r.evidence, 800) })),
        documents: documents.filter(r => has(r.filename, r.description, r.text_content)).slice(0, lim)
          .map(r => ({ id: r.id, filename: r.filename, segment: r.segment, interview_id: r.interview_id, description: r.description, snippet: clip(r.text_content, 800) })),
      };
    }
    case 'list_documents': {
      let rows = await fetchRows(env, localData, 'documents');
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      if (input.interview_id) rows = rows.filter(r => r.interview_id === input.interview_id);
      const documents = rows.map(({ text_content, file_base64, ...rest }) => rest);
      return { documents, count: documents.length };
    }
    case 'read_document': {
      const rows = await fetchRows(env, localData, 'documents');
      let doc = null;
      if (input.document_id) doc = rows.find(r => r.id === input.document_id);
      else if (input.filename) {
        const f = String(input.filename).trim().toLowerCase();
        doc = rows.find(r => String(r.filename || '').toLowerCase().includes(f));
      } else return { error: 'Provide filename or document_id' };
      if (!doc) return { error: 'Document not found. Use list_documents to see what exists.' };

      // Text already on record (text files, or a previously transcribed PDF)
      if (doc.text_content) {
        return { filename: doc.filename, mime_type: doc.mime_type, description: doc.description, contents: doc.text_content.slice(0, 20000) };
      }

      // Binary files live in the browser's IndexedDB when data is local —
      // the worker can't reach them. Everything text-based rode along.
      if (localData) {
        return { error: `"${doc.filename}" is a binary file stored only in the team's browser (local data mode). Its text was not extracted. Ask the user to open it from the Documents screen.` };
      }

      // Fetch the binary from Storage
      const fileRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${doc.id}`, {
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
      });
      if (!fileRes.ok) return { error: `File missing from storage (${fileRes.status}).` };
      const buf = new Uint8Array(await fileRes.arrayBuffer());
      let binary = '';
      for (let i = 0; i < buf.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      }
      const b64 = btoa(binary);

      // Images: hand the image itself back to the model
      if ((doc.mime_type || '').startsWith('image/')) {
        return { __image: { media_type: doc.mime_type, data: b64 }, filename: doc.filename, description: doc.description };
      }

      // PDFs: transcribe once with a nested Claude call, cache into text_content
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
        const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
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

// Detect patterns for proactive surfacing (runs server-side)
function detectPatterns() {
  // Placeholder — in production, this would analyse recent data trends
  // and return pattern strings for the frontend to display.
  return [];
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};

/* Pure helpers exported for the offline smoke harness (no runtime effect
   in Cloudflare — Workers only use the default export). */
export { validateAssessment, validateProposals, validateDraftFields, extractJson, hypothesesPromptSection };
