/* Overview — one question: "What should we do today?"

   It answers that in this order:
     1 · the loop, until you say you have got it (a first-run explainer)
     2 · what is wrong — the exceptions, never the totals
     3 · where the five questions stand
     4 · the numbers, underneath
     5 · what happened lately

   The header's primary action changes with the state of the workspace,
   because "what should we do today?" has a different answer on day one
   (line up somebody to talk to) than it does in week six (write up the
   conversation you had this morning). A dashboard that always offers the
   same button is a dashboard that has not read its own screen. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, kpiCard, emptyState, setPageActions,
  evidenceFor, evidenceWeight, isStalled, conversationUnmined, factNeedsSource,
  fmtDate, daysSince, prospectName, go,
} from '../app.js';
import { CURRENT_STAGE, STAGES, PIPELINE_LIVE, questionTone, STALL_DAYS } from '../config.js';
import { insightModal } from '../evidence.js';

/* The explainer is dismissed per browser, like the team names — it is a
   preference, not research, so it never belongs in a backup. */
const LOOP_LS_KEY = 'hati_loop_dismissed_v1';
const loopDismissed = () => { try { return localStorage.getItem(LOOP_LS_KEY) === '1'; } catch { return false; } };
const dismissLoop = () => { try { localStorage.setItem(LOOP_LS_KEY, '1'); } catch { /* private mode — the card just stays */ } };

/* ------------------------------------------------------------
   What to do next, decided once and used twice: for the header
   button and for the closing line of the attention panel, so the
   screen never suggests two different next moves.
   ------------------------------------------------------------ */
function nextAction() {
  const unmined = STATE.conversations.filter(c => conversationUnmined(c));
  if (unmined.length) {
    return { label: 'Finish a sheet', route: 'conversations',
      why: `Open the ${unmined.length === 1 ? 'sheet' : `${unmined.length} sheets`} nothing has been written down from, and attach at least one finding.` };
  }
  if (!STATE.prospects.length) {
    return { label: '+ Add a prospect', route: 'prospects',
      why: 'Nobody is on the list yet. Four companies you can get an introduction to this week is a good start.' };
  }
  if (!STATE.conversations.length) {
    return { label: '+ Start an interview sheet', route: 'sheet',
      why: 'Nobody has been talked to yet. Everything else in here is preparation for that.' };
  }
  return { label: '+ Start an interview sheet', route: 'sheet',
    why: 'Every conversation has been written up. Go and have another one.' };
}

