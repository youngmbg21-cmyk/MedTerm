/* Competitors — one question: "Who else could they buy instead of us?"

   The list leads with the status quo, not with Ironclad, because a folder
   on a shared drive is what actually wins these deals. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  openModal, closeModal, formField, setPageActions, fmtDate, today,
} from '../app.js';
import { COMPETITOR_TYPES, ownerOptions } from '../config.js';
import { data } from '../data.js';
import { insightsForSource, insightCard, insightModal, deleteInsight } from '../evidence.js';
import { exportCompetitors } from '../export.js';

const THREATS = ['High', 'Medium', 'Low', 'Unknown'];
const threatTone = (t) => ({ High: 'rose', Medium: 'gold', Low: 'green' }[t] || 'line');

const typeOrder = (t) => {
  const i = ['Status quo', 'E-signature', 'Kenyan / local', 'Global CLM', 'Regional / African', 'Adjacent tool'].indexOf(t);
  return i < 0 ? 99 : i;
};

function renderCompetitors(page) {
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => openCompetitorForm() }, '+ Add competitor'));

  const unpriced = STATE.competitors.filter(c => !String(c.price_notes || '').trim() ||
    /not verified/i.test(c.price_notes || ''));
  if (unpriced.length) {
    page.appendChild(h('div', { class: 'banner banner-gold mb-4' }, [
      h('span', { text: `${unpriced.length} competitor${unpriced.length === 1 ? '' : 's'} still carry unverified pricing. Until those are checked, every pricing decision we make rests on a guess about what the alternative costs.` }),
    ]));
  }

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('div', { class: 'text-sm t-soft flex-1 min-w-[200px]',
      text: 'The status quo — a shared drive, email and a lawyer on retainer — sits at the top on purpose. It is the competitor that wins most often.' }),
    h('button', { class: 'btn btn-line', onclick: exportCompetitors }, '↓ CSV'),
  ]));

  if (!STATE.competitors.length) {
    page.appendChild(emptyState('No competitors recorded.',
      'Start with what your prospects use today, not with the biggest names.',
      { label: '+ Add the first competitor', onclick: () => openCompetitorForm() }));
    return;
  }

  [...STATE.competitors]
    .sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || String(a.name).localeCompare(String(b.name)))
    .forEach(c => page.appendChild(competitorCard(c)));
}

function competitorCard(c) {
  const updates = STATE.competitor_updates
    .filter(u => String(u.competitor_id) === String(c.id))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const insights = insightsForSource('Competitor', c.id);

  const head = h('div', { class: 'flex flex-wrap items-start justify-between gap-3' }, [
    h('div', { class: 'flex-1 min-w-[200px]' }, [
      h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
        chip(c.type || 'Unknown', c.type === 'Status quo' ? 'bronze' : 'violet'),
        chip(`Threat: ${c.threat || 'Unknown'}`, threatTone(c.threat)),
        c.hq && c.hq !== '—' ? chip(c.hq, 'line') : null,
      ].filter(Boolean)),
      h('div', { class: 'card-title', text: c.name || '—' }),
    ]),
    h('div', { class: 'flex gap-1' }, [
      h('button', { class: 'btn btn-ghost text-xs', onclick: () => openCompetitorForm(c) }, 'Edit'),
      h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteCompetitor(c) }, 'Delete'),
    ]),
  ]);

  const body = h('div', { class: 'mt-3 flex flex-col gap-3' });
  if (c.positioning) body.appendChild(h('div', { class: 'text-sm t-soft', text: c.positioning }));

  const grid = h('div', { class: 'grid gap-3 sm:grid-cols-2' });
  const cell = (label, value, tone) => {
    if (!value) return null;
    return h('div', {}, [
      h('div', { class: `micro mb-1 ${tone || 't-mute'}`, text: label }),
      h('div', { class: 'text-sm', text: value }),
    ]);
  };
  [
    cell('What they charge', [c.pricing_model, c.price_notes].filter(Boolean).join(' — '), 't-bronze'),
    cell('Strengths', c.strengths),
    cell('Weaknesses', c.weaknesses),
    cell('In Kenya', c.kenya_presence),
  ].filter(Boolean).forEach(x => grid.appendChild(x));
  if (grid.children.length) body.appendChild(grid);

  if (c.notes) body.appendChild(h('div', { class: 'inset-block' }, [
    h('div', { class: 'micro t-bronze mb-1', text: 'What to do about it' }),
    h('div', { class: 'text-sm', text: c.notes }),
  ]));

  if (c.source_url) {
    body.appendChild(h('a', { class: 'source-link text-xs', href: c.source_url, target: '_blank', rel: 'noopener', text: c.source_url }));
  }

  /* Updates over time — this is what stops the map going stale. */
  const tools = h('div', { class: 'flex flex-wrap gap-2 pt-3 mt-1 border-t b-soft' }, [
    h('button', { class: 'btn btn-line text-xs', onclick: () => openUpdateForm(c) }, '+ Log an update'),
    h('button', { class: 'btn btn-line text-xs', onclick: () => insightModal({
      sourceKind: 'Competitor', sourceId: c.id, sourceLabel: c.name,
    }) }, '+ Write down a finding'),
  ]);
  body.appendChild(tools);

  if (updates.length) {
    const list = h('div', { class: 'flex flex-col gap-2' });
    updates.forEach(u => list.appendChild(h('div', { class: 'inset-block' }, [
      h('div', { class: 'flex items-center justify-between gap-2 mb-1' }, [
        h('span', { class: 'micro t-mute', text: `${fmtDate(u.date)}${u.owner ? ' · ' + u.owner : ''}` }),
        h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteUpdate(u) }, 'Delete'),
      ]),
      h('div', { class: 'text-sm', text: u.note || '' }),
      u.source_url ? h('a', { class: 'source-link text-xs', href: u.source_url, target: '_blank', rel: 'noopener', text: u.source_url }) : null,
    ].filter(Boolean))));
    body.appendChild(h('div', {}, [
      h('div', { class: 'micro t-mute mb-2', text: `${updates.length} update${updates.length === 1 ? '' : 's'}` }),
      list,
    ]));
  }

  if (insights.length) {
    const list = h('div', { class: 'flex flex-col gap-2' });
    insights.forEach(i => list.appendChild(insightCard(i, {
      onEdit: () => insightModal({ insight: i }),
      onDelete: () => deleteInsight(i),
    })));
    body.appendChild(h('div', {}, [
      h('div', { class: 'micro t-mute mb-2', text: 'Findings drawn from this' }),
      list,
    ]));
  }

  return h('div', { class: 'card card-pad mb-4' }, [head, body]);
}

