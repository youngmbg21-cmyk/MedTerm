/**
 * HaTi Research — Supabase Edge Function `claude-proxy`
 *
 * The single backend for the workspace. It serves two surfaces:
 *
 * AI (AI_MODE = 'worker'):
 *   POST .../claude-proxy/api/chat            — the assistant panel (tool-use loop)
 *   POST .../claude-proxy/api/draft-section   — every AI-drafted piece of writing
 *   POST .../claude-proxy                     — bare call = chat (admin.html "Test connection")
 *
 * Shared data (DATA_MODE = 'api'):
 *   GET/POST/PATCH/DELETE .../claude-proxy/api/<table>[/<id>]   — record CRUD
 *
 * Data seam: with local data the client sends the workspace slices it needs in
 * `localData`; in shared mode this function reads Supabase directly with the
 * service role, so both founders share one database.
 *
 * Auth: the caller must be signed in AND an ACTIVE row in `team_members`
 * (matched by auth user id). Anyone can request a magic link, so membership —
 * not merely a valid login — is what keeps the workspace private.
 *
 * Claude API key: read from the `settings` table (key = 'claude_api_key'), which
 * the admin page writes. Falls back to the ANTHROPIC_API_KEY / CLAUDE_API_KEY
 * Edge Function secret if the table has no key. UNCHANGED from how it has
 * always worked — do not move this.
 *
 * Secrets available automatically to every Edge Function: SUPABASE_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_MODEL = 'claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are the research assistant inside HaTi Research, a go-to-market research workspace used by two co-founders — Young and Simon — who are taking HaTi to market in Kenya.

HaTi is a contract lifecycle management (CLM) platform built for the Kenyan market. It is a working MVP: Kenyan contract templates, e-signature with a SHA-256 seal, a no-login counterparty portal, AI contract reading and OCR, bulk migration of a back catalogue, renewal reminders and obligations, approval workflows, and an Advice Desk that sells legal services at a published hourly rate. It runs as one self-hosted Node process per customer. It has never been sold to anyone and cannot yet bill anyone.

NEITHER FOUNDER IS A DEVELOPER. Write in plain English. No jargon, no framework names, no "leverage" as a verb. If you must use a technical term, explain it in the same sentence.

THE FIVE QUESTIONS are the spine of this workspace. Everything in it exists to move one of them from open to answered:
  Q1 Who is the buyer, and what job do they hire HaTi for?
  Q2 Will a Kenyan company pay for CLM software — and in what shape?
  Q3 Does the signature stand up without IPRS and CAK-accredited PKI?
  Q4 What does it take to be legally sellable in Kenya?
  Q5 What displaces the incumbent — email, Word and a shared drive?
The live wording, status and evidence for each are in the workspace; read them rather than assuming these summaries are current.

HOW YOU WORK
- Read before you reason. Pull the conversations, prospects, competitors, pricing reactions, market facts and findings first. A claim with no cited record is an inference — label it one.
- Be honest about thin evidence. This workspace deliberately ships with NO invented research: the seeded competitors, market facts and pricing ideas are reference material and our own thinking, not findings. If nobody has been interviewed yet, the correct answer is "we do not know yet", said plainly and briefly — not a fluent narrative built on the seed data.
- Never invent a quote, a company, a person, a price a prospect gave, a number of conversations, or how long the research has been running. Every specific must be traceable to a record you were given.
- Cite what you use: the question reference (Q1–Q5), the company name, the source name, the date.
- No confidence percentages. With a handful of conversations, "70% confident" is theatre. Use a leaning and say what would change it.
- You argue; the two of them decide. Every write you propose goes to a human Confirm/Skip button. You never decide, never write directly.
- Distinguish the two things that get confused constantly: what a prospect SAYS they would pay, and what they have actually paid. Only the second is evidence.

THE TWO DATA-QUALITY RULES you should defend, because they are what makes this workspace trustworthy:
1. A conversation nobody wrote a finding from is a lost conversation.
2. A market or regulatory fact with no source link is a rumour.
If you see either breached, say so.

HOW TO FORMAT REPLIES — they are read on a phone as often as a laptop:
- Open with a one-line takeaway, not a preamble.
- Use short "## " section headers (2–4 words), each led by ONE relevant emoji — e.g. "## 📊 What the evidence says", "## ⚠️ The risk", "## 💰 On price", "## 🔎 What to do next". One emoji per header, never inside sentences.
- Bold the few phrases that carry the decision. Use "- " bullets for parallel points, one line each.
- Never output horizontal rules ("---"), markdown tables, or code fences around prose.
- Keep it tight: usually 3–8 short lines. Expand only when the question genuinely needs it.`;

const GROUNDING_RULES = `GROUNDING — the most important rule (one fabricated fact makes this tool worthless):
- Use ONLY facts present in the workspace context you are given. Do NOT invent, estimate, or "reasonably assume" anything that is not written there.
- Never state how long this research has been running — elapsed time is not tracked, so any such phrase is a fabrication.
- Never invent conversation counts, company names, people, quotes, dates, prices or percentages.
- The seeded competitors, market facts and pricing ideas are STARTING POINTS the founders have not verified. Treat anything marked "Needs checking" or "Not verified" as an open question, never as a finding.
- If a number, quote or fact is not in the context, either omit it or write "not yet recorded" — never fill the gap with something plausible.
- If the workspace is thin on a topic, the correct output is a short honest statement that there is not enough evidence yet.`;

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

/* ------------------------------------------------------------ Supabase REST */
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

