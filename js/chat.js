/* ============================================================
   ASSISTANT PANEL — needs the Claude API (a secret), so it only
   runs when AI_MODE is 'worker' (independent of the data mode).
   Otherwise it shows a calm disabled state instead of erroring.
   ============================================================ */
import { STATE, h, lockScroll, unlockScroll } from './app.js';
import { CURRENT_PHASE, PHASES, SEGMENTS } from './config.js';
import { aiAvailable, chatRequest, aiDataSlices } from './data.js';
import { addActionConfirmation } from './actions.js';

let currentSessionId = null;

const QUICK_PROMPTS = [
  ['Strategy read', 'Give me your current strategy read on whether this is viable enough to build. Reason across demand, willingness to pay, unit economics, trust/moat, and execution risk — pull the interviews, matrix, segment cards, economics, and evidence links first. Land on a leaning, say what it hinges on, and name the single most valuable piece of evidence we still lack.'],
  ['Steel-man the risk', 'Argue the strongest case AGAINST building this. What is the most likely reason this fails, which kill criterion is closest to tripping, and what evidence in our own data supports the bear case? Be specific and cite it.'],
  ['Economics stress-test', 'Stress-test the unit economics. Pull the economics rows, name the single assumption the whole case rests on, and tell me what would have to be true at the break-point for this to work. Flag any number that has no evidence behind it.'],
  ['Compare segments', 'Compare the segments strategically using the segment cards and matrix. Which segment has the sharpest, best-paid pain — and which should we drop? Cite the pains and WTP signal per segment.'],
  ['What now?', 'What is the single most important thing I should do today to de-risk the decision, given the state of the project? Be specific — name a person, a deliverable, or an interview.'],
  ['Search the notes', 'Search all field notes and documents for the most important thing we have learned that is NOT yet reflected in the theme matrix or an evidence link. Quote the source and say what it implies strategically.'],
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
  // Crossing the mobile/desktop breakpoint changes whether the open chat panel
  // is a full-screen overlay (locks the page) or a docked side panel (does not).
  // Re-sync on that change so a rotate-to-desktop can't leave the page pinned.
  window.matchMedia('(max-width: 1024px)').addEventListener('change', () => {
    const panel = document.getElementById('chat-panel');
    syncChatScrollLock(!panel.classList.contains('closed'));
  });

  const quick = document.getElementById('chat-quick');
  QUICK_PROMPTS.forEach(([label, prompt]) => {
    quick.appendChild(h('button', {
      class: 'quick-action',
      disabled: aiAvailable ? null : '',
      onclick: () => { if (aiAvailable) { toggleChat(true); sendChat(prompt); } },
    }, label));
  });

  if (!aiAvailable) {
    input.disabled = true;
    input.placeholder = 'Assistant not connected';
    document.getElementById('send-chat-btn').disabled = true;
  }
}

/* On phones/tablets the chat panel is a full-screen overlay, so the page
   behind it must be frozen like any other overlay; on desktop it's a docked
   side panel and the page stays scrollable. Tracked so the lock is released
   symmetrically no matter how the panel is toggled. */
let chatScrollLocked = false;
function syncChatScrollLock(isOpen) {
  const overlay = isOpen && window.matchMedia('(max-width: 1024px)').matches;
  if (overlay && !chatScrollLocked) { lockScroll(); chatScrollLocked = true; }
  else if (!overlay && chatScrollLocked) { unlockScroll(); chatScrollLocked = false; }
}

