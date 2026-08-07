/* Conversations — one question: "What did people actually tell us?"

   The data-quality rule of this workspace lives here: a conversation that
   never produced a written finding is a conversation you have already
   forgotten. The screen says so in red, and will not stop saying it. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, quoteBlock,
  openModal, closeModal, formField, setPageActions, fmtDate, today, routeParams,
  conversationUnmined, prospectName, segmentCoverageRows, progressBar,
  expandableCard, OPEN_BY_DEFAULT_UP_TO,
} from '../app.js';
import { CHANNELS, teamOptions, SEGMENTS } from '../config.js';
import { data } from '../data.js';
import { insightsForSource, insightCard, insightModal, deleteInsight } from '../evidence.js';
import { exportConversations } from '../export.js';

const WTP = ['Not discussed', 'Said no', 'Vague yes', 'Named a number', 'Asked for a quote'];
const wtpTone = (w) => ({ 'Named a number': 'green', 'Asked for a quote': 'green', 'Vague yes': 'gold', 'Said no': 'rose' }[w] || 'line');

function prospectOptions() {
  return ['', ...[...STATE.prospects].sort((a, b) => String(a.company).localeCompare(String(b.company))).map(p => p.company)];
}
const prospectIdFromName = (name) => (STATE.prospects.find(p => p.company === name) || {}).id || '';

function renderConversations(page) {
  const preselect = routeParams().get('prospect');
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => openConversationForm(null, preselect) }, '+ Log a conversation'));

  /* Lead with the exception. */
  const unmined = STATE.conversations.filter(c => conversationUnmined(c));
  if (unmined.length) {
    page.appendChild(h('div', { class: 'banner banner-rose mb-4' }, [
      h('span', { text: `${unmined.length} conversation${unmined.length === 1 ? '' : 's'} with nothing written down from ${unmined.length === 1 ? 'it' : 'them'}. A conversation you did not turn into a finding is a conversation you have already lost — open it and attach at least one.` }),
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
      { label: '+ Log the first conversation', onclick: () => openConversationForm(null, preselect) }));
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

  /* Shut, a conversation still shows who, when, and whether anything was ever
     written down from it — which is the whole reason to look at this list. */
  const summary = h('div', {}, [
    h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
      chip(fmtDate(c.date), 'line'),
      c.channel ? chip(c.channel, 'info') : null,
      c.wtp_signal ? chip(c.wtp_signal, wtpTone(c.wtp_signal)) : null,
      unmined ? chip('nothing written down', 'rose') : chip(`${insights.length} finding${insights.length === 1 ? '' : 's'}`, 'green'),
    ].filter(Boolean)),
    h('div', { class: 'card-title', text: prospectName(c.prospect_id) }),
    h('div', { class: 'text-xs t-mute mt-0.5', text: [c.person, c.person_role, c.interviewer ? `ran by ${c.interviewer}` : null].filter(Boolean).join(' · ') }),
    h('div', { class: 'rec-peek', text: c.best_quote ? `“${c.best_quote}”` : (c.main_pain || 'No quote or pain recorded.') }),
  ]);

  const tools = h('div', { class: 'flex gap-1' }, [
    h('button', { class: 'btn btn-ghost text-xs', onclick: () => openConversationForm(c) }, 'Edit'),
    h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteConversation(c) }, 'Delete'),
  ]);

  const body = h('div', { class: 'flex flex-col gap-3' });

  if (c.best_quote) {
    body.appendChild(quoteBlock(c.best_quote, [c.person, prospectName(c.prospect_id)].filter(Boolean).join(', ')));
  }

  const cell = (label, value) => value ? h('div', {}, [
    h('div', { class: 'micro t-mute mb-1', text: label }),
    h('div', { class: 'text-sm', text: value }),
  ]) : null;

  const grid = h('div', { class: 'grid gap-3 sm:grid-cols-2' });
  [
    cell('What they use today', c.current_tools),
    cell('Biggest pain', c.main_pain),
    cell('What it costs them', c.pain_cost),
    cell('On price', c.wtp_detail),
  ].filter(Boolean).forEach(x => grid.appendChild(x));
  if (grid.children.length) body.appendChild(grid);

  if (c.notes) body.appendChild(h('div', { class: 'inset-block' }, [
    h('div', { class: 'micro t-bronze mb-1', text: 'Notes' }),
    h('div', { class: 'text-sm', style: 'white-space:pre-wrap', text: c.notes }),
  ]));

  body.appendChild(h('div', { class: 'flex flex-wrap gap-2 pt-3 border-t b-soft' }, [
    h('button', { class: `btn ${unmined ? 'btn-primary' : 'btn-line'} text-xs`, onclick: () => insightModal({
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

/* ------------------------------------------------------------ form */
function openConversationForm(existing, preselectProspectId) {
  const c = existing || {};
  const preName = preselectProspectId
    ? (STATE.prospects.find(p => String(p.id) === String(preselectProspectId)) || {}).company
    : null;
  openModal(existing ? 'Edit conversation' : 'Log a conversation', [
    formField('Company', 'company_option', 'select',
      existing ? prospectName(c.prospect_id) : (preName || ''), prospectOptions()),
    formField('Who you spoke to', 'person', 'input', c.person),
    formField('Their role', 'person_role', 'input', c.person_role),
    formField('Date', 'date', 'input', c.date || today(), null, 'date'),
    formField('Channel', 'channel', 'select', c.channel || 'In person', CHANNELS),
    formField('Ran by', 'interviewer', 'select', c.interviewer || teamOptions()[0], teamOptions()),
    formField('What they use today', 'current_tools', 'textarea', c.current_tools),
    formField('Their biggest contract pain', 'main_pain', 'textarea', c.main_pain),
    formField('What that pain costs them', 'pain_cost', 'textarea', c.pain_cost),
    formField('Would they pay?', 'wtp_signal', 'select', c.wtp_signal || 'Not discussed', WTP),
    formField('What they said about money', 'wtp_detail', 'textarea', c.wtp_detail),
    formField('Best quote — their exact words', 'best_quote', 'textarea', c.best_quote),
    formField('Full notes', 'notes', 'textarea', c.notes),
  ], async (form) => {
    const prospect_id = prospectIdFromName(form.company_option);
    if (!prospect_id) {
      alert('Pick the company first. If they are not in the list, add them on the Prospects screen — a conversation with nobody attached cannot be counted or followed up.');
      return;
    }
    const row = { ...form, prospect_id };
    delete row.company_option;
    try {
      if (existing) await data.update('conversations', existing.id, row);
      else await data.create('conversations', row);
      /* A conversation is a touch. Keep the pipeline honest without asking. */
      const p = STATE.prospects.find(x => String(x.id) === String(prospect_id));
      if (p) {
        const patch = { last_touch: row.date || today() };
        if (['To contact', 'Contacted'].includes(p.status)) patch.status = 'Talked';
        await data.update('prospects', p.id, patch);
        STATE.prospects = await data.list('prospects');
      }
      STATE.conversations = await data.list('conversations');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function deleteConversation(c) {
  const n = insightsForSource('Conversation', c.id).length;
  openModal('Delete this conversation?', [
    { key: '_', el: h('div', { class: 'text-sm t-soft' }, [
      h('div', { text: `${prospectName(c.prospect_id)}, ${fmtDate(c.date)}.` }),
      h('div', { class: 'text-xs mt-2 t-mute', text: n
        ? `${n} finding${n === 1 ? '' : 's'} drawn from this conversation will stay attached to their questions, but will no longer link back here.`
        : 'Nothing was ever written down from this one, so nothing else is affected.' }),
    ]) },
  ], async () => {
    await data.remove('conversations', c.id);
    STATE.conversations = await data.list('conversations');
    closeModal(); renderCurrentRoute();
  }, 'Delete', { danger: true });
}

registerRoute('conversations', 'Conversations', renderConversations,
  'What did people actually tell us?');