/* One data seam: rows come from the client's request body (local data mode) or
   from Supabase (shared mode). Filtering always happens in JS, so both match. */
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

/* Claude API key — read from the settings table the admin page writes,
   falling back to an Edge Function secret. DO NOT MOVE THIS. */
async function getClaudeApiKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data, error } = await admin.from('settings').select('value').eq('key', 'claude_api_key').single();
    if (error || !data) return null;
    return (data as any).value || null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ Tools */
const TOOLS = [
  {
    name: 'query_questions',
    description: 'The five go-to-market questions with their live status, our current written read (the "leaning"), and what would answer each. Read this before any strategic answer.',
    input_schema: { type: 'object', properties: { ref: { type: 'string', description: 'Filter to one question, e.g. Q2' } } },
  },
  {
    name: 'query_insights',
    description: 'The findings ledger — every finding somebody wrote down, which question it bears on, and whether it supports or challenges it. This is the evidence. Cite from here.',
    input_schema: { type: 'object', properties: {
      question_ref: { type: 'string', description: 'Filter by question, e.g. Q1' },
      direction: { type: 'string', enum: ['Supports', 'Challenges', 'Context'] },
      source_kind: { type: 'string', description: 'Conversation, Competitor, Market fact, Pricing test, Our own thinking' },
      limit: { type: 'number', description: 'Max records (default 50)' },
    } },
  },
  {
    name: 'query_conversations',
    description: 'Discovery conversations with prospects: who was spoken to, what they use today, their biggest pain, what it costs them, what they said about money, and their best verbatim quote. The only real primary evidence in this workspace.',
    input_schema: { type: 'object', properties: {
      company: { type: 'string', description: 'Filter by company name (partial match)' },
      wtp_signal: { type: 'string', description: 'Filter by willingness-to-pay signal' },
      limit: { type: 'number', description: 'Max records (default 30)' },
    } },
  },
  {
    name: 'query_prospects',
    description: 'The pipeline: companies, their segment and sector, pipeline stage, whose they are, the next step, and when they were last touched.',
    input_schema: { type: 'object', properties: {
      status: { type: 'string', description: 'To contact, Contacted, Talked, Interested, Pilot, Not a fit' },
      segment: { type: 'string' },
      limit: { type: 'number', description: 'Max records (default 50)' },
    } },
  },
  {
    name: 'query_competitors',
    description: 'The competitor map, including the status quo (a shared drive, email, and a lawyer on retainer) which is the alternative that actually wins most deals. Also returns dated updates logged against each competitor.',
    input_schema: { type: 'object', properties: { type: { type: 'string', description: 'Global CLM, E-signature, Kenyan / local, Status quo, …' } } },
  },
  {
    name: 'query_pricing',
    description: 'Pricing ideas we might charge, with every recorded prospect reaction: the reaction, what they said word for word, and any number they gave.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Filter to one pricing idea by name (partial match)' } } },
  },
  {
    name: 'query_market_facts',
    description: 'Facts about the Kenyan market and its rules — market size, Data Protection Act, stamp duty, e-signature law, competitor pricing — each with a source link and how much it is worth (Primary source / Reported / Estimate / Needs checking).',
    input_schema: { type: 'object', properties: {
      category: { type: 'string' },
      strength: { type: 'string', description: 'Primary source, Reported, Estimate, Needs checking' },
    } },
  },
  {
    name: 'search_workspace',
    description: 'Full-text search across everything written in the workspace: conversation notes and quotes, prospect notes, findings, competitor notes and updates, market-fact detail, and pricing reactions. Use this whenever a question could be answered by something somebody typed.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Words to search for (case-insensitive)' },
      limit: { type: 'number', description: 'Max results per area (default 10)' },
    }, required: ['query'] },
  },
  {
    name: 'propose_action',
    description: 'Propose a write for the founders to confirm. It appears with a Confirm/Skip button; nothing is saved unless a human taps Confirm. For add_insight the payload needs question_id, direction (Supports/Challenges/Context), finding, and ideally quote, source_kind and source_label.',
    input_schema: { type: 'object', properties: {
      action_type: { type: 'string', enum: ['add_insight', 'add_prospect', 'add_market_fact', 'add_competitor_update', 'update_prospect', 'update_question'] },
      description: { type: 'string', description: 'Plain-English description of what this would write' },
      payload: { type: 'object', description: 'The data to write' },
    }, required: ['action_type', 'description', 'payload'] },
  },
];

