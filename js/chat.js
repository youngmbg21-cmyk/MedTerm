import { STATE, PHASE_INFO, h, esc, api } from './app.js';

export function toggleChat(forceOpen) {
  const panel = document.getElementById('chat-panel');
  if (forceOpen === true) panel.classList.remove('closed');
  else if (forceOpen === false) panel.classList.add('closed');
  else panel.classList.toggle('closed');

  if (!panel.classList.contains('closed') && STATE.chatHistory.length === 0) {
    addChatMessage('bot', "Hi. I'll read your interviews, outreach, and matrix every time you ask. Try a quick action below, or type a question.");
  }
}

function addChatMessage(role, text) {
  const msgs = document.getElementById('chat-messages');
  const cls = role === 'user' ? 'chat-msg user' : 'chat-msg bot';
  const el = h('div', { class: cls });

  // Render bold markers safely
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
    const t = r.fields?.['Theme tag']; if (!t) return;
    themes[t] = (themes[t] || 0) + 1;
  });
  const segmentCounts = {};
  STATE.interviews.forEach(r => {
    const s = r.fields?.Segment; if (!s) return;
    segmentCounts[s] = (segmentCounts[s] || 0) + 1;
  });
  const outreachByStatus = {};
  STATE.outreach.forEach(r => {
    const s = r.fields?.Status || 'Cold';
    outreachByStatus[s] = (outreachByStatus[s] || 0) + 1;
  });
  const untaggedCount = STATE.interviews.filter(r => r.fields?.['Tagged same-day'] !== 'Y').length;
  const highSeverityQuotes = STATE.matrix
    .filter(r => (r.fields?.Severity >= 4) && r.fields?.WTP === 'Y')
    .slice(0, 8)
    .map(r => `- [${r.fields?.['Theme tag'] || '?'}] (${r.fields?.Segment || '?'}, sev ${r.fields?.Severity}, WTP ${r.fields?.WTP}) "${(r.fields?.Quote || '').slice(0, 200)}"`)
    .join('\n');

  return `Current phase: ${PHASE_INFO.label}

Interviews logged: ${STATE.interviews.length}
By segment: ${Object.entries(segmentCounts).map(([s,n]) => `${s}=${n}`).join(', ') || 'none yet'}
Untagged interviews (violates same-day hard rule): ${untaggedCount}

Outreach status: ${Object.entries(outreachByStatus).map(([s,n]) => `${s}=${n}`).join(', ') || 'no outreach yet'}
Total outreach records: ${STATE.outreach.length}

Matrix: ${STATE.matrix.length} quotes/observations tagged.
Theme frequencies: ${Object.entries(themes).sort((a,b) => b[1]-a[1]).slice(0,10).map(([t,n]) => `${t}=${n}`).join(', ') || 'none yet'}

High-severity, willingness-to-pay quotes (up to 8):
${highSeverityQuotes || '(none yet)'}`;
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
      body: JSON.stringify({ messages: STATE.chatHistory, dataContext })
    });
    removeTypingIndicator();
    const reply = res.text || '(empty reply)';
    addChatMessage('bot', reply);
    STATE.chatHistory.push({ role: 'assistant', content: reply });
  } catch (e) {
    removeTypingIndicator();
    addChatMessage('bot', `Couldn't reach the assistant. ${e.message}`);
  }
}

export function quickPrompt(text) {
  toggleChat(true);
  sendChat(text);
}

// Wire up global handlers for HTML onclick attributes
window.toggleChat = toggleChat;
window.quickPrompt = quickPrompt;
window.sendChat = sendChat;
