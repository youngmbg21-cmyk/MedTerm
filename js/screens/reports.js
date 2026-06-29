import { STATE, PHASE_INFO, h, esc, api, registerRoute } from '../app.js';
import { sendChat } from '../chat.js';

const REPORT_TYPES = [
  {
    type: 'weekly_status',
    name: 'Weekly status report',
    description: 'Single page. Last week\'s interviews, outreach progress, top themes, blockers, next week\'s plan.',
    icon: '📋',
  },
  {
    type: 'phase_exit',
    name: 'Phase exit assessment',
    description: 'Multi-page. Exit criteria with evidence, what was learned, what remains uncertain, GO/HOLD/EXTEND recommendation.',
    icon: '🚪',
  },
  {
    type: 'investor_briefing',
    name: 'Investor briefing',
    description: '5–8 pages. Cover, executive summary, wedge, team, what we learned, economic picture, decision or current direction.',
    icon: '📊',
  },
  {
    type: 'decision_memo',
    name: 'Decision memo',
    description: 'Phase 5 final output. Wedge tested, findings, economics, decision, MVP scope or pivot direction.',
    icon: '📝',
  },
];

function renderReports(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'Reports' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'Generate professional reports from your research data. The assistant writes each report using live project data.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  // Report type cards
  const grid = h('div', { class: 'grid md:grid-cols-2 gap-4 mb-6' });
  REPORT_TYPES.forEach(rt => {
    const card = h('div', { class: 'card p-5' }, [
      h('div', { class: 'flex items-start gap-3 mb-3' }, [
        h('span', { class: 'text-2xl', text: rt.icon }),
        h('div', {}, [
          h('div', { class: 'serif text-base', text: rt.name }),
          h('div', { class: 'text-xs mt-1', text: rt.description, style: 'color:var(--ink-soft);' }),
        ]),
      ]),
      h('button', { class: 'btn btn-primary w-full justify-center', onclick: () => generateReport(rt.type, rt.name) }, 'Generate'),
    ]);
    grid.appendChild(card);
  });
  page.appendChild(grid);

  // Past reports
  const pastLabel = h('div', { class: 'micro mb-3', text: 'Generated reports' });
  pastLabel.style.color = 'var(--ink-mute)';
  page.appendChild(pastLabel);

  const pastCard = h('div', { class: 'card' });
  if (!STATE.reports || STATE.reports.length === 0) {
    const empty = h('div', { class: 'p-6 text-center text-sm' });
    empty.style.color = 'var(--ink-mute)';
    empty.textContent = 'No reports generated yet.';
    pastCard.appendChild(empty);
  } else {
    STATE.reports.forEach(r => {
      const f = r.fields || r;
      const row = h('div', { class: 'px-6 py-4 border-b flex items-center justify-between', style: 'border-color:var(--line-soft);' }, [
        h('div', {}, [
          h('div', { class: 'font-medium text-sm', text: f.title || f.report_type || 'Report' }),
          h('div', { class: 'text-xs', text: `${f.report_type || ''} · ${(f.created_at || '').slice(0, 10)}`, style: 'color:var(--ink-mute);' }),
        ]),
        h('div', { class: 'flex gap-2' }, [
          h('button', { class: 'btn btn-line text-xs', onclick: () => viewReport(f) }, 'View'),
          h('button', { class: 'btn btn-ghost text-xs', onclick: () => printReport(f) }, 'Print'),
        ]),
      ]);
      pastCard.appendChild(row);
    });
  }
  page.appendChild(pastCard);
}

async function generateReport(type, name) {
  const prompt = `Generate a ${name} report based on the current project data. Structure it with clear sections. Use specific data points — interview IDs, theme frequencies, outreach counts. Be honest about what evidence is thin.`;

  // Open the chat and send the generation request
  window.toggleChat(true);
  sendChat(prompt);
}

function viewReport(report) {
  const content = report.content || {};
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const reportView = h('div', { class: 'report-print-view' });

  // Header
  const header = h('div', { class: 'mb-8 pb-4 border-b', style: 'border-color:var(--line);' });
  header.appendChild(h('div', { class: 'flex items-center gap-2 mb-4' }, [
    h('div', { class: 'w-7 h-7 rounded-lg flex items-center justify-center', style: 'background:var(--sage-deep);' }, [
      h('span', { class: 'serif text-white text-base', text: 'M' }),
    ]),
    h('span', { class: 'micro', text: 'MedTerminal' }),
  ]));
  header.appendChild(h('div', { class: 'serif text-2xl mb-2', text: report.title || report.report_type || 'Report' }));
  const date = h('div', { class: 'text-xs', text: `Generated ${(report.created_at || '').slice(0, 10)}` });
  date.style.color = 'var(--ink-mute)';
  header.appendChild(date);
  reportView.appendChild(header);

  // Body
  if (typeof content === 'string') {
    reportView.appendChild(h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: content }));
  } else if (content.sections) {
    content.sections.forEach(s => {
      const sectionLabel = h('div', { class: 'micro mb-2 mt-6', text: s.title || '' });
      sectionLabel.style.color = 'var(--clay)';
      reportView.appendChild(sectionLabel);
      reportView.appendChild(h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: s.body || '' }));
    });
  } else {
    reportView.appendChild(h('div', { class: 'text-sm', text: JSON.stringify(content, null, 2) }));
  }

  const modal = h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) root.innerHTML = ''; } }, [
    h('div', { class: 'modal p-8', style: 'max-width:800px;' }, [
      h('div', { class: 'flex justify-end mb-4 gap-2' }, [
        h('button', { class: 'btn btn-line text-xs', onclick: () => printReport(report) }, 'Print'),
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => { root.innerHTML = ''; } }, 'Close'),
      ]),
      reportView,
    ]),
  ]);
  root.appendChild(modal);
}

function printReport(report) {
  const content = report.content || {};
  const title = report.title || report.report_type || 'Report';
  const date = (report.created_at || '').slice(0, 10);

  let bodyHtml = '';
  if (typeof content === 'string') {
    bodyHtml = `<div style="white-space:pre-line;">${esc(content)}</div>`;
  } else if (content.sections) {
    bodyHtml = content.sections.map(s =>
      `<h2 style="font-family:Fraunces,Georgia,serif; font-size:16px; color:#B8693E; margin-top:24px; text-transform:uppercase; letter-spacing:0.1em; font-size:10.5px;">${esc(s.title || '')}</h2>
       <div style="white-space:pre-line; line-height:1.6;">${esc(s.body || '')}</div>`
    ).join('');
  }

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { font-family: Inter, sans-serif; color: #1F2A28; max-width: 700px; margin: 40px auto; padding: 0 20px; font-size: 14px; line-height: 1.6; }
  h1 { font-family: Fraunces, Georgia, serif; font-size: 24px; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #8A8478; margin-bottom: 32px; }
  .logo { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .logo-mark { width: 24px; height: 24px; background: #3F5A4D; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-family: Fraunces, Georgia, serif; font-size: 14px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <div class="logo"><div class="logo-mark">M</div><span style="text-transform:uppercase; letter-spacing:0.14em; font-size:10.5px; font-weight:500;">MedTerminal</span></div>
  <h1>${esc(title)}</h1>
  <div class="meta">Generated ${esc(date)}</div>
  ${bodyHtml}
</body>
</html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

registerRoute('reports', 'Reports', renderReports);
