/* Outreach — one question: "Who have we approached, and where do they stand?" */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, statusTone, emptyState,
  openModal, closeModal, formField, isStalled, fmtDate, setPageActions,
} from '../app.js';
import { SEGMENT_NAMES, OUTREACH_STATUSES, CHANNELS, ownerOptions, STALL_DAYS } from '../config.js';
import { data } from '../data.js';
import { exportOutreach } from '../export.js';

function renderOutreach(page) {
  const filterState = { status: 'all', q: '' };

  /* Lead with the exception: stalled contacts */
  const stalled = STATE.outreach.filter(isStalled);
  if (stalled.length) {
    page.appendChild(h('div', { class: 'banner banner-honey mb-4' }, [
      h('span', { text: `${stalled.length} contact${stalled.length === 1 ? '' : 's'} stalled — no movement for ${STALL_DAYS}+ days after contact. Chase or close them.` }),
    ]));
  }

  /* One primary action, in the app header; the tools row stays quiet */
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => openOutreachForm() }, '+ Add contact'));

  const headerBar = h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('input', { class: 'input flex-1 min-w-[180px]', placeholder: 'Search name, org, country…',
      oninput: e => { filterState.q = e.target.value; renderTable(); } }),
    h('select', { class: 'select max-w-[150px]', onchange: e => { filterState.status = e.target.value; renderTable(); } }, [
      h('option', { value: 'all' }, 'All statuses'),
      ...OUTREACH_STATUSES.map(s => h('option', { value: s }, s)),
    ]),
    h('button', { class: 'btn btn-line', onclick: exportOutreach }, '↓ CSV'),
  ]);
  page.appendChild(headerBar);

  const tableWrap = h('div', { class: 'card' });
  page.appendChild(tableWrap);

  function renderTable() {
    const rows = STATE.outreach
      .filter(r => {
        if (filterState.status !== 'all' && r.status !== filterState.status) return false;
        if (filterState.q) {
          const q = filterState.q.toLowerCase();
          const hay = [r.name, r.organisation, r.country, r.segment, r.notes].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      // stalled first, then most recent contact first
      .sort((a, b) => (isStalled(b) - isStalled(a)) || String(b.first_contact || '').localeCompare(String(a.first_contact || '')));

    tableWrap.innerHTML = '';
    if (!rows.length) {
      tableWrap.appendChild(emptyState(
        STATE.outreach.length === 0 ? 'No outreach yet.' : 'No matches with current filters.',
        STATE.outreach.length === 0 ? 'Add your first contact — templates are ready under Reference.' : null,
        STATE.outreach.length === 0 ? { label: '+ Add the first contact', onclick: () => openOutreachForm() } : null));
      return;
    }

    const table = h('table', { class: 'data stack' });
    const headRow = h('tr');
    ['Name', 'Segment', 'Org', 'Status', 'First contact', 'Owner', ''].forEach(th =>
      headRow.appendChild(h('th', { text: th })));
    table.appendChild(h('thead', {}, [headRow]));

    const tbody = h('tbody');
    rows.forEach(r => {
      const statusTd = h('td', { 'data-label': 'Status' }, [chip(r.status || 'Cold', statusTone(r.status))]);
      if (isStalled(r)) statusTd.appendChild(chip('stalled', 'honey'));
      tbody.appendChild(h('tr', { class: 'h-row' }, [
        h('td', { class: 'font-medium', 'data-label': 'Name', text: r.name || '—' }),
        h('td', { 'data-label': 'Segment', text: r.segment || '—' }),
        h('td', { 'data-label': 'Org', text: r.organisation || '—' }),
        statusTd,
        h('td', { class: 'num', 'data-label': 'First contact', text: fmtDate(r.first_contact) }),
        h('td', { 'data-label': 'Owner', text: r.owner || '—' }),
        h('td', { 'data-label': '' }, [h('button', { class: 'btn btn-ghost text-xs', onclick: () => openOutreachForm(r) }, 'Edit')]),
      ]));
    });
    table.appendChild(tbody);
    tableWrap.appendChild(h('div', { class: 'table-wrap' }, [table]));
  }
  renderTable();
}

function openOutreachForm(existing) {
  const r = existing || {};
  openModal(existing ? 'Edit contact' : 'Add contact', [
    formField('Name', 'name', 'input', r.name),
    formField('Segment', 'segment', 'select', r.segment, SEGMENT_NAMES),
    formField('Organisation', 'organisation', 'input', r.organisation),
    formField('Country', 'country', 'input', r.country),
    formField('Channel', 'channel', 'select', r.channel, CHANNELS),
    formField('Status', 'status', 'select', r.status || 'Cold', OUTREACH_STATUSES),
    formField('Owner', 'owner', 'select', r.owner, ownerOptions()),
    formField('First contact', 'first_contact', 'input', r.first_contact, null, 'date'),
    formField('Notes', 'notes', 'textarea', r.notes),
  ], async (form) => {
    try {
      if (existing) await data.update('outreach', existing.id, form);
      else await data.create('outreach', form);
      STATE.outreach = await data.list('outreach');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('outreach', 'Outreach', renderOutreach,
  'Who have we approached, and where do they stand?');
