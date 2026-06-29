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

Three buyer hypotheses being tested:
- H1: Family abroad (diaspora children paying for a Nairobi parent's care)
- H2: Patient or Nairobi family (direct payer)
- H3: Hospital IPD (pays for qualified leads or software)

Three break-points that kill the patient-pays model:
- CAC per closed case > revenue per case
- Consult-to-travelled conversion < 15%
- Service cost per case > USD 300

The same-day tagging rule is the most important data quality mechanism. Every interview must be tagged in the matrix the same day it happens. Untagged interviews are lost interviews.

When answering:
- Reference specific interview IDs, participant codes, theme names — not generic advice
- Cite the data you're drawing from
- If asked "what should I do today?", name a specific person, deliverable, or interview
- If evidence is thin on a topic, say so explicitly`;

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
  };

  // Match /api/<table> or /api/<table>/<id>
  const tableMatch = Object.entries(tableRoutes).find(([route]) => path.startsWith(route));

  if (tableMatch) {
    const [route, table] = tableMatch;
    const recordId = path.slice(route.length + 1) || null;

    if (request.method === 'GET') {
      const query = recordId ? `${table}?id=eq.${recordId}` : `${table}?order=created_at.desc`;
      const { data, status } = await supabaseRequest('GET', query, null, env);
      return jsonResponse({ records: Array.isArray(data) ? data : [data] }, status, origin, env);
    }

    if (request.method === 'POST' && isWriteRole) {
      const body = await request.json();
      const row = body.fields || body;
      row.created_by = member.id;
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

    if (request.method === 'DELETE' && recordId && member.role === 'lead') {
      const { data, status } = await supabaseRequest(
        'DELETE', `${table}?id=eq.${recordId}`, null, env
      );
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

  // --- Chat ---
  if (path === '/api/chat' && request.method === 'POST') {
    const { messages, dataContext } = await request.json();

    const systemMessage = `${SYSTEM_PROMPT}\n\n--- LIVE PROJECT DATA ---\n${dataContext}`;

    const claudeMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: systemMessage,
        messages: claudeMessages,
      }),
    });

    const result = await res.json();
    const text = result.content?.[0]?.text || '(empty response)';
    return jsonResponse({ text }, 200, origin, env);
  }

  return errorResponse('Not found', 404, origin, env);
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
