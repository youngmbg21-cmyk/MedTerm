/* Market & rules — one question: "What is true about Kenya, and who says so?"

   The rule this screen enforces: every fact carries a source link. The form
   refuses to save one without it, and any fact that got in another way is
   flagged in red until somebody fixes it. A fact without a source is a
   rumour, and a decision built on rumours is a guess in a suit. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  openModal, closeModal, formField, setPageActions, fmtDate, today, factNeedsSource,
} from '../app.js';
import { FACT_CATEGORIES, FACT_STRENGTH, FACT_STRENGTH_NAMES, factStrengthTone, ownerOptions } from '../config.js';
import { data } from '../data.js';
import { insightModal, insightsForSource, insightCard, deleteInsight, questionOptions } from '../evidence.js';
import { exportFacts } from '../export.js';

const view = { category: 'all' };

function questionIdFromOption(label) {
  const ref = String(label || '').split(' — ')[0];
  return (STATE.questions.find(q => q.ref === ref) || {}).id || '';
}
function optionForQuestion(id) {
  const q = STATE.questions.find(x => String(x.id) === String(id));
  return q ? `${q.ref} — ${q.short}` : '';
}

function renderMarket(page) {
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => openFactForm() }, '+ Add a fact'));

  const sourceless = STATE.market_facts.filter(factNeedsSource);
  if (sourceless.length) {
    page.appendChild(h('div', { class: 'banner banner-rose mb-3' }, [
      h('span', { text: `${sourceless.length} fact${sourceless.length === 1 ? ' has' : 's have'} no source link. Until a link is attached, ${sourceless.length === 1 ? 'it is' : 'they are'} hearsay — open and fix, or delete.` }),
    ]));
  }

  const unchecked = STATE.market_facts.filter(f => f.strength === 'Needs checking');
  if (unchecked.length) {
    page.appendChild(h('div', { class: 'banner banner-gold mb-4' }, [
      h('span', { text: `${unchecked.length} fact${unchecked.length === 1 ? '' : 's'} still marked "Needs checking". These were seeded as the right documents to read, not as answers. Read one, write what it actually says, and change its strength.` }),
    ]));
  }

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('select', {
      class: 'select max-w-[220px]',
      onchange: e => { view.category = e.target.value; renderCurrentRoute(); },
    }, [
      h('option', { value: 'all' }, 'All categories'),
      ...FACT_CATEGORIES.map(c => {
        const o = h('option', { value: c }, c);
        if (view.category === c) o.selected = true;
        return o;
      }),
    ]),
    h('div', { class: 'flex-1' }),
    h('button', { class: 'btn btn-line', onclick: exportFacts }, '↓ CSV'),
  ]));

  /* A quiet legend, because "Primary source" vs "Reported" is the whole
     difference between a fact you can act on and one you cannot. */
  page.appendChild(h('div', { class: 'card card-pad mb-4' }, [
    h('div', { class: 'micro t-mute mb-2', text: 'How much a fact is worth' }),
    h('div', { class: 'flex flex-wrap gap-3' }, FACT_STRENGTH.map(s =>
      h('div', { class: 'flex items-center gap-2' }, [chip(s.name, s.tone), h('span', { class: 'text-xs t-mute', text: s.hint })]))),
  ]));

  const rows = STATE.market_facts
    .filter(f => view.category === 'all' || f.category === view.category)
    .sort((a, b) => (factNeedsSource(b) - factNeedsSource(a)) ||
      String(a.category || '').localeCompare(String(b.category || '')));

  if (!rows.length) {
    page.appendChild(emptyState(
      STATE.market_facts.length ? 'Nothing in that category yet.' : 'No facts recorded.',
      'Start with the four that decide whether HaTi can be sold at all: the Data Protection Act, e-signature law, stamp duty, and how big the market really is.',
      { label: '+ Add the first fact', onclick: () => openFactForm() }));
    return;
  }

  rows.forEach(f => page.appendChild(factCard(f)));
}

