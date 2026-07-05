/* Interviews — one question: "Which conversations have we had, and is each one tagged?"
   Master–detail: list left (grouped by segment — the fieldwork's real structure),
   interview + linked quotes right. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, quoteBlock,
  openModal, closeModal, formField, isUntaggedOverdue, daysSince, fmtDate, go,
  segmentCoverageRows, setPageActions,
} from '../app.js';
import { SEGMENTS, SEGMENT_NAMES, interviewerOptions } from '../config.js';
import { data } from '../data.js';
import { exportInterviews } from '../export.js';
import { openLinkModal, existingLinkChips } from '../evidence.js';
import { barChart } from '../charts.js';

let selectedId = null;
/* Manual collapse overrides, keyed by group name. Session-only — never persisted. */
const collapseOverrides = {};

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

  /* One primary action, in the app header; the tools row stays quiet */
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => openInterviewForm() }, '+ Log interview'));

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('div', { class: 'text-sm flex-1 t-soft', text: `${interviews.length} logged · hard rule: tag in matrix the same day` }),
    h('button', { class: 'btn btn-line', onclick: exportInterviews }, '↓ CSV'),
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
  const coverageWrap = h('div', { class: 'px-5 pt-5 pb-2' }, [
    h('div', { class: 'micro mb-2 t-mute', text: 'Recruitment vs target' }),
    barChart(segmentCoverageRows(), { width: 320, barHeight: 16, gap: 7 }),
  ]);
  listCard.appendChild(coverageWrap);
  const groupsWrap = h('div', { class: 'md-list-scroll' });
  listCard.appendChild(groupsWrap);
  const detailCard = h('div', { class: 'card md-detail' });
  layout.appendChild(listCard);
  layout.appendChild(detailCard);
  page.appendChild(layout);

  /* Group by segment, config order, with an Unassigned tail group */
  function buildGroups() {
    const groups = SEGMENTS.map(s => ({ key: s.name, name: s.name, target: s.target, rows: [] }));
    const unassigned = { key: '__unassigned', name: 'Unassigned', target: null, rows: [] };
    interviews.forEach(r => {
      const g = groups.find(g => g.key === r.segment);
      (g || unassigned).rows.push(r);
    });
    if (unassigned.rows.length) groups.push(unassigned);
    return groups.filter(g => g.rows.length);
  }

  function coverageTone(count, target) {
    if (!target) return 'line';
    if (count >= target) return 'sage';
    if (count >= target * 0.5) return 'honey';
    return 'rose';
  }

  function isCollapsed(group) {
    if (group.key in collapseOverrides) return collapseOverrides[group.key];
    if (interviews.length <= 15) return false;
    const hasSelected = group.rows.some(r => r.id === selectedId);
    const hasOverdue = group.rows.some(isUntaggedOverdue);
    return !(hasSelected || hasOverdue);
  }

  function makeRow(r) {
    const untagged = r.tagged_same_day !== 'Y';
    const item = h('div', { class: `md-list-item${r.id === selectedId ? ' selected' : ''}` }, [
      h('div', { class: 'flex items-center justify-between gap-2' }, [
        h('span', { class: 'font-medium text-sm num', text: r.interview_id || '—' }),
        chip(untagged ? 'untagged' : 'tagged', untagged ? (isUntaggedOverdue(r) ? 'rose' : 'honey') : 'sage'),
      ]),
      h('div', { class: 'text-xs mt-1 t-mute', text: `${fmtDate(r.date)} · ${r.format || '—'} · ${r.interviewer || '—'}` }),
    ]);
    item.addEventListener('click', () => { selectedId = r.id; renderList(); renderDetail(); });
    return item;
  }

  function makeGroupHeader(group, collapsed, onToggle, { pinned } = {}) {
    const untaggedCount = group.rows.filter(r => r.tagged_same_day !== 'Y').length;
    const countChip = group.target
      ? chip(`${group.rows.length}/${group.target}`, coverageTone(group.rows.length, group.target))
      : chip(`${group.rows.length}`, 'honey');
    const header = h('div', { class: 'group-header' }, [
      h('div', { class: 'flex items-center gap-2 min-w-0' }, [
        h('span', { class: 'group-chevron', text: collapsed ? '›' : '⌄' }),
        h('span', { class: 'text-sm font-medium truncate', text: group.name }),
      ]),
      h('div', { class: 'flex items-center gap-2 flex-shrink-0' }, [
        untaggedCount ? h('span', { class: 'flex items-center gap-1 text-xs t-rose' }, [
          h('span', { class: 'group-dot' }), String(untaggedCount),
        ]) : null,
        countChip,
      ].filter(Boolean)),
    ]);
    if (pinned) header.classList.add('group-header-pinned');
    header.addEventListener('click', onToggle);
    return header;
  }

  function renderList() {
    groupsWrap.innerHTML = '';
    const groups = buildGroups();

    /* Pinned shortcut: overdue-untagged rows, regardless of their real group */
    const overdueRows = interviews.filter(isUntaggedOverdue);
    if (overdueRows.length) {
      const pinKey = '__needs_tagging';
      const collapsed = collapseOverrides[pinKey] === true;
      const pinGroup = { key: pinKey, name: 'Needs tagging (shortcut)', target: null, rows: overdueRows };
      const body = h('div', { class: 'group-body' });
      overdueRows.forEach(r => body.appendChild(makeRow(r)));
      body.style.display = collapsed ? 'none' : '';
      const header = makeGroupHeader(pinGroup, collapsed, () => {
        collapseOverrides[pinKey] = !collapsed;
        renderList();
      }, { pinned: true });
      groupsWrap.appendChild(h('div', { class: 'group-block' }, [header, body]));
    }

    groups.forEach(group => {
      const collapsed = isCollapsed(group);
      const body = h('div', { class: 'group-body' });
      group.rows.forEach(r => body.appendChild(makeRow(r)));
      body.style.display = collapsed ? 'none' : '';
      const header = makeGroupHeader(group, collapsed, () => {
        collapseOverrides[group.key] = !collapsed;
        renderList();
      });
      if (group.key === '__unassigned') header.classList.add('group-header-honey');
      groupsWrap.appendChild(h('div', { class: 'group-block' }, [header, body]));
    });
  }

  function renderDetail() {
    detailCard.innerHTML = '';
    const r = interviews.find(x => x.id === selectedId);
    if (!r) { detailCard.appendChild(emptyState('Select an interview.')); return; }

    const untagged = r.tagged_same_day !== 'Y';
    const header = h('div', { class: 'px-6 pt-5 pb-4 border-b b-soft' }, [
      h('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        h('div', { class: 'serif text-xl', text: `${r.interview_id || '—'} · ${r.segment || '—'}` }),
        h('button', { class: 'btn btn-line text-xs', onclick: () => openInterviewForm(r) }, 'Edit'),
      ]),
      h('div', { class: 'text-xs mt-1 t-mute', text: `${fmtDate(r.date)} · ${r.format || '—'} · by ${r.interviewer || '—'} · initials ${r.initials || '—'} · recorded ${r.recorded || '—'}` }),
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
        h('div', { class: 'micro mb-1 t-mute', text: 'Topic' }),
        h('div', { class: 'text-sm', text: r.brief_topic }),
      ]));
    }

    /* Field notes — the full write-up lives in the app, not in external docs */
    detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
      h('div', { class: 'flex items-center justify-between mb-1' }, [
        h('div', { class: 'micro t-mute', text: 'Field notes' }),
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => openNotesEditor(r) }, r.notes_markdown ? 'Edit notes' : 'Write notes'),
      ]),
      r.notes_markdown
        ? h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: r.notes_markdown })
        : h('div', { class: 'text-sm t-mute', text: 'No notes yet. Write the full debrief here — this app is the single repository, and the assistant can only search what lives in it.' }),
    ]));

    /* Hypothesis links — how this conversation bears on the decision */
    if (r.interview_id) {
      const linkChips = existingLinkChips('interview', r.interview_id);
      detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
        h('div', { class: 'flex items-center justify-between mb-1' }, [
          h('div', { class: 'micro t-mute', text: `Hypothesis links (${linkChips.length})` }),
          h('button', { class: 'btn btn-ghost text-xs',
            onclick: () => openLinkModal({ evidence_type: 'interview', evidence_id: r.interview_id, cite: r.interview_id }) }, 'Link to hypothesis'),
        ]),
        linkChips.length
          ? h('div', { class: 'flex flex-wrap gap-1.5' }, linkChips)
          : h('div', { class: 'text-xs t-mute', text: 'Not linked to the hypothesis board yet.' }),
      ]));
    }

    /* Documents attached to this interview */
    const docs = STATE.documents.filter(d => d.interview_id === r.interview_id);
    if (docs.length) {
      detailCard.appendChild(h('div', { class: 'px-6 pt-4' }, [
        h('div', { class: 'micro mb-1 t-mute', text: `Documents (${docs.length})` }),
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
      h('div', { class: 'micro t-mute', text: `Tagged quotes (${quotes.length})` }),
      h('button', { class: 'btn btn-ghost text-xs', onclick: () => go('matrix') }, 'Open matrix →'),
    ]);
    detailCard.appendChild(qHead);
    if (!quotes.length) {
      detailCard.appendChild(h('div', { class: 'px-6 pb-6' }, [
        h('div', { class: 'text-sm t-mute', text: 'No quotes tagged from this interview yet.' }),
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
