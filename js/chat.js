/* ============================================================
   ASSISTANT PANEL — needs the Claude API (a secret), so it only
   runs in 'api' mode. In local mode it shows a calm disabled
   state instead of erroring.
   ============================================================ */
import { STATE, h, renderCurrentRoute } from './app.js';
import { CURRENT_PHASE, PHASES, SEGMENTS } from './config.js';
import { isLocalMode, chatRequest, data } from './data.js';

let currentSessionId = null;

const QUICK_PROMPTS = [
  ['Status check', 'Give me a one-paragraph status of where the project is right now. Be specific. Use the data.'],
  ['Phase exit check', 'Assess our progress against the current phase exit criteria. What still needs to be done?'],
  ['What now?', 'What is the single most important thing I should do today, given the state of the project? Be specific — name a person, a deliverable, or an interview.'],
  ['Surface themes', 'Surface the strongest themes emerging from the matrix. Quote specific entries. Flag where evidence is still thin.'],
  ['Search the notes', 'Search all field notes and documents for the most important thing we have learned that is NOT yet reflected in the theme matrix. Quote the source.'],
];

export function initChat() {
  document.getElementById('open-chat-btn').addEventListener('click', () => toggleChat());
  document.getElementById('close-chat-btn').addEventListener('click', () => toggleChat(false));
  document.getElementById('clear-chat-btn').addEventListener('click', clearChat);
  document.getElementById('send-chat-btn').addEventListener('click', () => sendChat());
  const input = document.getElementById('chat-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  const quick = document.getElementById('chat-quick');
  QUICK_PROMPTS.forEach(([label, prompt]) => {
    quick.appendChild(h('button', {
      class: 'quick-action',
      disabled: isLocalMode ? '' : null,
      onclick: () => { if (!isLocalMode) { toggleChat(true); sendChat(prompt); } },
    }, label));
  });

  if (isLocalMode) {
    input.disabled = true;
    input.placeholder = 'Assistant unavailable in demo mode';
    document.getElementById('send-chat-btn').disabled = true;
    quick.querySelectorAll('button').forEach(b => { b.style.opacity = '.5'; b.style.cursor = 'default'; });
  }
}

export function toggleChat(forceOpen) {
  const panel = document.getElementById('chat-panel');
  if (forceOpen === true) panel.classList.remove('closed');
  else if (forceOpen === false) panel.classList.add('closed');
  else panel.classList.toggle('closed');

  if (!panel.classList.contains('closed') && document.getElementById('chat-messages').children.length === 0) {
    if (isLocalMode) {
      addChatMessage('bot', 'The assistant connects when API keys are added. Everything else in the workspace works without it — see Settings for how to go live.');
    } else {
      addChatMessage('bot', 'Hi. I read your interviews, outreach, and matrix every time you ask. Try a quick action below, or type a question.');
    }
  }
}

function clearChat() {
  STATE.chatHistory = [];
  currentSessionId = null;
  document.getElementById('chat-messages').innerHTML = '';
  toggleChat(true); // repopulates the greeting
}

function addChatMessage(role, text) {
  const msgs = document.getElementById('chat-messages');
  const el = h('div', { class: role === 'user' ? 'chat-msg user' : 'chat-msg bot' });
  // Minimal markdown: **bold** only. Everything else is plain text.
  text.split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (i % 2 === 1) el.appendChild(h('strong', { text: part }));
    else el.appendChild(document.createTextNode(part));
  });
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

function setTyping(on) {
  const existing = document.getElementById('typing');
  if (!on) { existing?.remove(); return; }
  if (existing) return;
  const msgs = document.getElementById('chat-messages');
  msgs.appendChild(h('div', { class: 'chat-msg bot flex items-center gap-1.5', id: 'typing' }, [
    h('div', { class: 'typing-dot' }), h('div', { class: 'typing-dot' }), h('div', { class: 'typing-dot' }),
  ]));
  msgs.scrollTop = msgs.scrollHeight;
}