function factCard(f) {
  const missing = factNeedsSource(f);
  const insights = insightsForSource('Market fact', f.id);

  const head = h('div', { class: 'flex flex-wrap items-start justify-between gap-3' }, [
    h('div', { class: 'flex-1 min-w-[200px]' }, [
      h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
        chip(f.category || 'Other', 'violet'),
        chip(f.strength || 'Needs checking', factStrengthTone(f.strength)),
        missing ? chip('no source', 'rose') : null,
        f.affects_question ? chip((STATE.questions.find(q => String(q.id) === String(f.affects_question)) || {}).ref || '—', 'info') : null,
      ].filter(Boolean)),
      h('div', { class: 'card-title', text: f.claim || '—' }),
      f.value ? h('div', { class: 'text-sm t-bronze mt-1 num', text: f.value }) : null,
    ].filter(Boolean)),
    h('div', { class: 'flex gap-1' }, [
      h('button', { class: 'btn btn-ghost text-xs', onclick: () => openFactForm(f) }, 'Edit'),
      h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteFact(f) }, 'Delete'),
    ]),
  ]);

  const body = h('div', { class: 'mt-3 flex flex-col gap-3' });
  if (f.detail) body.appendChild(h('div', { class: 'text-sm t-soft', style: 'white-space:pre-wrap', text: f.detail }));

  body.appendChild(h('div', { class: missing ? 'inset-block b-rose-hint' : 'inset-block' }, [
    h('div', { class: 'micro t-bronze mb-1', text: 'Source' }),
    missing
      ? h('div', { class: 'text-sm t-rose', text: 'None. Attach the link this came from, or delete the fact.' })
      : h('div', {}, [
        h('div', { class: 'text-sm', text: f.source_name || 'Source' }),
        h('a', { class: 'source-link text-xs', href: f.source_url, target: '_blank', rel: 'noopener', text: f.source_url }),
        f.checked_on ? h('div', { class: 'text-xs t-mute mt-1', text: `Checked ${fmtDate(f.checked_on)}` }) : null,
      ].filter(Boolean)),
  ]));

  if (f.notes) body.appendChild(h('div', { class: 'text-sm t-mute', text: f.notes }));

  body.appendChild(h('div', { class: 'flex flex-wrap gap-2 pt-3 border-t b-soft' }, [
    h('button', { class: 'btn btn-line text-xs', onclick: () => insightModal({
      sourceKind: 'Market fact', sourceId: f.id, sourceLabel: f.source_name || f.claim,
      questionId: f.affects_question || '',
    }) }, '+ Write down a finding'),
  ]));

  insights.forEach(i => body.appendChild(insightCard(i, {
    onEdit: () => insightModal({ insight: i }),
    onDelete: () => deleteInsight(i),
  })));

  return h('div', { class: `card card-pad mb-3${missing ? ' card-flagged' : ''}` }, [head, body]);
}

/* ------------------------------------------------------------ form */
function openFactForm(existing) {
  const f = existing || {};
  openModal(existing ? 'Edit fact' : 'Add a fact', [
    formField('Category', 'category', 'select', f.category || FACT_CATEGORIES[0], FACT_CATEGORIES),
    formField('The claim, in one sentence', 'claim', 'textarea', f.claim),
    formField('The number or value, if there is one', 'value', 'input', f.value),
    formField('Detail — what it says and why it matters to us', 'detail', 'textarea', f.detail),
    formField('Who says so', 'source_name', 'input', f.source_name),
    formField('Source link (required)', 'source_url', 'input', f.source_url, null, 'url'),
    formField('How much it is worth', 'strength', 'select', f.strength || 'Needs checking', FACT_STRENGTH_NAMES),
    formField('Which question it bears on', 'question_option', 'select',
      optionForQuestion(f.affects_question), ['', ...questionOptions()]),
    formField('Checked on', 'checked_on', 'input', f.checked_on, null, 'date'),
    formField('Notes', 'notes', 'textarea', f.notes),
  ], async (form) => {
    if (!String(form.claim || '').trim()) { alert('The fact needs its one sentence.'); return; }
    /* The rule of this screen, enforced rather than requested. */
    if (!String(form.source_url || '').trim()) {
      alert('Every fact needs a source link. If you cannot link it, you cannot yet call it a fact — put it in a conversation note or an insight marked "Our own thinking" instead.');
      return;
    }
    const row = { ...form, affects_question: questionIdFromOption(form.question_option) };
    delete row.question_option;
    try {
      if (existing) await data.update('market_facts', existing.id, row);
      else await data.create('market_facts', { ...row, owner: ownerOptions()[0], added_on: today() });
      STATE.market_facts = await data.list('market_facts');
      closeModal(); renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function deleteFact(f) {
  openModal('Delete this fact?', [
    { key: '_', el: h('div', { class: 'text-sm t-soft', text: f.claim || '' }) },
  ], async () => {
    await data.remove('market_facts', f.id);
    STATE.market_facts = await data.list('market_facts');
    closeModal(); renderCurrentRoute();
  }, 'Delete', { danger: true });
}

registerRoute('market', 'Market & rules', renderMarket,
  'What is true about Kenya, and who says so?');
