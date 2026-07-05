/* Theme matrix — one question: "What is the evidence saying, quote by quote?"
   Two views: Grid (a true theme × segment pivot, the shape of the analysis)
   and Quotes (the evidence itself, grouped by theme and ranked by weight). */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, quoteBlock,
  openModal, closeModal, formField, isUntaggedOverdue, go, rankThemes,
  setPageActions,
} from '../app.js';
import { SEGMENT_NAMES, THEMES } from '../config.js';
import { data } from '../data.js';
import { exportMatrix } from '../export.js';
import { openLinkModal, existingLinkChips, maybeProposeLinks } from '../evidence.js';

/* View + drill-down state persist across re-renders within the session — never to storage. */
let activeView = null; // 'grid' | 'quotes' — auto-picked until the user taps a toggle
let viewManuallySet = false;
let drillFilter = null; // { theme, segment } set by tapping a grid cell
const collapseOverrides = {}; // quotes-view theme group collapse, keyed by tag

function sevTone(avgSev) {
  if (avgSev >= 4) return { bg: 'var(--rose-soft)', fg: '#9a3f3f' };
  if (avgSev >= 3) return { bg: 'var(--honey-soft)', fg: 'var(--honey-deep)' };
  return { bg: 'var(--sage-soft)', fg: 'var(--sage-deep)' };
}

function renderMatrix(page) {
  const rows = STATE.matrix;
  /* Recomputed every render (not just once) — the initial render fires before
     async data has loaded, when STATE.matrix is still empty. */
  if (!viewManuallySet) activeView = rows.length >= 10 ? 'grid' : 'quotes';

  /* Lead with the exception: untagged interviews mean the matrix is behind */
  const overdue = STATE.interviews.filter(isUntaggedOverdue);
  if (overdue.length) {
    page.appendChild(h('div', { class: 'banner banner-rose mb-4' }, [
      h('span', { text: `The matrix is missing ${overdue.map(r => r.interview_id).join(', ')} — tag those interviews first.` }),
      h('button', { class: 'btn btn-line text-xs', onclick: () => go('interviews') }, 'Open interviews'),
    ]));
  }

  /* One primary action, in the app header; the tools row stays quiet */
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => openMatrixForm() }, '+ Add quote'));

  const toolbar = h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('div', { class: 'seg-toggle' }, [
      h('button', {
        class: `seg-toggle-btn${activeView === 'grid' ? ' active' : ''}`, type: 'button',
        onclick: () => { activeView = 'grid'; viewManuallySet = true; renderCurrentRoute(); },
      }, 'Grid'),
      h('button', {
        class: `seg-toggle-btn${activeView === 'quotes' ? ' active' : ''}`, type: 'button',
        onclick: () => { activeView = 'quotes'; viewManuallySet = true; renderCurrentRoute(); },
      }, 'Quotes'),
    ]),
    h('button', { class: 'btn btn-line ml-auto', onclick: exportMatrix }, '↓ CSV'),
  ]);
  page.appendChild(toolbar);

  const card = h('div', { class: 'card' });
  page.appendChild(card);

  if (!rows.length) {
    card.appendChild(emptyState('No quotes tagged yet.', 'Add the first one after your next interview.',
      { label: '+ Add the first quote', onclick: () => openMatrixForm() }));
    return;
  }

  if (activeView === 'grid') renderGrid(card);
  else renderQuotesView(card);
}

