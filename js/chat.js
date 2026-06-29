import { STATE, PHASE_INFO, h, esc, api, renderCurrentRoute } from './app.js';

let currentSessionId = null;

export function toggleChat(forceOpen) {
  const panel = document.getElementById('chat-panel');
  if (forceOpen === true) panel.classList.remove('closed');
  else if (forceOpen === false) panel.classList.add('closed');
  else panel.classList.toggle('closed');

  if (!panel.classList.contains('closed') && STATE.chatHistory.length === 0) {
    addChatMessage('bot', "Hi. I read your interviews, outreach, and matrix every time you ask. I can also query specific data, suggest actions, and generate reports. Try a quick action below, or type a question.");
  }
}

function addChatMessage(role, text) {
  const msgs = document.getElementById('chat-messages');
  const cls = role === 'user' ? 'chat-msg user' : 'chat-msg bot';
  const el = h('div', { class: cls });

  const parts = text.split(/\*\*(.+?)\*\*/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      el.appendChild(h('strong', { text: part }));
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });

  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function addActionConfirmation(action) {
  const msgs = document.getElementById('chat-messages');
  const card = h('div', { class: 'chat-msg bot', style: 'max-width:100%;' });

  const label = h('div', { class: 'micro mb-2', text: 'Proposed action' });
  label.style.color = 'var(--clay)';
  card.appendChild(label);

  card.appendChild(h('div', { class: 'text-sm mb-3', text: action.description || JSON.stringify(action.payload) }));

  const buttons = h('div', { class: 'flex gap-2' }, [
    h('button', { class: 'btn btn-primary text-xs', onclick: async () => {
      try {
        await executeAction(action);
        buttons.innerHTML = '';
        const done = h('span', { class: 'chip chip-sage', text: 'Done' });
        buttons.appendChild(done);
      } catch (e) {
        buttons.innerHTML = '';
        const fail = h('span', { class: 'chip chip-rose', text: `Failed: ${e.message}` });
        buttons.appendChild(fail);
      }
    } }, 'Confirm'),
    h('button', { class: 'btn btn-line text-xs', onclick: () => {
      buttons.innerHTML = '';
      const skip = h('span', { class: 'chip chip-line', text: 'Skipped' });
      buttons.appendChild(skip);
    } }, 'Skip'),
  ]);
  card.appendChild(buttons);

  msgs.appendChild(card);
  msgs.scrollTop = msgs.scrollHeight;
}

