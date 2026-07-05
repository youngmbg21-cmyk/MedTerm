/* Phase 3 — Sense-making screens.
   All read the canonical snake_case shape via STATE / data.js. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, quoteBlock,
  openModal, closeModal, formField, fmtDate, rankThemes, setPageActions,
} from '../app.js';
import { data } from '../data.js';
import { exportKillList } from '../export.js';

/* ---------- Theme analysis — "Which themes are strongest?" ---------- */
function renderThemeAnalysis(page) {
  const ranked = rankThemes();

  if (!ranked.length) {
    page.appendChild(h('div', { class: 'card' }, [
      emptyState('No matrix entries yet.', 'Themes will rank here once quotes are tagged.'),
    ]));
    return;
  }

  /* Lead with the exception: themes with thin evidence */
  const thin = ranked.filter(t => t.count < 3);
  if (thin.length) {
    page.appendChild(h('div', { class: 'banner banner-honey mb-4' }, [
      h('span', { text: `${thin.length} theme${thin.length === 1 ? '' : 's'} rest on fewer than 3 quotes — treat those rankings as provisional.` }),
    ]));
  }

  page.appendChild(h('div', { class: 'text-sm mb-4 t-soft', text: `Ranked by frequency × average severity × WTP signal. ${ranked.length} themes from ${STATE.matrix.length} matrix entries.` }));

  const table = h('table', { class: 'data' });
  const headRow = h('tr');
  ['#', 'Theme', 'Count', 'Avg severity', 'WTP rate', 'Score'].forEach(t => headRow.appendChild(h('th', { text: t })));
  table.appendChild(h('thead', {}, [headRow]));

  const tbody = h('tbody');
  ranked.forEach((t, i) => {
    const sevColor = t.avgSev >= 4 ? 'var(--rose)' : t.avgSev >= 3 ? 'var(--honey-deep)' : 'var(--ink)';
    const themeTd = h('td', {}, [chip(t.tag, 'plum'), t.count < 3 ? chip('thin', 'honey') : null].filter(Boolean));
    themeTd.className = 'flex flex-wrap gap-1.5';
    tbody.appendChild(h('tr', { class: 'h-row' }, [
      h('td', { class: 'num', text: `${i + 1}` }),
      themeTd,
      h('td', { class: 'num', text: `${t.count}` }),
      h('td', { class: 'num', text: t.avgSev.toFixed(1), style: `color:${sevColor};` }),
      h('td', { class: 'num', text: `${t.wtpRate}%` }),
      h('td', { class: 'num font-medium', text: t.score.toFixed(1) }),
    ]));
  });
  table.appendChild(tbody);
  page.appendChild(h('div', { class: 'card' }, [h('div', { class: 'table-wrap' }, [table])]));
}

registerRoute('theme-analysis', 'Theme analysis', renderThemeAnalysis,
  'Which themes are strongest — and which rest on thin evidence?');

/* ---------- Segment cards — "What do we now know about each segment?" ---------- */
function renderSegmentCards(page) {
  const segments = [...new Set(STATE.matrix.map(r => r.segment).filter(Boolean))];

  if (!segments.length) {
    page.appendChild(h('div', { class: 'card' }, [
      emptyState('No segments in the matrix yet.', 'Segment cards build themselves as interviews are tagged.'),
    ]));
    return;
  }

  segments.forEach(seg => {
    const quotes = STATE.matrix.filter(r => r.segment === seg);
    const highSev = quotes.filter(r => (+r.severity || 0) >= 4);
    const wtpY = quotes.filter(r => r.wtp === 'Y');

    const themes = {};
    quotes.forEach(r => { if (r.theme_tag) themes[r.theme_tag] = (themes[r.theme_tag] || 0) + 1; });
    const topThemes = Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const card = h('div', { class: 'card p-6 mb-4 max-w-3xl' });
    card.appendChild(h('div', { class: 'serif text-lg mb-3', text: seg }));
    card.appendChild(h('div', { class: 'flex flex-wrap gap-2 mb-4' }, [
      chip(`${quotes.length} quotes`, 'line'),
      chip(`${highSev.length} high-severity`, highSev.length ? 'rose' : 'line'),
      chip(`${wtpY.length} WTP`, wtpY.length ? 'sage' : 'line'),
    ]));

    if (topThemes.length) {
      card.appendChild(h('div', { class: 'micro mb-2 t-mute', text: 'Top themes' }));
      card.appendChild(h('div', { class: 'flex flex-wrap gap-2 mb-4' },
        topThemes.map(([t, n]) => chip(`${t} (${n})`, 'plum'))));
    }

    const topQuotes = [...quotes].sort((a, b) => (+b.severity || 0) - (+a.severity || 0)).slice(0, 3);
    if (topQuotes.length) {
      card.appendChild(h('div', { class: 'micro mb-1 t-mute', text: 'Strongest quotes' }));
      topQuotes.forEach(q => card.appendChild(quoteBlock(q)));
    }

    page.appendChild(card);
  });
}

registerRoute('segment-cards', 'Segment cards', renderSegmentCards,
  'What do we now know about each segment?');

