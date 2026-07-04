/* Theme matrix — one question: "What is the evidence saying, quote by quote?" */
import {
  STATE, registerRoute, renderCurrentRoute, h, emptyState, quoteBlock,
  openModal, closeModal, formField, isUntaggedOverdue, go,
} from '../app.js';
import { SEGMENT_NAMES, THEMES } from '../config.js';
import { data } from '../data.js';
import { exportMatrix } from '../export.js';

function renderMatrix(page) {
  const filterState = { theme: 'all', segment: 'all', minSev: 0, wtp: 'all' };

  /* Lead with the exception: untagged interviews mean the matrix is behind */
  const overdue = STATE.interviews.filter(isUntaggedOverdue);
  if (overdue.length) {
    page.appendChild(h('div', { class: 'banner banner-rose mb-4' }, [
      h('span', { text: `The matrix is missing ${overdue.map(r => r.interview_id).join(', ')} — tag those interviews first.` }),
      h('button', { class: 'btn btn-line text-xs', onclick: () => go('interviews') }, 'Open interviews'),
    ]));
  }

  const filters = h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('select', { class: 'select max-w-[210px]', onchange: e => { filterState.theme = e.target.value; renderRows(); } }, [
      h('option', { value: 'all' }, 'All themes'),
      ...THEMES.map(t => h('option', { value: t }, t)),
    ]),
    h('select', { class: 'select max-w-[150px]', onchange: e => { filterState.segment = e.target.value; renderRows(); } }, [
      h('option', { value: 'all' }, 'All segments'),
      ...SEGMENT_NAMES.map(s => h('option', { value: s }, s)),
    ]),
    h('select', { class: 'select max-w-[140px]', onchange: e => { filterState.minSev = +e.target.value; renderRows(); } }, [
      h('option', { value: '0' }, 'Any severity'),
      h('option', { value: '3' }, 'Severity ≥ 3'),
      h('option', { value: '4' }, 'Severity ≥ 4'),
      h('option', { value: '5' }, 'Severity = 5'),
    ]),
    h('select', { class: 'select max-w-[130px]', onchange: e => { filterState.wtp = e.target.value; renderRows(); } }, [
      h('option', { value: 'all' }, 'Any WTP'),
      h('option', { value: 'Y' }, 'WTP = Y'),
      h('option', { value: 'Maybe' }, 'WTP = Maybe'),
    ]),
    h('button', { class: 'btn btn-line ml-auto', onclick: exportMatrix }, '↓ CSV'),
    h('button', { class: 'btn btn-primary', onclick: () => openMatrixForm() }, '+ Add quote'),
  ]);
  page.appendChild(filters);

  const card = h('div', { class: 'card' });
  page.appendChild(card);

  function renderRows() {
    card.innerHTML = '';
    const rows = STATE.matrix.filter(r => {
      if (filterState.theme !== 'all' && r.theme_tag !== filterState.theme) return false;
      if (filterState.segment !== 'all' && r.segment !== filterState.segment) return false;
      if (filterState.minSev && (+r.severity || 0) < filterState.minSev) return false;
      if (filterState.wtp !== 'all' && r.wtp !== filterState.wtp) return false;
      return true;
    });

    if (!rows.length) {
      card.appendChild(emptyState(
        STATE.matrix.length === 0 ? 'No quotes tagged yet.' : 'No matches with current filters.',
        STATE.matrix.length === 0 ? 'Add the first one after your next interview.' : null));
      return;
    }

    rows.forEach(r => {
      card.appendChild(quoteBlock(r, {
        showEdit: h('button', { class: 'btn btn-ghost text-xs', onclick: () => openMatrixForm(r) }, 'Edit'),
      }));
    });
  }
  renderRows();
}

function openMatrixForm(existing) {
  const r = existing || {};
  const interviewIds = STATE.interviews.map(i => i.interview_id).filter(Boolean);
  openModal(existing ? 'Edit quote' : 'Add quote', [
    formField('Interview', 'interview_id', 'select', r.interview_id, ['', ...interviewIds]),
    formField('Quote / observation', 'quote', 'textarea', r.quote),
    formField('Theme tag', 'theme_tag', 'select', r.theme_tag, THEMES),
    formField('Segment', 'segment', 'select', r.segment, SEGMENT_NAMES),
    formField('Severity (1–5)', 'severity', 'select', String(r.severity || ''), ['1', '2', '3', '4', '5']),
    formField('Willingness to pay', 'wtp', 'select', r.wtp, ['Y', 'Maybe', 'N']),
    formField('Notes', 'notes', 'textarea', r.notes),
  ], async (form) => {
    if (form.severity) form.severity = Number(form.severity);
    try {
      if (existing) await data.update('matrix', existing.id, form);
      else await data.create('matrix', form);
      STATE.matrix = await data.list('matrix');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('matrix', 'Theme matrix', renderMatrix,
  'What is the evidence saying, quote by quote?');
