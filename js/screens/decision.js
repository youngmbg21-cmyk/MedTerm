import { STATE, h, esc, api, openModal, closeModal, formField, renderCurrentRoute, registerRoute } from '../app.js';

// --- Decision Memo Composer ---
const MEMO_SECTIONS = [
  { key: 'wedge_tested', label: 'Wedge tested', placeholder: 'Which wedge was tested and why it was chosen.' },
  { key: 'what_we_learned', label: 'What we learned', placeholder: 'Key findings from the research — themes, patterns, surprises.' },
  { key: 'economic_picture', label: 'Economic picture', placeholder: 'Unit economics, break-points, model viability.' },
  { key: 'decision', label: 'Decision', placeholder: 'GO / PIVOT / NO-GO and the reasoning.' },
  { key: 'mvp_scope', label: 'MVP scope (if GO)', placeholder: 'One segment, one pain, one workflow, one revenue model, one channel, one success metric.' },
  { key: 'pivot_scope', label: 'Pivot scope (if PIVOT)', placeholder: 'What changes, what stays, what the next test looks like.' },
  { key: 'public_learnings', label: 'Public learnings (if NO-GO)', placeholder: 'What we would share publicly about what we learned.' },
];

function renderDecisionMemo(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'Decision memo' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'The most important document this project produces. Seven sections. Co-signed by the team.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  const memo = STATE.decisionMemo;
  const content = memo?.content || {};

  const card = h('div', { class: 'card max-w-3xl' });

  MEMO_SECTIONS.forEach(s => {
    const section = h('div', { class: 'px-6 py-5 border-b', style: 'border-color:var(--line-soft);' });

    const header = h('div', { class: 'flex items-baseline justify-between mb-2' }, [
      h('div', { class: 'micro', text: s.label }),
    ]);
    header.querySelector('.micro').style.color = 'var(--clay)';
    section.appendChild(header);

    if (content[s.key]) {
      section.appendChild(h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: content[s.key] }));
      section.appendChild(h('div', { class: 'mt-2' }, [
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => editMemoSection(s.key, s.label, content[s.key]) }, 'Edit')
      ]));
    } else {
      const empty = h('div', { class: 'text-sm', text: s.placeholder });
      empty.style.color = 'var(--ink-mute)';
      section.appendChild(empty);
      section.appendChild(h('div', { class: 'mt-2' }, [
        h('button', { class: 'btn btn-line text-xs', onclick: () => editMemoSection(s.key, s.label, '') }, 'Write this section')
      ]));
    }

    card.appendChild(section);
  });

  // Co-signature
  const sigSection = h('div', { class: 'px-6 py-5' });
  const sigLabel = h('div', { class: 'micro mb-3', text: 'Co-signatures' });
  sigLabel.style.color = 'var(--ink-mute)';
  sigSection.appendChild(sigLabel);

  if (memo?.co_signed_at) {
    sigSection.appendChild(h('div', { class: 'chip chip-sage', text: `Co-signed ${memo.co_signed_at}` }));
  } else {
    sigSection.appendChild(h('div', { class: 'text-sm mb-2', text: 'Not yet co-signed. Both team members must sign to finalise.' }));
    sigSection.appendChild(h('button', { class: 'btn btn-primary', onclick: async () => {
      try {
        const now = new Date().toISOString().slice(0, 10);
        if (memo?.id) {
          await api(`/api/decision_memos/${memo.id}`, { method: 'PATCH', body: JSON.stringify({ co_signed_at: now }) });
          STATE.decisionMemo = { ...memo, co_signed_at: now };
        }
        renderCurrentRoute();
      } catch (e) { alert('Sign failed: ' + e.message); }
    } }, 'Sign this memo'));
  }
  card.appendChild(sigSection);

  page.appendChild(card);
}

