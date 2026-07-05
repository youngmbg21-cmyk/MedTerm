/* Interviews — one question: "Which conversations have we had, and is each one tagged?"
   Master–detail: list left, interview + linked quotes right. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, quoteBlock,
  openModal, closeModal, formField, isUntaggedOverdue, daysSince, fmtDate, go,
} from '../app.js';
import { SEGMENT_NAMES, interviewerOptions } from '../config.js';
import { data } from '../data.js';
import { exportInterviews } from '../export.js';
import { openLinkModal, existingLinkChips } from '../evidence.js';

let selectedId = null;

function renderInterviews(page) {
  const interviews = [...STATE.interviews].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  /* Lead with the exception: the hard rule */
  const overdue = interviews.filter(isUntaggedOverdue);
  if (overdue.length) {
    page.appendChild(h('div', { class: 'banner banner-rose mb-4' }, [
      h('span', { text: `Hard rule breached: ${overdue.map(r => r.interview_id).join(', ')} still untagged past 24h. Tag ${overdue.length === 1 ? 'it' : 'them'} in the matrix today.` }),
      h('button', { class: 'btn btn-line text-xs', onclick: () => go('matrix') }, 'Open matrix'),
    ]));
  }

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('div', { class: 'text-sm flex-1', style: 'color:var(--ink-soft);', text: `${interviews.length} logged · hard rule: tag in matrix the same day` }),
    h('button', { class: 'btn btn-line', onclick: exportInterviews }, '↓ CSV'),
    h('button', { class: 'btn btn-primary', onclick: () => openInterviewForm() }, '+ Log interview'),
  ]));

  if (!interviews.length) {
    page.appendChild(h('div', { class: 'card' }, [
      emptyState('No interviews logged yet.', 'Phase 1 begins when target lists are built and the first outreach is sent.'),
    ]));
    return;
  }

  if (!selectedId || !interviews.find(r => r.id === selectedId)) {
    selectedId = (overdue[0] || interviews[0]).id;
  }

  const layout = h('div', { class: 'md-layout' });
  const listCard = h('div', { class: 'card overflow-hidden' });
  const detailCard = h('div', { class: 'card md-detail' });
  layout.appendChild(listCard);
  layout.appendChild(detailCard);
  page.appendChild(layout);

  function renderList() {
    listCard.innerHTML = '';
    interviews.forEach(r => {
      const untagged = r.tagged_same_day !== 'Y';
      const item = h('div', { class: `md-list-item${r.id === selectedId ? ' selected' : ''}` }, [
        h('div', { class: 'flex items-center justify-between gap-2' }, [
          h('span', { class: 'font-medium text-sm num', text: r.interview_id || '—' }),
          chip(untagged ? 'untagged' : 'tagged', untagged ? (isUntaggedOverdue(r) ? 'rose' : 'honey') : 'sage'),
        ]),
        h('div', { class: 'text-xs mt-1', style: 'color:var(--ink-mute);', text: `${fmtDate(r.date)} · ${r.segment || '—'} · ${r.interviewer || '—'}` }),
      ]);
      item.addEventListener('click', () => { selectedId = r.id; renderList(); renderDetail(); });
      listCard.appendChild(item);
    });
  }

  function renderDetail() {
    detailCard.innerHTML = '';
    const r = interviews.find(x => x.id === selectedId);
    if (!r) { detailCard.appendChild(emptyState('Select an interview.')); return; }

    const untagged = r.tagged_same_day !== 'Y';
    const header = h('div', { class: 'px-6 pt-5 pb-4 border-b', style: 'border-color:var(--line-soft);' }, [
      h('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        h('div', { class: 'serif text-xl', text: `${r.interview_id || '—'} · ${r.segment || '—'}` }),
        h('button', { class: 'btn btn-line text-xs', onclick: () => openInterviewForm(r) }, 'Edit'),
      ]),
      h('div', { class: 'text-xs mt-1', style: 'color:var(--ink-mute);', text: `${fmtDate(r.date)} · ${r.format || '—'} · by ${r.interviewer || '—'} · initials ${r.initials || '—'} · recorded ${r.recorded || '—'}` }),
    ]);
    detailCard.appendChild(header);

    if (untagged && isUntaggedOverdue(r)) {
      detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
        h('div', { class: 'banner banner-rose' }, [
          h('span', { text: `Untagged for ${daysSince(r.date)} day${daysSince(r.date) === 1 ? '' : 's'}. Untagged interviews are lost interviews.` }),
          h('button', { class: 'btn btn-line text-xs', onclick: () => markTagged(r) }, 'Mark tagged'),
        ]),
      ]));
    } else if (untagged) {
      detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
        h('div', { class: 'banner banner-honey' }, [
          h('span', { text: 'Not yet tagged — tag it in the matrix before the day ends.' }),
          h('button', { class: 'btn btn-line text-xs', onclick: () => markTagged(r) }, 'Mark tagged'),
        ]),
      ]));
    }

    if (r.brief_topic) {
      detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
        h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Topic' }),
        h('div', { class: 'text-sm', text: r.brief_topic }),
      ]));
    }

    /* Field notes — the full write-up lives in the app, not in external docs */
    detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
      h('div', { class: 'flex items-center justify-between mb-1' }, [
        h('div', { class: 'micro', style: 'color:var(--ink-mute);', text: 'Field notes' }),
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => openNotesEditor(r) }, r.notes_markdown ? 'Edit notes' : 'Write notes'),
      ]),
      r.notes_markdown
        ? h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: r.notes_markdown })
        : h('div', { class: 'text-sm', style: 'color:var(--ink-mute);', text: 'No notes yet. Write the full debrief here — this app is the single repository, and the assistant can only search what lives in it.' }),
    ]));

    /* Hypothesis links — how this conversation bears on the decision */
    if (r.interview_id) {
      const linkChips = existingLinkChips('interview', r.interview_id);
      detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
        h('div', { class: 'flex items-center justify-between mb-1' }, [
          h('div', { class: 'micro', style: 'color:var(--ink-mute);', text: `Hypothesis links (${linkChips.length})` }),
          h('button', { class: 'btn btn-ghost text-xs',
            onclick: () => openLinkModal({ evidence_type: 'interview', evidence_id: r.interview_id, cite: r.interview_id }) }, 'Link to hypothesis'),
        ]),
        linkChips.length
          ? h('div', { class: 'flex flex-wrap gap-1.5' }, linkChips)
          : h('div', { class: 'text-xs', style: 'color:var(--ink-mute);', text: 'Not linked to the hypothesis board yet.' }),
      ]));
    }

    /* Documents attached to this interview */
    const docs = STATE.documents.filter(d => d.interview_id === r.interview_id);
    if (docs.length) {
      detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
        h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: `Documents (${docs.length})` }),
        h('div', { class: 'flex flex-wrap gap-2' }, docs.map(d => {
          const c = chip(d.filename, 'info');
          c.style.cursor = 'pointer';
          c.title = d.description || '';
          c.addEventListener('click', () => go('documents'));
          return c;
        })),
      ]));
    }

    /* Linked theme-matrix quotes */
    const quotes = STATE.matrix.filter(q => q.interview_id === r.interview_id);
    const qHead = h('div', { class: 'px-6 pt-5 pb-2 flex items-center justify-between' }, [
      h('div', { class: 'micro', style: 'color:var(--ink-mute);', text: `Tagged quotes (${quotes.length})` }),
      h('button', { class: 'btn btn-ghost text-xs', onclick: () => go('matrix') }, 'Open matrix →'),
    ]);
    detailCard.appendChild(qHead);
    if (!quotes.length) {
      detailCard.appendChild(h('div', { class: 'px-6 pb-6' }, [
        h('div', { class: 'text-sm', style: 'color:var(--ink-mute);', text: 'No quotes tagged from this interview yet.' }),
      ]));
    } else {
      const list = h('div', { class: 'pb-2' });
      quotes.forEach(q => list.appendChild(quoteBlock(q)));
      detailCard.appendChild(list);
    }
  }

  function openNotesEditor(r) {
    const fields = [formField('Field notes (plain text; blank lines separate paragraphs)', 'notes_markdown', 'textarea', r.notes_markdown || '')];
    const ta = fields[0].el.querySelector('textarea');
    ta.rows = 14;
    openModal(`Field notes — ${r.interview_id}`, fields, async (form) => {
      try {
        await data.update('interviews', r.id, { notes_markdown: form.notes_markdown });
        STATE.interviews = await data.list('interviews');
        closeModal();
        renderCurrentRoute();
      } catch (e) { alert('Save failed: ' + e.message); }
    });
  }

  async function markTagged(r) {
    try {
      await data.update('interviews', r.id, { tagged_same_day: 'Y' });
      STATE.interviews = await data.list('interviews');
      renderCurrentRoute();
    } catch (e) { alert('Update failed: ' + e.message); }
  }

  renderList();
  renderDetail();
}

