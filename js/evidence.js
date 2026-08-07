/* ============================================================
   EVIDENCE — the link between something we found out and one of
   the five questions. This module is the single place that link
   is created, rendered and counted, so no screen invents its own
   version of "does this support or challenge Q2?".

   The record is an `insight` row in the database — that name is
   load-bearing in sql/schema.sql and the Edge Function, so it
   stays. On screen it is always called a FINDING, and never
   anything else. If you are adding user-facing copy here, the
   word is "finding".

   An insight record:
     question_id   which of the five questions it bears on
     direction     Supports · Challenges · Context
     finding       one sentence, in plain words
     quote         what somebody actually said, if anything
     source_kind   Conversation · Competitor · Market fact ·
                   Pricing test · Our own thinking
     source_id     the id of that record, when there is one
     source_label  a human label kept alongside the id, so an
                   insight still reads correctly if the source
                   record is later deleted
     owner         who wrote it down
     date          when
   ============================================================ */
import { STATE, h, chip, openModal, closeModal, formField, renderCurrentRoute, today, evidenceFor } from './app.js';
import { data } from './data.js';
import { DIRECTION_NAMES, directionTone, EVIDENCE_KINDS, ownerOptions } from './config.js';

/* Questions as dropdown options: "Q1 — Who is the buyer…" */
export function questionOptions() {
  return [...STATE.questions]
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map(q => `${q.ref} — ${q.short}`);
}
const questionIdFromOption = (label) => {
  const ref = String(label || '').split(' — ')[0];
  return (STATE.questions.find(q => q.ref === ref) || {}).id || '';
};
const optionForQuestion = (id) => {
  const q = STATE.questions.find(x => String(x.id) === String(id));
  return q ? `${q.ref} — ${q.short}` : '';
};

/**
 * The one modal for writing an insight down. Callers pass whatever they
 * already know about the source; the human fills in the rest.
 * Nothing about this is AI-only — writing a finding by hand is the
 * normal path, and the assistant simply proposes the same shape.
 */
export function insightModal({
  insight = null,
  sourceKind = 'Our own thinking',
  sourceId = '',
  sourceLabel = '',
  questionId = '',
  quote = '',
  afterSave,
} = {}) {
  const editing = !!insight;
  const src = insight || {};
  const fields = [
    formField('Which question does this bear on?', 'question_option', 'select',
      optionForQuestion(src.question_id || questionId) || questionOptions()[0], questionOptions()),
    formField('Does it support or challenge it?', 'direction', 'select',
      src.direction || 'Supports', DIRECTION_NAMES),
    formField('The finding, in one sentence', 'finding', 'textarea', src.finding || ''),
    formField('What they actually said (optional)', 'quote', 'textarea', src.quote || quote),
    formField('Where it came from', 'source_kind', 'select',
      src.source_kind || sourceKind, EVIDENCE_KINDS),
    formField('Source', 'source_label', 'text', src.source_label || sourceLabel),
    formField('Written down by', 'owner', 'select', src.owner || ownerOptions()[0], ownerOptions()),
    formField('Date', 'date', 'text', src.date || today(), null, 'date'),
  ];

  openModal(editing ? 'Edit finding' : 'Write down a finding', fields, async (out) => {
    if (!String(out.finding || '').trim()) {
      alert('A finding needs its one sentence. That sentence is the whole record — everything else is supporting detail.');
      return;
    }
    const row = {
      question_id: questionIdFromOption(out.question_option),
      direction: out.direction,
      finding: out.finding.trim(),
      quote: (out.quote || '').trim(),
      source_kind: out.source_kind,
      source_id: editing ? (src.source_id || sourceId) : sourceId,
      source_label: (out.source_label || '').trim(),
      owner: out.owner,
      date: out.date || today(),
    };
    if (editing) await data.update('insights', insight.id, row);
    else await data.create('insights', { ...row, source: 'human' });
    STATE.insights = await data.list('insights');
    closeModal();
    if (afterSave) afterSave();
    else renderCurrentRoute();
  }, editing ? 'Save' : 'Save finding');
}

/* Every insight drawn from one particular record. */
export function insightsForSource(kind, id, insights = STATE.insights) {
  return insights.filter(i => i.source_kind === kind && String(i.source_id) === String(id));
}

/* One finding, rendered. Compact enough for a list, complete enough to
   argue with: direction, the sentence, the quote, and where it came from. */
export function insightCard(insight, { showQuestion = true, onEdit, onDelete } = {}) {
  const q = STATE.questions.find(x => String(x.id) === String(insight.question_id));
  const head = h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-2' }, [
    chip(insight.direction || 'Context', directionTone(insight.direction)),
    showQuestion && q ? chip(q.ref, 'info') : null,
    insight.source_kind ? chip(insight.source_kind, 'violet') : null,
    insight.source === 'ai_confirmed' ? chip('AI-proposed, confirmed', 'line') : null,
  ].filter(Boolean));

  const body = h('div', {}, [
    h('div', { class: 'text-sm', text: insight.finding || '' }),
    insight.quote ? h('div', { class: 'quote-text mt-2', text: `“${insight.quote}”` }) : null,
    h('div', { class: 'text-xs mt-2 t-mute', text: [insight.source_label, insight.owner, insight.date].filter(Boolean).join(' · ') || '—' }),
  ].filter(Boolean));

  const tools = (onEdit || onDelete) ? h('div', { class: 'flex gap-2 mt-2' }, [
    onEdit ? h('button', { class: 'btn btn-ghost text-xs', onclick: onEdit }, 'Edit') : null,
    onDelete ? h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: onDelete }, 'Delete') : null,
  ].filter(Boolean)) : null;

  return h('div', { class: 'card card-pad' }, [head, body, tools].filter(Boolean));
}

/* The "attach a finding" button every source screen shows. One shape,
   one label, everywhere. */
export function addInsightButton(opts, label = 'Write down a finding') {
  return h('button', { class: 'btn btn-line text-xs', onclick: () => insightModal(opts) }, label);
}

/* A compact "2 support · 1 challenges" line for a question. */
export function evidenceTally(questionId) {
  const e = evidenceFor(questionId);
  const row = h('div', { class: 'flex flex-wrap gap-1.5' });
  row.appendChild(chip(`${e.supports.length} support`, e.supports.length ? 'green' : 'line'));
  row.appendChild(chip(`${e.challenges.length} challenge`, e.challenges.length ? 'rose' : 'line'));
  if (e.context.length) row.appendChild(chip(`${e.context.length} context`, 'info'));
  return row;
}

export async function deleteInsight(insight, after) {
  openModal('Delete this finding?', [
    { key: '_', el: h('div', { class: 'text-sm t-soft' }, [
      h('div', { text: insight.finding || '' }),
      h('div', { class: 'text-xs mt-2 t-mute', text: 'Deleting it removes it from the question it was attached to. This cannot be undone.' }),
    ]) },
  ], async () => {
    await data.remove('insights', insight.id);
    STATE.insights = await data.list('insights');
    closeModal();
    (after || renderCurrentRoute)();
  }, 'Delete', { danger: true });
}
