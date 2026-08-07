/* Conversations — one question: "What did people actually tell us?"

   This screen is the list. The sheet (js/screens/sheet.js) is where one is
   filled in. There is exactly one way to record a meeting, and it is the
   sheet — a second free-form form would mean two founders capturing two
   different shapes of thing, which is the problem the script exists to fix.

   The data-quality rule of this workspace lives here: a conversation that
   never produced a written finding is a conversation you have already
   forgotten. The screen says so in red, and will not stop saying it. */
import {
  STATE, registerRoute, h, chip, emptyState,
  openModal, closeModal, setPageActions, fmtDate, routeParams,
  conversationUnmined, prospectName, segmentCoverageRows, progressBar, go,
  expandableCard, OPEN_BY_DEFAULT_UP_TO,
} from '../app.js';
import { SEGMENTS } from '../config.js';
import { data } from '../data.js';
import { insightsForSource, insightCard, insightModal, deleteInsight } from '../evidence.js';
import { scriptFor, scriptLength } from '../script.js';
import { exportConversations } from '../export.js';

const wtpTone = (w) => ({ 'Named a number': 'green', 'Asked for a quote': 'green', 'Vague yes': 'gold', 'Said no': 'rose' }[w] || 'line');

const reactionsFor = (convId) =>
  STATE.pricing_reactions.filter(r => String(r.conversation_id) === String(convId));

/* How much of the script this sheet got through — the same count the sheet
   itself shows, so the two never disagree. */
function progressFor(c) {
  const p = STATE.prospects.find(x => String(x.id) === String(c.prospect_id)) || {};
  const total = scriptLength(p.segment || '');
  let answers = {};
  try { answers = JSON.parse(c.answers || '{}') || {}; } catch { /* older row, no bag */ }
  const done = scriptFor(p.segment || '').flatMap(b => b.questions)
    .filter(q => String((q.field ? c[q.field] : answers[q.key]) || '').trim()).length;
  return { done, total };
}

function renderConversations(page) {
  const preselect = routeParams().get('prospect');
  setPageActions(h('button', {
    class: 'btn btn-primary',
    onclick: () => go(preselect ? `sheet?prospect=${encodeURIComponent(preselect)}` : 'sheet'),
  }, '+ New sheet'));

  /* Lead with the exception. */
  const unmined = STATE.conversations.filter(c => conversationUnmined(c));
  if (unmined.length) {
    page.appendChild(h('div', { class: 'banner banner-rose mb-4' }, [
      h('span', { text: `${unmined.length} conversation${unmined.length === 1 ? '' : 's'} with nothing written down from ${unmined.length === 1 ? 'it' : 'them'}. A conversation you did not turn into a finding is a conversation you have already lost — open the sheet and attach at least one.` }),
    ]));
  }

  /* Coverage against the targets we set ourselves. */
  const coverage = segmentCoverageRows();
  const done = coverage.reduce((n, r) => n + r.value, 0);
  const target = SEGMENTS.reduce((n, s) => n + s.target, 0);
  const cov = h('div', { class: 'card card-pad mb-4' }, [
    h('div', { class: 'flex items-baseline justify-between mb-3' }, [
      h('div', { class: 'card-title', text: 'Coverage' }),
      h('div', { class: 'text-sm t-mute num', text: `${done} of ${target} conversations` }),
    ]),
  ]);
  coverage.forEach(r => {
    const pct = r.target ? Math.min(100, (r.value / r.target) * 100) : 0;
    cov.appendChild(h('div', { class: 'mb-3' }, [
      h('div', { class: 'flex justify-between text-xs mb-1' }, [
        h('span', { text: r.label }),
        h('span', { class: 'num t-mute', text: `${r.value} / ${r.target}` }),
      ]),
      progressBar(pct, pct >= 100 ? 'var(--green)' : pct > 0 ? 'var(--gold)' : undefined),
    ]));
  });
  page.appendChild(cov);

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('div', { class: 'text-sm t-soft flex-1 min-w-[200px]',
      text: 'Write what they said, in their words. Paraphrase is where research goes to die.' }),
    h('button', { class: 'btn btn-line', onclick: exportConversations }, '↓ CSV'),
  ]));

  if (!STATE.conversations.length) {
    page.appendChild(emptyState('No conversations logged yet.',
      'Everything else in this workspace is preparation. This is the screen that produces the answers — one conversation, written up the same day, beats ten remembered later.',
      { label: '+ Start the first sheet', onclick: () => go(preselect ? `sheet?prospect=${encodeURIComponent(preselect)}` : 'sheet') }));
    return;
  }

  const rows = [...STATE.conversations]
    .sort((a, b) => (conversationUnmined(b) - conversationUnmined(a)) ||
      String(b.date || '').localeCompare(String(a.date || '')));
  rows.forEach(c => page.appendChild(conversationCard(c, rows.length)));
}

