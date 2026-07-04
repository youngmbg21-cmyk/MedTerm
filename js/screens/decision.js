/* Phase 5 — Decision screens. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  openModal, closeModal, formField, fmtDate,
} from '../app.js';
import { getTeam } from '../config.js';
import { data } from '../data.js';

/* ---------- Decision memo — "GO, PIVOT, or NO-GO — and on what evidence?" ---------- */
const VERDICTS = ['Undecided', 'GO', 'PIVOT', 'NO-GO'];
const VERDICT_TONE = { GO: 'sage', PIVOT: 'honey', 'NO-GO': 'rose', Undecided: 'line' };

const MEMO_SECTIONS = [
  { key: 'wedge_tested', label: 'Wedge tested', placeholder: 'Which wedge was tested and why it was chosen.' },
  { key: 'what_we_learned', label: 'What we learned', placeholder: 'Key findings from the research — themes, patterns, surprises.' },
  { key: 'economic_picture', label: 'Economic picture', placeholder: 'Unit economics, break-points, model viability.' },
  { key: 'decision', label: 'Decision reasoning', placeholder: 'Why the verdict above is the right call on today\'s evidence.' },
  { key: 'mvp_scope', label: 'MVP scope (if GO)', placeholder: 'One segment, one pain, one workflow, one revenue model, one channel, one success metric.' },
  { key: 'pivot_scope', label: 'Pivot scope (if PIVOT)', placeholder: 'What changes, what stays, what the next test looks like.' },
  { key: 'public_learnings', label: 'Public learnings (if NO-GO)', placeholder: 'What we would share publicly about what we learned.' },
];

function getMemo() { return STATE.decision_memos[0] || null; }

async function saveMemo(patch) {
  const memo = getMemo();
  if (memo) await data.update('decision_memos', memo.id, patch);
  else await data.create('decision_memos', { version: 1, content: {}, ...patch });
  STATE.decision_memos = await data.list('decision_memos');
  renderCurrentRoute();
}

function renderDecisionMemo(page) {
  const memo = getMemo();
  const content = memo?.content || {};
  const verdict = content.verdict || 'Undecided';

  /* Verdict first — the reader should know the answer before the argument */
  const verdictCard = h('div', { class: 'card p-6 mb-4 max-w-3xl' });
  verdictCard.appendChild(h('div', { class: 'micro mb-2', style: 'color:var(--ink-mute);', text: 'Verdict' }));
  const verdictRow = h('div', { class: 'flex flex-wrap items-center gap-2' });
  VERDICTS.forEach(v => {
    const isActive = v === verdict;
    const btn = h('button', {
      class: `btn ${isActive ? 'btn-primary' : 'btn-line'}`,
      onclick: async () => {
        try { await saveMemo({ content: { ...content, verdict: v } }); }
        catch (e) { alert('Save failed: ' + e.message); }
      },
    }, v);
    verdictRow.appendChild(btn);
  });
  verdictCard.appendChild(verdictRow);
  if (verdict !== 'Undecided') {
    verdictCard.appendChild(h('div', { class: 'mt-3' }, [chip(`Current verdict: ${verdict}`, VERDICT_TONE[verdict])]));
  }
  page.appendChild(verdictCard);

  /* Seven sections */
  const card = h('div', { class: 'card max-w-3xl' });
  MEMO_SECTIONS.forEach(s => {
    const section = h('div', { class: 'px-6 py-5 border-b', style: 'border-color:var(--line-soft);' });
    section.appendChild(h('div', { class: 'micro mb-2', style: 'color:var(--clay);', text: s.label }));
    if (content[s.key]) {
      section.appendChild(h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: content[s.key] }));
      section.appendChild(h('div', { class: 'mt-2' }, [
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => editMemoSection(s, content) }, 'Edit'),
      ]));
    } else {
      section.appendChild(h('div', { class: 'text-sm', style: 'color:var(--ink-mute);', text: s.placeholder }));
      section.appendChild(h('div', { class: 'mt-2' }, [
        h('button', { class: 'btn btn-line text-xs', onclick: () => editMemoSection(s, content) }, 'Write this section'),
      ]));
    }
    card.appendChild(section);
  });

  /* Co-sign block */
  const team = getTeam();
  const sig = h('div', { class: 'px-6 py-5' });
  sig.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--ink-mute);', text: 'Co-signatures' }));
  if (memo?.co_signed_at) {
    sig.appendChild(chip(`Co-signed by ${team.lead} & ${team.field} · ${fmtDate(memo.co_signed_at)}`, 'sage'));
  } else {
    sig.appendChild(h('div', { class: 'text-sm mb-3', style: 'color:var(--ink-soft);', text: `Not yet co-signed. ${team.lead} and ${team.field} must both agree to finalise.` }));
    sig.appendChild(h('button', { class: 'btn btn-primary', onclick: async () => {
      if (!memo) { alert('Write the memo before signing it.'); return; }
      if (verdict === 'Undecided') { alert('Pick a verdict before signing.'); return; }
      if (!confirm(`Sign this memo as final? Verdict: ${verdict}.`)) return;
      try { await saveMemo({ co_signed_at: new Date().toISOString().slice(0, 10) }); }
      catch (e) { alert('Sign failed: ' + e.message); }
    } }, 'Sign this memo'));
  }
  card.appendChild(sig);
  page.appendChild(card);
}

