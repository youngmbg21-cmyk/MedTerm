/* Reports — one question: "What do we send to someone who wasn't in the room?"
   In local mode reports are generated from a structured template using live
   data. In api mode the assistant can also draft them via chat. */
import {
  STATE, registerRoute, renderCurrentRoute, h, emptyState, fmtDate, daysSince,
  isUntaggedOverdue, isStalled, rankThemes, segmentCoverageRows,
} from '../app.js';
import { CURRENT_PHASE, PHASES, SEGMENTS, getTeam } from '../config.js';
import { data, aiAvailable, draftSectionRequest, aiDataSlices } from '../data.js';
import { barChart, percentMeter, riskMatrixSvg, serializeSvg, PALETTE } from '../charts.js';
import { DEFAULT_ASSUMPTIONS, BREAKPOINTS, derive } from './economics.js';
import { aiDraftControls } from '../ai-draft.js';

const REPORT_TYPES = [
  { type: 'weekly_status', name: 'Weekly status report', description: 'Single page. This week\'s interviews, outreach progress, top themes, blockers.' },
  { type: 'phase_exit', name: 'Phase exit assessment', description: 'Exit criteria with evidence, what was learned, what remains uncertain.' },
  { type: 'investor_briefing', name: 'Investor briefing', description: 'Executive summary, wedge, what we learned, economic picture, current direction.' },
  { type: 'executive_briefing', name: 'Executive briefing', description: 'Board-ready: verdict-first summary, methodology, core findings, strategic implications, risk matrix, next steps.' },
];

/* ---------- Shared helpers ---------- */
/* Text ranking by mention count, drawn from the same rollup the matrix
   screen uses, so the two never disagree. */