export function toggleChat(forceOpen) {
  const panel = document.getElementById('chat-panel');
  if (forceOpen === true) panel.classList.remove('closed');
  else if (forceOpen === false) panel.classList.add('closed');
  else panel.classList.toggle('closed');
  syncChatScrollLock(!panel.classList.contains('closed'));

  if (!panel.classList.contains('closed') && document.getElementById('chat-messages').children.length === 0) {
    if (!aiAvailable) {
      addChatMessage('bot', 'The assistant connects when AI_MODE is set to \'worker\' — it works with local data too. Everything else in the workspace works without it; see Settings for how to go live.');
    } else {
      addChatMessage('bot', 'Hi. I read your interviews, outreach, matrix, economics, segment cards, and the hypothesis board every time you ask — then reason from them like a strategy analyst, not just report them. Ask for a strategy read, stress-test the economics, or steel-man the risk. Try a quick action below, or type a question.');
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
  // User text stays literal; bot replies get the rich renderer (headings,
  // bullets, callouts, bold/italic/code, leaning pills; "----" rules dropped).
  if (role === 'user') el.appendChild(document.createTextNode(text));
  else el.appendChild(renderRich(text));
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

/* Rich markdown → DOM (desktop mirror of the mobile renderer). Line-driven so a
   heading immediately followed by a list parses correctly; horizontal rules are
   dropped to a hairline, and the decision tokens GO / PIVOT / NO-GO /
   INSUFFICIENT become colored pills. */
const LEANING_PILL = {
  'GO':           { bg: '#E6EDE7', tx: '#3F5A4D' },
  'NO-GO':        { bg: '#F6E3E3', tx: '#9A3F3F' },
  'PIVOT':        { bg: '#F5E9CF', tx: '#755A1E' },
  'INSUFFICIENT': { bg: '#F5E9CF', tx: '#755A1E' },
};
function renderRich(text) {
  const root = h('div', { class: 'chat-rich' });
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let para = [], list = null;
  const flushPara = () => { if (para.length) { root.appendChild(h('p', { class: 'chat-p' }, mdInline(para.join(' ')))); para = []; } };
  const flushList = () => { if (list) { root.appendChild(list.el); list = null; } };
  const flushAll = () => { flushPara(); flushList(); };
  for (const rawLine of lines) {
    const t = rawLine.replace(/\s+$/, '').trim();
    if (!t) { flushAll(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,}|—{2,}|={3,})$/.test(t)) { flushAll(); root.appendChild(h('hr', { class: 'chat-hr' })); continue; }
    const head = t.match(/^(#{1,6})\s+(.*)$/);
    if (head) { flushAll(); root.appendChild(h('div', { class: 'chat-h' }, mdInline(head[2]))); continue; }
    const bq = t.match(/^>\s?(.*)$/);
    if (bq) { flushPara(); flushList(); root.appendChild(h('div', { class: 'chat-quote' }, mdInline(bq[1]))); continue; }
    const bullet = t.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', el: h('ul', { class: 'chat-ul' }) }; }
      list.el.appendChild(h('li', {}, mdInline(bullet[1]))); continue;
    }
    const num = t.match(/^\d+[.)]\s+(.*)$/);
    if (num) {
      flushPara();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', el: h('ol', { class: 'chat-ol' }) }; }
      list.el.appendChild(h('li', {}, mdInline(num[1]))); continue;
    }
    flushList(); para.push(t);
  }
  flushAll();
  return root;
}
function mdInline(text) {
  const nodes = [];
  const src = String(text);
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|(?<![A-Za-z0-9])_[^_\n]+_(?![A-Za-z0-9])|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    colorizeInto(nodes, src.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) nodes.push(h('strong', { text: tok.slice(2, -2) }));
    else if (tok.startsWith('`')) nodes.push(h('code', { class: 'chat-code', text: tok.slice(1, -1) }));
    else nodes.push(h('em', { text: tok.slice(1, -1) }));
    last = re.lastIndex;
  }
  colorizeInto(nodes, src.slice(last));
  return nodes;
}
function colorizeInto(nodes, s) {
  if (!s) return;
  const re = /\b(NO-GO|GO|PIVOT|INSUFFICIENT)\b/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(document.createTextNode(s.slice(last, m.index)));
    const p = LEANING_PILL[m[1]];
    nodes.push(h('span', { class: 'chat-pill', style: `background:${p.bg};color:${p.tx};`, text: m[1] }));
    last = m.index + m[0].length;
  }
  if (last < s.length) nodes.push(document.createTextNode(s.slice(last)));
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

  /* Hypothesis board — statuses live in the DB, never hardcoded. */
  const hypLines = [...STATE.hypotheses]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(hyp => {
      const links = STATE.evidence_links.filter(l => l.hypothesis_id === hyp.id);
      const s = links.filter(l => l.direction === 'supports').length;
      const c = links.filter(l => l.direction === 'contradicts').length;
      return `- ${hyp.code} (${hyp.kind === 'kill_criterion' ? 'kill criterion' : 'buyer hypothesis'}) [${hyp.status}]: ${hyp.title} — ${hyp.description} (evidence: ${s} supporting, ${c} contradicting)`;
    }).join('\n');

  const latestAssessment = [...STATE.ai_assessments]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

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

Hypothesis board (${STATE.evidence_links.length} evidence links total):
${hypLines || '(no hypotheses defined)'}
Latest AI assessment: ${latestAssessment ? `${latestAssessment.leaning} (${String(latestAssessment.created_at).slice(0, 10)}, trigger: ${latestAssessment.trigger})` : 'none yet'}

Field notes coverage: ${STATE.interviews.filter(r => r.notes_markdown).length} of ${STATE.interviews.length} interviews have full field notes.
Documents on file: ${STATE.documents.length}${STATE.documents.length ? ' — ' + STATE.documents.slice(0, 20).map(d => `${d.filename}${d.interview_id ? ` (${d.interview_id})` : ''}`).join(', ') : ''}

You have tools to reach EVERYTHING in this workspace: search_notes (full-text across
interview field notes, outreach notes, matrix quotes, deliverable evidence, and document
contents), query_* tools for structured records, list_documents, and read_document (returns
a document's full contents). When a question could be answered by notes or documents,
search before answering — never say you lack access to the team's notes.`;
}

export async function sendChat(userText) {
  if (!aiAvailable) return;
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
      // Local data mode: the worker has no DB to query, so the workspace
      // rides along and the worker's tools answer from it.
      localData: aiDataSlices(STATE),
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

/* Assistant proposes → user confirms → write goes through data.js.
   The Confirm/Skip block itself lives in js/actions.js so capture screens
   can reuse the exact same pattern for AI link proposals. */