/* ---------- Top-3 pains — "Which pains should the product solve?" ---------- */
function renderTopPains(page) {
  const painQuotes = STATE.matrix.filter(r => (r.theme_tag || '').startsWith('Pain') || (r.theme_tag || '').startsWith('Friction'));

  const grouped = {};
  painQuotes.forEach(r => {
    if (!grouped[r.theme_tag]) grouped[r.theme_tag] = { quotes: [], totalSev: 0, wtpY: 0 };
    grouped[r.theme_tag].quotes.push(r);
    grouped[r.theme_tag].totalSev += +r.severity || 0;
    if (r.wtp === 'Y') grouped[r.theme_tag].wtpY++;
  });

  const ranked = Object.entries(grouped)
    .map(([tag, d]) => ({ tag, ...d, score: d.quotes.length * (d.totalSev / d.quotes.length) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!ranked.length) {
    page.appendChild(h('div', { class: 'card' }, [
      emptyState('No pain or friction themes tagged yet.', 'Top pains are derived from the matrix.'),
    ]));
    return;
  }

  ranked.forEach((pain, i) => {
    const avgSev = pain.totalSev / pain.quotes.length;
    const card = h('div', { class: 'card p-6 mb-4 max-w-3xl' });
    card.appendChild(h('div', { class: 'flex flex-wrap items-baseline justify-between gap-2 mb-3' }, [
      h('div', { class: 'serif text-lg', text: `${i + 1}. ${pain.tag}` }),
      h('div', { class: 'flex gap-2' }, [
        chip(`${pain.quotes.length} mentions`, 'line'),
        chip(`Avg severity ${avgSev.toFixed(1)}`, avgSev >= 4 ? 'rose' : 'honey'),
        chip(`${pain.wtpY} WTP`, pain.wtpY ? 'sage' : 'line'),
      ]),
    ]));
    [...pain.quotes].sort((a, b) => (+b.severity || 0) - (+a.severity || 0)).slice(0, 3)
      .forEach(q => card.appendChild(quoteBlock(q)));
    page.appendChild(card);
  });
}

registerRoute('top-pains', 'Top-3 pains', renderTopPains,
  'Which three pains should any product be built around?');

/* ---------- Kill list — "Which hypotheses has the evidence killed?" ---------- */
function renderKillList(page) {
  /* One primary action, in the app header; the tools row stays quiet */
  setPageActions(h('button', { class: 'btn btn-primary', onclick: openKillForm }, '+ Kill a hypothesis'));

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('div', { class: 'text-sm flex-1 t-soft', text: 'Append-only. Entries cannot be edited or removed — that is the point.' }),
    h('button', { class: 'btn btn-line', onclick: exportKillList }, '↓ CSV'),
  ]));

  const card = h('div', { class: 'card' });
  if (!STATE.kill_list.length) {
    card.appendChild(emptyState('No hypotheses killed yet.', 'When evidence falsifies a hypothesis, record it here.'));
  } else {
    [...STATE.kill_list]
      .sort((a, b) => String(b.killed_date || '').localeCompare(String(a.killed_date || '')))
      .forEach(r => {
        card.appendChild(h('div', { class: 'px-6 py-4 border-b b-soft' }, [
          h('div', { class: 'flex items-center gap-2 mb-2' }, [
            chip('Killed', 'rose'),
            h('span', { class: 'text-xs t-mute', text: fmtDate(r.killed_date) }),
          ]),
          h('div', { class: 'serif text-base mb-1', text: r.hypothesis || '' }),
          h('div', { class: 'text-sm t-soft', text: r.evidence || '' }),
        ]));
      });
  }
  page.appendChild(card);
}

function openKillForm() {
  openModal('Kill a hypothesis', [
    formField('Hypothesis', 'hypothesis', 'textarea', ''),
    formField('Evidence that killed it', 'evidence', 'textarea', ''),
    formField('Date', 'killed_date', 'input', new Date().toISOString().slice(0, 10), null, 'date'),
  ], async (form) => {
    if (!form.hypothesis || !form.evidence) { alert('Hypothesis and evidence are both required.'); return; }
    try {
      await data.create('kill_list', form);
      STATE.kill_list = await data.list('kill_list');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  }, 'Kill it', { danger: true });
}

registerRoute('kill-list', 'Kill list', renderKillList,
  'Which hypotheses has the evidence killed?');

/* ---------- State of the field — "Where does the research stand, in one paragraph?" ---------- */
function findStateOfField() {
  return STATE.deliverables.find(d => d.phase === 3 && d.deliverable === 'State of the field');
}

function renderStateOfField(page) {
  const record = findStateOfField();
  const card = h('div', { class: 'card p-6 max-w-3xl' });

  if (record?.evidence) {
    card.appendChild(h('div', { class: 'text-xs mb-3 t-mute', text: `Last updated ${fmtDate(record.updated_at || record.created_at)}` }));
    card.appendChild(h('div', { class: 'quote-text', style: 'border:none; padding:0;', text: record.evidence }));
    card.appendChild(h('div', { class: 'mt-5' }, [
      h('button', { class: 'btn btn-line', onclick: () => openFieldEditor(record) }, 'Edit'),
    ]));
  } else {
    card.appendChild(h('div', { class: 'text-sm mb-4 t-mute', text: 'No state-of-the-field written yet. One dated paragraph, updated whenever the picture changes.' }));
    card.appendChild(h('button', { class: 'btn btn-primary', onclick: () => openFieldEditor(record) }, 'Write the first one'));
  }
  page.appendChild(card);
}

function openFieldEditor(record) {
  openModal('State of the field', [
    formField('One paragraph', 'content', 'textarea', record?.evidence || ''),
  ], async (form) => {
    try {
      if (record) {
        await data.update('deliverables', record.id, { evidence: form.content, status: 'In progress' });
      } else {
        await data.create('deliverables', { phase: 3, deliverable: 'State of the field', status: 'In progress', evidence: form.content });
      }
      STATE.deliverables = await data.list('deliverables');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('state-of-field', 'State of the field', renderStateOfField,
  'Where does the research stand, in one dated paragraph?');