function conversationCard(c, listLength = 0) {
  const insights = insightsForSource('Conversation', c.id);
  const unmined = conversationUnmined(c);
  const reactions = reactionsFor(c.id);
  const { done, total } = progressFor(c);

  const summary = h('div', {}, [
    h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
      chip(fmtDate(c.date), 'line'),
      c.channel ? chip(c.channel, 'info') : null,
      c.wtp_signal && c.wtp_signal !== 'Not discussed' ? chip(c.wtp_signal, wtpTone(c.wtp_signal)) : null,
      reactions.length ? chip(`${reactions.length} price reaction${reactions.length === 1 ? '' : 's'}`, 'bronze') : null,
      unmined ? chip('nothing written down', 'rose') : chip(`${insights.length} finding${insights.length === 1 ? '' : 's'}`, 'green'),
      total ? chip(`${done}/${total} answered`, done >= total ? 'green' : 'line') : null,
    ].filter(Boolean)),
    h('div', { class: 'card-title', text: prospectName(c.prospect_id) }),
    h('div', { class: 'text-xs t-mute mt-0.5', text: [c.person, c.person_role, c.interviewer ? `ran by ${c.interviewer}` : null].filter(Boolean).join(' · ') }),
    h('div', { class: 'rec-peek', text: c.best_quote ? `“${c.best_quote}”` : (c.main_pain || 'No quote or pain recorded.') }),
  ]);

  const tools = h('div', { class: 'flex gap-1' }, [
    h('button', { class: 'btn btn-ghost text-xs', onclick: () => go(`sheet?id=${encodeURIComponent(c.id)}`) }, 'Open sheet'),
    h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteConversation(c) }, 'Delete'),
  ]);

  const body = h('div', { class: 'flex flex-col gap-3' });

  if (c.best_quote) {
    body.appendChild(h('div', { class: 'quote-block' }, [
      h('div', { class: 'quote-text', text: `“${c.best_quote}”` }),
      h('div', { class: 'quote-cite', text: [c.person, prospectName(c.prospect_id)].filter(Boolean).join(', ') }),
    ]));
  }

  const cell = (label, value) => value ? h('div', {}, [
    h('div', { class: 'micro t-mute mb-1', text: label }),
    h('div', { class: 'text-sm', style: 'white-space:pre-wrap', text: value }),
  ]) : null;

  const grid = h('div', { class: 'grid gap-3 sm:grid-cols-2' });
  [
    cell('What they use today', c.current_tools),
    cell('Biggest pain', c.main_pain),
    cell('What it costs them', c.pain_cost),
    cell('On price', c.wtp_detail),
  ].filter(Boolean).forEach(x => grid.appendChild(x));
  if (grid.children.length) body.appendChild(grid);

  if (reactions.length) {
    const list = h('div', { class: 'flex flex-wrap gap-1.5' });
    reactions.forEach(r => {
      const idea = STATE.pricing_ideas.find(i => String(i.id) === String(r.pricing_idea_id));
      list.appendChild(chip(`${idea ? idea.name : 'A price'}: ${r.reaction}`, 'bronze'));
    });
    body.appendChild(h('div', {}, [h('div', { class: 'micro t-mute mb-2', text: 'On the numbers' }), list]));
  }

  if (c.notes) body.appendChild(h('div', { class: 'inset-block' }, [
    h('div', { class: 'micro t-bronze mb-1', text: 'Notes' }),
    h('div', { class: 'text-sm', style: 'white-space:pre-wrap', text: c.notes }),
  ]));

  body.appendChild(h('div', { class: 'flex flex-wrap gap-2 pt-3 border-t b-soft' }, [
    h('button', { class: `btn ${unmined ? 'btn-primary' : 'btn-line'} text-xs`,
      onclick: () => go(`sheet?id=${encodeURIComponent(c.id)}`) },
      unmined ? 'Open the sheet and attach a finding' : 'Open the sheet'),
    h('button', { class: 'btn btn-line text-xs', onclick: () => insightModal({
      sourceKind: 'Conversation', sourceId: c.id,
      sourceLabel: `${prospectName(c.prospect_id)}${c.person ? ' — ' + c.person : ''}, ${fmtDate(c.date)}`,
      quote: c.best_quote || '',
    }) }, '+ Write down a finding'),
  ]));

  if (insights.length) {
    const list = h('div', { class: 'flex flex-col gap-2' });
    insights.forEach(i => list.appendChild(insightCard(i, {
      onEdit: () => insightModal({ insight: i }),
      onDelete: () => deleteInsight(i),
    })));
    body.appendChild(list);
  }

  return expandableCard({
    key: `conversation:${c.id}`, summary, detail: body, tools, flagged: unmined,
    /* A conversation nobody has written a finding from opens itself, every
       time, until somebody does. That is the rule, not a nicety. */
    defaultOpen: unmined || listLength <= OPEN_BY_DEFAULT_UP_TO,
  });
}

function deleteConversation(c) {
  const n = insightsForSource('Conversation', c.id).length;
  const r = reactionsFor(c.id).length;
  openModal('Delete this sheet?', [
    { key: '_', el: h('div', { class: 'text-sm t-soft' }, [
      h('div', { text: `${prospectName(c.prospect_id)}, ${fmtDate(c.date)}.` }),
      h('div', { class: 'text-xs mt-2 t-mute', text: n
        ? `${n} finding${n === 1 ? '' : 's'} drawn from this conversation will stay attached to their questions, but will no longer link back here.`
        : 'Nothing was ever written down from this one, so nothing else is affected.' }),
      r ? h('div', { class: 'text-xs mt-2 t-mute', text: `${r} price reaction${r === 1 ? '' : 's'} recorded in this meeting will be deleted with it.` }) : null,
    ].filter(Boolean)) },
  ], async () => {
    for (const x of reactionsFor(c.id)) await data.remove('pricing_reactions', x.id);
    await data.remove('conversations', c.id);
    STATE.conversations = await data.list('conversations');
    STATE.pricing_reactions = await data.list('pricing_reactions');
    closeModal();
    go('conversations');
  }, 'Delete', { danger: true });
}

registerRoute('conversations', 'Conversations', renderConversations,
  'What did people actually tell us?');
