/* Findings — one question: "What have we learned, and what does it change?"

   Every finding in the workspace in one place, filterable by question and by
   direction. This is the ledger the two of you argue from.

   The record is called an `insight` in the database and in js/evidence.js,
   which is where that name stays. On screen there is one word for it —
   "finding" — because two words for one thing is two things to learn. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  setPageActions, evidenceFor,
} from '../app.js';
import { DIRECTION_NAMES, EVIDENCE_KINDS } from '../config.js';
import { insightModal, insightCard, deleteInsight } from '../evidence.js';
import { exportInsights } from '../export.js';

const view = { question: 'all', direction: 'all', kind: 'all' };

function renderFindings(page) {
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => insightModal({}) }, '+ Write down a finding'));

  const qs = [...STATE.questions].sort((a, b) => (a.sort || 0) - (b.sort || 0));

  /* The board: every question with its tally, tappable as a filter. */
  const board = h('div', { class: 'grid gap-3 mb-4', style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))' });
  qs.forEach(q => {
    const e = evidenceFor(q.id);
    const selected = view.question === String(q.id);
    const card = h('button', {
      class: `card card-pad text-left${selected ? ' is-selected' : ''}`,
      onclick: () => { view.question = selected ? 'all' : String(q.id); renderCurrentRoute(); },
    }, [
      h('div', { class: 'flex items-center gap-2 mb-1' }, [chip(q.ref || '—', 'info')]),
      h('div', { class: 'text-sm', text: q.short || '' }),
      h('div', { class: 'flex flex-wrap gap-1.5 mt-2' }, [
        chip(`${e.supports.length} support`, e.supports.length ? 'green' : 'line'),
        chip(`${e.challenges.length} challenge`, e.challenges.length ? 'rose' : 'line'),
      ]),
    ]);
    board.appendChild(card);
  });
  if (qs.length) page.appendChild(board);

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('select', { class: 'select max-w-[150px]', onchange: e => { view.direction = e.target.value; renderCurrentRoute(); } }, [
      h('option', { value: 'all' }, 'Any direction'),
      ...DIRECTION_NAMES.map(d => { const o = h('option', { value: d }, d); if (view.direction === d) o.selected = true; return o; }),
    ]),
    h('select', { class: 'select max-w-[190px]', onchange: e => { view.kind = e.target.value; renderCurrentRoute(); } }, [
      h('option', { value: 'all' }, 'Any source' ),
      ...EVIDENCE_KINDS.map(k => { const o = h('option', { value: k }, k); if (view.kind === k) o.selected = true; return o; }),
    ]),
    view.question !== 'all' || view.direction !== 'all' || view.kind !== 'all'
      ? h('button', { class: 'btn btn-ghost text-xs', onclick: () => { view.question = 'all'; view.direction = 'all'; view.kind = 'all'; renderCurrentRoute(); } }, 'Clear filters')
      : null,
    h('div', { class: 'flex-1' }),
    h('button', { class: 'btn btn-line', onclick: exportInsights }, '↓ CSV'),
  ].filter(Boolean)));

  const rows = STATE.insights
    .filter(i => view.question === 'all' || String(i.question_id) === view.question)
    .filter(i => view.direction === 'all' || i.direction === view.direction)
    .filter(i => view.kind === 'all' || i.source_kind === view.kind)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  if (!rows.length) {
    page.appendChild(emptyState(
      STATE.insights.length ? 'Nothing matches those filters.' : 'No findings written down yet.',
      STATE.insights.length
        ? 'Clear the filters, or attach a finding to the question you were looking at.'
        : 'A finding is one sentence that changes what you would do. Attach it to a question and say whether it supports or challenges it — that link is the whole point of this workspace.',
      STATE.insights.length ? null : { label: '+ Write down the first finding', onclick: () => insightModal({}) }));
    return;
  }

  page.appendChild(h('div', { class: 'text-sm t-mute mb-3', text: `${rows.length} finding${rows.length === 1 ? '' : 's'}` }));

  const list = h('div', { class: 'flex flex-col gap-3' });
  rows.forEach(i => list.appendChild(insightCard(i, {
    onEdit: () => insightModal({ insight: i }),
    onDelete: () => deleteInsight(i),
  })));
  page.appendChild(list);
}

registerRoute('findings', 'Findings', renderFindings,
  'What have we learned, and what does it change?');