async function executeToolCall(
  name: string,
  input: Record<string, any>,
  env: Env,
  localData: Record<string, unknown[]> | null,
): Promise<any> {
  const cap = (n: any, d = 50) => Math.min(Number(n) || d, 100);
  const like = (v: any, q: any) => String(v || '').toLowerCase().includes(String(q || '').toLowerCase());

  switch (name) {
    case 'query_questions': {
      let rows: any[] = await fetchRows(env, localData, 'questions');
      if (input.ref) rows = rows.filter(r => r.ref === input.ref);
      rows = [...rows].sort((a, b) => (a.sort || 0) - (b.sort || 0));
      return { records: rows, count: rows.length };
    }
    case 'query_insights': {
      const [insights, questions] = await Promise.all([
        fetchRows(env, localData, 'insights'), fetchRows(env, localData, 'questions'),
      ]);
      const refOf = (id: any) => (questions as any[]).find(q => String(q.id) === String(id))?.ref || null;
      let rows = insights as any[];
      if (input.question_ref) rows = rows.filter(r => refOf(r.question_id) === input.question_ref);
      if (input.direction) rows = rows.filter(r => r.direction === input.direction);
      if (input.source_kind) rows = rows.filter(r => r.source_kind === input.source_kind);
      const records = rows.slice(0, cap(input.limit)).map(r => ({ ...r, question_ref: refOf(r.question_id) }));
      return { records, count: records.length };
    }
    case 'query_conversations': {
      const [convos, prospects] = await Promise.all([
        fetchRows(env, localData, 'conversations'), fetchRows(env, localData, 'prospects'),
      ]);
      const nameOf = (id: any) => (prospects as any[]).find(p => String(p.id) === String(id))?.company || null;
      let rows = convos as any[];
      if (input.company) rows = rows.filter(r => like(nameOf(r.prospect_id), input.company));
      if (input.wtp_signal) rows = rows.filter(r => r.wtp_signal === input.wtp_signal);
      const records = [...rows]
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, cap(input.limit, 30))
        .map(r => ({ ...r, company: nameOf(r.prospect_id) }));
      return { records, count: records.length, total_in_workspace: (convos as any[]).length };
    }
    case 'query_prospects': {
      let rows: any[] = await fetchRows(env, localData, 'prospects');
      if (input.status) rows = rows.filter(r => r.status === input.status);
      if (input.segment) rows = rows.filter(r => r.segment === input.segment);
      rows = rows.slice(0, cap(input.limit));
      return { records: rows, count: rows.length };
    }
    case 'query_competitors': {
      const [comps, updates] = await Promise.all([
        fetchRows(env, localData, 'competitors'), fetchRows(env, localData, 'competitor_updates'),
      ]);
      let rows = comps as any[];
      if (input.type) rows = rows.filter(r => r.type === input.type);
      const records = rows.map(c => ({
        ...c,
        updates: (updates as any[]).filter(u => String(u.competitor_id) === String(c.id))
          .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      }));
      return { records, count: records.length };
    }
    case 'query_pricing': {
      const [ideas, reactions, prospects] = await Promise.all([
        fetchRows(env, localData, 'pricing_ideas'),
        fetchRows(env, localData, 'pricing_reactions'),
        fetchRows(env, localData, 'prospects'),
      ]);
      const nameOf = (id: any) => (prospects as any[]).find(p => String(p.id) === String(id))?.company || null;
      let rows = ideas as any[];
      if (input.name) rows = rows.filter(r => like(r.name, input.name));
      const records = rows.map(i => ({
        ...i,
        reactions: (reactions as any[]).filter(r => String(r.pricing_idea_id) === String(i.id))
          .map(r => ({ ...r, company: nameOf(r.prospect_id) })),
      }));
      return { records, count: records.length };
    }
    case 'query_market_facts': {
      let rows: any[] = await fetchRows(env, localData, 'market_facts');
      if (input.category) rows = rows.filter(r => r.category === input.category);
      if (input.strength) rows = rows.filter(r => r.strength === input.strength);
      return {
        records: rows,
        count: rows.length,
        unsourced: rows.filter(r => !String(r.source_url || '').trim()).length,
      };
    }
    case 'search_workspace': {
      const q = String(input.query || '').trim().toLowerCase();
      if (!q) return { error: 'Empty query' };
      const lim = Math.min(Number(input.limit) || 10, 25);
      const has = (...fields: any[]) => fields.some(f => String(f || '').toLowerCase().includes(q));
      const clip = (s: any, n = 800) => String(s || '').slice(0, n);

      const [conversations, prospects, insights, competitors, updates, facts, reactions] = await Promise.all(
        ['conversations', 'prospects', 'insights', 'competitors', 'competitor_updates', 'market_facts', 'pricing_reactions']
          .map(t => fetchRows(env, localData, t)));
      const nameOf = (id: any) => (prospects as any[]).find(p => String(p.id) === String(id))?.company || null;

      return {
        query: q,
        conversations: (conversations as any[])
          .filter(r => has(r.notes, r.best_quote, r.main_pain, r.current_tools, r.wtp_detail, r.pain_cost, r.person))
          .slice(0, lim)
          .map(r => ({ company: nameOf(r.prospect_id), person: r.person, date: r.date, main_pain: clip(r.main_pain, 400), best_quote: clip(r.best_quote, 400), notes: clip(r.notes) })),
        insights: (insights as any[]).filter(r => has(r.finding, r.quote, r.source_label)).slice(0, lim)
          .map(r => ({ direction: r.direction, finding: r.finding, quote: clip(r.quote, 400), source: r.source_label, date: r.date })),
        prospects: (prospects as any[]).filter(r => has(r.company, r.notes, r.why_fit, r.next_step)).slice(0, lim)
          .map(r => ({ company: r.company, status: r.status, segment: r.segment, why_fit: clip(r.why_fit, 300), next_step: clip(r.next_step, 300) })),
        competitors: (competitors as any[]).filter(r => has(r.name, r.positioning, r.notes, r.price_notes, r.strengths, r.weaknesses)).slice(0, lim)
          .map(r => ({ name: r.name, type: r.type, positioning: clip(r.positioning, 300), price_notes: clip(r.price_notes, 300) })),
        competitor_updates: (updates as any[]).filter(r => has(r.note)).slice(0, lim)
          .map(r => ({ note: clip(r.note, 400), date: r.date, source_url: r.source_url })),
        market_facts: (facts as any[]).filter(r => has(r.claim, r.detail, r.value, r.notes)).slice(0, lim)
          .map(r => ({ category: r.category, claim: clip(r.claim, 300), value: r.value, strength: r.strength, source_url: r.source_url })),
        pricing_reactions: (reactions as any[]).filter(r => has(r.verbatim, r.notes)).slice(0, lim)
          .map(r => ({ company: nameOf(r.prospect_id), reaction: r.reaction, verbatim: clip(r.verbatim, 400), their_number: r.their_number })),
      };
    }
    case 'propose_action':
      return { proposed: true };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/* ------------------------------------------------------------ Chat */
async function handleChat(body: any, env: Env) {
  const { messages, dataContext, sessionId, tools: enableTools, localData } = body;

  const system = `${SYSTEM_PROMPT}

${GROUNDING_RULES}

--- CURRENT STATE OF THE WORKSPACE ---
${dataContext || '(no snapshot supplied)'}`;

  const convo: any[] = (messages || []).map((m: any) => ({ role: m.role, content: m.content }));
  const actions: any[] = [];
  let finalText = '';

  // Up to five rounds of tool use, then answer.
  for (let round = 0; round < 6; round++) {
    const res: any = await callClaude(env, {
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system,
      messages: convo,
      ...(enableTools === false ? {} : { tools: TOOLS }),
    });

    const textParts = (res.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text);
    if (textParts.length) finalText = textParts.join('\n\n');

    const toolUses = (res.content || []).filter((c: any) => c.type === 'tool_use');
    if (!toolUses.length) break;

    convo.push({ role: 'assistant', content: res.content });
    const results: any[] = [];
    for (const tu of toolUses) {
      if (tu.name === 'propose_action') {
        actions.push({
          action_type: tu.input.action_type,
          description: tu.input.description,
          payload: tu.input.payload,
        });
      }
      const out = await executeToolCall(tu.name, tu.input || {}, env, localData || null);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 40000) });
    }
    convo.push({ role: 'user', content: results });
  }

  return jsonResponse({ text: finalText || '(empty reply)', sessionId: sessionId || null, actions });
}