function openInterviewForm(existing) {
  const r = existing || {};
  const fields = [
    formField('Date', 'date', 'input', r.date || new Date().toISOString().slice(0, 10), null, 'date'),
    formField('Interviewer', 'interviewer', 'select', r.interviewer, interviewerOptions()),
    formField('Segment', 'segment', 'select', r.segment, SEGMENT_NAMES),
    formField('Initials', 'initials', 'input', r.initials),
    formField('Format', 'format', 'select', r.format, ['In-person', 'Video', 'Phone']),
    formField('Recorded', 'recorded', 'select', r.recorded || 'N', ['Y', 'N']),
    formField('Tagged same-day', 'tagged_same_day', 'select', r.tagged_same_day || 'N', ['Y', 'N']),
    formField('Brief topic', 'brief_topic', 'input', r.brief_topic),
    formField('Field notes (full debrief — the assistant reads these)', 'notes_markdown', 'textarea', r.notes_markdown),
  ];
  openModal(existing ? `Edit ${r.interview_id}` : 'Log interview', fields, async (form) => {
    try {
      if (existing) {
        await data.update('interviews', existing.id, form);
      } else {
        const created = await data.create('interviews', form); // interview_id assigned by the adapter
        selectedId = created.id;
      }
      STATE.interviews = await data.list('interviews');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('interviews', 'Interviews', renderInterviews,
  'Which conversations have we had — and is every one tagged?');
