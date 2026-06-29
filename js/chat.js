import { STATE, PHASE_INFO, h, esc, api, renderCurrentRoute, SEGMENTS, THEMES } from './app.js';

let currentSessionId = null;

export function toggleChat(forceOpen) {
  const panel = document.getElementById('chat-panel');
  if (forceOpen === true) panel.classList.remove('closed');
  else if (forceOpen === false) panel.classList.add('closed');
  else panel.classList.toggle('closed');

  if (!panel.classList.contains('closed') && STATE.chatHistory.length === 0) {
    addChatMessage('bot', "Hi. I read your interviews, outreach, and matrix every time you ask. I can also query specific data, suggest actions, and generate reports. Ask me how to use any tab or feature — I know the whole platform. Try a quick action below, or type a question.");
  }
}

export function clearChat() {
  STATE.chatHistory = [];
  currentSessionId = null;
  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = '';
  addChatMessage('bot', "Chat cleared. I still have access to all your project data. Ask me anything — including how to use any tab or feature.");
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

function buildPlatformGuide() {
  return `
=== PLATFORM USAGE GUIDE (answer questions about any tab/feature from this) ===

This is MedTerminal Research Workspace — a tool for managing a six-phase qualitative research programme investigating whether a patient-side medical tourism platform (Kenya → India) is viable.

TABS & FEATURES:
- **Dashboard**: Overview with KPIs — interviews logged, same-day tag rate, outreach stats, theme count. Shows phase progress and exit criteria checklist.
- **Outreach**: Contact management table. Track interview subjects (patients, caregivers, hospital staff, brokers, clinicians). Fields: Name, Segment, Organisation, Country, Channel, Status (Cold→Sent→Replied→Booked→Done→Declined), Owner, Notes. Add new contacts via the + button.
- **Interviews**: Log of qualitative interviews. Each has date, segment, participant code, interviewer, notes. The SAME-DAY TAG RULE is critical — interviews must be tagged the same day they are conducted. Red warnings appear for untagged interviews.
- **Theme Matrix**: De-identified quotes tagged by theme, severity (1-5), and willingness-to-pay (WTP) signal. This is the core analysis tool. Themes include: ${THEMES.slice(0, 10).join(', ')}, and more.
- **Saturation**: Shows per-segment interview progress toward Phase 2 exit criteria. Segments tracked: ${SEGMENTS.join(', ')}.
- **Scripts** (Reference): Read-only interview scripts for different segments.
- **Templates** (Reference): Outreach message templates.
- **Operating Manual** (Reference): Project procedures and guidelines.
- **Theme Analysis** (Phase 3): Deep analysis of emerging themes across segments.
- **Segment Cards** (Phase 3): Per-segment synthesis cards.
- **Top-3 Pains** (Phase 3): Ranked pain points from the research.
- **Kill List** (Phase 3): Reasons that could kill the project — tracked and evaluated.
- **State of the Field** (Phase 3): Competitive landscape analysis.
- **Unit Economics** (Phase 4): Financial model and unit economics calculations.
- **Alternate Models** (Phase 4): Alternative business model explorations.
- **Field Checks** (Phase 4): Real-world validation of economic assumptions.
- **Decision Memo** (Phase 5): Go/no-go decision document.
- **MVP Scope** (Phase 5): Minimum viable product definition if go.
- **Confirmatory Tests** (Phase 5): Final validation tests.
- **Reports** (Output): Generated research reports.

HOW TO USE:
- Navigate using the left sidebar. On mobile, tap the hamburger menu.
- Use the AI assistant (me) via the chat panel — click "Ask assistant" or "Open assistant".
- Quick actions below the chat provide common queries.
- The Refresh button re-fetches all data from Airtable.
- All data persists in Airtable via the Cloudflare Worker backend.
=== END PLATFORM GUIDE ===`;
}

function buildFullContentSnapshot() {
  const sections = [];

  // Outreach records (summarized to stay within token limits)
  if (STATE.outreach.length > 0) {
    const outreachSummary = STATE.outreach.slice(0, 50).map(r => {
      const f = r.fields || r;
      return `${f.Name || '?'} | ${f.Segment || '?'} | ${f.Organisation || ''} | ${f.Status || 'Cold'} | ${f.Notes || ''}`.slice(0, 200);
    }).join('\n');
    sections.push(`=== OUTREACH RECORDS (${STATE.outreach.length} total, showing up to 50) ===\n${outreachSummary}`);
  }

  // Full interview log
  if (STATE.interviews.length > 0) {
    const interviewList = STATE.interviews.slice(0, 50).map(r => {
      const f = r.fields || r;
      return `ID:${f.ID || r.id || '?'} | ${f.Date || '?'} | ${f.Segment || '?'} | ${f.ParticipantCode || f.participant_code || '?'} | Tagged:${f['Tagged same-day'] || f.tagged_same_day || 'N'} | ${(f.Notes || f.notes || '').slice(0, 150)}`;
    }).join('\n');
    sections.push(`=== INTERVIEW LOG (${STATE.interviews.length} total, showing up to 50) ===\n${interviewList}`);
  }

  // Full theme matrix quotes
  if (STATE.matrix.length > 0) {
    const matrixList = STATE.matrix.slice(0, 80).map(r => {
      const f = r.fields || r;
      return `[${f['Theme tag'] || f.theme_tag || '?'}] Seg:${f.Segment || f.segment || '?'} Sev:${f.Severity || f.severity || '?'} WTP:${f.WTP || f.wtp || '?'} — "${(f.Quote || f.quote || '').slice(0, 200)}"`;
    }).join('\n');
    sections.push(`=== THEME MATRIX (${STATE.matrix.length} total, showing up to 80) ===\n${matrixList}`);
  }

  // Kill list
  if (STATE.killList?.length > 0) {
    const killItems = STATE.killList.map(r => {
      const f = r.fields || r;
      return `- ${f.Risk || f.risk || f.Name || f.name || JSON.stringify(f).slice(0, 200)}`;
    }).join('\n');
    sections.push(`=== KILL LIST (${STATE.killList.length} entries) ===\n${killItems}`);
  }

  // Field checks
  if (STATE.fieldChecks?.length > 0) {
    const checks = STATE.fieldChecks.map(r => {
      const f = r.fields || r;
      return `- ${f.Check || f.check || f.Name || f.name || JSON.stringify(f).slice(0, 200)}`;
    }).join('\n');
    sections.push(`=== FIELD CHECKS (${STATE.fieldChecks.length} entries) ===\n${checks}`);
  }

  // Scripts
  if (STATE.scripts?.length > 0) {
    const scriptList = STATE.scripts.map(r => {
      const f = r.fields || r;
      return `Script: ${f.script_name || f.Name || '?'} — ${(f.content || f.Content || f.script_content || '').slice(0, 300)}`;
    }).join('\n');
    sections.push(`=== SCRIPTS (${STATE.scripts.length}) ===\n${scriptList}`);
  }

  // Deliverables
  if (STATE.deliverables?.length > 0) {
    const delList = STATE.deliverables.map(r => {
      const f = r.fields || r;
      return `${f.Name || f.name || '?'} | Status: ${f.Status || f.status || '?'}`;
    }).join('\n');
    sections.push(`=== DELIVERABLES (${STATE.deliverables.length}) ===\n${delList}`);
  }

  // Reports
  if (STATE.reports?.length > 0) {
    const reportList = STATE.reports.map(r => {
      const f = r.fields || r;
      return `${f.Title || f.title || f.Name || f.name || '?'} — ${(f.Summary || f.summary || f.Content || f.content || '').slice(0, 300)}`;
    }).join('\n');
    sections.push(`=== REPORTS (${STATE.reports.length}) ===\n${reportList}`);
  }

  return sections.join('\n\n');
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

  const scriptNames = STATE.scripts?.length > 0
    ? [...new Set(STATE.scripts.map(s => s.script_name || s.fields?.script_name).filter(Boolean))].join(', ')
    : 'Patient / caregiver, Hospital IPD, Agent / facilitator';

  // Feature 2: Platform guide baked into context
  const platformGuide = buildPlatformGuide();

  // Feature 4: Full content snapshot from all tabs
  const fullContent = buildFullContentSnapshot();

  return `${platformGuide}

=== PROJECT STATUS SUMMARY ===
Current phase: ${PHASE_INFO.label}

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
Field checks: ${STATE.fieldChecks?.length || 0}

${fullContent}`;
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
window.clearChat = clearChat;