function editMemoSection(section, content) {
  openModal(`Edit: ${section.label}`, [
    formField(section.label, section.key, 'textarea', content[section.key] || ''),
  ], async (form) => {
    try {
      await saveMemo({ content: { ...content, [section.key]: form[section.key] } });
      closeModal();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('decision-memo', 'Decision memo', renderDecisionMemo,
  'GO, PIVOT, or NO-GO — and on what evidence?');

/* ---------- MVP scope — "If GO: what is the narrowest thing we build?" ---------- */
const SCOPE_FIELDS = [
  { key: 'segment', label: 'One segment', placeholder: 'e.g. Diaspora family with parent needing cardiac care' },
  { key: 'pain', label: 'One pain', placeholder: 'e.g. Cannot get a trustworthy hospital quote without a broker' },
  { key: 'workflow', label: 'One workflow', placeholder: 'e.g. Upload medical report → matched quotes from 3 hospitals → book consultation' },
  { key: 'revenue_model', label: 'One revenue model', placeholder: 'e.g. Hospital referral fee: $300 per converted case' },
  { key: 'channel', label: 'One channel', placeholder: 'e.g. Facebook diaspora groups + WhatsApp' },
  { key: 'success_metric', label: 'One success metric', placeholder: 'e.g. 5 completed cases in first 3 months' },
];

function findScopeDeliverable() {
  return STATE.deliverables.find(d => d.phase === 5 && d.deliverable === 'If GO: MVP scope defined ("one of each")');
}

function parseScope(record) {
  try { return JSON.parse(record?.evidence || '{}'); } catch { return {}; }
}

function renderMVPScope(page) {
  const record = findScopeDeliverable();
  const scope = parseScope(record);
  const card = h('div', { class: 'card p-6 max-w-3xl' });

  SCOPE_FIELDS.forEach(f => {
    const section = h('div', { class: 'mb-5' });
    section.appendChild(h('div', { class: 'micro mb-1', style: 'color:var(--clay);', text: f.label }));
    if (scope[f.key]) {
      section.appendChild(h('div', { class: 'text-sm', text: scope[f.key] }));
    } else {
      section.appendChild(h('div', { class: 'text-sm', style: 'color:var(--ink-mute);', text: f.placeholder }));
    }
    card.appendChild(section);
  });

  card.appendChild(h('button', { class: 'btn btn-line', onclick: () => {
    openModal('Edit MVP scope', SCOPE_FIELDS.map(f => formField(f.label, f.key, 'textarea', scope[f.key] || '')),
      async (form) => {
        try {
          const evidence = JSON.stringify(form);
          if (record) await data.update('deliverables', record.id, { evidence, status: 'In progress' });
          else await data.create('deliverables', { phase: 5, deliverable: 'If GO: MVP scope defined ("one of each")', status: 'In progress', evidence });
          STATE.deliverables = await data.list('deliverables');
          closeModal();
          renderCurrentRoute();
        } catch (e) { alert('Save failed: ' + e.message); }
      });
  } }, 'Edit scope'));

  page.appendChild(card);
}

registerRoute('mvp-scope', 'MVP scope', renderMVPScope,
  'If GO: what is the narrowest thing we build first?');

/* ---------- Confirmatory tests — "Does reality agree with the decision?" ---------- */
const TESTS = [
  {
    name: 'Digital test: paid mock landing page',
    description: 'Run a paid ad to a landing page describing the service. Measure click-through and sign-up intent.',
    metrics: ['Ad spend', 'Impressions', 'Clicks', 'Landing page sign-ups', 'Cost per sign-up'],
    deliverableKey: 'Confirmatory test: digital',
  },
  {
    name: 'On-ground test: free service for 2–3 caregivers',
    description: 'Offer the full service for free to 2–3 caregivers found through interviews. Measure whether they complete the journey and would pay.',
    metrics: ['Caregivers recruited', 'Cases started', 'Cases completed', 'Would-pay signal'],
    deliverableKey: 'Confirmatory test: on-ground',
  },
];

function renderConfirmatoryTests(page) {
  TESTS.forEach(test => {
    const record = STATE.deliverables.find(d => d.phase === 5 && d.deliverable === test.deliverableKey);
    let values = {};
    try { values = JSON.parse(record?.evidence || '{}'); } catch { values = {}; }

    const card = h('div', { class: 'card p-6 mb-4 max-w-3xl' });
    card.appendChild(h('div', { class: 'serif text-lg mb-2', text: test.name }));
    card.appendChild(h('div', { class: 'text-sm mb-4', style: 'color:var(--ink-soft);', text: test.description }));
    card.appendChild(h('div', { class: 'micro mb-2', style: 'color:var(--ink-mute);', text: 'Metrics' }));

    test.metrics.forEach(m => {
      card.appendChild(h('div', { class: 'flex items-center justify-between py-2 border-b text-sm', style: 'border-color:var(--line-soft);' }, [
        h('span', { text: m }),
        h('span', { class: 'num', text: values[m] || '—' }),
      ]));
    });

    card.appendChild(h('div', { class: 'mt-4' }, [
      h('button', { class: 'btn btn-line text-xs', onclick: () => {
        openModal(`Update: ${test.name}`, test.metrics.map(m => formField(m, m, 'input', values[m] || '')),
          async (form) => {
            try {
              const evidence = JSON.stringify(form);
              if (record) await data.update('deliverables', record.id, { evidence, status: 'In progress' });
              else await data.create('deliverables', { phase: 5, deliverable: test.deliverableKey, status: 'In progress', evidence });
              STATE.deliverables = await data.list('deliverables');
              closeModal();
              renderCurrentRoute();
            } catch (e) { alert('Save failed: ' + e.message); }
          });
      } }, 'Update metrics'),
    ]));

    page.appendChild(card);
  });
}

registerRoute('confirmatory-tests', 'Confirmatory tests', renderConfirmatoryTests,
  'Does reality agree with the decision we made?');
