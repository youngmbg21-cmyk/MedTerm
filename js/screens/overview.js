/* Overview — the command center.
   One question: "Where does the project stand right now, and what needs me?" */
import {
  STATE, registerRoute, h, kpiCard, chip, statusTone, progressBar, emptyState,
  loadingState, isUntaggedOverdue, isStalled, daysSince, fmtDate, go, loadAllData,
} from '../app.js';
import { CURRENT_PHASE, PHASES, SEGMENTS } from '../config.js';
import { data, aiAvailable } from '../data.js';
import { latestAssessment, LEANING_TONE, buyerHypotheses, runAssessment } from '../evidence.js';

function renderOverview(page) {
  if (!STATE.loaded) {
    page.appendChild(h('div', { class: 'card' }, [loadingState()]));
    return;
  }

  /* ---- Phase rail: 0→5, current highlighted, % of exit criteria met ---- */
  const rail = h('div', { class: 'phase-rail mb-6' });
  PHASES.forEach(p => {
    const dels = STATE.deliverables.filter(d => d.phase === p.n);
    const done = dels.filter(d => d.status === 'Complete').length;
    const pct = dels.length ? Math.round((done / dels.length) * 100) : 0;
    const cls = p.n < CURRENT_PHASE ? 'done' : p.n === CURRENT_PHASE ? 'current' : '';
    rail.appendChild(h('div', { class: `phase-step ${cls}` }, [
      h('div', { class: 'micro', text: `Phase ${p.n}` }),
      h('div', { class: 'text-sm font-medium mt-0.5', text: p.name }),
      h('div', { class: 'text-xs mt-1 num', text: dels.length ? `${pct}%` : '—' }),
    ]));
  });
  page.appendChild(rail);

  /* ---- KPI strip ---- */
  const totalInterviews = STATE.interviews.length;
  const tagged = STATE.interviews.filter(r => r.tagged_same_day === 'Y').length;
  const taggedPct = totalInterviews ? Math.round((tagged / totalInterviews) * 100) : 100;
  const contacted = STATE.outreach.filter(r => ['Sent', 'Replied', 'Booked', 'Done'].includes(r.status)).length;
  const booked = STATE.outreach.filter(r => ['Booked', 'Done'].includes(r.status)).length;
  const themeCount = new Set(STATE.matrix.map(r => r.theme_tag).filter(Boolean)).size;

  page.appendChild(h('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-4 mb-4' }, [
    kpiCard('Interviews logged', totalInterviews, `target ${SEGMENTS.reduce((s, x) => s + x.target, 0)} by Phase 2 close`),
    kpiCard('Same-day tagged', `${taggedPct}%`, taggedPct === 100 ? 'Hard rule holding' : 'Hard rule: must be 100%',
      taggedPct === 100 ? 'sage' : taggedPct >= 80 ? 'honey' : 'rose'),
    kpiCard('Outreach contacted', contacted, `${booked} booked or done`),
    kpiCard('Themes surfaced', themeCount, themeCount >= 8 ? 'Rich pool' : 'Build the matrix'),
  ]));

  /* ---- Decision pulse — judgment lives on the Decision Brief; this is a pointer ---- */
  const latest = latestAssessment();
  const strengthening = buyerHypotheses().filter(x => x.status === 'strengthening').length;
  const weakening = buyerHypotheses().filter(x => x.status === 'weakening').length;
  const pulse = h('div', { class: 'card p-4 mb-6 flex flex-wrap items-center gap-3' }, [
    h('span', { class: 'micro t-mute', text: 'If we decided today' }),
    latest
      ? chip(latest.leaning, LEANING_TONE[latest.leaning] || 'line')
      : chip('No assessment yet', 'line'),
    h('span', { class: 'text-xs num t-mute', text: `${strengthening} strengthening · ${weakening} weakening` }),
    h('button', { class: 'btn btn-ghost text-xs ml-auto', onclick: () => go('decision-brief') }, 'Open Decision Brief →'),
  ]);
  page.appendChild(pulse);

  /* ---- Three panels ---- */
  const grid = h('div', { class: 'grid lg:grid-cols-3 gap-4' });

  /* Panel 1 — this phase's exit criteria (a filtered view of deliverables) */
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const criteria = STATE.deliverables.filter(d => d.phase === CURRENT_PHASE);
  const critPanel = h('div', { class: 'card' });
  critPanel.appendChild(h('div', { class: 'px-5 pt-4 pb-3 border-b b-soft' }, [
    h('div', { class: 'micro t-mute', text: `Phase ${CURRENT_PHASE} exit criteria` }),
    h('div', { class: 'serif text-base mt-0.5', text: phase?.long || '' }),
  ]));
  const critList = h('div', { class: 'px-5 py-2' });
  if (!criteria.length) {
    critList.appendChild(emptyState('No deliverables defined for this phase.'));
  } else {
    criteria.forEach(d => {
      const row = h('div', { class: 'py-2.5 border-b flex items-start justify-between gap-3 b-soft' }, [
        h('div', { class: 'text-sm', text: d.deliverable, style: d.status === 'Complete' ? 'color:var(--ink-mute); text-decoration:line-through;' : '' }),
        chip(d.status, statusTone(d.status)),
      ]);
      row.style.cursor = 'pointer';
      row.title = d.evidence || '';
      row.addEventListener('click', () => cycleDeliverable(d));
      critList.appendChild(row);
    });
    critList.lastChild.style.borderBottom = 'none';
  }
  critPanel.appendChild(critList);
  critPanel.appendChild(h('div', { class: 'px-5 pb-3 text-xs t-mute', text: 'Tap a criterion to advance its status.' }));

  /* Phase-exit review — an advisory gate, not a hard block. Advancing
     CURRENT_PHASE stays a config change by design. */
  const hasExitReview = STATE.ai_assessments.some(a => a.trigger === 'phase_exit' && a.phase === CURRENT_PHASE);
  if (!hasExitReview) {
    critPanel.appendChild(h('div', { class: 'px-5 pb-3' }, [
      h('div', { class: 'banner banner-honey' }, [
        h('span', { text: 'This phase has not had an exit review.' }),
      ]),
    ]));
  }
  if (aiAvailable) {
    const exitBtn = h('button', { class: 'btn btn-line text-xs', onclick: async () => {
      exitBtn.disabled = true;
      exitBtn.textContent = 'Reviewing…';
      try {
        await runAssessment('phase_exit');
        go('decision-brief');
      } catch (e) {
        exitBtn.disabled = false;
        exitBtn.textContent = 'Run phase exit review';
        alert('Exit review failed: ' + e.message);
      }
    } }, 'Run phase exit review');
    critPanel.appendChild(h('div', { class: 'px-5 pb-4' }, [exitBtn]));
  } else if (!hasExitReview) {
    critPanel.appendChild(h('div', { class: 'px-5 pb-4 text-xs t-mute', text: 'Connect the assistant to run the exit review before advancing the phase.' }));
  }
  grid.appendChild(critPanel);

  /* Panel 2 — saturation by segment */
  const satPanel = h('div', { class: 'card' });
  satPanel.appendChild(h('div', { class: 'px-5 pt-4 pb-3 border-b b-soft' }, [
    h('div', { class: 'micro t-mute', text: 'Saturation by segment' }),
    h('div', { class: 'serif text-base mt-0.5', text: 'Interview coverage' }),
  ]));
  const satList = h('div', { class: 'px-5 py-3' });
  SEGMENTS.forEach(seg => {
    const done = STATE.interviews.filter(r => r.segment === seg.name).length;
    const pct = Math.min(100, Math.round((done / seg.target) * 100));
    const color = done >= seg.target ? 'var(--sage)' : done >= seg.target / 2 ? 'var(--honey)' : 'var(--line)';
    satList.appendChild(h('div', { class: 'mb-3' }, [
      h('div', { class: 'flex justify-between text-xs mb-1' }, [
        h('span', { text: seg.name }),
        h('span', { class: 'num t-mute', text: `${done} / ${seg.target}` }),
      ]),
      progressBar(pct, color),
    ]));
  });
  const satLink = h('button', { class: 'btn btn-ghost text-xs', onclick: () => go('saturation') }, 'Open saturation →');
  satPanel.appendChild(satList);
  satPanel.appendChild(h('div', { class: 'px-5 pb-3' }, [satLink]));
  grid.appendChild(satPanel);

  /* Panel 3 — needs attention (the exceptions, led by the hard rule) */
  const attnPanel = h('div', { class: 'card' });
  attnPanel.appendChild(h('div', { class: 'px-5 pt-4 pb-3 border-b b-soft' }, [
    h('div', { class: 'micro t-mute', text: 'Needs attention' }),
    h('div', { class: 'serif text-base mt-0.5', text: 'Problems first' }),
  ]));
  const attnList = h('div', { class: 'px-5 py-3 flex flex-col gap-2' });

  const overdue = STATE.interviews.filter(isUntaggedOverdue);
  overdue.forEach(r => {
    const item = h('div', { class: 'banner banner-rose', style: 'cursor:pointer;' }, [
      h('span', { text: `${r.interview_id} untagged for ${daysSince(r.date)} day${daysSince(r.date) === 1 ? '' : 's'} — tag it now` }),
    ]);
    item.addEventListener('click', () => go('interviews'));
    attnList.appendChild(item);
  });

  const stalled = STATE.outreach.filter(isStalled);
  stalled.forEach(r => {
    const item = h('div', { class: 'banner banner-honey', style: 'cursor:pointer;' }, [
      h('span', { text: `${r.name} (${r.status.toLowerCase()}) silent since ${fmtDate(r.first_contact)} — chase or close` }),
    ]);
    item.addEventListener('click', () => go('outreach'));
    attnList.appendChild(item);
  });

  const blocked = STATE.deliverables.filter(d => d.phase === CURRENT_PHASE && d.status === 'Blocked');
  blocked.forEach(d => {
    attnList.appendChild(h('div', { class: 'banner banner-rose' }, [
      h('span', { text: `Blocked: ${d.deliverable}` }),
    ]));
  });

  if (!attnList.children.length) {
    attnList.appendChild(h('div', { class: 'banner banner-info' }, [
      h('span', { text: 'Nothing needs attention. Keep interviewing.' }),
    ]));
  }
  attnPanel.appendChild(attnList);
  grid.appendChild(attnPanel);

  page.appendChild(grid);

  async function cycleDeliverable(d) {
    const order = ['Not started', 'In progress', 'Complete', 'Blocked'];
    const next = order[(order.indexOf(d.status) + 1) % order.length];
    try {
      await data.update('deliverables', d.id, { status: next });
      await loadAllData();
    } catch (e) { alert('Update failed: ' + e.message); }
  }
}

registerRoute('overview', 'Overview', renderOverview,
  'Where does the project stand, and what needs me today?');
