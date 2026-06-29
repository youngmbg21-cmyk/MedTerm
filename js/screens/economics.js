import { STATE, h, esc, api, openModal, closeModal, formField, renderCurrentRoute, registerRoute } from '../app.js';

// --- Unit Economics Model ---
const DEFAULT_ASSUMPTIONS = {
  procedure_cost_usd: 8000,
  take_rate_pct: 8,
  cac_usd: 150,
  consult_to_travel_pct: 20,
  service_cost_per_case_usd: 200,
  cases_per_month: 10,
  monthly_fixed_costs_usd: 2000,
};

const BREAKPOINTS = {
  cac_exceeds_revenue: (a) => a.cac_usd > (a.procedure_cost_usd * a.take_rate_pct / 100),
  conversion_below_15: (a) => a.consult_to_travel_pct < 15,
  service_cost_above_300: (a) => a.service_cost_per_case_usd > 300,
};

function derive(a) {
  const revenuePerCase = a.procedure_cost_usd * a.take_rate_pct / 100;
  const grossMarginPerCase = revenuePerCase - a.service_cost_per_case_usd;
  const netMarginPerCase = grossMarginPerCase - a.cac_usd;
  const monthlyRevenue = revenuePerCase * a.cases_per_month;
  const monthlyGross = grossMarginPerCase * a.cases_per_month;
  const monthlyNet = netMarginPerCase * a.cases_per_month - a.monthly_fixed_costs_usd;
  const leadsNeeded = Math.ceil(a.cases_per_month / (a.consult_to_travel_pct / 100));
  const monthlyCAC = a.cac_usd * leadsNeeded;
  return { revenuePerCase, grossMarginPerCase, netMarginPerCase, monthlyRevenue, monthlyGross, monthlyNet, leadsNeeded, monthlyCAC };
}

