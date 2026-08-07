/* Prospects — one question: "Who are we talking to, and who is going cold?"

   The list leads with the exception (gone cold, no next step) rather than
   with totals, because a pipeline that only shows totals flatters you. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  openModal, closeModal, formField, setPageActions, fmtDate, today,
  isStalled, daysSince, pipelineCounts, expandableCard, OPEN_BY_DEFAULT_UP_TO,
} from '../app.js';
import {
  PIPELINE, PIPELINE_NAMES, pipelineTone, SEGMENT_NAMES, SECTORS, CHANNELS,
  ownerOptions, STALL_DAYS,
} from '../config.js';
import { data } from '../data.js';
import { exportProspects } from '../export.js';

const view = { status: 'all', q: '' };

function renderProspects(page) {
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => openProspectForm() }, '+ Add prospect'));

  /* Lead with the exception. */
  const stalled = STATE.prospects.filter(isStalled);
  const noNextStep = STATE.prospects.filter(p =>
    ['Contacted', 'Talked', 'Interested', 'Pilot'].includes(p.status) && !String(p.next_step || '').trim());

  if (stalled.length) {
    page.appendChild(h('div', { class: 'banner banner-rose mb-3' }, [
      h('span', { text: `${stalled.length} prospect${stalled.length === 1 ? ' has' : 's have'} gone quiet for ${STALL_DAYS}+ days: ${stalled.slice(0, 4).map(p => p.company).join(', ')}${stalled.length > 4 ? '…' : ''}. Chase them or move them to "Not a fit" — a pipeline full of maybes tells you nothing.` }),
    ]));
  }
  if (noNextStep.length) {
    page.appendChild(h('div', { class: 'banner banner-gold mb-4' }, [
      h('span', { text: `${noNextStep.length} live prospect${noNextStep.length === 1 ? ' has' : 's have'} no next step written down. A prospect with no next step is not in the pipeline, whatever the status says.` }),
    ]));
  }

  /* The pipeline at a glance. */
  const board = h('div', { class: 'grid gap-3 mb-4', style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))' });
  pipelineCounts().forEach(({ label, value }) => {
    const stage = PIPELINE.find(p => p.name === label) || {};
    const cardEl = h('button', {
      class: `card card-pad text-left${view.status === label ? ' is-selected' : ''}`,
      onclick: () => { view.status = view.status === label ? 'all' : label; renderCurrentRoute(); },
      title: stage.hint || '',
    }, [
      h('div', { class: 'kpi-num num', text: String(value) }),
      h('div', { class: 'kpi-label', text: label }),
    ]);
    cardEl.querySelector('.kpi-num').style.color = `var(--${pipelineTone(label) === 'line' ? 'ink' : pipelineTone(label) + '-text'})`;
    board.appendChild(cardEl);
  });
  page.appendChild(board);

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('input', {
      class: 'input flex-1 min-w-[180px]', placeholder: 'Search company, sector, notes…', value: view.q,
      oninput: e => { view.q = e.target.value; renderList(); },
    }),
    h('select', {
      class: 'select max-w-[170px]',
      onchange: e => { view.status = e.target.value; renderList(); },
    }, [
      h('option', { value: 'all', selected: view.status === 'all' ? '' : null }, 'All stages'),
      ...PIPELINE_NAMES.map(s => {
        const o = h('option', { value: s }, s);
        if (view.status === s) o.selected = true;
        return o;
      }),
    ]),
    h('button', { class: 'btn btn-line', onclick: exportProspects }, '↓ CSV'),
  ]));

  const wrap = h('div');
  page.appendChild(wrap);

  function renderList() {
    wrap.innerHTML = '';
    const rows = STATE.prospects
      .filter(p => {
        if (view.status !== 'all' && p.status !== view.status) return false;
        if (view.q) {
          const hay = [p.company, p.sector, p.segment, p.city, p.notes, p.why_fit, p.next_step]
            .filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(view.q.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => (isStalled(b) - isStalled(a)) ||
        PIPELINE_NAMES.indexOf(b.status) - PIPELINE_NAMES.indexOf(a.status) ||
        String(a.company || '').localeCompare(String(b.company || '')));

    if (!rows.length) {
      wrap.appendChild(emptyState(
        STATE.prospects.length ? 'No prospects match that.' : 'No prospects yet.',
        STATE.prospects.length ? 'Clear the search or pick another stage.'
          : 'Start with four companies you can get an introduction to this week. Quality of introduction beats size of list.',
        STATE.prospects.length ? null : { label: '+ Add the first prospect', onclick: () => openProspectForm() }));
      return;
    }
    rows.forEach(p => wrap.appendChild(prospectCard(p, rows.length)));
  }
  renderList();
}

function prospectCard(p, listLength = 0) {
  const convos = STATE.conversations.filter(c => String(c.prospect_id) === String(p.id));
  const contacts = STATE.contacts.filter(c => String(c.prospect_id) === String(p.id));
  const stalled = isStalled(p);
  const nextStep = String(p.next_step || '').trim();

  /* The summary has to answer "do I need to open this?" on its own: where they
     are, whether they have gone quiet, and what we said we would do next. */
  const summary = h('div', {}, [
    h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
      chip(p.status || 'To contact', pipelineTone(p.status)),
      p.segment ? chip(p.segment, 'violet') : null,
      stalled ? chip(`quiet ${daysSince(p.last_touch || p.first_contact)}d`, 'rose') : null,
      convos.length ? chip(`${convos.length} conversation${convos.length === 1 ? '' : 's'}`, 'info') : null,
      nextStep ? null : chip('no next step', 'gold'),
    ].filter(Boolean)),
    h('div', { class: 'card-title', text: p.company || '—' }),
    h('div', { class: 'text-xs t-mute mt-0.5', text: [p.sector, p.city, p.size].filter(Boolean).join(' · ') || '' }),
    h('div', { class: 'rec-peek', text: nextStep ? `Next: ${nextStep}` : 'No next step written down.' }),
  ]);

  const tools = h('div', { class: 'flex gap-1' }, [
    h('button', { class: 'btn btn-ghost text-xs', onclick: () => openProspectForm(p) }, 'Edit'),
    h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteProspect(p) }, 'Delete'),
  ]);

  const body = h('div', { class: 'flex flex-col gap-3' });
  if (p.why_fit) body.appendChild(h('div', { class: 'text-sm t-soft', text: p.why_fit }));

  body.appendChild(h('div', { class: `inset-block${nextStep ? '' : ' b-rose-hint'}` }, [
    h('div', { class: 'micro t-bronze mb-1', text: 'Next step' }),
    h('div', { class: 'text-sm', text: nextStep || 'Nothing written down. Decide the next move now, while you remember why.' }),
    p.next_step_date ? h('div', { class: 'text-xs t-mute mt-1', text: `By ${fmtDate(p.next_step_date)}` }) : null,
  ].filter(Boolean)));

  if (contacts.length) {
    const list = h('div', { class: 'flex flex-wrap gap-2' });
    contacts.forEach(c => list.appendChild(h('div', { class: 'chip chip-line' }, [
      h('span', { text: `${c.name}${c.role ? ' · ' + c.role : ''}` }),
    ])));
    body.appendChild(h('div', {}, [h('div', { class: 'micro t-mute mb-2', text: 'People' }), list]));
  }

  if (p.notes) body.appendChild(h('div', { class: 'text-sm t-mute', text: p.notes }));

  body.appendChild(h('div', { class: 'flex flex-wrap gap-2 pt-3 border-t b-soft' }, [
    h('button', { class: 'btn btn-line text-xs', onclick: () => openContactForm(p) }, '+ Add a person'),
    h('a', { class: 'btn btn-line text-xs', href: `#conversations?prospect=${encodeURIComponent(p.id)}` }, 'Log a conversation'),
  ]));

  const foot = h('div', { class: 'text-xs t-mute mt-2', text: [
    p.owner ? `Ours: ${p.owner}` : null,
    p.channel ? `via ${p.channel}` : null,
    p.last_touch ? `last touch ${fmtDate(p.last_touch)}` : 'never contacted',
  ].filter(Boolean).join(' · ') });
  body.appendChild(foot);

  return expandableCard({
    key: `prospect:${p.id}`, summary, detail: body, tools, flagged: stalled,
    /* A gone-cold prospect opens itself — the thing you must act on is never
       behind a tap. Otherwise a short list reads better whole. */
    defaultOpen: stalled || listLength <= OPEN_BY_DEFAULT_UP_TO,
  });
}

