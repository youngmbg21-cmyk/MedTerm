/* Pricing — one question: "What will they actually pay, and for what shape?"

   An idea with no reactions is an opinion. The screen counts reactions per
   idea and puts the untested ones first, so the board cannot quietly become
   a list of things we like the sound of. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, quoteBlock,
  openModal, closeModal, formField, setPageActions, fmtDate, today, fmtKES, prospectName,
  expandableCard, OPEN_BY_DEFAULT_UP_TO,
} from '../app.js';
import { PRICING_MODELS, REACTION_NAMES, reactionTone, ownerOptions } from '../config.js';
import { data } from '../data.js';
import { insightModal, insightsForSource, insightCard, deleteInsight } from '../evidence.js';
import { exportPricing } from '../export.js';

const IDEA_STATUS = ['To test', 'Testing', 'Working', 'Rejected'];
const ideaTone = (s) => ({ Working: 'green', Testing: 'gold', Rejected: 'rose' }[s] || 'line');

const reactionsFor = (ideaId) => STATE.pricing_reactions.filter(r => String(r.pricing_idea_id) === String(ideaId));

function renderPricing(page) {
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => openIdeaForm() }, '+ Add a pricing idea'));

  const untested = STATE.pricing_ideas.filter(i => reactionsFor(i.id).length === 0);
  if (untested.length) {
    page.appendChild(h('div', { class: 'banner banner-gold mb-4' }, [
      h('span', { text: `${untested.length} of ${STATE.pricing_ideas.length} pricing ideas have never been put in front of anyone. Until a real prospect reacts to a real number, these are opinions.` }),
    ]));
  }

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('div', { class: 'text-sm t-soft flex-1 min-w-[200px]',
      text: 'Show a prospect three priced options and record what they said — the words, not your reading of them. "Too expensive" and "wrong shape" mean completely different things.' }),
    h('button', { class: 'btn btn-line', onclick: exportPricing }, '↓ CSV'),
  ]));

  if (!STATE.pricing_ideas.length) {
    page.appendChild(emptyState('No pricing ideas yet.',
      'Four models are worth testing: per seat, flat per company, a one-off migration fee, and services with the software included.',
      { label: '+ Add the first idea', onclick: () => openIdeaForm() }));
    return;
  }

  const rows = [...STATE.pricing_ideas]
    .sort((a, b) => reactionsFor(a.id).length - reactionsFor(b.id).length);
  rows.forEach(i => page.appendChild(ideaCard(i, rows.length)));
}

function ideaCard(idea, listLength = 0) {
  const reactions = reactionsFor(idea.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const insights = insightsForSource('Pricing test', idea.id);
  const tally = REACTION_NAMES
    .map(n => ({ name: n, count: reactions.filter(r => r.reaction === n).length }))
    .filter(x => x.count > 0);

  const priceLine = idea.price_low || idea.price_high
    ? `${fmtKES(idea.price_low)}${idea.price_high && idea.price_high !== idea.price_low ? ' – ' + fmtKES(idea.price_high) : ''}${idea.unit ? ' ' + idea.unit : ''}`
    : 'No number attached — pick one before you show it to anybody.';

  const summary = h('div', {}, [
    h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
      chip(idea.model || 'Model not set', 'violet'),
      chip(idea.status || 'To test', ideaTone(idea.status)),
      chip(`${reactions.length} reaction${reactions.length === 1 ? '' : 's'}`, reactions.length ? 'info' : 'line'),
    ]),
    h('div', { class: 'card-title', text: idea.name || '—' }),
    h('div', { class: 'text-sm t-bronze mt-1 num', text: priceLine }),
    h('div', { class: 'rec-peek', text: reactions.length
      ? `Latest: ${reactions[0].reaction} — ${prospectName(reactions[0].prospect_id)}`
      : 'Nobody has reacted to this number yet.' }),
  ]);

  const tools = h('div', { class: 'flex gap-1' }, [
    h('button', { class: 'btn btn-ghost text-xs', onclick: () => openIdeaForm(idea) }, 'Edit'),
    h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteIdea(idea) }, 'Delete'),
  ]);

  const body = h('div', { class: 'flex flex-col gap-3' });

  if (tally.length) {
    body.appendChild(h('div', { class: 'flex flex-wrap gap-1.5' },
      tally.map(t => chip(`${t.count} × ${t.name}`, reactionTone(t.name)))));
  }

  const cell = (label, value) => value ? h('div', {}, [
    h('div', { class: 'micro t-mute mb-1', text: label }),
    h('div', { class: 'text-sm', text: value }),
  ]) : null;
  const grid = h('div', { class: 'grid gap-3 sm:grid-cols-2' });
  [cell('Why it could work', idea.rationale), cell('What could go wrong', idea.risk)]
    .filter(Boolean).forEach(x => grid.appendChild(x));
  if (grid.children.length) body.appendChild(grid);

  body.appendChild(h('div', { class: 'flex flex-wrap gap-2 pt-3 border-t b-soft' }, [
    h('button', { class: `btn ${reactions.length ? 'btn-line' : 'btn-primary'} text-xs`, onclick: () => openReactionForm(idea) }, '+ Record a reaction'),
    h('button', { class: 'btn btn-line text-xs', onclick: () => insightModal({
      sourceKind: 'Pricing test', sourceId: idea.id, sourceLabel: idea.name,
    }) }, '+ Write down a finding'),
  ]));

  reactions.forEach(r => {
    const box = h('div', { class: 'inset-block' }, [
      h('div', { class: 'flex flex-wrap items-center justify-between gap-2 mb-1' }, [
        h('div', { class: 'flex flex-wrap items-center gap-1.5' }, [
          chip(r.reaction || '—', reactionTone(r.reaction)),
          h('span', { class: 'text-xs t-mute', text: `${prospectName(r.prospect_id)} · ${fmtDate(r.date)}` }),
          r.their_number ? chip(fmtKES(r.their_number), 'green') : null,
        ].filter(Boolean)),
        h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteReaction(r) }, 'Delete'),
      ]),
    ]);
    if (r.verbatim) box.appendChild(quoteBlock(r.verbatim, prospectName(r.prospect_id)));
    if (r.notes) box.appendChild(h('div', { class: 'text-xs t-mute mt-1', text: r.notes }));
    body.appendChild(box);
  });

  insights.forEach(i => body.appendChild(insightCard(i, {
    onEdit: () => insightModal({ insight: i }),
    onDelete: () => deleteInsight(i),
  })));

  return expandableCard({
    key: `pricing:${idea.id}`, summary, detail: body, tools,
    defaultOpen: listLength <= OPEN_BY_DEFAULT_UP_TO,
  });
}

/* ------------------------------------------------------------ forms */
function openIdeaForm(existing) {
  const i = existing || {};
  openModal(existing ? 'Edit pricing idea' : 'Add a pricing idea', [
    formField('Name', 'name', 'input', i.name),
    formField('Model', 'model', 'select', i.model || PRICING_MODELS[0], PRICING_MODELS),
    formField('Price from (KES)', 'price_low', 'input', i.price_low, null, 'number'),
    formField('Price to (KES)', 'price_high', 'input', i.price_high, null, 'number'),
    formField('Unit', 'unit', 'input', i.unit),
    formField('Why it could work', 'rationale', 'textarea', i.rationale),
    formField('What could go wrong', 'risk', 'textarea', i.risk),
    formField('Status', 'status', 'select', i.status || 'To test', IDEA_STATUS),
  ], async (form) => {
    if (!String(form.name || '').trim()) { alert('The idea needs a name.'); return; }
    form.price_low = form.price_low == null ? null : Number(form.price_low);
    form.price_high = form.price_high == null ? null : Number(form.price_high);
    try {
      if (existing) await data.update('pricing_ideas', existing.id, form);
      else await data.create('pricing_ideas', form);
      STATE.pricing_ideas = await data.list('pricing_ideas');
      closeModal(); renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function openReactionForm(idea) {
  const options = ['', ...[...STATE.prospects].sort((a, b) => String(a.company).localeCompare(String(b.company))).map(p => p.company)];
  openModal(`How did they react to "${idea.name}"?`, [
    formField('Company', 'company_option', 'select', '', options),
    formField('Reaction', 'reaction', 'select', 'About right', REACTION_NAMES),
    formField('What they said, word for word', 'verbatim', 'textarea', ''),
    formField('A number they gave, if any (KES)', 'their_number', 'input', '', null, 'number'),
    formField('Notes', 'notes', 'textarea', ''),
    formField('Recorded by', 'owner', 'select', ownerOptions()[0], ownerOptions()),
    formField('Date', 'date', 'input', today(), null, 'date'),
  ], async (form) => {
    const prospect_id = (STATE.prospects.find(p => p.company === form.company_option) || {}).id || '';
    if (!prospect_id) { alert('Pick the company. A reaction with nobody attached cannot be weighed against anything.'); return; }
    const row = { ...form, prospect_id, pricing_idea_id: idea.id };
    delete row.company_option;
    row.their_number = row.their_number == null ? null : Number(row.their_number);
    try {
      await data.create('pricing_reactions', row);
      STATE.pricing_reactions = await data.list('pricing_reactions');
      if (idea.status === 'To test') {
        await data.update('pricing_ideas', idea.id, { status: 'Testing' });
        STATE.pricing_ideas = await data.list('pricing_ideas');
      }
      closeModal(); renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function deleteReaction(r) {
  openModal('Delete this reaction?', [
    { key: '_', el: h('div', { class: 'text-sm t-soft', text: r.verbatim || `${r.reaction} — ${prospectName(r.prospect_id)}` }) },
  ], async () => {
    await data.remove('pricing_reactions', r.id);
    STATE.pricing_reactions = await data.list('pricing_reactions');
    closeModal(); renderCurrentRoute();
  }, 'Delete', { danger: true });
}

function deleteIdea(idea) {
  const n = reactionsFor(idea.id).length;
  openModal(`Delete "${idea.name}"?`, [
    { key: '_', el: h('div', { class: 'text-sm t-soft' }, [
      h('div', { text: n ? `This idea has ${n} recorded reaction${n === 1 ? '' : 's'}. They will be deleted with it.` : 'Nobody has reacted to this one yet.' }),
      h('div', { class: 'text-xs mt-2 t-mute', text: 'Consider marking it Rejected instead — a rejected price with the reason written down is a finding.' }),
    ]) },
  ], async () => {
    for (const r of reactionsFor(idea.id)) await data.remove('pricing_reactions', r.id);
    await data.remove('pricing_ideas', idea.id);
    STATE.pricing_ideas = await data.list('pricing_ideas');
    STATE.pricing_reactions = await data.list('pricing_reactions');
    closeModal(); renderCurrentRoute();
  }, 'Delete', { danger: true });
}

registerRoute('pricing', 'Pricing', renderPricing,
  'What will they actually pay, and for what shape?');