/* ---------- Grid view — theme × segment pivot ---------- */
function renderGrid(card) {
  /* Only cells for known segments participate in totals, so row/column/grand
     totals always sum consistently — quotes with an unrecognised segment
     still count toward the theme's evidence in Quotes view, just not here. */
  const cellFor = (theme, segment) => STATE.matrix.filter(r => r.theme_tag === theme && r.segment === segment);

  const table = h('table', { class: 'data grid-pivot' });
  const headRow = h('tr', {}, [
    h('th', { class: 'grid-row-header' }, 'Theme'),
    ...SEGMENT_NAMES.map(s => h('th', { class: 'text-center', text: s })),
    h('th', { class: 'text-center', text: 'Total' }),
  ]);
  table.appendChild(h('thead', {}, [headRow]));

  const tbody = h('tbody');
  const colTotals = SEGMENT_NAMES.map(() => 0);
  let grandTotal = 0;

  THEMES.forEach(theme => {
    const rowCells = SEGMENT_NAMES.map(s => cellFor(theme, s));
    const rowQuotes = rowCells.flat();
    const rowCount = rowQuotes.length;
    const avgSev = rowCount ? rowQuotes.reduce((sum, r) => sum + (+r.severity || 0), 0) / rowCount : 0;
    const wtpRate = rowCount ? Math.round((rowQuotes.filter(r => r.wtp === 'Y').length / rowCount) * 100) : 0;
    grandTotal += rowCount;

    const headerCell = h('td', { class: 'grid-row-header' }, [
      h('div', { class: 'text-sm font-medium', text: theme }),
      rowCount ? h('div', { class: 'text-xs mt-0.5 t-mute', text: `${rowCount} · avg sev ${avgSev.toFixed(1)} · WTP-Y ${wtpRate}%` }) : null,
    ].filter(Boolean));

    const tr = h('tr', { class: 'h-row' }, [headerCell]);
    rowCells.forEach((quotes, i) => {
      colTotals[i] += quotes.length;
      if (!quotes.length) {
        tr.appendChild(h('td', { class: 'text-center num t-mute', text: '·' }));
        return;
      }
      const cellAvgSev = quotes.reduce((sum, r) => sum + (+r.severity || 0), 0) / quotes.length;
      const tone = sevTone(cellAvgSev);
      const td = h('td', {
        class: 'text-center num grid-cell',
        style: `background:${tone.bg}; color:${tone.fg}; cursor:pointer;`,
        text: String(quotes.length),
      });
      td.addEventListener('click', () => {
        drillFilter = { theme, segment: SEGMENT_NAMES[i] };
        activeView = 'quotes';
        viewManuallySet = true;
        renderCurrentRoute();
      });
      tr.appendChild(td);
    });
    tr.appendChild(h('td', { class: 'text-center num font-medium', text: rowCount ? String(rowCount) : '·' }));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const footRow = h('tr', {}, [
    h('td', { class: 'grid-row-header font-medium', text: 'Total' }),
    ...colTotals.map(n => h('td', { class: 'text-center num font-medium', text: n ? String(n) : '·' })),
    h('td', { class: 'text-center num font-medium', text: grandTotal ? String(grandTotal) : '·' }),
  ]);
  table.appendChild(h('tfoot', {}, [footRow]));

  card.appendChild(h('div', { class: 'table-wrap' }, [table]));
}

/* ---------- Quotes view — grouped by theme, ranked by evidence weight ---------- */
function renderQuotesView(card) {
  const filterState = { segment: 'all', minSev: 0, wtp: 'all' };

  const filterRow = h('div', { class: 'px-5 pt-5 pb-3 flex flex-wrap items-center gap-3' }, [
    h('select', { class: 'select max-w-[150px]', onchange: e => { filterState.segment = e.target.value; renderBody(); } }, [
      h('option', { value: 'all' }, 'All segments'),
      ...SEGMENT_NAMES.map(s => h('option', { value: s }, s)),
    ]),
    h('select', { class: 'select max-w-[140px]', onchange: e => { filterState.minSev = +e.target.value; renderBody(); } }, [
      h('option', { value: '0' }, 'Any severity'),
      h('option', { value: '3' }, 'Severity ≥ 3'),
      h('option', { value: '4' }, 'Severity ≥ 4'),
      h('option', { value: '5' }, 'Severity = 5'),
    ]),
    h('select', { class: 'select max-w-[130px]', onchange: e => { filterState.wtp = e.target.value; renderBody(); } }, [
      h('option', { value: 'all' }, 'Any WTP'),
      h('option', { value: 'Y' }, 'WTP = Y'),
      h('option', { value: 'Maybe' }, 'WTP = Maybe'),
    ]),
  ]);
  card.appendChild(filterRow);

  const chipRow = h('div', { class: 'px-5 pb-3' });
  card.appendChild(chipRow);

  const body = h('div');
  card.appendChild(body);

  function renderDrillChip() {
    chipRow.innerHTML = '';
    if (!drillFilter) return;
    const wrap = h('span', { class: 'chip chip-info' }, [
      h('span', { text: `${drillFilter.theme} · ${drillFilter.segment}` }),
    ]);
    const closeBtn = h('span', { text: ' ✕', style: 'cursor:pointer; margin-left:4px;' });
    closeBtn.addEventListener('click', () => { drillFilter = null; renderCurrentRoute(); });
    wrap.appendChild(closeBtn);
    chipRow.appendChild(wrap);
  }

  function renderBody() {
    body.innerHTML = '';
    const rows = STATE.matrix.filter(r => {
      if (drillFilter && (r.theme_tag !== drillFilter.theme || r.segment !== drillFilter.segment)) return false;
      if (filterState.segment !== 'all' && r.segment !== filterState.segment) return false;
      if (filterState.minSev && (+r.severity || 0) < filterState.minSev) return false;
      if (filterState.wtp !== 'all' && r.wtp !== filterState.wtp) return false;
      return true;
    });

    if (!rows.length) {
      body.appendChild(emptyState('No matches with current filters.'));
      return;
    }

    const ranked = rankThemes(rows);
    const untagged = rows.filter(r => !r.theme_tag);

    ranked.forEach(t => group(t.tag, t.quotes, {
      count: t.count, avgSev: t.avgSev, wtpRate: t.wtpRate,
    }));

    if (untagged.length) {
      const avgSev = untagged.reduce((s, r) => s + (+r.severity || 0), 0) / untagged.length;
      const wtpRate = Math.round((untagged.filter(r => r.wtp === 'Y').length / untagged.length) * 100);
      group('Untagged', untagged, { count: untagged.length, avgSev, wtpRate, honey: true });
    }

    function group(tag, quotes, { count, avgSev, wtpRate, honey }) {
      const key = tag;
      const collapsed = collapseOverrides[key] === true;
      const groupBody = h('div', { style: collapsed ? 'display:none;' : '' });
      quotes.forEach(q => {
        const block = quoteBlock(q, {
          showEdit: h('div', { class: 'flex gap-1' }, [
            h('button', { class: 'btn btn-ghost text-xs', title: 'Link to hypothesis',
              onclick: () => openLinkModal({ evidence_type: 'matrix', evidence_id: q.id, cite: q.interview_id || 'quote' }) }, 'Link'),
            h('button', { class: 'btn btn-ghost text-xs', onclick: () => openMatrixForm(q) }, 'Edit'),
          ]),
        });
        const linkChips = existingLinkChips('matrix', q.id);
        if (linkChips.length) block.appendChild(h('div', { class: 'flex flex-wrap gap-1.5 mt-2' }, linkChips));
        groupBody.appendChild(block);
      });

      const header = h('div', { class: `theme-group-header${honey ? ' theme-group-header-honey' : ''}` }, [
        h('div', { class: 'flex items-center gap-2 min-w-0' }, [
          h('span', { class: 'group-chevron', text: collapsed ? '›' : '⌄' }),
          honey ? h('span', { class: 'text-sm font-medium', text: tag }) : chip(tag, 'plum'),
        ]),
        h('div', { class: 'text-xs flex-shrink-0 t-mute', text: `${count} · avg sev ${avgSev.toFixed(1)} · WTP-Y ${wtpRate}%` }),
      ]);
      header.addEventListener('click', () => { collapseOverrides[key] = !collapsed; renderBody(); });

      body.appendChild(h('div', { class: 'mb-2' }, [header, groupBody]));
    }
  }

  renderDrillChip();
  renderBody();
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
      let saved;
      if (existing) saved = await data.update('matrix', existing.id, form);
      else saved = await data.create('matrix', form);
      STATE.matrix = await data.list('matrix');
      closeModal();
      renderCurrentRoute();
      // Quiet, skippable link proposal after the save — AI mode only.
      maybeProposeLinks('matrix', saved);
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('matrix', 'Theme matrix', renderMatrix,
  'What is the evidence saying, quote by quote?');