function topThemes(n = 5) {
  return rankThemes(STATE.matrix)
    .map(t => [t.tag, t.count])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/* Bar-chart rows for the theme-frequency chart — same rollup as topThemes(). */
function themeFrequencyRows(n = 6) {
  return topThemes(n).map(([tag, count]) => ({ label: tag, value: count, color: PALETTE.plum }));
}

function taggedPct() {
  const total = STATE.interviews.length;
  if (!total) return null; // null (not 100) — an empty ledger isn't a satisfied rule
  return (STATE.interviews.filter(r => r.tagged_same_day === 'Y').length / total) * 100;
}

function isEconomicsCritical(text) {
  return /cost|pay|price|fee|money|insur|cac|conversion|margin/i.test(text || '');
}

function wordLimit(str, n) {
  const words = str.trim().split(/\s+/);
  return words.length <= n ? str.trim() : words.slice(0, n).join(' ') + '…';
}

/* ---------- Template generators (work in both modes) ---------- */
function generateWeeklyStatus() {
  const recent = STATE.interviews.filter(r => (daysSince(r.date) ?? 99) <= 7);
  const overdue = STATE.interviews.filter(isUntaggedOverdue);
  const stalled = STATE.outreach.filter(isStalled);
  const booked = STATE.outreach.filter(r => r.status === 'Booked');
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);

  return {
    title: `Weekly status — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    sections: [
      {
        title: 'Where we are',
        body: `Phase ${CURRENT_PHASE} — ${phase?.long}. ${STATE.interviews.length} interviews logged in total, ${STATE.matrix.length} quotes tagged in the matrix, ${STATE.outreach.length} contacts in the outreach pipeline.`,
        chart: taggedPct() == null ? null : { type: 'meter', pct: taggedPct(), label: 'Same-day tagging rate (hard rule: must be 100%)' },
      },
      { title: 'This week\'s interviews', body: recent.length ? recent.map(r => `${r.interview_id} · ${r.segment} · ${fmtDate(r.date)} — ${r.brief_topic || 'no topic recorded'}`).join('\n') : 'No interviews in the last 7 days.' },
      {
        title: 'Top themes so far',
        body: topThemes().map(([t, n], i) => `${i + 1}. ${t} (${n} mentions)`).join('\n') || 'No themes tagged yet.',
        chart: themeFrequencyRows().length ? { type: 'bar', rows: themeFrequencyRows() } : null,
      },
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
      {
        title: 'Coverage',
        body: SEGMENTS.map(s => `${s.name}: ${STATE.interviews.filter(r => r.segment === s.name).length}/${s.target} interviews`).join('\n'),
        chart: { type: 'bar', rows: segmentCoverageRows() },
      },
      { title: 'What remains uncertain', body: STATE.field_checks.filter(r => !r.confirmed).map(r => `- ${r.assumption}`).join('\n') || 'No open field checks.' },
    ],
  };
}

function generateInvestorBriefing() {
  const killed = STATE.kill_list;
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const wtpQuotes = STATE.matrix.filter(r => r.wtp === 'Y' && +r.severity >= 4);

  const wtpBySegment = {};
  wtpQuotes.forEach(r => { wtpBySegment[r.segment] = (wtpBySegment[r.segment] || 0) + 1; });
  const wtpRows = Object.entries(wtpBySegment).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  return {
    title: `MedTerminal — research briefing, ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
    sections: [
      { title: 'Executive summary', body: `We are running a six-phase discovery programme to decide whether a patient-side medical-travel service for the Kenya→India corridor is worth building. We are in Phase ${CURRENT_PHASE} (${phase?.long}) with ${STATE.interviews.length} interviews completed across ${new Set(STATE.interviews.map(r => r.segment)).size} segments.` },
      { title: 'The wedge being tested', body: 'Patient-side coordination for Kenyan families seeking treatment in India: discovery, trustworthy quotes, document handling, and money movement — the work currently done informally by brokers with opaque commissions.' },
      {
        title: 'Strongest willingness-to-pay evidence',
        body: wtpQuotes.slice(0, 5).map(r => `"${r.quote}" — ${r.segment}, ${r.interview_id}`).join('\n\n') || 'Evidence still accumulating.',
        chart: wtpRows.length ? { type: 'bar', rows: wtpRows, opts: { max: Math.max(...wtpRows.map(r => r.value)) } } : null,
      },
      { title: 'What we have ruled out', body: killed.map(k => `- ${k.hypothesis} (killed ${fmtDate(k.killed_date)})`).join('\n') || 'Nothing killed yet.' },
      { title: 'Honest caveats', body: 'Sample sizes are small and skewed to accessible contacts. Willingness-to-pay statements are unvalidated by actual payment. Economics are modelled, not observed.' },
    ],
  };
}

