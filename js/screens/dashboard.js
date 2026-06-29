import { STATE, PHASE_INFO, h, esc, registerRoute } from '../app.js';
import { toggleChat, quickPrompt } from '../chat.js';

function kpiCard(label, value, sub, tone) {
  const style = tone === 'rose' ? 'color:var(--rose);' : tone === 'honey' ? 'color:#8a6a23;' : tone === 'sage' ? 'color:var(--sage-deep);' : '';
  const card = h('div', { class: 'card kpi' });
  const num = h('div', { class: 'kpi-num', text: String(value) });
  if (style) num.style.cssText = style;
  card.appendChild(num);
  card.appendChild(h('div', { class: 'kpi-label', text: label }));
  if (sub) {
    const subEl = h('div', { class: 'text-xs mt-2' });
    subEl.style.color = 'var(--ink-mute)';
    subEl.textContent = sub;
    card.appendChild(subEl);
  }
  return card;
}

function renderDashboard(page) {
  const total = STATE.interviews.length;
  const tagged = STATE.interviews.filter(r => r.fields?.['Tagged same-day'] === 'Y').length;
  const taggedPct = total ? Math.round((tagged / total) * 100) : 0;
  const sentOrLater = STATE.outreach.filter(r => ['Sent','Replied','Booked','Done'].includes(r.fields?.Status)).length;
  const booked = STATE.outreach.filter(r => ['Booked','Done'].includes(r.fields?.Status)).length;
  const themes = new Set(STATE.matrix.map(r => r.fields?.['Theme tag']).filter(Boolean));

  const kpis = h('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-4 mb-6' }, [
    kpiCard('Interviews logged', total, total >= 30 ? 'Saturation territory' : 'Target ~30 by Phase 2 close'),
    kpiCard('Same-day tagged', `${taggedPct}%`, taggedPct === 100 ? 'Hard rule holding' : 'Hard rule: must be 100%', taggedPct === 100 ? 'sage' : taggedPct >= 80 ? 'honey' : 'rose'),
    kpiCard('Outreach contacted', sentOrLater, `${booked} booked or done`),
    kpiCard('Themes surfaced', themes.size, themes.size >= 8 ? 'Rich pool' : 'Build the matrix')
  ]);
  page.appendChild(kpis);

  // Phase progress card
  const phaseHeader = h('div', { class: 'px-6 pt-5 pb-4 flex items-baseline justify-between border-b', style: 'border-color:var(--line-soft);' }, [
    h('div', {}, [
      h('div', { class: 'micro', text: `Phase ${PHASE_INFO.current}` }),
      h('div', { class: 'serif text-lg mt-1', text: PHASE_INFO.label.split('—')[1]?.trim() || PHASE_INFO.label })
    ]),
    h('div', { class: 'flex gap-1.5' }, [0,1,2,3,4,5].map(n =>
      h('span', { class: `phase-pill ${n < PHASE_INFO.current ? 'done' : n === PHASE_INFO.current ? 'active' : 'next'}`, text: `${n}` })
    ))
  ]);

  const criteriaItems = PHASE_INFO.exitCriteria.map(c => {
    const done = STATE.deliverables.find(d => d.fields?.['Deliverable']?.toLowerCase().includes(c.label.toLowerCase().slice(0, 20)))?.fields?.Status === 'Complete';
    const icon = done
      ? '<span style="color:var(--sage-deep);font-size:13px;">✓</span>'
      : '<span style="color:var(--line);font-size:13px;">○</span>';
    const iconWrap = h('span', { class: 'inline-flex w-4 h-4 rounded items-center justify-center' });
    iconWrap.innerHTML = icon;
    iconWrap.style.cssText = `background:${done?'var(--sage-soft)':'var(--bg-soft)'}; border: 1px solid ${done?'var(--sage)':'var(--line)'}`;

    const labelEl = h('span', { text: c.label });
    if (done) { labelEl.className = 'line-through'; labelEl.style.color = 'var(--ink-mute)'; }

    const statusText = h('span', { class: 'micro' });
    statusText.innerHTML = done ? '<span style="color:var(--sage-deep);">Done</span>' : '<span style="color:var(--ink-mute);">Pending</span>';

    return h('div', { class: 'flex items-center justify-between py-2 text-sm' }, [
      h('div', { class: 'flex items-center gap-3' }, [iconWrap, labelEl]),
      statusText
    ]);
  });

  const phaseCard = h('div', { class: 'card mb-6' }, [
    phaseHeader,
    h('div', { class: 'px-6 py-4 divide-warm' }, criteriaItems)
  ]);
  page.appendChild(phaseCard);

  // Recent activity + assistant prompt
  const grid = h('div', { class: 'grid md:grid-cols-3 gap-4' });

  const recentItems = STATE.interviews.slice(0, 4).length
    ? STATE.interviews.slice(0, 4).map(r => {
        const f = r.fields || {};
        if (!f.Date) {
          const empty = h('div', { class: 'py-4 text-sm', text: 'No interviews logged yet. Start with Phase 1 outreach, then log the first one in Interviews.' });
          empty.style.color = 'var(--ink-mute)';
          return empty;
        }
        const tagEl = h('div');
        tagEl.innerHTML = f['Tagged same-day'] === 'Y' ? '<span class="chip chip-sage">tagged</span>' : '<span class="chip chip-rose">untagged</span>';
        return h('div', { class: 'py-3 flex items-center justify-between text-sm' }, [
          h('div', {}, [
            h('div', { class: 'font-medium', text: `${esc(f['Interview ID'] || '—')} · ${esc(f.Segment || '—')}` }),
            h('div', { class: 'text-xs mt-0.5', style: 'color:var(--ink-mute);', text: `${f.Date || ''} · ${esc(f.Interviewer || '')}` })
          ]),
          tagEl
        ]);
      })
    : [(() => {
        const empty = h('div', { class: 'py-4 text-sm', text: 'No interviews logged yet. Start with Phase 1 outreach, then log the first one in Interviews.' });
        empty.style.color = 'var(--ink-mute)';
        return empty;
      })()];

  const recentHeader = h('div', { class: 'px-6 pt-5 pb-3' });
  const recentLabel = h('div', { class: 'micro', text: 'Recent interviews' });
  recentLabel.style.color = 'var(--ink-mute)';
  recentHeader.appendChild(recentLabel);

  const recent = h('div', { class: 'card md:col-span-2' }, [
    recentHeader,
    h('div', { class: 'divide-warm px-6 pb-5' }, recentItems)
  ]);
  grid.appendChild(recent);

  const askDesc = h('div', { class: 'text-xs mb-3', text: 'The assistant reads your interviews, outreach, and matrix — and recommends the next specific move.' });
  askDesc.style.color = 'var(--ink-soft)';
  const ask = h('div', { class: 'card-soft p-5' }, [
    h('div', { class: 'serif text-base mb-2', text: 'What should I do today?' }),
    askDesc,
    h('button', { class: 'btn btn-primary w-full justify-center', onclick: () => { toggleChat(true); quickPrompt('What is the single most important thing I should do today? Be specific.'); } }, 'Ask the assistant')
  ]);
  grid.appendChild(ask);

  page.appendChild(grid);
}

registerRoute('dashboard', 'Dashboard', renderDashboard);
