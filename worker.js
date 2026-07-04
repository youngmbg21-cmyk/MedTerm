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

  // --- Chat with tool use ---
  if (path === '/api/chat' && request.method === 'POST') {
    const { messages, dataContext, sessionId, tools: enableTools } = await request.json();

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

    const systemMessage = `${SYSTEM_PROMPT}\n\n--- LIVE PROJECT DATA ---\n${dataContext}`;

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
        name: 'propose_action',
        description: 'Propose an action for the user to confirm. The action will be shown to the user with a Confirm/Skip button.',
        input_schema: {
          type: 'object',
          properties: {
            action_type: { type: 'string', enum: ['add_interview', 'update_deliverable', 'add_matrix_entry', 'flag_quote'], description: 'Type of action' },
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

    let res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeBody),
    });

    let result = await res.json();
    const actions = [];
    let textParts = [];
    let toolRound = 0;
    const maxToolRounds = 3;

    // Process tool use loop
    while (result.stop_reason === 'tool_use' && toolRound < maxToolRounds) {
      toolRound++;
      const toolUseBlocks = result.content.filter(b => b.type === 'tool_use');
      const textBlocks = result.content.filter(b => b.type === 'text');
      textBlocks.forEach(b => textParts.push(b.text));

      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const toolResult = await executeToolCall(toolBlock.name, toolBlock.input, env, member);

        if (toolBlock.name === 'propose_action') {
          actions.push({
            action_type: toolBlock.input.action_type,
            description: toolBlock.input.description,
            payload: toolBlock.input.payload,
          });
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: 'Action proposed to user for confirmation.' });
        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(toolResult).slice(0, 4000) });
        }
      }

      // Continue conversation with tool results
      claudeMessages.push({ role: 'assistant', content: result.content });
      claudeMessages.push({ role: 'user', content: toolResults });

      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ ...claudeBody, messages: claudeMessages }),
      });
      result = await res.json();
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

// Execute a tool call from Claude
async function executeToolCall(name, input, env, member) {
  switch (name) {
    case 'query_outreach': {
      let query = 'outreach?order=created_at.desc';
      if (input.status) query += `&status=eq.${input.status}`;
      if (input.segment) query += `&segment=eq.${input.segment}`;
      query += `&limit=${input.limit || 20}`;
      const { data } = await supabaseRequest('GET', query, null, env);
      return { records: data, count: data?.length || 0 };
    }
    case 'query_interviews': {
      let query = 'interviews?order=date.desc';
      if (input.segment) query += `&segment=eq.${input.segment}`;
      if (input.interviewer) query += `&interviewer=eq.${input.interviewer}`;
      if (input.tagged) query += `&tagged_same_day=eq.${input.tagged}`;
      query += `&limit=${input.limit || 20}`;
      const { data } = await supabaseRequest('GET', query, null, env);
      return { records: data, count: data?.length || 0 };
    }
    case 'query_matrix': {
      let query = 'matrix?order=created_at.desc';
      if (input.theme_tag) query += `&theme_tag=eq.${input.theme_tag}`;
      if (input.segment) query += `&segment=eq.${input.segment}`;
      if (input.min_severity) query += `&severity=gte.${input.min_severity}`;
      if (input.wtp) query += `&wtp=eq.${input.wtp}`;
      query += `&limit=${input.limit || 20}`;
      const { data } = await supabaseRequest('GET', query, null, env);
      return { records: data, count: data?.length || 0 };
    }
    case 'query_scripts': {
      let query = 'scripts?order=version.desc';
      if (input.script_name) query += `&script_name=eq.${encodeURIComponent(input.script_name)}`;
      const { data } = await supabaseRequest('GET', query, null, env);
      return { records: data, count: data?.length || 0 };
    }
    case 'query_deliverables': {
      let query = 'deliverables?order=phase.asc';
      if (input.phase !== undefined) query += `&phase=eq.${input.phase}`;
      if (input.status) query += `&status=eq.${input.status}`;
      const { data } = await supabaseRequest('GET', query, null, env);
      return { records: data, count: data?.length || 0 };
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
