/* Phase 4 — Economics screens. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  openModal, closeModal, formField, fmtDate,
} from '../app.js';
import { interviewerOptions } from '../config.js';
import { data } from '../data.js';

/* ---------- Unit economics — "Does the patient-pays model survive its break-points?" ---------- */
const DEFAULT_ASSUMPTIONS = {
  procedure_cost_usd: 8000,
  take_rate_pct: 8,
  cac_usd: 150,
  consult_to_travel_pct: 20,
  service_cost_per_case_usd: 200,
  cases_per_month: 10,
  monthly_fixed_costs_usd: 2000,
};

/* The three break-points that kill the patient-pays model. */
const BREAKPOINTS = [
  {
    label: 'CAC per closed case must stay below revenue per case',
    broken: (a, d) => d.cacPerCase > d.revenuePerCase,
    detail: (a, d) => `CAC per closed case $${d.cacPerCase.toFixed(0)} vs revenue $${d.revenuePerCase.toFixed(0)}`,
  },
  {
    label: 'Consult → travel conversion must be ≥ 15%',
    broken: (a) => a.consult_to_travel_pct < 15,
    detail: (a) => `Current: ${a.consult_to_travel_pct}%`,
  },
  {
    label: 'Service cost per case must stay below $300',
    broken: (a) => a.service_cost_per_case_usd > 300,
    detail: (a) => `Current: $${a.service_cost_per_case_usd}`,
  },
];

function derive(a) {
  const revenuePerCase = a.procedure_cost_usd * a.take_rate_pct / 100;
  const leadsPerCase = 100 / Math.max(a.consult_to_travel_pct, 0.01);
  const cacPerCase = a.cac_usd * leadsPerCase;
  const grossMarginPerCase = revenuePerCase - a.service_cost_per_case_usd;
  const netMarginPerCase = grossMarginPerCase - cacPerCase;
  const leadsNeeded = Math.ceil(a.cases_per_month * leadsPerCase);
  return {
    revenuePerCase, cacPerCase, grossMarginPerCase, netMarginPerCase, leadsNeeded,
    monthlyRevenue: revenuePerCase * a.cases_per_month,
    monthlyNet: netMarginPerCase * a.cases_per_month - a.monthly_fixed_costs_usd,
    monthlyCACSpend: a.cac_usd * leadsNeeded,
  };
}