function generateExecutiveBriefing() {
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const team = getTeam();
  const total = STATE.interviews.length;
  const taggedPercent = taggedPct();
  const ranked = rankThemes(STATE.matrix).slice(0, 6);
  const topTheme = ranked[0];

  const memo = STATE.decision_memos[0];
  const verdict = memo?.content?.verdict;
  const verdictLine = (verdict && verdict !== 'Undecided')
    ? `Verdict: ${verdict}.`
    : `Direction: continuing Phase ${CURRENT_PHASE} discovery — no formal verdict yet.`;

  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...(STATE.economics.find(m => m.model_name === 'base')?.assumptions || {}) };
  const derived = derive(assumptions);
  const brokenCount = BREAKPOINTS.filter(bp => bp.broken(assumptions, derived)).length;

  const summaryRaw = `${verdictLine} The programme has completed ${total} interview${total === 1 ? '' : 's'} across ${new Set(STATE.interviews.map(r => r.segment)).size} of ${SEGMENTS.length} target segments, testing patient-side coordination for the Kenya→India medical-travel corridor. ${topTheme ? `The strongest signal so far is "${topTheme.tag}" (${topTheme.count} mentions, ${topTheme.wtpRate}% willingness-to-pay rate).` : 'Theme evidence is still accumulating.'} The unit-economics model currently ${brokenCount === 0 ? 'clears all three break-point checks' : `fails ${brokenCount} of 3 break-point checks`} under current assumptions. Same-day interview tagging stands at ${taggedPercent == null ? 'n/a — no interviews logged yet' : Math.round(taggedPercent) + '%'}. Sample sizes remain small; findings should be read as directional, not conclusive, until Phase 2 saturation.`;
  const summary = wordLimit(summaryRaw, 150);

  const dates = STATE.interviews.map(r => r.date).filter(Boolean).sort();
  const period = dates.length ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : 'No interviews logged yet.';

  const findingsBody = ranked.length
    ? ranked.map((t, i) => {
        const bestQuote = [...t.quotes].sort((a, b) => (+b.severity || 0) - (+a.severity || 0))[0];
        const thin = t.count < 3 ? ' (thin evidence — fewer than 3 supporting quotes)' : '';
        return `${i + 1}. ${t.tag}${thin}\n   ${t.count} mentions · avg severity ${t.avgSev.toFixed(1)} · ${t.wtpRate}% WTP\n   "${(bestQuote?.quote || '').slice(0, 220)}" — ${bestQuote?.interview_id || '?'}`;
      }).join('\n\n')
    : 'No matrix entries yet — core findings will populate once quotes are tagged.';

  const implications = [];
  const ipdWtp = STATE.matrix.filter(r => r.segment === 'Hospital IPD' && r.wtp === 'Y');
  if (ipdWtp.length >= 2) implications.push(`Willingness to pay on the Hospital IPD side is now corroborated by ${ipdWtp.length} independent interviews (${[...new Set(ipdWtp.map(r => r.interview_id))].join(', ')}) — worth pricing a pilot offer.`);
  if (STATE.kill_list.length) implications.push(`${STATE.kill_list.length} hypothesis(es) eliminated by direct evidence, narrowing scope: ${STATE.kill_list.map(k => `"${k.hypothesis}"`).join('; ')}.`);
  const discoveryThemes = STATE.matrix.filter(r => (r.theme_tag || '').startsWith('Discovery'));
  const socialDiscovery = discoveryThemes.filter(r => r.theme_tag === 'Discovery — WhatsApp/personal').length;
  if (discoveryThemes.length >= 3 && socialDiscovery / discoveryThemes.length >= 0.6) implications.push('Discovery is consistently social (WhatsApp, personal referral), not searched — channel strategy should follow trust networks, not SEO or paid acquisition.');
  const unconfirmedCritical = STATE.field_checks.filter(r => !r.confirmed && isEconomicsCritical(r.assumption));
  if (unconfirmedCritical.length) implications.push(`${unconfirmedCritical.length} unverified assumption(s) sit directly under the economics model and should be field-checked before further spend.`);
  if (!implications.length) implications.push('Evidence base is still too thin to state a strategic implication with confidence — prioritise reaching the Phase 2 interview targets before drawing conclusions.');

  let riskN = 1;
  const riskItems = [];
  BREAKPOINTS.forEach(bp => {
    const broken = bp.broken(assumptions, derived);
    riskItems.push({ n: riskN++, label: bp.label, likelihood: broken ? 'High' : 'Low', impact: 'High' });
  });
  const unconfirmed = STATE.field_checks.filter(r => !r.confirmed);
  unconfirmed.slice(0, 4).forEach(r => {
    riskItems.push({ n: riskN++, label: r.assumption, likelihood: 'High', impact: isEconomicsCritical(r.assumption) ? 'High' : 'Low' });
  });
  const moreChecks = unconfirmed.length - 4;

  const today = new Date();
  const inDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const nextSteps = [];
  const overdue = STATE.interviews.filter(isUntaggedOverdue);
  if (overdue.length) nextSteps.push(`Tag ${overdue.map(r => r.interview_id).join(', ')} in the matrix — Owner: ${team.field}. Target: ${fmtDate(inDays(1))}.`);
  const stalled = STATE.outreach.filter(isStalled);
  if (stalled.length) nextSteps.push(`Follow up or close ${stalled.length} stalled outreach contact(s) — Owner: ${team.field}. Target: ${fmtDate(inDays(7))}.`);
  if (unconfirmedCritical.length) nextSteps.push(`Field-verify: ${unconfirmedCritical[0].assumption} — Owner: ${team.lead}. Target: ${fmtDate(inDays(14))}.`);
  const behindTarget = SEGMENTS.filter(s => STATE.interviews.filter(r => r.segment === s.name).length < s.target).sort((a, b) => a.target - b.target)[0];
  if (behindTarget) nextSteps.push(`Recruit toward the ${behindTarget.name} target (${STATE.interviews.filter(r => r.segment === behindTarget.name).length}/${behindTarget.target}) — Owner: ${team.field}. Target: ${fmtDate(inDays(14))}.`);
  if (!nextSteps.length) nextSteps.push(`No open gaps detected — proceed to the next phase-exit review. Owner: ${team.lead}. Target: ${fmtDate(inDays(7))}.`);

  return {
    title: `Executive briefing — Phase ${CURRENT_PHASE}, ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
    sections: [
      { title: 'Executive summary', body: summary },
      {
        title: 'Field research methodology',
        body: `Period covered: ${period}.\nSame-day tagging rate: ${taggedPercent == null ? 'n/a — no interviews logged yet' : Math.round(taggedPercent) + '% (hard rule requires 100%)'}.\nInterviews by segment vs target:\n${SEGMENTS.map(s => `  ${s.name}: ${STATE.interviews.filter(r => r.segment === s.name).length}/${s.target}`).join('\n')}`,
        chart: { type: 'bar', rows: segmentCoverageRows() },
      },
      {
        title: 'Core analytical findings',
        body: findingsBody,
        chart: themeFrequencyRows().length ? { type: 'bar', rows: themeFrequencyRows() } : null,
      },
      { title: 'Strategic implications for project teams', body: implications.map(s => `- ${s}`).join('\n') },
      {
        title: 'Investment thesis & risk assessment',
        body: `Current investment picture with confidence levels — not a settled thesis at ${total} interview${total === 1 ? '' : 's'}. Risk matrix below plots break-point and assumption risk by likelihood × impact; see the numbered legend.`,
        chart: riskItems.length ? { type: 'riskMatrix', items: riskItems } : null,
      },
      { title: 'Next steps', body: nextSteps.map(s => `- ${s}`).join('\n') + (moreChecks > 0 ? `\n\n+${moreChecks} more unverified assumption(s) — see Field checks.` : '') },
    ],
  };
}

const GENERATORS = {
  weekly_status: generateWeeklyStatus,
  phase_exit: generatePhaseExit,
  investor_briefing: generateInvestorBriefing,
  executive_briefing: generateExecutiveBriefing,
};

/* ---------- Chart rendering — shared between the on-screen view and print ---------- */
function buildChartNode(chart) {
  const wrap = h('div', { class: 'my-3' });
  if (chart.type === 'bar') wrap.appendChild(barChart(chart.rows, chart.opts));
  else if (chart.type === 'meter') wrap.appendChild(percentMeter(chart.pct, { label: chart.label, ...chart.opts }));
  else if (chart.type === 'riskMatrix') {
    wrap.appendChild(riskMatrixSvg(chart.items, chart.opts));
    const legend = h('div', { class: 'mt-3 flex flex-col gap-1.5' });
    chart.items.forEach(it => {
      legend.appendChild(h('div', { class: 'flex items-start gap-2 text-xs t-soft' }, [
        h('span', { class: 'chip chip-line', style: 'min-width:22px; justify-content:center; flex-shrink:0;', text: String(it.n) }),
        h('span', { text: `${it.label} — likelihood ${it.likelihood.toLowerCase()}, impact ${it.impact.toLowerCase()}` }),
      ]));
    });
    wrap.appendChild(legend);
  }
  return wrap;
}

function chartToHtml(chart) {
  if (chart.type === 'bar') return `<div style="margin:14px 0;">${serializeSvg(barChart(chart.rows, chart.opts))}</div>`;
  if (chart.type === 'meter') return `<div style="margin:14px 0;">${serializeSvg(percentMeter(chart.pct, { label: chart.label, ...chart.opts }))}</div>`;
  if (chart.type === 'riskMatrix') {
    const svgHtml = serializeSvg(riskMatrixSvg(chart.items, chart.opts));
    const legendHtml = chart.items.map(it =>
      `<div style="font-size:11px; color:#4A5651; margin:4px 0;"><strong>${escapeHtml(String(it.n))}.</strong> ${escapeHtml(it.label)} — likelihood ${escapeHtml(it.likelihood.toLowerCase())}, impact ${escapeHtml(it.impact.toLowerCase())}</div>`
    ).join('');
    return `<div style="margin:14px 0;">${svgHtml}</div><div>${legendHtml}</div>`;
  }
  return '';
}

/* ---------- Screen ---------- */
function renderReports(page) {
  if (!aiAvailable) {
    page.appendChild(h('div', { class: 'banner banner-info mb-4' }, [
      h('span', { text: 'Reports are generated from live data using structured templates. Assistant-drafted narrative becomes available when the assistant is connected.' }),
    ]));
  }

  /* AI-first per report type: the assistant drafts the narrative and the
     data sections come from the same deterministic templates (numbers are
     computed, never AI-invented); the human reviews before anything is
     saved. The template path stays as a full peer. */
  const grid = h('div', { class: 'grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6' });
  REPORT_TYPES.forEach(rt => {
    grid.appendChild(h('div', { class: 'card p-5 flex flex-col' }, [
      h('div', { class: 'serif text-base mb-1', text: rt.name }),
      h('div', { class: 'text-xs mb-2 flex-1 t-soft', text: rt.description }),
      aiDraftControls({
        filled: false,
        draftLabel: 'Draft with assistant',
        manualLabel: 'Generate from template',
        manualTone: 'line',
        onDraft: () => draftReportWithAssistant(rt),
        onManual: () => generateAndSave(rt.type),
      }),
    ]));
  });
  page.appendChild(grid);

  /* Bulk delete: tick the reports to remove, then "Delete selected". The bar
     stays hidden until at least one is checked. Selection resets on re-render. */
  selectedReports.clear();
  const selCount = h('span', { class: 'text-xs t-mute' });
  const selBar = h('div', { class: 'flex items-center gap-2', style: 'display:none;' }, [
    selCount,
    h('button', { class: 'btn btn-line text-xs t-rose', onclick: () => deleteSelectedReports() }, 'Delete selected'),
    h('button', { class: 'btn btn-ghost text-xs', onclick: () => renderCurrentRoute() }, 'Clear'),
  ]);
  const updateSelBar = () => {
    const n = selectedReports.size;
    selBar.style.display = n ? 'flex' : 'none';
    selCount.textContent = `${n} selected`;
  };

  page.appendChild(h('div', { class: 'flex items-center justify-between gap-2 mb-3' }, [
    h('div', { class: 'micro t-mute', text: 'Generated reports' }),
    selBar,
  ]));

  const pastCard = h('div', { class: 'card' });
  if (!STATE.reports.length) {
    pastCard.appendChild(emptyState('No reports generated yet.'));
  } else {
    [...STATE.reports].reverse().forEach(r => {
      pastCard.appendChild(h('div', { class: 'px-6 py-4 border-b flex flex-wrap items-center gap-3 b-soft' }, [
        h('input', {
          type: 'checkbox',
          'aria-label': `Select ${r.title || r.report_type}`,
          style: 'width:18px; height:18px; cursor:pointer; flex-shrink:0;',
          onchange: (e) => {
            if (e.target.checked) selectedReports.add(r.id); else selectedReports.delete(r.id);
            updateSelBar();
          },
        }),
        h('div', { class: 'flex-1 min-w-0' }, [
          h('div', { class: 'font-medium text-sm', text: r.title || r.report_type }),
          h('div', { class: 'text-xs t-mute', text: `${r.report_type} · ${fmtDate(r.created_at)}` }),
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

/* Ids of reports ticked in the list. Module-level so it survives checkbox
   toggles (which don't re-render); cleared on every full render of the screen. */
const selectedReports = new Set();

async function deleteSelectedReports() {
  const ids = [...selectedReports];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} report${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
  try {
    for (const id of ids) await data.remove('reports', id);
    selectedReports.clear();
    STATE.reports = await data.list('reports');
    renderCurrentRoute();
  } catch (e) { alert('Delete failed: ' + e.message); }
}

async function generateAndSave(type) {
  try {
    const content = GENERATORS[type]();
    await data.create('reports', { report_type: type, title: content.title, content, version: 1 });
    STATE.reports = await data.list('reports');
    renderCurrentRoute();
  } catch (e) { alert('Generate failed: ' + e.message); }
}

/* Assistant-drafted report: the narrative comes from the drafting endpoint,
   every data section (numbers, charts) comes from the same deterministic
   template as always — the AI never invents figures. Nothing is saved until
   the human reviews the preview and taps Save. */
async function draftReportWithAssistant(rt) {
  const content = GENERATORS[rt.type]();
  const { text } = await draftSectionRequest({
    section_label: rt.name,
    placeholder: rt.description,
    doc_kind: `the narrative summary of a "${rt.name}" for someone who wasn't in the room`,
    phase: CURRENT_PHASE,
    segments: SEGMENTS,
    localData: aiDataSlices(STATE),
  });
  content.sections = [
    { title: 'Narrative — assistant-drafted, human-reviewed', body: (text || '').trim() },
    ...content.sections,
  ];
  content.assistant_drafted = true;
  previewDraftReport(rt, content);
}

