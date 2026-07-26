/* ============================================================
   ASSISTANT PANEL — needs the Claude API (a secret), so it only
   runs when AI_MODE is 'worker' (independent of the data mode).
   Otherwise it shows a calm disabled state instead of erroring.
   ============================================================ */
import { STATE, h, lockScroll, unlockScroll } from './app.js';
import { CURRENT_STAGE, STAGES, SEGMENTS, PIPELINE_NAMES } from './config.js';
import { aiAvailable, chatRequest, aiDataSlices } from './data.js';
import { addActionConfirmation } from './actions.js';

let currentSessionId = null;

const QUICK_PROMPTS = [
  ['Where do we stand?', 'Read the whole workspace and tell me where the five questions actually stand. For each one: what the evidence says, how thin it is, and whether we are entitled to a leaning yet. Be blunt when the honest answer is "we do not know".'],
  ['Argue against us', 'Argue the strongest case AGAINST taking HaTi to market as it stands. Use our own recorded evidence — conversations, competitor notes, market facts — and cite it. What is the most likely reason this fails?'],
  ['What should I do today?', 'Given the state of the workspace, what is the single most useful thing to do today? Name a specific company, person or document. Prefer whatever would move the question with the least evidence behind it.'],
  ['Pricing read', 'Look at the pricing ideas and every recorded reaction. Which model is holding up, which is dying, and what number would you put in front of the next prospect? Say plainly if there is not enough evidence to have a view.'],
  ['Who is missing?', 'Look at the prospects and conversations against our segment targets. Which kind of company have we not talked to, and who should we be chasing that we are not?'],
  ['Check my facts', 'Go through the market and regulation facts. Which are still unverified or unsourced, which ones actually decide something, and in what order should we check them?'],
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

/* Badge the sidebar "Assistant" button when a reply lands while the panel is
   closed, so you know to reopen it. Cleared whenever the panel is opened. */
function setChatUnread(on) {
  document.getElementById('open-chat-btn')?.classList.toggle('has-unread', on);
}

export function toggleChat(forceOpen) {
  const panel = document.getElementById('chat-panel');
  if (forceOpen === true) panel.classList.remove('closed');
  else if (forceOpen === false) panel.classList.add('closed');
  else panel.classList.toggle('closed');
  const isOpen = !panel.classList.contains('closed');
  if (isOpen) setChatUnread(false);
  syncChatScrollLock(isOpen);

  if (!panel.classList.contains('closed') && document.getElementById('chat-messages').children.length === 0) {
    if (!aiAvailable) {
      addChatMessage('bot', 'The assistant is off. It turns on when AI_MODE is set to \'worker\' in js/config.js, and it works with local data too. Everything else in the workspace works without it.');
    } else {
      addChatMessage('bot', 'Hi. I read your conversations, prospects, competitors, pricing tests and market facts every time you ask, and reason from them rather than just reporting them. Ask where the five questions stand, or ask me to argue against you. Try a quick action below, or type a question.');
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
  'GO':           { bg: '#E2EFE8', tx: '#0E4E34' },
  'NO-GO':        { bg: '#F8E3E1', tx: '#94382F' },
  'PIVOT':        { bg: '#F7EDD3', tx: '#74560F' },
  'INSUFFICIENT': { bg: '#F7EDD3', tx: '#74560F' },
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

/* Compact context snapshot — summaries, not raw dumps. The tools on the
   backend can fetch detail; this is the shape of the workspace. */
function buildDataContext() {
  const stage = STAGES.find(p => p.n === CURRENT_STAGE);

  const byStatus = {};
  STATE.prospects.forEach(p => { const s = p.status || 'To contact'; byStatus[s] = (byStatus[s] || 0) + 1; });

  const bySegment = {};
  const prospectById = Object.fromEntries(STATE.prospects.map(p => [String(p.id), p]));
  STATE.conversations.forEach(c => {
    const seg = (prospectById[String(c.prospect_id)] || {}).segment || 'unknown';
    bySegment[seg] = (bySegment[seg] || 0) + 1;
  });

  const questionLines = [...STATE.questions]
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map(q => {
      const mine = STATE.insights.filter(i => String(i.question_id) === String(q.id));
      const sup = mine.filter(i => i.direction === 'Supports').length;
      const ch = mine.filter(i => i.direction === 'Challenges').length;
      return `- ${q.ref} [${q.status || 'Open'}]: ${q.short} (evidence: ${sup} supporting, ${ch} challenging)` +
        (q.leaning ? `\n    our current read: ${q.leaning}` : '');
    }).join('\n');

  const recentFindings = [...STATE.insights]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 15)
    .map(i => {
      const q = STATE.questions.find(x => String(x.id) === String(i.question_id));
      return `- [${q ? q.ref : '—'} · ${i.direction}] ${i.finding}${i.quote ? ` — quote: "${String(i.quote).slice(0, 180)}"` : ''} (${i.source_kind}: ${i.source_label || '—'})`;
    }).join('\n');

  const priceLines = STATE.pricing_ideas.map(idea => {
    const rs = STATE.pricing_reactions.filter(r => String(r.pricing_idea_id) === String(idea.id));
    const tally = rs.reduce((m, r) => { m[r.reaction] = (m[r.reaction] || 0) + 1; return m; }, {});
    return `- ${idea.name} (${idea.model}, ${idea.price_low || '?'}–${idea.price_high || '?'} KES ${idea.unit || ''}) [${idea.status}] — reactions: ${Object.entries(tally).map(([k, n]) => `${k}=${n}`).join(', ') || 'none yet'}`;
  }).join('\n');

  const competitorLines = STATE.competitors
    .map(c => `- ${c.name} (${c.type}, threat ${c.threat || 'unknown'}) — ${c.pricing_model || 'pricing unknown'}`)
    .join('\n');

  const factLines = STATE.market_facts
    .map(f => `- [${f.category} · ${f.strength}] ${f.claim}${f.value ? ` (${f.value})` : ''}${f.source_url ? ` — source: ${f.source_url}` : ' — NO SOURCE LINK'}`)
    .join('\n');

  const unmined = STATE.conversations.filter(c => {
    const has = STATE.insights.some(i => i.source_kind === 'Conversation' && String(i.source_id) === String(c.id));
    return !has;
  }).length;

  return `HaTi Research — a go-to-market research workspace for two founders taking HaTi,
a Kenyan contract lifecycle management platform, to market.

Current stage: ${CURRENT_STAGE} — ${stage?.long}

THE FIVE QUESTIONS (the spine of this workspace — everything exists to move one):
${questionLines || '(no questions defined)'}

Conversations logged: ${STATE.conversations.length}
By segment: ${Object.entries(bySegment).map(([s, n]) => `${s}=${n}`).join(', ') || 'none yet'}
Segment targets: ${SEGMENTS.map(s => `${s.name}=${s.target}`).join(', ')}
Conversations with NO finding written down: ${unmined} (this is the workspace's most important data-quality rule)

Prospects: ${STATE.prospects.length} — ${PIPELINE_NAMES.map(s => `${s}=${byStatus[s] || 0}`).join(', ')}

Findings recorded: ${STATE.insights.length}. Most recent:
${recentFindings || '(none yet)'}

Pricing ideas and how prospects reacted:
${priceLines || '(none)'}

Competitors:
${competitorLines || '(none)'}

Market and regulation facts:
${factLines || '(none)'}

Rules for you:
- This workspace is deliberately empty of invented evidence. If there are no conversations,
  the honest answer is that we do not know yet — say so plainly rather than reasoning from
  the seeded reference material as if it were research.
- Never invent a quote, a company, a price a prospect gave, or a number of conversations.
  Every specific must be traceable to a record above.
- Cite what you use: the question reference (Q1…Q5), the company, the source name.
- No confidence percentages. A leaning plus what would change it.
- You argue; the two founders decide. Every action you propose is confirmed by a human.`;
}

/* With local data the app opens without a login; the assistant is the first
   thing that genuinely needs one, so it asks here, through the same Supabase
   magic-link flow the shared-data mode uses at boot. */
let signedIn = false;
async function ensureSignedIn() {
  if (signedIn) return;
  const { requireLogin } = await import('./auth.js');
  await requireLogin();
  signedIn = true;
}

export async function sendChat(userText) {
  if (!aiAvailable) return;
  const sendBtn = document.getElementById('send-chat-btn');
  if (sendBtn && sendBtn.disabled) return; // a request is already in flight — no double-send
  const input = document.getElementById('chat-input');
  const text = (userText || input.value || '').trim();
  if (!text) return;
  input.value = '';

  addChatMessage('user', text);
  STATE.chatHistory.push({ role: 'user', content: text });
  setTyping(true);
  if (sendBtn) sendBtn.disabled = true;

  try {
    await ensureSignedIn();
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
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    // Panel closed while the assistant was thinking → flag the reply is waiting.
    if (document.getElementById('chat-panel')?.classList.contains('closed')) setChatUnread(true);
  }
}

/* Assistant proposes → user confirms → write goes through data.js.
   The Confirm/Skip block itself lives in js/actions.js so capture screens
   can reuse the exact same pattern for AI link proposals. */