function renderEconomics(page) {
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...(STATE.economics?.assumptions || {}) };

  const title = h('div', { class: 'serif text-xl mb-1', text: 'Unit economics model' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'Parametric model for the patient-pays corridor. Adjust assumptions to see derived outputs and break-point warnings.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  const grid = h('div', { class: 'grid md:grid-cols-2 gap-5 mb-6' });

  // Assumptions card
  const assumptionsCard = h('div', { class: 'card p-6' });
  assumptionsCard.appendChild(h('div', { class: 'micro mb-4', text: 'Assumptions' }));

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
    const wrap = h('div', { class: 'mb-3' });
    wrap.appendChild(h('label', { class: 'label', text: f.label }));
    const input = h('input', {
      class: 'input', type: 'number', value: `${assumptions[f.key]}`, step: `${f.step}`,
      oninput: (e) => {
        assumptions[f.key] = +e.target.value;
        renderOutputs();
      }
    });
    wrap.appendChild(input);
    assumptionsCard.appendChild(wrap);
  });

  const saveBtn = h('button', { class: 'btn btn-primary mt-2', onclick: async () => {
    try {
      await api('/api/economics', { method: 'POST', body: JSON.stringify({ model_name: 'base', assumptions }) });
      saveBtn.textContent = 'Saved';
      setTimeout(() => { saveBtn.textContent = 'Save assumptions'; }, 1500);
    } catch (e) { alert('Save failed: ' + e.message); }
  } }, 'Save assumptions');
  assumptionsCard.appendChild(saveBtn);
  grid.appendChild(assumptionsCard);

  // Outputs card
  const outputsCard = h('div', { class: 'card p-6' });
  outputsCard.id = 'econ-outputs';
  grid.appendChild(outputsCard);

  page.appendChild(grid);

  // Break-points card
  const breakCard = h('div', { class: 'card p-6 mb-6' });
  breakCard.id = 'econ-breakpoints';
  page.appendChild(breakCard);

  // Sensitivity table
  const sensCard = h('div', { class: 'card p-6' });
  sensCard.id = 'econ-sensitivity';
  page.appendChild(sensCard);

  function renderOutputs() {
    const d = derive(assumptions);
    const out = document.getElementById('econ-outputs');
    out.innerHTML = '';
    out.appendChild(h('div', { class: 'micro mb-4', text: 'Derived outputs' }));

    const rows = [
      ['Revenue per case', `$${d.revenuePerCase.toFixed(0)}`],
      ['Gross margin per case', `$${d.grossMarginPerCase.toFixed(0)}`],
      ['Net margin per case', `$${d.netMarginPerCase.toFixed(0)}`],
      ['Leads needed / month', `${d.leadsNeeded}`],
      ['Monthly CAC spend', `$${d.monthlyCAC.toFixed(0)}`],
      ['Monthly revenue', `$${d.monthlyRevenue.toFixed(0)}`],
      ['Monthly gross profit', `$${d.monthlyGross.toFixed(0)}`],
      ['Monthly net (after fixed)', `$${d.monthlyNet.toFixed(0)}`],
    ];

    rows.forEach(([label, value]) => {
      const isNeg = value.includes('-');
      const row = h('div', { class: 'flex justify-between py-2 text-sm border-b', style: 'border-color:var(--line-soft);' }, [
        h('span', { text: label }),
        h('span', { class: 'num font-medium', text: value, style: isNeg ? 'color:var(--rose);' : '' }),
      ]);
      out.appendChild(row);
    });

    // Break-points
    const bp = document.getElementById('econ-breakpoints');
    bp.innerHTML = '';
    bp.appendChild(h('div', { class: 'micro mb-4', text: 'Break-point alerts' }));

    const checks = [
      { test: BREAKPOINTS.cac_exceeds_revenue(assumptions), label: 'CAC per closed case exceeds revenue per case', detail: `CAC $${assumptions.cac_usd} vs revenue $${d.revenuePerCase.toFixed(0)}` },
      { test: BREAKPOINTS.conversion_below_15(assumptions), label: 'Consult → travel conversion below 15%', detail: `Current: ${assumptions.consult_to_travel_pct}%` },
      { test: BREAKPOINTS.service_cost_above_300(assumptions), label: 'Service cost per case exceeds $300', detail: `Current: $${assumptions.service_cost_per_case_usd}` },
    ];

    checks.forEach(c => {
      const icon = c.test ? '⚠' : '✓';
      const chipClass = c.test ? 'chip-rose' : 'chip-sage';
      const row = h('div', { class: 'flex items-center gap-3 py-2' }, [
        h('span', { class: `chip ${chipClass}`, text: `${icon} ${c.test ? 'BROKEN' : 'OK'}` }),
        h('div', {}, [
          h('div', { class: 'text-sm font-medium', text: c.label }),
          h('div', { class: 'text-xs', style: 'color:var(--ink-mute);', text: c.detail }),
        ]),
      ]);
      bp.appendChild(row);
    });

    // Sensitivity table: take rate vs conversion
    const sens = document.getElementById('econ-sensitivity');
    sens.innerHTML = '';
    sens.appendChild(h('div', { class: 'micro mb-3', text: 'Sensitivity: take rate × consult-to-travel conversion' }));

    const takeRates = [5, 6, 7, 8, 10, 12];
    const conversions = [10, 15, 20, 25, 30];

    const table = h('table', { class: 'data' });
    const tHead = h('thead');
    const headerRow = h('tr', {}, [h('th', { text: 'Take rate ↓ / Conv →' })]);
    conversions.forEach(c => headerRow.appendChild(h('th', { text: `${c}%` })));
    tHead.appendChild(headerRow);
    table.appendChild(tHead);

    const tBody = h('tbody');
    takeRates.forEach(tr => {
      const row = h('tr', { class: 'h-row' }, [h('td', { class: 'font-medium', text: `${tr}%` })]);
      conversions.forEach(cv => {
        const testA = { ...assumptions, take_rate_pct: tr, consult_to_travel_pct: cv };
        const testD = derive(testA);
        const broken = BREAKPOINTS.cac_exceeds_revenue(testA) || BREAKPOINTS.conversion_below_15(testA);
        const td = h('td', { class: 'num', text: `$${testD.netMarginPerCase.toFixed(0)}` });
        if (broken) td.style.cssText = 'color:var(--rose); font-weight:600;';
        else if (testD.netMarginPerCase > 0) td.style.color = 'var(--sage-deep)';
        row.appendChild(td);
      });
      tBody.appendChild(row);
    });
    table.appendChild(tBody);

    const tw = h('div', { class: 'table-wrap' });
    tw.appendChild(table);
    sens.appendChild(tw);
  }

  renderOutputs();
}

