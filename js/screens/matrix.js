import { STATE, SEGMENTS, THEMES, h, esc, statusChip, api, openModal, closeModal, formField, renderCurrentRoute, registerRoute } from '../app.js';
import { exportMatrix } from '../export.js';

function renderMatrix(page) {
  const filterState = { theme: 'all', segment: 'all', minSev: 0, wtp: 'all' };

  const filters = h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('select', { class: 'select max-w-[220px]', onchange: e => { filterState.theme = e.target.value; renderRows(); } }, [
      h('option', { value: 'all' }, 'All themes'),
      ...THEMES.map(t => h('option', { value: t }, t))
    ]),
    h('select', { class: 'select max-w-[160px]', onchange: e => { filterState.segment = e.target.value; renderRows(); } }, [
      h('option', { value: 'all' }, 'All segments'),
      ...SEGMENTS.map(s => h('option', { value: s }, s))
    ]),
    h('select', { class: 'select max-w-[140px]', onchange: e => { filterState.minSev = +e.target.value; renderRows(); } }, [
      h('option', { value: '0' }, 'Any severity'),
      h('option', { value: '3' }, 'Severity ≥ 3'),
      h('option', { value: '4' }, 'Severity ≥ 4'),
      h('option', { value: '5' }, 'Severity = 5')
    ]),
    h('select', { class: 'select max-w-[140px]', onchange: e => { filterState.wtp = e.target.value; renderRows(); } }, [
      h('option', { value: 'all' }, 'Any WTP'),
      h('option', { value: 'Y' }, 'WTP = Y'),
      h('option', { value: 'Maybe' }, 'WTP = Maybe')
    ]),
    h('button', { class: 'btn btn-line ml-auto', onclick: exportMatrix }, '↓ CSV'),
    h('button', { class: 'btn btn-primary', onclick: () => openMatrixForm() }, '+ Add quote')
  ]);
  page.appendChild(filters);

  const card = h('div', { class: 'card' });
  page.appendChild(card);

  function renderRows() {
    card.innerHTML = '';
    const rows = STATE.matrix.filter(r => {
      const f = r.fields || {};
      if (filterState.theme !== 'all' && f['Theme tag'] !== filterState.theme) return false;
      if (filterState.segment !== 'all' && f.Segment !== filterState.segment) return false;
      if (filterState.minSev && (+(f.Severity || 0)) < filterState.minSev) return false;
      if (filterState.wtp !== 'all' && f.WTP !== filterState.wtp) return false;
      return true;
    });

    if (rows.length === 0) {
      const empty = h('div', { class: 'p-10 text-center' });
      empty.style.color = 'var(--ink-mute)';
      if (STATE.matrix.length === 0) {
        empty.textContent = 'No quotes tagged yet.';
        const sub = h('span', { class: 'text-xs', text: 'Add the first one after your next interview.' });
        empty.appendChild(h('br'));
        empty.appendChild(sub);
      } else {
        empty.textContent = 'No matches with current filters.';
      }
      card.appendChild(empty);
      return;
    }

    rows.forEach(r => {
      const f = r.fields || {};
      const chips = [
        f['Theme tag'] ? h('span', { class: 'chip chip-sage', text: f['Theme tag'] }) : null,
        f.Segment ? h('span', { class: 'chip chip-line', text: f.Segment }) : null,
        f.Severity ? h('span', { class: `chip ${f.Severity>=4?'chip-rose':f.Severity>=3?'chip-honey':'chip-line'}`, text: `Severity ${f.Severity}` }) : null,
        f.WTP ? h('span', { class: `chip ${f.WTP==='Y'?'chip-sage':'chip-line'}`, text: `WTP ${f.WTP}` }) : null,
        f['Interview ID'] ? h('span', { class: 'chip chip-line', text: f['Interview ID'] }) : null
      ].filter(Boolean);

      const quoteEl = h('div', { class: 'serif text-base leading-relaxed' });
      if (f.Quote) {
        quoteEl.textContent = f.Quote;
      } else {
        quoteEl.style.color = 'var(--ink-mute)';
        quoteEl.textContent = '(no quote)';
      }

      const children = [
        h('div', { class: 'flex items-start justify-between gap-4 mb-2' }, [
          h('div', { class: 'flex flex-wrap gap-2' }, chips),
          h('button', { class: 'btn btn-ghost text-xs', onclick: () => openMatrixForm(r) }, 'Edit')
        ]),
        quoteEl
      ];

      if (f.Notes) {
        const notesEl = h('div', { class: 'text-xs mt-2', text: f.Notes });
        notesEl.style.color = 'var(--ink-mute)';
        children.push(notesEl);
      }

      const row = h('div', { class: 'px-6 py-4 border-b', style: 'border-color:var(--line-soft);' }, children);
      card.appendChild(row);
    });
  }
  renderRows();
}

function openMatrixForm(existing) {
  const f = existing?.fields || {};
  openModal('Add matrix quote', [
    formField('Interview ID', 'Interview ID', 'select', f['Interview ID'], ['', ...STATE.interviews.map(i => i.fields?.['Interview ID']).filter(Boolean)]),
    formField('Quote / observation', 'Quote', 'textarea', f.Quote),
    formField('Theme tag', 'Theme tag', 'select', f['Theme tag'], THEMES),
    formField('Segment', 'Segment', 'select', f.Segment, SEGMENTS),
    formField('Severity (1–5)', 'Severity', 'select', f.Severity, ['1','2','3','4','5']),
    formField('Willingness to pay', 'WTP', 'select', f.WTP, ['Y','Maybe','N']),
    formField('Notes', 'Notes', 'textarea', f.Notes)
  ], async (data) => {
    if (data.Severity) data.Severity = Number(data.Severity);
    try {
      if (existing) {
        const updated = await api(`/api/Matrix/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ fields: data }) });
        const idx = STATE.matrix.findIndex(r => r.id === existing.id);
        if (idx >= 0) STATE.matrix[idx] = updated;
      } else {
        const created = await api('/api/Matrix', { method: 'POST', body: JSON.stringify({ fields: data }) });
        STATE.matrix.unshift(created.records ? created.records[0] : created);
      }
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('matrix', 'Theme matrix', renderMatrix);