function renderOverview(page) {
  const next = nextAction();
  setPageActions(h('button', {
    class: 'btn btn-primary',
    onclick: () => (next.route ? go(next.route) : insightModal({})),
  }, next.label));

  const stage = STAGES.find(s => s.n === CURRENT_STAGE) || STAGES[0];
  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-2 mb-4' }, [
    chip(`Stage ${stage.n} · ${stage.name}`, 'green'),
    h('span', { class: 'text-sm t-mute', text: stage.long }),
  ]));

  /* ---- 0 · How this works, until they say they have got it ---- */
  if (!loopDismissed()) page.appendChild(loopCard());

  /* ---- 1 · What needs attention. The exceptions, first. ---- */
  const unmined  = STATE.conversations.filter(c => conversationUnmined(c));
  const stalled  = STATE.prospects.filter(isStalled);
  const noSource = STATE.market_facts.filter(factNeedsSource);
  const noNext   = STATE.prospects.filter(p => PIPELINE_LIVE.includes(p.status) && p.status !== 'To contact' && !String(p.next_step || '').trim());
  const dueSoon  = STATE.prospects.filter(p => p.next_step_date && (daysSince(p.next_step_date) ?? -99) >= 0);
  const emptyQs  = STATE.questions.filter(q => evidenceFor(q.id).all.length === 0 && q.status !== 'Parked');

  const items = [];
  if (unmined.length) items.push({ tone: 'rose', route: 'conversations',
    text: `${unmined.length} conversation${unmined.length === 1 ? '' : 's'} with no finding written down. This is the one that costs you most — write them up before the memory goes.` });
  if (noSource.length) items.push({ tone: 'rose', route: 'market',
    text: `${noSource.length} market fact${noSource.length === 1 ? ' has' : 's have'} no source link. Fix or delete — an unsourced fact will eventually be quoted as if it were true.` });
  if (dueSoon.length) items.push({ tone: 'gold', route: 'prospects',
    text: `${dueSoon.length} next step${dueSoon.length === 1 ? ' is' : 's are'} due or overdue: ${dueSoon.slice(0, 3).map(p => p.company).join(', ')}${dueSoon.length > 3 ? '…' : ''}.` });
  if (stalled.length) items.push({ tone: 'gold', route: 'prospects',
    text: `${stalled.length} prospect${stalled.length === 1 ? ' has' : 's have'} gone quiet for ${STALL_DAYS}+ days. Chase or close them.` });
  if (noNext.length) items.push({ tone: 'gold', route: 'prospects',
    text: `${noNext.length} live prospect${noNext.length === 1 ? ' has' : 's have'} no next step written down.` });
  if (emptyQs.length) items.push({ tone: 'info', route: 'questions',
    text: `${emptyQs.map(q => q.ref).join(', ')} ${emptyQs.length === 1 ? 'has' : 'have'} no evidence at all. Aim the next conversation there.` });

  const attention = h('div', { class: 'card card-pad mb-4' }, [
    h('div', { class: 'card-title mb-3', text: 'What needs attention' }),
  ]);
  if (!items.length) {
    attention.appendChild(h('div', { class: 'text-sm t-soft', text: 'Nothing is flagged. Every conversation has a finding attached, every fact has a source, and every live prospect has a next step.' }));
  } else {
    items.forEach(i => {
      attention.appendChild(h('button', {
        class: `banner banner-${i.tone} mb-2 w-full text-left`,
        onclick: () => go(i.route),
      }, [h('span', { text: i.text })]));
    });
  }
  /* Whatever the list says, the panel closes by naming one move. A list of
     symptoms is not an instruction. */
  attention.appendChild(h('div', { class: 'inset-block mt-3' }, [
    h('div', { class: 'micro t-bronze mb-1', text: 'Do this next' }),
    h('div', { class: 'text-sm', text: next.why }),
  ]));
  page.appendChild(attention);

  /* ---- 2 · Where the five questions stand ---- */
  const qs = [...STATE.questions].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const qCard = h('div', { class: 'card card-pad mb-4' }, [
    h('div', { class: 'flex items-baseline justify-between mb-3' }, [
      h('div', { class: 'card-title', text: 'Where the five questions stand' }),
      h('button', { class: 'btn btn-ghost text-xs', onclick: () => go('questions') }, 'Open →'),
    ]),
  ]);
  if (!qs.length) {
    qCard.appendChild(emptyState('No questions set.', 'Settings → Reset to the starting workspace restores the five from the research brief.'));
  } else {
    qs.forEach(q => {
      const e = evidenceFor(q.id);
      const w = evidenceWeight(q.id);
      qCard.appendChild(h('div', { class: 'flex flex-wrap items-center gap-2 py-2 border-b b-soft' }, [
        chip(q.ref || '—', 'info'),
        h('span', { class: 'text-sm flex-1 min-w-[160px]', text: q.short || '' }),
        chip(w.label, w.tone),
        chip(q.status || 'Open', questionTone(q.status)),
        /* Spelled out. "0↑ 0↓" saves eight characters and costs a reader who
           has to work out which arrow is which every time they look. */
        h('span', { class: 'text-xs t-mute', text: `${e.supports.length} support · ${e.challenges.length} challenge` }),
      ]));
    });
  }
  page.appendChild(qCard);

  /* ---- 3 · The numbers, underneath ---- */
  const live = STATE.prospects.filter(p => PIPELINE_LIVE.includes(p.status)).length;
  const pilots = STATE.prospects.filter(p => p.status === 'Pilot').length;
  const reactions = STATE.pricing_reactions.length;
  const grid = h('div', { class: 'grid gap-3 mb-4', style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))' }, [
    kpiCard('Conversations', STATE.conversations.length, 'the only real evidence'),
    kpiCard('Findings', STATE.insights.length, 'attached to a question'),
    kpiCard('Live prospects', live, `${pilots} at pilot`, pilots ? 'green' : undefined),
    kpiCard('Price reactions', reactions, reactions ? 'to a real number' : 'nobody has seen a price yet', reactions ? undefined : 'gold'),
    kpiCard('Facts with sources', STATE.market_facts.filter(f => !factNeedsSource(f)).length, `of ${STATE.market_facts.length}`),
    kpiCard('Competitors', STATE.competitors.length, 'including the status quo'),
  ]);
  page.appendChild(grid);

  /* ---- 4 · The last few things that happened ---- */
  const recent = [
    ...STATE.conversations.map(c => ({ date: c.date, text: `Talked to ${prospectName(c.prospect_id)}${c.person ? ' — ' + c.person : ''}`, route: 'conversations' })),
    ...STATE.insights.map(i => ({ date: i.date, text: `Finding: ${String(i.finding || '').slice(0, 90)}`, route: 'findings' })),
    ...STATE.pricing_reactions.map(r => ({ date: r.date, text: `${prospectName(r.prospect_id)} reacted "${r.reaction}" to a price`, route: 'pricing' })),
    ...STATE.competitor_updates.map(u => ({ date: u.date, text: `Competitor update: ${String(u.note || '').slice(0, 90)}`, route: 'competitors' })),
  ].filter(x => x.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);

  const recentCard = h('div', { class: 'card card-pad' }, [
    h('div', { class: 'card-title mb-3', text: 'Lately' }),
  ]);
  if (!recent.length) {
    recentCard.appendChild(h('div', { class: 'text-sm t-mute', text: 'Nothing recorded yet. The workspace starts with reference material only — the competitor set, the Kenyan rules to read, four pricing ideas and a starter target list. Everything else is yours to fill in.' }));
  } else {
    recent.forEach(r => recentCard.appendChild(h('button', {
      class: 'flex items-baseline gap-3 py-2 border-b b-soft w-full text-left h-row',
      onclick: () => go(r.route),
    }, [
      h('span', { class: 'text-xs t-mute num', style: 'min-width:56px', text: fmtDate(r.date) }),
      h('span', { class: 'text-sm', text: r.text }),
    ])));
  }
  page.appendChild(recentCard);
}