/* ------------------------------------------------------------ forms */
function openProspectForm(existing) {
  const p = existing || {};
  openModal(existing ? 'Edit prospect' : 'Add prospect', [
    formField('Company', 'company', 'input', p.company),
    formField('Segment', 'segment', 'select', p.segment, ['', ...SEGMENT_NAMES]),
    formField('Sector', 'sector', 'select', p.sector, ['', ...SECTORS]),
    formField('City', 'city', 'input', p.city),
    formField('Size', 'size', 'input', p.size),
    formField('Why they might fit', 'why_fit', 'textarea', p.why_fit),
    formField('Stage', 'status', 'select', p.status || 'To contact', PIPELINE_NAMES),
    formField('Whose prospect', 'owner', 'select', p.owner, ['', ...ownerOptions()]),
    formField('How we reach them', 'channel', 'select', p.channel, ['', ...CHANNELS]),
    formField('Next step', 'next_step', 'textarea', p.next_step),
    formField('Next step by', 'next_step_date', 'input', p.next_step_date, null, 'date'),
    formField('Last touch', 'last_touch', 'input', p.last_touch, null, 'date'),
    formField('Notes', 'notes', 'textarea', p.notes),
  ], async (form) => {
    if (!String(form.company || '').trim()) { alert('A prospect needs a company name.'); return; }
    try {
      if (existing) await data.update('prospects', existing.id, form);
      else await data.create('prospects', form);
      STATE.prospects = await data.list('prospects');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function openContactForm(p, existing) {
  const c = existing || {};
  openModal(existing ? 'Edit person' : `Add a person at ${p.company}`, [
    formField('Name', 'name', 'input', c.name),
    formField('Role', 'role', 'input', c.role),
    formField('Email', 'email', 'input', c.email, null, 'email'),
    formField('Phone', 'phone', 'input', c.phone),
    formField('Notes', 'notes', 'textarea', c.notes),
  ], async (form) => {
    if (!String(form.name || '').trim()) { alert('A person needs a name.'); return; }
    try {
      if (existing) await data.update('contacts', existing.id, form);
      else await data.create('contacts', { ...form, prospect_id: p.id });
      STATE.contacts = await data.list('contacts');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function deleteProspect(p) {
  const convos = STATE.conversations.filter(c => String(c.prospect_id) === String(p.id)).length;
  openModal(`Delete ${p.company}?`, [
    { key: '_', el: h('div', { class: 'text-sm t-soft' }, [
      h('div', { text: convos
        ? `This prospect has ${convos} conversation${convos === 1 ? '' : 's'} logged against it. Those conversations will be left without a company.`
        : 'This removes the prospect and the people recorded against it.' }),
      h('div', { class: 'text-xs mt-2 t-mute', text: 'Consider moving them to "Not a fit" with a reason instead — a closed prospect with a written reason is evidence; a deleted one is a gap.' }),
    ]) },
  ], async () => {
    for (const c of STATE.contacts.filter(c => String(c.prospect_id) === String(p.id))) {
      await data.remove('contacts', c.id);
    }
    await data.remove('prospects', p.id);
    STATE.prospects = await data.list('prospects');
    STATE.contacts = await data.list('contacts');
    closeModal(); renderCurrentRoute();
  }, 'Delete', { danger: true });
}

registerRoute('prospects', 'Prospects', renderProspects,
  'Who are we talking to, and who is going cold?');
