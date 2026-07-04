/* Reports — one question: "What do we send to someone who wasn't in the room?"
   In local mode reports are generated from a structured template using live
   data. In api mode the assistant can also draft them via chat. */
import {
  STATE, registerRoute, renderCurrentRoute, h, emptyState, fmtDate, daysSince,
  isUntaggedOverdue, isStalled,
} from '../app.js';
import { CURRENT_PHASE, PHASES, SEGMENTS } from '../config.js';
import { data, isLocalMode } from '../data.js';

const REPORT_TYPES = [
  { type: 'weekly_status', name: 'Weekly status report', description: 'Single page. This week\'s interviews, outreach progress, top themes, blockers.' },
  { type: 'phase_exit', name: 'Phase exit assessment', description: 'Exit criteria with evidence, what was learned, what remains uncertain.' },
  { type: 'investor_briefing', name: 'Investor briefing', description: 'Executive summary, wedge, what we learned, economic picture, current direction.' },
];

/* ---------- Template generators (work in both modes) ---------- */
function topThemes(n = 5) {
  const counts = {};
  STATE.matrix.forEach(r => { if (r.theme_tag) counts[r.theme_tag] = (counts[r.theme_tag] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function generateWeeklyStatus() {
  const recent = STATE.interviews.filter(r => (daysSince(r.date) ?? 99) <= 7);
  const overdue = STATE.interviews.filter(isUntaggedOverdue);
  const stalled = STATE.outreach.filter(isStalled);
  const booked = STATE.outreach.filter(r => r.status === 'Booked');
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);

  return {
    title: `Weekly status — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    sections: [
      { title: 'Where we are', body: `Phase ${CURRENT_PHASE} — ${phase?.long}. ${STATE.interviews.length} interviews logged in total, ${STATE.matrix.length} quotes tagged in the matrix, ${STATE.outreach.length} contacts in the outreach pipeline.` },
      { title: 'This week\'s interviews', body: recent.length ? recent.map(r => `${r.interview_id} · ${r.segment} · ${fmtDate(r.date)} — ${r.brief_topic || 'no topic recorded'}`).join('\n') : 'No interviews in the last 7 days.' },
      { title: 'Top themes so far', body: topThemes().map(([t, n], i) => `${i + 1}. ${t} (${n} mentions)`).join('\n') || 'No themes tagged yet.' },
      { title: 'Blockers', body: [
        overdue.length ? `Same-day-tag rule breached: ${overdue.map(r => r.interview_id).join(', ')} untagged past 24h.` : null,
        stalled.length ? `${stalled.length} outreach contact(s) stalled with no movement: ${stalled.map(r => r.name).join(', ')}.` : null,
      ].filter(Boolean).join('\n') || 'No blockers.' },
      { title: 'Next week', body: booked.length ? `Booked interviews to run: ${booked.map(r => `${r.name} (${r.segment})`).join(', ')}.` : 'No interviews booked yet — priority is converting replied contacts to bookings.' },
    ],
  };
}

function generatePhaseExit() {
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const criteria = STATE.deliverables.filter(d => d.phase === CURRENT_PHASE);
  const done = criteria.filter(d => d.status === 'Complete');
  const blocked = criteria.filter(d => d.status === 'Blocked');
  const verdict = blocked.length ? 'HOLD — blocked criteria must clear first'
    : done.length === criteria.length && criteria.length > 0 ? 'READY to exit'
    : 'EXTEND — criteria still open';

  return {
    title: `Phase ${CURRENT_PHASE} exit assessment — ${phase?.long}`,
    sections: [
      { title: 'Recommendation', body: verdict },
      { title: 'Exit criteria', body: criteria.map(d => `[${d.status}] ${d.deliverable}${d.evidence ? ` — ${d.evidence}` : ''}`).join('\n') || 'No criteria defined.' },
      { title: 'Coverage', body: SEGMENTS.map(s => {
        const n = STATE.interviews.filter(r => r.segment === s.name).length;
        return `${s.name}: ${n}/${s.target} interviews`;
      }).join('\n') },
      { title: 'What remains uncertain', body: STATE.field_checks.filter(r => !r.confirmed).map(r => `- ${r.assumption}`).join('\n') || 'No open field checks.' },
    ],
  };
}

function generateInvestorBriefing() {
  const killed = STATE.kill_list;
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const wtpQuotes = STATE.matrix.filter(r => r.wtp === 'Y' && +r.severity >= 4);

  return {
    title: `MedTerminal — research briefing, ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
    sections: [
      { title: 'Executive summary', body: `We are running a six-phase discovery programme to decide whether a patient-side medical-travel service for the Kenya→India corridor is worth building. We are in Phase ${CURRENT_PHASE} (${phase?.long}) with ${STATE.interviews.length} interviews completed across ${new Set(STATE.interviews.map(r => r.segment)).size} segments.` },
      { title: 'The wedge being tested', body: 'Patient-side coordination for Kenyan families seeking treatment in India: discovery, trustworthy quotes, document handling, and money movement — the work currently done informally by brokers with opaque commissions.' },
      { title: 'Strongest willingness-to-pay evidence', body: wtpQuotes.slice(0, 5).map(r => `"${r.quote}" — ${r.segment}, ${r.interview_id}`).join('\n\n') || 'Evidence still accumulating.' },
      { title: 'What we have ruled out', body: killed.map(k => `- ${k.hypothesis} (killed ${fmtDate(k.killed_date)})`).join('\n') || 'Nothing killed yet.' },
      { title: 'Honest caveats', body: 'Sample sizes are small and skewed to accessible contacts. Willingness-to-pay statements are unvalidated by actual payment. Economics are modelled, not observed.' },
    ],
  };
}

const GENERATORS = {
  weekly_status: generateWeeklyStatus,
  phase_exit: generatePhaseExit,
  investor_briefing: generateInvestorBriefing,
};

/* ---------- Screen ---------- */
function renderReports(page) {
  if (isLocalMode) {
    page.appendChild(h('div', { class: 'banner banner-info mb-4' }, [
      h('span', { text: 'Reports are generated from live data using structured templates. Assistant-drafted prose becomes available when the backend goes live.' }),
    ]));
  }

  const grid = h('div', { class: 'grid md:grid-cols-3 gap-4 mb-6' });
  REPORT_TYPES.forEach(rt => {
    grid.appendChild(h('div', { class: 'card p-5 flex flex-col' }, [
      h('div', { class: 'serif text-base mb-1', text: rt.name }),
      h('div', { class: 'text-xs mb-4 flex-1', style: 'color:var(--ink-soft);', text: rt.description }),
      h('button', { class: 'btn btn-primary w-full justify-center', onclick: () => generateAndSave(rt.type) }, 'Generate'),
    ]));
  });
  page.appendChild(grid);

  page.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--ink-mute);', text: 'Generated reports' }));
  const pastCard = h('div', { class: 'card' });
  if (!STATE.reports.length) {
    pastCard.appendChild(emptyState('No reports generated yet.'));
  } else {
    [...STATE.reports].reverse().forEach(r => {
      pastCard.appendChild(h('div', { class: 'px-6 py-4 border-b flex flex-wrap items-center justify-between gap-2', style: 'border-color:var(--line-soft);' }, [
        h('div', {}, [
          h('div', { class: 'font-medium text-sm', text: r.title || r.report_type }),
          h('div', { class: 'text-xs', style: 'color:var(--ink-mute);', text: `${r.report_type} · ${fmtDate(r.created_at)}` }),
        ]),
        h('div', { class: 'flex gap-2' }, [
          h('button', { class: 'btn btn-line text-xs', onclick: () => viewReport(r) }, 'View'),
          h('button', { class: 'btn btn-ghost text-xs', onclick: () => printReport(r) }, 'Print'),
        ]),
      ]));
    });
  }
  page.appendChild(pastCard);
}

async function generateAndSave(type) {
  try {
    const content = GENERATORS[type]();
    await data.create('reports', { report_type: type, title: content.title, content, version: 1 });
    STATE.reports = await data.list('reports');
    renderCurrentRoute();
  } catch (e) { alert('Generate failed: ' + e.message); }
}

function viewReport(report) {
  const content = report.content || {};
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const view = h('div', { class: 'report-print-view' });
  view.appendChild(h('div', { class: 'mb-8 pb-4 border-b', style: 'border-color:var(--line);' }, [
    h('div', { class: 'flex items-center gap-2 mb-4' }, [
      h('div', { class: 'w-7 h-7 rounded-lg flex items-center justify-center', style: 'background:var(--sage-deep);' }, [
        h('span', { class: 'serif text-white text-base', text: 'M' }),
      ]),
      h('span', { class: 'micro', text: 'MedTerminal' }),
    ]),
    h('div', { class: 'serif text-2xl mb-2', text: report.title || report.report_type }),
    h('div', { class: 'text-xs', style: 'color:var(--ink-mute);', text: `Generated ${fmtDate(report.created_at)}` }),
  ]));

  (content.sections || []).forEach(s => {
    view.appendChild(h('div', { class: 'micro mb-2 mt-6', style: 'color:var(--clay);', text: s.title || '' }));
    view.appendChild(h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: s.body || '' }));
  });

  root.appendChild(h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) root.innerHTML = ''; } }, [
    h('div', { class: 'modal p-8', style: 'max-width:800px;' }, [
      h('div', { class: 'flex justify-end mb-4 gap-2' }, [
        h('button', { class: 'btn btn-line text-xs', onclick: () => printReport(report) }, 'Print'),
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => { root.innerHTML = ''; } }, 'Close'),
      ]),
      view,
    ]),
  ]));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function printReport(report) {
  const content = report.content || {};
  const bodyHtml = (content.sections || []).map(s =>
    `<h2 style="font-family:Fraunces,Georgia,serif; color:#B8693E; margin-top:24px; text-transform:uppercase; letter-spacing:0.1em; font-size:10.5px;">${escapeHtml(s.title)}</h2>
     <div style="white-space:pre-line; line-height:1.6;">${escapeHtml(s.body)}</div>`).join('');

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html>
<html><head><title>${escapeHtml(report.title || 'Report')}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { font-family: Inter, sans-serif; color: #1F2A28; max-width: 700px; margin: 40px auto; padding: 0 20px; font-size: 14px; line-height: 1.6; }
  h1 { font-family: Fraunces, Georgia, serif; font-size: 24px; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #8A8478; margin-bottom: 32px; }
  .logo { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .logo-mark { width: 24px; height: 24px; background: #3F5A4D; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-family: Fraunces, Georgia, serif; font-size: 14px; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <div class="logo"><div class="logo-mark">M</div><span style="text-transform:uppercase; letter-spacing:0.14em; font-size:10.5px; font-weight:500;">MedTerminal</span></div>
  <h1>${escapeHtml(report.title || 'Report')}</h1>
  <div class="meta">Generated ${escapeHtml(fmtDate(report.created_at))}</div>
  ${bodyHtml}
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

registerRoute('reports', 'Reports', renderReports,
  'What do we send to someone who wasn\'t in the room?');
