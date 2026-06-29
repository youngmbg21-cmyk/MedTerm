import { STATE, SEGMENTS, h, esc, api, openModal, closeModal, formField, renderCurrentRoute, registerRoute } from '../app.js';

function renderInterviews(page) {
  const rule = h('strong', { text: 'Hard rule: tag in matrix the same day' });
  rule.style.color = 'var(--sage-deep)';
  const headerBar = h('div', { class: 'flex justify-between items-center mb-4' }, [
    h('div', { class: 'text-sm', style: 'color:var(--ink-soft);' }, [
      document.createTextNode(`${STATE.interviews.length} logged · `),
      rule
    ]),
    h('button', { class: 'btn btn-primary', onclick: () => openInterviewForm() }, '+ Log interview')
  ]);
  page.appendChild(headerBar);

  const card = h('div', { class: 'card' });
  const tw = h('div', { class: 'table-wrap' });
  const table = h('table', { class: 'data' });
  const thead = h('thead');
  thead.innerHTML = '<tr><th>ID</th><th>Date</th><th>Segment</th><th>Initials</th><th>Interviewer</th><th>Format</th><th>Tagged</th><th>Topic</th><th></th></tr>';
  table.appendChild(thead);

  const tbody = h('tbody');
  if (STATE.interviews.length === 0) {
    const td = h('td', { colspan: '9', class: 'text-center py-10' });
    td.style.color = 'var(--ink-mute)';
    td.textContent = 'No interviews logged yet.';
    const sub = h('span', { class: 'text-xs', text: 'Phase 1 begins when target lists are built and the first outreach is sent.' });
    td.appendChild(h('br'));
    td.appendChild(sub);
    tbody.appendChild(h('tr', {}, [td]));
  } else {
    STATE.interviews.forEach(r => {
      const f = r.fields || {};
      const tagTd = h('td');
      tagTd.innerHTML = f['Tagged same-day'] === 'Y' ? '<span class="chip chip-sage">Y</span>' : '<span class="chip chip-rose">No</span>';
      const editBtn = h('button', { class: 'btn btn-ghost', onclick: () => openInterviewForm(r) }, 'Edit');
      const tr = h('tr', { class: 'h-row' }, [
        h('td', { class: 'font-medium num', text: f['Interview ID'] || '—' }),
        h('td', { class: 'num', text: f.Date || '—' }),
        h('td', { text: f.Segment || '—' }),
        h('td', { text: f.Initials || '—' }),
        h('td', { text: f.Interviewer || '—' }),
        h('td', { text: f.Format || '—' }),
        tagTd,
        h('td', { class: 'max-w-[280px]', text: f['Brief topic'] || '—' }),
        h('td', {}, [editBtn])
      ]);
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  card.appendChild(tw);
  page.appendChild(card);
}

function openInterviewForm(existing) {
  const f = existing?.fields || {};
  const nextId = `INT-${String(STATE.interviews.length + 1).padStart(3,'0')}`;
  openModal('Log interview', [
    formField('Interview ID', 'Interview ID', 'input', f['Interview ID'] || nextId),
    formField('Date', 'Date', 'input', f.Date || new Date().toISOString().slice(0,10), null, 'date'),
    formField('Interviewer', 'Interviewer', 'select', f.Interviewer, ['Young','Simon']),
    formField('Segment', 'Segment', 'select', f.Segment, SEGMENTS),
    formField('Initials', 'Initials', 'input', f.Initials),
    formField('Format', 'Format', 'select', f.Format, ['In-person','Video','Phone']),
    formField('Recorded', 'Recorded', 'select', f.Recorded, ['Y','N']),
    formField('Tagged same-day', 'Tagged same-day', 'select', f['Tagged same-day'] || 'N', ['Y','N']),
    formField('Brief topic', 'Brief topic', 'input', f['Brief topic']),
    formField('Link to notes', 'Link to notes', 'input', f['Link to notes'])
  ], async (data) => {
    try {
      if (existing) {
        const updated = await api(`/api/Interviews/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ fields: data }) });
        const idx = STATE.interviews.findIndex(r => r.id === existing.id);
        if (idx >= 0) STATE.interviews[idx] = updated;
      } else {
        const created = await api('/api/Interviews', { method: 'POST', body: JSON.stringify({ fields: data }) });
        STATE.interviews.unshift(created.records ? created.records[0] : created);
      }
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('interviews', 'Interviews', renderInterviews);