function previewDraftReport(rt, content) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const draft = { content, title: content.title, report_type: rt.type, created_at: new Date().toISOString().slice(0, 10) };
  root.appendChild(h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) root.innerHTML = ''; } }, [
    h('div', { class: 'modal', style: 'max-width:800px;' }, [
      h('div', { class: 'banner banner-info mb-4' }, [
        h('span', { text: 'Assistant draft — review before saving. Nothing is stored until you save.' }),
      ]),
      reportViewNode(draft),
      h('div', { class: 'flex justify-end gap-2 mt-5 pt-4 border-t b-soft' }, [
        h('button', { class: 'btn btn-line', onclick: () => { root.innerHTML = ''; } }, 'Discard'),
        h('button', { class: 'btn btn-primary', onclick: async () => {
          try {
            await data.create('reports', { report_type: rt.type, title: content.title, content, version: 1 });
            STATE.reports = await data.list('reports');
            root.innerHTML = '';
            renderCurrentRoute();
          } catch (e) { alert('Save failed: ' + e.message); }
        } }, 'Save report'),
      ]),
    ]),
  ]));
}

/* The one report renderer — used by the saved-report viewer and the
   assistant-draft preview so they can never drift apart. */
function reportViewNode(report) {
  const content = report.content || {};
  const view = h('div', { class: 'report-print-view' });
  view.appendChild(h('div', { class: 'mb-8 pb-4 border-b b-line' }, [
    h('div', { class: 'flex items-center gap-2 mb-4' }, [
      h('div', { class: 'w-7 h-7 rounded-lg flex items-center justify-center', style: 'background:var(--sage-deep);' }, [
        h('span', { class: 'serif text-white text-base', text: 'M' }),
      ]),
      h('span', { class: 'micro', text: 'MedTerminal' }),
    ]),
    h('div', { class: 'serif text-2xl mb-2', text: report.title || report.report_type }),
    h('div', { class: 'text-xs t-mute', text: `Generated ${fmtDate(report.created_at)}` }),
  ]));

  (content.sections || []).forEach(s => {
    view.appendChild(h('div', { class: 'micro mb-2 mt-6 t-clay', text: s.title || '' }));
    if (s.body) view.appendChild(h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: s.body }));
    if (s.chart) view.appendChild(buildChartNode(s.chart));
  });
  return view;
}