function editMemoSection(key, label, currentValue) {
  openModal(`Edit: ${label}`, [
    formField(label, key, 'textarea', currentValue),
  ], async (data) => {
    const content = { ...(STATE.decisionMemo?.content || {}), [key]: data[key] };
    try {
      if (STATE.decisionMemo?.id) {
        await api(`/api/decision_memos/${STATE.decisionMemo.id}`, { method: 'PATCH', body: JSON.stringify({ content }) });
        STATE.decisionMemo.content = content;
      } else {
        const created = await api('/api/decision_memos', { method: 'POST', body: JSON.stringify({ version: 1, content }) });
        STATE.decisionMemo = created;
      }
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('decision-memo', 'Decision memo', renderDecisionMemo);

// --- MVP Scope Composer ---
function renderMVPScope(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'MVP scope' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'If GO: define the narrowest viable product.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  const fields = [
    { key: 'segment', label: 'One segment', placeholder: 'e.g. Diaspora family with parent needing cardiac care' },
    { key: 'pain', label: 'One pain', placeholder: 'e.g. Cannot get a trustworthy hospital quote without a broker' },
    { key: 'workflow', label: 'One workflow', placeholder: 'e.g. Upload medical report → get matched quotes from 3 hospitals → book consultation' },
    { key: 'revenue_model', label: 'One revenue model', placeholder: 'e.g. Hospital referral fee: $300 per converted case' },
    { key: 'channel', label: 'One channel', placeholder: 'e.g. Facebook diaspora groups + WhatsApp' },
    { key: 'success_metric', label: 'One success metric', placeholder: 'e.g. 5 completed cases in first 3 months' },
  ];

  const scope = STATE.mvpScope || {};
  const card = h('div', { class: 'card p-6 max-w-3xl' });

  fields.forEach(f => {
    const section = h('div', { class: 'mb-5' });
    const label = h('div', { class: 'micro mb-1', text: f.label });
    label.style.color = 'var(--clay)';
    section.appendChild(label);

    if (scope[f.key]) {
      section.appendChild(h('div', { class: 'text-sm', text: scope[f.key] }));
    } else {
      const empty = h('div', { class: 'text-sm', text: f.placeholder });
      empty.style.color = 'var(--ink-mute)';
      section.appendChild(empty);
    }
    card.appendChild(section);
  });

  card.appendChild(h('button', { class: 'btn btn-line', onclick: () => {
    openModal('Edit MVP scope', fields.map(f =>
      formField(f.label, f.key, 'textarea', scope[f.key] || '')
    ), async (data) => {
      try {
        STATE.mvpScope = data;
        await api('/api/deliverables', { method: 'POST', body: JSON.stringify({ phase: 5, deliverable: 'MVP scope', status: 'In progress', evidence: JSON.stringify(data) }) });
        closeModal();
        renderCurrentRoute();
      } catch (e) { alert('Save failed: ' + e.message); }
    });
  } }, 'Edit scope'));

  page.appendChild(card);
}

registerRoute('mvp-scope', 'MVP scope', renderMVPScope);

// --- Confirmatory Tests ---
function renderConfirmatoryTests(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'Confirmatory tests' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'Two tests to validate the decision before committing fully.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  const tests = [
    {
      name: 'Digital test: paid mock landing page',
      description: 'Run a paid ad to a landing page describing the service. Measure click-through and sign-up intent.',
      metrics: ['Ad spend', 'Impressions', 'Clicks', 'Landing page sign-ups', 'Cost per sign-up'],
      stateKey: 'digitalTest',
    },
    {
      name: 'On-ground test: free service for 2–3 caregivers',
      description: 'Offer the full service for free to 2–3 caregivers found through interviews. Measure whether they complete the journey and would pay.',
      metrics: ['Caregivers recruited', 'Cases started', 'Cases completed', 'Would-pay signal'],
      stateKey: 'groundTest',
    },
  ];

  tests.forEach(test => {
    const card = h('div', { class: 'card p-6 mb-4 max-w-3xl' });
    card.appendChild(h('div', { class: 'serif text-lg mb-2', text: test.name }));
    card.appendChild(h('div', { class: 'text-sm mb-4', text: test.description }));

    const metricsLabel = h('div', { class: 'micro mb-2', text: 'Metrics to track' });
    metricsLabel.style.color = 'var(--ink-mute)';
    card.appendChild(metricsLabel);

    const data = STATE[test.stateKey] || {};
    test.metrics.forEach(m => {
      const row = h('div', { class: 'flex items-center justify-between py-2 border-b text-sm', style: 'border-color:var(--line-soft);' }, [
        h('span', { text: m }),
        h('span', { class: 'num', text: data[m] || '—' }),
      ]);
      card.appendChild(row);
    });

    card.appendChild(h('div', { class: 'mt-3' }, [
      h('button', { class: 'btn btn-line text-xs', onclick: () => {
        openModal(`Update: ${test.name}`, test.metrics.map(m =>
          formField(m, m, 'input', data[m] || '')
        ), async (formData) => {
          STATE[test.stateKey] = formData;
          try {
            await api('/api/deliverables', { method: 'POST', body: JSON.stringify({ phase: 5, deliverable: test.name, status: 'In progress', evidence: JSON.stringify(formData) }) });
          } catch (e) { /* best-effort save */ }
          closeModal();
          renderCurrentRoute();
        });
      } }, 'Update metrics')
    ]));

    page.appendChild(card);
  });
}

registerRoute('confirmatory-tests', 'Confirmatory tests', renderConfirmatoryTests);