async function executeAction(action) {
  const { action_type, payload } = action;
  switch (action_type) {
    case 'add_interview':
      await api('/api/interviews', { method: 'POST', body: JSON.stringify(payload) });
      break;
    case 'update_deliverable':
      await api(`/api/deliverables/${payload.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      break;
    case 'add_matrix_entry':
      await api('/api/matrix', { method: 'POST', body: JSON.stringify(payload) });
      break;
    case 'flag_quote':
      await api(`/api/matrix/${payload.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      break;
    default:
      throw new Error(`Unknown action type: ${action_type}`);
  }
  // Reload data after action
  await api('/api/interviews').then(r => { STATE.interviews = r.records || []; }).catch(() => {});
  await api('/api/matrix').then(r => { STATE.matrix = r.records || []; }).catch(() => {});
  renderCurrentRoute();
}

function addTypingIndicator() {
  const msgs = document.getElementById('chat-messages');
  const el = h('div', { class: 'chat-msg bot flex items-center gap-1.5', id: 'typing' }, [
    h('div', { class: 'typing-dot' }),
    h('div', { class: 'typing-dot' }),
    h('div', { class: 'typing-dot' })
  ]);
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTypingIndicator() {
  const t = document.getElementById('typing');
  if (t) t.remove();
}

function buildDataContext() {
  const themes = {};
  STATE.matrix.forEach(r => {
    const f = r.fields || r;
    const t = f['Theme tag'] || f.theme_tag; if (!t) return;
    themes[t] = (themes[t] || 0) + 1;
  });
  const segmentCounts = {};
  STATE.interviews.forEach(r => {
    const f = r.fields || r;
    const s = f.Segment || f.segment; if (!s) return;
    segmentCounts[s] = (segmentCounts[s] || 0) + 1;
  });
  const outreachByStatus = {};
  STATE.outreach.forEach(r => {
    const f = r.fields || r;
    const s = f.Status || f.status || 'Cold';
    outreachByStatus[s] = (outreachByStatus[s] || 0) + 1;
  });
  const untaggedCount = STATE.interviews.filter(r => {
    const f = r.fields || r;
    return (f['Tagged same-day'] || f.tagged_same_day) !== 'Y';
  }).length;

  const highSeverityQuotes = STATE.matrix
    .filter(r => {
      const f = r.fields || r;
      return (+(f.Severity || f.severity) >= 4) && (f.WTP || f.wtp) === 'Y';
    })
    .slice(0, 12)
    .map(r => {
      const f = r.fields || r;
      return `- [${f['Theme tag'] || f.theme_tag || '?'}] (${f.Segment || f.segment || '?'}, sev ${f.Severity || f.severity}, WTP ${f.WTP || f.wtp}) "${(f.Quote || f.quote || '').slice(0, 200)}"`;
    })
    .join('\n');

  // Script names for context
  const scriptNames = STATE.scripts?.length > 0
    ? [...new Set(STATE.scripts.map(s => s.script_name || s.fields?.script_name).filter(Boolean))].join(', ')
    : 'Patient / caregiver, Hospital IPD, Agent / facilitator';

  return `Current phase: ${PHASE_INFO.label}

Interviews logged: ${STATE.interviews.length}
By segment: ${Object.entries(segmentCounts).map(([s,n]) => `${s}=${n}`).join(', ') || 'none yet'}
Untagged interviews (violates same-day hard rule): ${untaggedCount}

Outreach status: ${Object.entries(outreachByStatus).map(([s,n]) => `${s}=${n}`).join(', ') || 'no outreach yet'}
Total outreach records: ${STATE.outreach.length}

Matrix: ${STATE.matrix.length} quotes/observations tagged.
Theme frequencies: ${Object.entries(themes).sort((a,b) => b[1]-a[1]).slice(0,15).map(([t,n]) => `${t}=${n}`).join(', ') || 'none yet'}

High-severity, willingness-to-pay quotes (up to 12):
${highSeverityQuotes || '(none yet)'}

Interview scripts available: ${scriptNames}
Kill list entries: ${STATE.killList?.length || 0}
Field checks: ${STATE.fieldChecks?.length || 0}`;
}

export async function sendChat(userText) {
  const input = document.getElementById('chat-input');
  const text = (userText || input.value || '').trim();
  if (!text) return;
  input.value = '';

  addChatMessage('user', text);
  STATE.chatHistory.push({ role: 'user', content: text });

  addTypingIndicator();
  try {
    const dataContext = buildDataContext();
    const res = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: STATE.chatHistory,
        dataContext,
        sessionId: currentSessionId,
        tools: true,
      })
    });
    removeTypingIndicator();

    // Handle tool-use responses
    if (res.actions && res.actions.length > 0) {
      res.actions.forEach(action => {
        addActionConfirmation(action);
      });
    }

    const reply = res.text || '(empty reply)';
    addChatMessage('bot', reply);
    STATE.chatHistory.push({ role: 'assistant', content: reply });

    if (res.sessionId) currentSessionId = res.sessionId;

    // Proactive pattern surfacing
    if (res.patterns && res.patterns.length > 0) {
      res.patterns.forEach(p => {
        const patternMsg = h('div', { class: 'chat-msg bot', style: 'border-color: var(--honey); background: var(--honey-soft);' });
        const label = h('div', { class: 'micro mb-1', text: 'Pattern detected' });
        label.style.color = '#8a6a23';
        patternMsg.appendChild(label);
        patternMsg.appendChild(h('div', { text: p }));
        document.getElementById('chat-messages').appendChild(patternMsg);
      });
    }
  } catch (e) {
    removeTypingIndicator();
    addChatMessage('bot', `Couldn't reach the assistant. ${e.message}`);
  }
}

export function quickPrompt(text) {
  toggleChat(true);
  sendChat(text);
}

window.toggleChat = toggleChat;
window.quickPrompt = quickPrompt;
window.sendChat = sendChat;