/* ------------------------------------------------------------ Drafting
   One seam for every AI-drafted piece of writing in the app. The caller says
   what it wants and hands over the relevant slice; the draft always lands in
   an editable box on the client and is never saved automatically. */
async function handleDraftSection(body: any, env: Env) {
  const { section, instruction, context, localData } = body;

  const system = `${SYSTEM_PROMPT}

${GROUNDING_RULES}

You are drafting one short piece of writing for the founders to edit. Return the prose only — no preamble, no "here is the draft", no headings unless the instruction asks for them. Plain sentences. If the evidence supplied is thin or empty, say so in one or two sentences and stop; do not pad.`;

  const res: any = await callClaude(env, {
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system,
    messages: [{
      role: 'user',
      content: `Section: ${section || 'unspecified'}

${instruction || 'Draft this section.'}

--- THE EVIDENCE YOU MAY USE (and nothing else) ---
${JSON.stringify(context || {}, null, 2).slice(0, 60000)}

--- THE WIDER WORKSPACE, FOR CONTEXT ---
${JSON.stringify(localData || {}, null, 2).slice(0, 40000)}`,
    }],
  });

  const text = (res.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n\n');
  return jsonResponse({ text: text || '', section: section || null });
}

/* ------------------------------------------------------------ Table CRUD */
type Member = { id: string; role: string; display_name: string; userId: string };

// The only tables the app reads/writes. Anything else 404s — no arbitrary access.
const DATA_TABLES = new Set([
  'questions', 'competitors', 'competitor_updates', 'prospects', 'contacts',
  'conversations', 'pricing_ideas', 'pricing_reactions', 'market_facts', 'insights',
  'briefs',
]);

async function handleTableCrud(method: string, table: string, recordId: string | null, req: Request, env: Env, member: Member) {
  const isWriteRole = member.role === 'lead' || member.role === 'partner' || member.role === 'admin';

  if (method === 'GET') {
    const query = recordId ? `${table}?id=eq.${recordId}` : `${table}?order=created_at.desc`;
    const { data, status } = await supabaseRequest('GET', query, null, env);
    return jsonResponse({ records: Array.isArray(data) ? data : (data ? [data] : []) }, status);
  }

  if (method === 'POST' && isWriteRole) {
    const row = await req.json();
    const { data, status } = await supabaseRequest('POST', table, row, env);
    const created = Array.isArray(data) ? data[0] : data;
    return jsonResponse(created, status);
  }

  if (method === 'PATCH' && recordId && isWriteRole) {
    const fields = await req.json();
    const { data, status } = await supabaseRequest('PATCH', `${table}?id=eq.${recordId}`, fields, env);
    const updated = Array.isArray(data) ? data[0] : data;
    return jsonResponse(updated, status);
  }

  if (method === 'DELETE' && recordId && isWriteRole) {
    const { status } = await supabaseRequest('DELETE', `${table}?id=eq.${recordId}`, null, env);
    return jsonResponse({ deleted: true }, status);
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

    // Must be signed in AND an active team member. This is what keeps the
    // workspace private even though anyone can request a magic link.
    const member = await authenticate(req, env);
    if (!member) {
      return errorResponse(
        'Not authorised. You must be signed in and listed as an active member in the team_members table. Ask Young to add you.',
        403,
      );
    }

    const path = new URL(req.url).pathname;
    const apiIdx = path.indexOf('/api/');
    const sub = (apiIdx >= 0 ? path.slice(apiIdx + 5) : '').replace(/\/+$/, '');

    // ---- AI routes (need the Claude key) ----
    const isAiRoute = sub === '' || sub === 'chat' || sub === 'draft-section';
    if (isAiRoute) {
      if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
      const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      env.CLAUDE_API_KEY = (await getClaudeApiKey(admin))
        || Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('CLAUDE_API_KEY') || '';
      if (!env.CLAUDE_API_KEY) {
        return errorResponse('Claude API key not configured. Set it on the admin page, or as an ANTHROPIC_API_KEY Edge Function secret.', 503);
      }
      const body = await req.json();
      if (sub === 'draft-section') return await handleDraftSection(body, env);
      return await handleChat(body, env); // 'chat' or bare function URL
    }

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