function viewReport(report) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) root.innerHTML = ''; } }, [
    h('div', { class: 'modal', style: 'max-width:800px;' }, [
      h('div', { class: 'flex justify-end mb-4 gap-2' }, [
        h('button', { class: 'btn btn-line text-xs', onclick: () => printReport(report) }, 'Print'),
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => { root.innerHTML = ''; } }, 'Close'),
      ]),
      reportViewNode(report),
    ]),
  ]));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function printReport(report) {
  const content = report.content || {};
  const bodyHtml = (content.sections || []).map(s => {
    const heading = `<h2>${escapeHtml(s.title || '')}</h2>`;
    const body = s.body ? `<div style="white-space:pre-line; line-height:1.6;">${escapeHtml(s.body)}</div>` : '';
    const chart = s.chart ? chartToHtml(s.chart) : '';
    return heading + body + chart;
  }).join('');

  const w = window.open('', '_blank');
  if (!w) { alert('Couldn’t open the print window — allow pop-ups for this site and try again.'); return; }
  w.document.write(`<!DOCTYPE html>
<html><head><title>${escapeHtml(report.title || 'Report')}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { font-family: Inter, sans-serif; color: #1F2A28; max-width: 720px; margin: 40px auto; padding: 0 20px; font-size: 14px; line-height: 1.6; }
  h1 { font-family: Fraunces, Georgia, serif; font-size: 26px; line-height: 1.25; margin-bottom: 4px; }
  h2 { font-family: Fraunces, Georgia, serif; color: #96501F; margin-top: 24px; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10.5px; }
  .meta { font-size: 11px; color: #6E6A5E; margin-bottom: 8px; }
  .title-block { padding-bottom: 20px; margin-bottom: 28px; border-bottom: 2px solid #1F2A28; }
  .logo { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .logo-mark { width: 24px; height: 24px; background: #3F5A4D; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-family: Fraunces, Georgia, serif; font-size: 14px; }
  svg { max-width: 100%; height: auto; }
  .print-foot { display: none; }
  @media print {
    body { margin: 0; padding-bottom: 36px; }
    .print-foot {
      display: flex; justify-content: space-between; position: fixed; bottom: 0; left: 0; right: 0;
      font-size: 9.5px; color: #6E6A5E; border-top: 1px solid #E5DDD0;
      padding: 6px 4px 0; background: #fff;
      font-variant-numeric: tabular-nums;
    }
  }
</style></head>
<body>
  <div class="title-block">
    <div class="logo"><div class="logo-mark">M</div><span style="text-transform:uppercase; letter-spacing:0.14em; font-size:10.5px; font-weight:500;">MedTerminal</span></div>
    <h1>${escapeHtml(report.title || 'Report')}</h1>
    <div class="meta">Generated ${escapeHtml(fmtDate(report.created_at))} · Confidential — internal research working document</div>
  </div>
  ${bodyHtml}
  <div class="print-foot"><span>MedTerminal · ${escapeHtml(report.title || 'Report')}</span><span>Generated ${escapeHtml(fmtDate(report.created_at))}</span></div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

registerRoute('reports', 'Reports', renderReports,
  'What do we send to someone who wasn\'t in the room?');
