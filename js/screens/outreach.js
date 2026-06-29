import { STATE, SEGMENTS, OUTREACH_STATUS_OPTIONS, h, esc, statusChip, api, openModal, closeModal, formField, renderCurrentRoute, registerRoute } from '../app.js';

function renderOutreach(page) {
  const filterState = { status: 'all', owner: 'all', q: '' };

  const headerBar = h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('input', { class: 'input flex-1 min-w-[200px]', placeholder: 'Search name, org, country…', oninput: e => { filterState.q = e.target.value; renderTable(); } }),
    h('select', { class: 'select max-w-[160px]', onchange: e => { filterState.status = e.target.value; renderTable(); } }, [
      h('option', { value: 'all' }, 'All statuses'),
      ...OUTREACH_STATUS_OPTIONS.map(s => h('option', { value: s }, s))
    ]),
    h('button', { class: 'btn btn-primary', onclick: () => openOutreachForm() }, '+ Add contact')
  ]);
  page.appendChild(headerBar);

  const tableWrap = h('div', { class: 'card' });
  page.appendChild(tableWrap);

  function renderTable() {
    const rows = STATE.outreach.filter(r => {
      const f = r.fields || {};
      if (filterState.status !== 'all' && f.Status !== filterState.status) return false;
      if (filterState.q) {
        const q = filterState.q.toLowerCase();
        const hay = [f.Name, f.Organisation, f.Country, f.Segment, f.Notes].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    tableWrap.innerHTML = '';
    const t = h('div', { class: 'table-wrap' });
    const table = h('table', { class: 'data' });

    const thead = h('thead');
    thead.innerHTML = '<tr><th>Name</th><th>Segment</th><th>Org</th><th>Country</th><th>Status</th><th>Owner</th><th></th></tr>';
    table.appendChild(thead);

    const tbody = h('tbody');
    if (rows.length === 0) {
      const td = h('td', { colspan: '7', class: 'text-center py-8' });
      td.style.color = 'var(--ink-mute)';
      td.textContent = STATE.outreach.length === 0 ? 'No outreach yet. Add your first contact.' : 'No matches.';
      tbody.appendChild(h('tr', {}, [td]));
    } else {
      rows.forEach(r => {
        const f = r.fields || {};
        const editBtn = h('button', { class: 'btn btn-ghost', onclick: () => openOutreachForm(r) }, 'Edit');
        const statusTd = h('td');
        statusTd.innerHTML = statusChip(f.Status);
        const tr = h('tr', { class: 'h-row' }, [
          h('td', { class: 'font-medium', text: f.Name || '—' }),
          h('td', { text: f.Segment || '—' }),
          h('td', { text: f.Organisation || '—' }),
          h('td', { text: f.Country || '—' }),
          statusTd,
          h('td', { text: f.Owner || '—' }),
          h('td', {}, [editBtn])
        ]);
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    t.appendChild(table);
    tableWrap.appendChild(t);
  }
  renderTable();
}

function openOutreachForm(existing) {
  const f = existing?.fields || {};
  openModal('Outreach contact', [
    formField('Name', 'Name', 'input', f.Name),
    formField('Segment', 'Segment', 'select', f.Segment, SEGMENTS),
    formField('Organisation', 'Organisation', 'input', f.Organisation),
    formField('Country', 'Country', 'input', f.Country),
    formField('Channel', 'Channel', 'select', f.Channel, ['LinkedIn','Email','In-person','Phone','WhatsApp','Facebook']),
    formField('Status', 'Status', 'select', f.Status || 'Cold', OUTREACH_STATUS_OPTIONS),
    formField('Owner', 'Owner', 'select', f.Owner, ['Young','Simon','Joint']),
    formField('First contact', 'First contact', 'input', f['First contact'], null, 'date'),
    formField('Notes', 'Notes', 'textarea', f.Notes)
  ], async (data) => {
    try {
      if (existing) {
        const updated = await api(`/api/Outreach/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ fields: data }) });
        const idx = STATE.outreach.findIndex(r => r.id === existing.id);
        if (idx >= 0) STATE.outreach[idx] = updated;
      } else {
        const created = await api('/api/Outreach', { method: 'POST', body: JSON.stringify({ fields: data }) });
        STATE.outreach.unshift(created.records ? created.records[0] : created);
      }
      closeModal();
      renderCurrentRoute();
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  });
}

registerRoute('outreach', 'Outreach', renderOutreach);
