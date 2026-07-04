import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function getClaudeApiKey(supabaseAdmin: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'claude_api_key')
    .single();

  if (error || !data) return null;
  return data.value;
}

async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  switch (name) {
    case 'query_outreach': {
      let query = supabaseAdmin.from('outreach').select('*').order('created_at', { ascending: false });
      if (input.status) query = query.eq('status', input.status);
      if (input.segment) query = query.eq('segment', input.segment);
      query = query.limit((input.limit as number) || 20);
      const { data } = await query;
      return { records: data, count: data?.length || 0 };
    }
    case 'query_interviews': {
      let query = supabaseAdmin.from('interviews').select('*').order('date', { ascending: false });
      if (input.segment) query = query.eq('segment', input.segment);
      if (input.interviewer) query = query.eq('interviewer', input.interviewer);
      if (input.tagged) query = query.eq('tagged_same_day', input.tagged);
      query = query.limit((input.limit as number) || 20);
      const { data } = await query;
      return { records: data, count: data?.length || 0 };
    }
    case 'query_matrix': {
      let query = supabaseAdmin.from('matrix').select('*').order('created_at', { ascending: false });
      if (input.theme_tag) query = query.eq('theme_tag', input.theme_tag);
      if (input.segment) query = query.eq('segment', input.segment);
      if (input.min_severity) query = query.gte('severity', input.min_severity);
      if (input.wtp) query = query.eq('wtp', input.wtp);
      query = query.limit((input.limit as number) || 20);
      const { data } = await query;
      return { records: data, count: data?.length || 0 };
    }
    case 'query_scripts': {
      let query = supabaseAdmin.from('scripts').select('*').order('version', { ascending: false });
      if (input.script_name) query = query.eq('script_name', input.script_name);
      const { data } = await query;
      return { records: data, count: data?.length || 0 };
    }
    case 'query_deliverables': {
      let query = supabaseAdmin.from('deliverables').select('*').order('phase', { ascending: true });
      if (input.phase !== undefined) query = query.eq('phase', input.phase);
      if (input.status) query = query.eq('status', input.status);
      const { data } = await query;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    // Get API key from settings table
    const apiKey = await getClaudeApiKey(supabaseAdmin);
    if (!apiKey) {
      return jsonResponse({ error: 'Claude API key not configured. Ask your admin to set it on the admin page.' }, 503);
    }

    const { messages, dataContext, sessionId, tools: enableTools } = await req.json();

    // Persist chat session
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const { data: sessionData } = await supabaseAdmin
        .from('chat_sessions')
        .insert({ user_id: user.id, title: messages[0]?.content?.slice(0, 80) || 'Chat session' })
        .select()
        .single();
      activeSessionId = sessionData?.id;
    }

    // Save user message
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user') {
        await supabaseAdmin.from('chat_messages').insert({
          session_id: activeSessionId,
          role: 'user',
          content: lastMsg.content,
        });
      }
    }

    const systemMessage = `${SYSTEM_PROMPT}\n\n--- LIVE PROJECT DATA ---\n${dataContext}`;
    const claudeMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    // Tool definitions
    const toolDefs = enableTools ? [
      {
        name: 'query_outreach',
        description: 'Query outreach contacts with optional filters.',
        input_schema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filter by status: Cold, Sent, Replied, Booked, Done, Declined' },
            segment: { type: 'string', description: 'Filter by segment' },
            limit: { type: 'number', description: 'Max records (default 20)' },
          },
        },
      },
      {
        name: 'query_interviews',
        description: 'Query interview records with optional filters.',
        input_schema: {
          type: 'object',
          properties: {
            segment: { type: 'string' },
            interviewer: { type: 'string' },
            tagged: { type: 'string', description: 'Y or N' },
            limit: { type: 'number' },
          },
        },
      },
      {
        name: 'query_matrix',
        description: 'Query theme matrix entries with optional filters.',
        input_schema: {
          type: 'object',
          properties: {
            theme_tag: { type: 'string' },
            segment: { type: 'string' },
            min_severity: { type: 'number' },
            wtp: { type: 'string', description: 'Y, Maybe, N' },
            limit: { type: 'number' },
          },
        },
      },
      {
        name: 'query_scripts',
        description: 'Query interview scripts.',
        input_schema: {
          type: 'object',
          properties: { script_name: { type: 'string' } },
        },
      },
      {
        name: 'query_deliverables',
        description: 'Query phase deliverables and exit criteria.',
        input_schema: {
          type: 'object',
          properties: {
            phase: { type: 'number' },
            status: { type: 'string' },
          },
        },
      },
      {
        name: 'propose_action',
        description: 'Propose an action for the user to confirm.',
        input_schema: {
          type: 'object',
          properties: {
            action_type: { type: 'string', enum: ['add_interview', 'update_deliverable', 'add_matrix_entry', 'flag_quote'] },
            description: { type: 'string' },
            payload: { type: 'object' },
          },
          required: ['action_type', 'description', 'payload'],
        },
      },
      {
        name: 'generate_report',
        description: 'Generate a report.',
        input_schema: {
          type: 'object',
          properties: {
            report_type: { type: 'string', enum: ['weekly_status', 'phase_exit', 'investor_briefing', 'decision_memo'] },
            parameters: { type: 'object' },
          },
          required: ['report_type'],
        },
      },
    ] : undefined;

    const claudeBody: Record<string, unknown> = {
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
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeBody),
    });

    let result = await res.json();
    const actions: unknown[] = [];
    const textParts: string[] = [];
    let toolRound = 0;
    const maxToolRounds = 3;

    while (result.stop_reason === 'tool_use' && toolRound < maxToolRounds) {
      toolRound++;
      const toolUseBlocks = result.content.filter((b: { type: string }) => b.type === 'tool_use');
      result.content
        .filter((b: { type: string }) => b.type === 'text')
        .forEach((b: { text: string }) => textParts.push(b.text));

      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const toolResult = await executeToolCall(toolBlock.name, toolBlock.input, supabaseAdmin);

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

      claudeMessages.push({ role: 'assistant', content: result.content });
      claudeMessages.push({ role: 'user', content: toolResults });

      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ ...claudeBody, messages: claudeMessages }),
      });
      result = await res.json();
    }

    if (result.content) {
      result.content
        .filter((b: { type: string }) => b.type === 'text')
        .forEach((b: { text: string }) => textParts.push(b.text));
    }
    const finalText = textParts.join('\n\n') || '(empty response)';

    // Save assistant message
    await supabaseAdmin.from('chat_messages').insert({
      session_id: activeSessionId,
      role: 'assistant',
      content: finalText,
      tool_calls: toolRound > 0 ? { rounds: toolRound, actions: actions.length } : null,
    });

    return jsonResponse({
      text: finalText,
      sessionId: activeSessionId,
      actions,
      patterns: [],
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