/* ------------------------------------------------------------ forms */
function openCompetitorForm(existing) {
  const c = existing || {};
  openModal(existing ? 'Edit competitor' : 'Add competitor', [
    formField('Name', 'name', 'input', c.name),
    formField('Type', 'type', 'select', c.type || 'Global CLM', COMPETITOR_TYPES),
    formField('Based in', 'hq', 'input', c.hq),
    formField('How they position themselves', 'positioning', 'textarea', c.positioning),
    formField('Pricing model', 'pricing_model', 'input', c.pricing_model),
    formField('What we know about their price', 'price_notes', 'textarea', c.price_notes),
    formField('Strengths', 'strengths', 'textarea', c.strengths),
    formField('Weaknesses', 'weaknesses', 'textarea', c.weaknesses),
    formField('Presence in Kenya', 'kenya_presence', 'textarea', c.kenya_presence),
    formField('Threat to us', 'threat', 'select', c.threat || 'Unknown', THREATS),
    formField('Source link', 'source_url', 'input', c.source_url, null, 'url'),
    formField('What to do about it', 'notes', 'textarea', c.notes),
  ], async (form) => {
    try {
      if (existing) await data.update('competitors', existing.id, form);
      else await data.create('competitors', form);
      STATE.competitors = await data.list('competitors');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function openUpdateForm(c) {
  openModal(`Update on ${c.name}`, [
    formField('What changed', 'note', 'textarea', ''),
    formField('Source link', 'source_url', 'input', '', null, 'url'),
    formField('Noticed by', 'owner', 'select', ownerOptions()[0], ownerOptions()),
    formField('Date', 'date', 'input', today(), null, 'date'),
  ], async (form) => {
    if (!String(form.note || '').trim()) { alert('An update needs a line saying what changed.'); return; }
    try {
      await data.create('competitor_updates', { ...form, competitor_id: c.id });
      STATE.competitor_updates = await data.list('competitor_updates');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function deleteUpdate(u) {
  openModal('Delete this update?', [
    { key: '_', el: h('div', { class: 'text-sm t-soft', text: u.note || '' }) },
  ], async () => {
    await data.remove('competitor_updates', u.id);
    STATE.competitor_updates = await data.list('competitor_updates');
    closeModal(); renderCurrentRoute();
  }, 'Delete', { danger: true });
}

function deleteCompetitor(c) {
  const updates = STATE.competitor_updates.filter(u => String(u.competitor_id) === String(c.id)).length;
  openModal(`Delete ${c.name}?`, [
    { key: '_', el: h('div', { class: 'text-sm t-soft' }, [
      h('div', { text: `This removes the competitor${updates ? ` and its ${updates} update${updates === 1 ? '' : 's'}` : ''}.` }),
      h('div', { class: 'text-xs mt-2 t-mute', text: 'Findings already attached to questions are kept — they carry their own copy of the source name.' }),
    ]) },
  ], async () => {
    for (const u of STATE.competitor_updates.filter(u => String(u.competitor_id) === String(c.id))) {
      await data.remove('competitor_updates', u.id);
    }
    await data.remove('competitors', c.id);
    STATE.competitors = await data.list('competitors');
    STATE.competitor_updates = await data.list('competitor_updates');
    closeModal(); renderCurrentRoute();
  }, 'Delete', { danger: true });
}

registerRoute('competitors', 'Competitors', renderCompetitors,
  'Who else could they buy instead of us — including nobody?');