registerRoute('economics', 'Unit economics', renderEconomics);

// --- Alternate Models ---
function renderAltModels(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'Alternate revenue models' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'Side-by-side comparison of three alternative models beyond patient-pays.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  const models = [
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

  const grid = h('div', { class: 'grid md:grid-cols-3 gap-4' });
  models.forEach(m => {
    const card = h('div', { class: 'card p-5' });
    card.appendChild(h('div', { class: 'serif text-lg mb-3', text: m.name }));

    const items = [
      ['How it works', m.how],
      ['Revenue', m.revenue],
      ['Who pays', m.who_pays],
      ['Pros', m.pros],
      ['Cons', m.cons],
    ];
    items.forEach(([label, val]) => {
      const lbl = h('div', { class: 'micro mt-3 mb-1', text: label });
      lbl.style.color = 'var(--ink-mute)';
      card.appendChild(lbl);
      card.appendChild(h('div', { class: 'text-sm', text: val }));
    });
    grid.appendChild(card);
  });
  page.appendChild(grid);
}

registerRoute('alt-models', 'Alternate models', renderAltModels);

// --- Field Check Log ---
function renderFieldChecks(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'Field-check log' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'Track which fragile assumptions have been confirmed in the field.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  page.appendChild(h('div', { class: 'mb-4' }, [
    h('button', { class: 'btn btn-primary', onclick: () => openFieldCheckForm() }, '+ Add assumption')
  ]));

  const card = h('div', { class: 'card' });

  if (!STATE.fieldChecks || STATE.fieldChecks.length === 0) {
    const empty = h('div', { class: 'p-8 text-center' });
    empty.style.color = 'var(--ink-mute)';
    empty.textContent = 'No field checks logged yet. Add fragile assumptions that need in-person verification.';
    card.appendChild(empty);
  } else {
    const table = h('table', { class: 'data' });
    const thead = h('thead');
    thead.innerHTML = '<tr><th>Assumption</th><th>Status</th><th>Confirmed by</th><th>Date</th><th>Notes</th></tr>';
    table.appendChild(thead);
    const tbody = h('tbody');
    STATE.fieldChecks.forEach(r => {
      const f = r.fields || r;
      const statusChip = f.confirmed
        ? h('span', { class: 'chip chip-sage', text: 'Confirmed' })
        : h('span', { class: 'chip chip-honey', text: 'Unconfirmed' });
      const statusTd = h('td');
      statusTd.appendChild(statusChip);
      tbody.appendChild(h('tr', { class: 'h-row' }, [
        h('td', { class: 'font-medium', text: f.assumption || '' }),
        statusTd,
        h('td', { text: f.confirmed_by || '—' }),
        h('td', { class: 'num', text: f.confirmed_date || '—' }),
        h('td', { text: f.notes || '—' }),
      ]));
    });
    table.appendChild(tbody);
    const tw = h('div', { class: 'table-wrap' });
    tw.appendChild(table);
    card.appendChild(tw);
  }
  page.appendChild(card);
}

function openFieldCheckForm() {
  openModal('Add field check', [
    formField('Assumption', 'assumption', 'textarea', ''),
    formField('Confirmed?', 'confirmed', 'select', 'false', ['false', 'true']),
    formField('Confirmed by', 'confirmed_by', 'input', ''),
    formField('Date', 'confirmed_date', 'input', '', null, 'date'),
    formField('Notes', 'notes', 'textarea', ''),
  ], async (data) => {
    data.confirmed = data.confirmed === 'true';
    try {
      const created = await api('/api/field_checks', { method: 'POST', body: JSON.stringify(data) });
      if (!STATE.fieldChecks) STATE.fieldChecks = [];
      STATE.fieldChecks.unshift(created);
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('field-checks', 'Field checks', renderFieldChecks);