/* ------------------------------------------------------------
   The loop, in four steps. Each step ticks itself off once there
   is a record of that kind, so the card doubles as a setup
   checklist without ever nagging.
   ------------------------------------------------------------ */
function loopCard() {
  const steps = [
    { n: 1, done: STATE.prospects.length > 0,
      text: 'Line up a company worth talking to.', go: 'prospects', label: 'Prospects' },
    { n: 2, done: STATE.conversations.length > 0,
      text: 'Meet them and fill in the sheet — the questions written for their kind of company, the prices, and what they said, all on one page.', go: 'sheet', label: 'New sheet' },
    { n: 3, done: STATE.insights.length > 0,
      text: 'Tick which answers mattered. That is what attaches them to one of the five questions — you do it on the sheet, in the room.', go: 'conversations', label: 'Conversations' },
    { n: 4, done: STATE.questions.some(q => q.leaning),
      text: 'Read where the five questions now stand, and aim the next meeting at the thinnest one.', go: 'questions', label: 'Where we stand' },
  ];

  const card = h('div', { class: 'card card-pad mb-4' }, [
    h('div', { class: 'flex flex-wrap items-start justify-between gap-3 mb-1' }, [
      h('div', {}, [
        h('div', { class: 'card-title', text: 'How this works' }),
        h('div', { class: 'text-2nd t-mute mt-0.5', text: 'One loop, four steps. The sheet in step 2 is where nearly all of it happens.' }),
      ]),
      h('button', {
        class: 'btn btn-ghost text-xs',
        onclick: () => { dismissLoop(); renderCurrentRoute(); },
      }, 'Got it, hide this'),
    ]),
  ]);

  steps.forEach(s => {
    card.appendChild(h('button', {
      class: `loop-step${s.done ? ' done' : ''}`,
      onclick: () => go(s.go),
    }, [
      h('span', { class: 'loop-step-n', text: s.done ? '✓' : String(s.n) }),
      h('span', { class: 'loop-step-text', text: s.text }),
      h('span', { class: 'loop-step-go', text: `${s.label} →` }),
    ]));
  });

  card.appendChild(h('div', { class: 'text-xs t-mute mt-3', text: 'The two rules that make it worth doing: a conversation nobody wrote a finding from is a lost conversation, and a fact with no source link is a rumour. The app flags both in red and will keep flagging them.' }));
  return card;
}

registerRoute('overview', 'Overview', renderOverview,
  'What should we do today?');