/* Compact context snapshot — summaries, not raw dumps. */
function buildDataContext() {
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);

  const segmentCounts = {};
  STATE.interviews.forEach(r => { if (r.segment) segmentCounts[r.segment] = (segmentCounts[r.segment] || 0) + 1; });

  const outreachByStatus = {};
  STATE.outreach.forEach(r => { const s = r.status || 'Cold'; outreachByStatus[s] = (outreachByStatus[s] || 0) + 1; });

  const themes = {};
  STATE.matrix.forEach(r => { if (r.theme_tag) themes[r.theme_tag] = (themes[r.theme_tag] || 0) + 1; });

  const untagged = STATE.interviews.filter(r => r.tagged_same_day !== 'Y');

  const highSevQuotes = STATE.matrix
    .filter(r => +r.severity >= 4 && r.wtp === 'Y')
    .slice(0, 12)
    .map(r => `- [${r.theme_tag}] (${r.segment}, sev ${r.severity}, ${r.interview_id}) "${(r.quote || '').slice(0, 200)}"`)
    .join('\n');

  const criteria = STATE.deliverables
    .filter(d => d.phase === CURRENT_PHASE)
    .map(d => `- [${d.status}] ${d.deliverable}${d.evidence ? ` — ${d.evidence}` : ''}`)
    .join('\n');

  return `Current phase: ${CURRENT_PHASE} — ${phase?.long}

Exit criteria for this phase:
${criteria || '(none defined)'}

Interviews logged: ${STATE.interviews.length}
By segment: ${Object.entries(segmentCounts).map(([s, n]) => `${s}=${n}`).join(', ') || 'none yet'}
Segment targets: ${SEGMENTS.map(s => `${s.name}=${s.target}`).join(', ')}
Untagged interviews (violates same-day hard rule): ${untagged.length}${untagged.length ? ' (' + untagged.map(r => r.interview_id).join(', ') + ')' : ''}

Outreach status: ${Object.entries(outreachByStatus).map(([s, n]) => `${s}=${n}`).join(', ') || 'none yet'}
Total outreach records: ${STATE.outreach.length}

Matrix: ${STATE.matrix.length} quotes tagged.
Theme frequencies: ${Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, n]) => `${t}=${n}`).join(', ') || 'none yet'}

High-severity WTP quotes (up to 12):
${highSevQuotes || '(none yet)'}

Kill list entries: ${STATE.kill_list.length}
Field checks: ${STATE.field_checks.length}

Field notes coverage: ${STATE.interviews.filter(r => r.notes_markdown).length} of ${STATE.interviews.length} interviews have full field notes.
Documents on file: ${STATE.documents.length}${STATE.documents.length ? ' — ' + STATE.documents.slice(0, 20).map(d => `${d.filename}${d.interview_id ? ` (${d.interview_id})` : ''}`).join(', ') : ''}

You have tools to reach EVERYTHING in this workspace: search_notes (full-text across
interview field notes, outreach notes, matrix quotes, deliverable evidence, and document
contents), query_* tools for structured records, list_documents, and read_document (returns
a document's full contents). When a question could be answered by notes or documents,
search before answering — never say you lack access to the team's notes.`;
}

export async function sendChat(userText) {
  if (isLocalMode) return;
  const input = document.getElementById('chat-input');
  const text = (userText || input.value || '').trim();
  if (!text) return;
  input.value = '';

  addChatMessage('user', text);
  STATE.chatHistory.push({ role: 'user', content: text });
  setTyping(true);

  try {
    const res = await chatRequest({
      messages: STATE.chatHistory,
      dataContext: buildDataContext(),
      sessionId: currentSessionId,
      tools: true,
    });
    setTyping(false);

    (res.actions || []).forEach(addActionConfirmation);

    const reply = res.text || '(empty reply)';
    addChatMessage('bot', reply);
    STATE.chatHistory.push({ role: 'assistant', content: reply });
    if (res.sessionId) currentSessionId = res.sessionId;
  } catch (e) {
    setTyping(false);
    addChatMessage('bot', `Couldn't reach the assistant. ${e.message}`);
  }
}

/* Assistant proposes → user confirms → write goes through data.js */
function addActionConfirmation(action) {
  const msgs = document.getElementById('chat-messages');
  const buttons = h('div', { class: 'flex gap-2' });

  const TABLE_FOR_ACTION = {
    add_interview: 'interviews',
    add_matrix_entry: 'matrix',
    update_deliverable: 'deliverables',
    flag_quote: 'matrix',
  };

  buttons.appendChild(h('button', { class: 'btn btn-primary text-xs', onclick: async () => {
    try {
      const table = TABLE_FOR_ACTION[action.action_type];
      if (!table) throw new Error(`Unknown action: ${action.action_type}`);
      if (action.action_type.startsWith('add')) {
        await data.create(table, action.payload);
      } else {
        const { id, ...patch } = action.payload;
        await data.update(table, id, patch);
      }
      STATE[table] = await data.list(table);
      renderCurrentRoute();
      buttons.innerHTML = '';
      buttons.appendChild(h('span', { class: 'chip chip-sage', text: 'Done' }));
    } catch (e) {
      buttons.innerHTML = '';
      buttons.appendChild(h('span', { class: 'chip chip-rose', text: `Failed: ${e.message}` }));
    }
  } }, 'Confirm'));

  buttons.appendChild(h('button', { class: 'btn btn-line text-xs', onclick: () => {
    buttons.innerHTML = '';
    buttons.appendChild(h('span', { class: 'chip chip-line', text: 'Skipped' }));
  } }, 'Skip'));

  msgs.appendChild(h('div', { class: 'chat-msg bot', style: 'max-width:100%;' }, [
    h('div', { class: 'micro mb-2', style: 'color:var(--clay);', text: 'Proposed action' }),
    h('div', { class: 'text-sm mb-3', text: action.description || JSON.stringify(action.payload) }),
    buttons,
  ]));
  msgs.scrollTop = msgs.scrollHeight;
}