function renderEconomics(page) {
  const saved = STATE.economics.find(m => m.model_name === 'base');
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...(saved?.assumptions || {}) };

  const grid = h('div', { class: 'grid md:grid-cols-2 gap-5 mb-5' });
  const assumptionsCard = h('div', { class: 'card p-6' });
  const outputsCard = h('div', { class: 'card p-6' });
  const breakCard = h('div', { class: 'card p-6 mb-5' });
  const sensCard = h('div', { class: 'card p-6' });

  assumptionsCard.appendChild(h('div', { class: 'micro mb-4', style: 'color:var(--ink-mute);', text: 'Assumptions' }));
  const fields = [
    { key: 'procedure_cost_usd', label: 'Procedure cost (USD)', step: 500 },
    { key: 'take_rate_pct', label: 'Take rate (%)', step: 1 },
    { key: 'cac_usd', label: 'CAC per lead (USD)', step: 10 },
    { key: 'consult_to_travel_pct', label: 'Consult → travel (%)', step: 1 },
    { key: 'service_cost_per_case_usd', label: 'Service cost per case (USD)', step: 25 },
    { key: 'cases_per_month', label: 'Cases per month', step: 1 },
    { key: 'monthly_fixed_costs_usd', label: 'Monthly fixed costs (USD)', step: 100 },
  ];
  fields.forEach(f => {
    assumptionsCard.appendChild(h('div', { class: 'mb-3' }, [
      h('label', { class: 'label', text: f.label }),
      h('input', { class: 'input', type: 'number', value: `${assumptions[f.key]}`, step: `${f.step}`,
        oninput: (e) => { assumptions[f.key] = +e.target.value || 0; renderOutputs(); } }),
    ]));
  });
  const saveBtn = h('button', { class: 'btn btn-primary mt-2', onclick: async () => {
    try {
      if (saved) await data.update('economics', saved.id, { assumptions });
      else await data.create('economics', { model_name: 'base', assumptions });
      STATE.economics = await data.list('economics');
      saveBtn.textContent = 'Saved';
      setTimeout(() => { saveBtn.textContent = 'Save assumptions'; }, 1500);
    } catch (e) { alert('Save failed: ' + e.message); }
  } }, 'Save assumptions');
  assumptionsCard.appendChild(saveBtn);

  grid.appendChild(assumptionsCard);
  grid.appendChild(outputsCard);
  page.appendChild(grid);
  page.appendChild(breakCard);
  page.appendChild(sensCard);

  function renderOutputs() {
    const d = derive(assumptions);

    outputsCard.innerHTML = '';
    outputsCard.appendChild(h('div', { class: 'micro mb-4', style: 'color:var(--ink-mute);', text: 'Derived outputs' }));
    [
      ['Revenue per case', d.revenuePerCase],
      ['CAC per closed case', d.cacPerCase],
      ['Gross margin per case', d.grossMarginPerCase],
      ['Net margin per case', d.netMarginPerCase],
      ['Leads needed / month', d.leadsNeeded, true],
      ['Monthly CAC spend', d.monthlyCACSpend],
      ['Monthly revenue', d.monthlyRevenue],
      ['Monthly net (after fixed)', d.monthlyNet],
    ].forEach(([label, val, isCount]) => {
      const text = isCount ? `${val}` : `$${val.toFixed(0)}`;
      outputsCard.appendChild(h('div', { class: 'flex justify-between py-2 text-sm border-b', style: 'border-color:var(--line-soft);' }, [
        h('span', { text: label }),
        h('span', { class: 'num font-medium', text, style: val < 0 ? 'color:var(--rose);' : '' }),
      ]));
    });

    breakCard.innerHTML = '';
    breakCard.appendChild(h('div', { class: 'micro mb-4', style: 'color:var(--ink-mute);', text: 'Break-point checks — any red kills the patient-pays model' }));
    BREAKPOINTS.forEach(bp => {
      const broken = bp.broken(assumptions, d);
      breakCard.appendChild(h('div', { class: 'flex items-center gap-3 py-2' }, [
        chip(broken ? '✗ BROKEN' : '✓ PASS', broken ? 'rose' : 'sage'),
        h('div', {}, [
          h('div', { class: 'text-sm font-medium', text: bp.label }),
          h('div', { class: 'text-xs', style: 'color:var(--ink-mute);', text: bp.detail(assumptions, d) }),
        ]),
      ]));
    });

    sensCard.innerHTML = '';
    sensCard.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--ink-mute);', text: 'Sensitivity: net margin per case — take rate × conversion' }));
    const takeRates = [5, 6, 7, 8, 10, 12];
    const conversions = [10, 15, 20, 25, 30];
    const table = h('table', { class: 'data' });
    const headRow = h('tr', {}, [h('th', { text: 'Take ↓ / Conv →' })]);
    conversions.forEach(c => headRow.appendChild(h('th', { text: `${c}%` })));
    table.appendChild(h('thead', {}, [headRow]));
    const tbody = h('tbody');
    takeRates.forEach(tr => {
      const row = h('tr', { class: 'h-row' }, [h('td', { class: 'font-medium num', text: `${tr}%` })]);
      conversions.forEach(cv => {
        const testA = { ...assumptions, take_rate_pct: tr, consult_to_travel_pct: cv };
        const testD = derive(testA);
        const anyBroken = BREAKPOINTS.some(bp => bp.broken(testA, testD));
        const td = h('td', { class: 'num', text: `$${testD.netMarginPerCase.toFixed(0)}` });
        td.style.color = anyBroken ? 'var(--rose)' : testD.netMarginPerCase > 0 ? 'var(--sage-deep)' : 'var(--ink)';
        if (anyBroken) td.style.fontWeight = '600';
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    sensCard.appendChild(h('div', { class: 'table-wrap' }, [table]));
  }

  renderOutputs();
}

registerRoute('economics', 'Unit economics', renderEconomics,
  'Does the patient-pays model survive its three break-points?');

/* ---------- Alternate models — "If patient-pays dies, what replaces it?" ---------- */
const ALT_MODELS = [
  {
    name: 'Hospital referral fee',
    how: 'Hospital IPD (International Patient Department) pays per qualified lead that converts to a treated patient.',
    revenue: '$200–500 per converted case',
    who_pays: 'Hospital IPD',
    pros: 'No patient-side CAC. Aligned with hospital growth teams. Scalable per corridor.',
    cons: 'Requires hospital partnerships. Revenue per case is lower. Dependent on conversion quality.',
  },
  {
    name: 'Hospital SaaS',
    how: 'Monthly subscription for software that pre-qualifies and packages African patient cases for the IPD.',
    revenue: '$500–2,000/month per hospital',
    who_pays: 'Hospital IPD',
    pros: 'Recurring revenue. Stickier than referral fees. Defensible once integrated.',
    cons: 'Longer sales cycle. Needs product-market fit proof. Small addressable market initially.',
  },
  {
    name: 'Premium case handling',
    how: 'End-to-end concierge service for high-value cases (cardiac, oncology). Patient or family pays a flat fee.',
    revenue: '$500–1,500 per case',
    who_pays: 'Patient / family',
    pros: 'High margin. Deep relationship. Strong word-of-mouth if executed well.',
    cons: 'Does not scale without people. Service cost risk. Regulatory exposure in some corridors.',
  },
];

function renderAltModels(page) {
  const grid = h('div', { class: 'grid md:grid-cols-3 gap-4' });
  ALT_MODELS.forEach(m => {
    const card = h('div', { class: 'card p-5' });
    card.appendChild(h('div', { class: 'serif text-lg mb-1', text: m.name }));
    card.appendChild(h('div', { class: 'mb-2' }, [chip(m.who_pays, 'info')]));
    [['How it works', m.how], ['Revenue', m.revenue], ['Pros', m.pros], ['Cons', m.cons]].forEach(([label, val]) => {
      card.appendChild(h('div', { class: 'micro mt-3 mb-1', style: 'color:var(--ink-mute);', text: label }));
      card.appendChild(h('div', { class: 'text-sm', text: val }));
    });
    grid.appendChild(card);
  });
  page.appendChild(grid);
}

registerRoute('alt-models', 'Alternate models', renderAltModels,
  'If patient-pays breaks, which model replaces it?');

/* ---------- Field checks — "Which fragile assumptions have we verified in the field?" ---------- */
function renderFieldChecks(page) {
  const unconfirmed = STATE.field_checks.filter(r => !r.confirmed);
  if (unconfirmed.length) {
    page.appendChild(h('div', { class: 'banner banner-honey mb-4' }, [
      h('span', { text: `${unconfirmed.length} assumption${unconfirmed.length === 1 ? '' : 's'} still unverified — each one is model risk.` }),
    ]));
  }

  page.appendChild(h('div', { class: 'mb-4 flex justify-end' }, [
    h('button', { class: 'btn btn-primary', onclick: () => openFieldCheckForm() }, '+ Add assumption'),
  ]));

  const card = h('div', { class: 'card' });
  if (!STATE.field_checks.length) {
    card.appendChild(emptyState('No field checks logged yet.', 'Add fragile assumptions that need in-person verification.'));
  } else {
    const table = h('table', { class: 'data stack' });
    const headRow = h('tr');
    ['Assumption', 'Status', 'Confirmed by', 'Date', 'Notes', ''].forEach(t => headRow.appendChild(h('th', { text: t })));
    table.appendChild(h('thead', {}, [headRow]));
    const tbody = h('tbody');
    [...STATE.field_checks]
      .sort((a, b) => (a.confirmed === b.confirmed ? 0 : a.confirmed ? 1 : -1))
      .forEach(r => {
        tbody.appendChild(h('tr', { class: 'h-row' }, [
          h('td', { class: 'font-medium', 'data-label': 'Assumption', text: r.assumption || '' }),
          h('td', { 'data-label': 'Status' }, [chip(r.confirmed ? 'Confirmed' : 'Unconfirmed', r.confirmed ? 'sage' : 'honey')]),
          h('td', { 'data-label': 'Confirmed by', text: r.confirmed_by || '—' }),
          h('td', { class: 'num', 'data-label': 'Date', text: fmtDate(r.confirmed_date) }),
          h('td', { 'data-label': 'Notes', text: r.notes || '—' }),
          h('td', { 'data-label': '' }, [h('button', { class: 'btn btn-ghost text-xs', onclick: () => openFieldCheckForm(r) }, 'Edit')]),
        ]));
      });
    table.appendChild(tbody);
    card.appendChild(h('div', { class: 'table-wrap' }, [table]));
  }
  page.appendChild(card);
}

function openFieldCheckForm(existing) {
  const r = existing || {};
  openModal(existing ? 'Edit field check' : 'Add field check', [
    formField('Assumption', 'assumption', 'textarea', r.assumption),
    formField('Confirmed?', 'confirmed', 'select', r.confirmed ? 'Yes' : 'No', ['No', 'Yes']),
    formField('Confirmed by', 'confirmed_by', 'select', r.confirmed_by, ['', ...interviewerOptions()]),
    formField('Date', 'confirmed_date', 'input', r.confirmed_date, null, 'date'),
    formField('Notes', 'notes', 'textarea', r.notes),
  ], async (form) => {
    form.confirmed = form.confirmed === 'Yes';
    if (!form.confirmed_date) form.confirmed_date = null;
    try {
      if (existing) await data.update('field_checks', existing.id, form);
      else await data.create('field_checks', form);
      STATE.field_checks = await data.list('field_checks');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('field-checks', 'Field checks', renderFieldChecks,
  'Which fragile assumptions have we verified in the field?');
