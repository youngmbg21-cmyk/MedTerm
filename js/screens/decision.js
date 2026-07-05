/* Phase 5 — Decision screens. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  openModal, closeModal, formField, fmtDate, go,
} from '../app.js';
import { getTeam, CURRENT_PHASE, SEGMENTS } from '../config.js';
import { data, aiAvailable, draftSectionRequest, aiDataSlices } from '../data.js';
import { latestAssessment, LEANING_TONE } from '../evidence.js';

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

/* The agreed human verdict: both seats must pick the same non-Undecided
   answer. Stored back into content.verdict so reports and the Decision
   Brief's divergence panel read one canonical field. */
function agreedVerdict(content) {
  const a = content.verdict_lead || 'Undecided';
  const b = content.verdict_field || 'Undecided';
  return a !== 'Undecided' && a === b ? a : 'Undecided';
}

function renderDecisionMemo(page) {
  const memo = getMemo();
  const content = memo?.content || {};
  const team = getTeam();
  const latest = latestAssessment();
  const agreed = agreedVerdict(content);
  /* Overriding the AI is allowed — but it must be written down. */
  const divergent = agreed !== 'Undecided' && !!latest && agreed !== latest.leaning;

  async function pickVerdict(key, v) {
    const next = { ...content, [key]: v };
    next.verdict = agreedVerdict(next);
    try { await saveMemo({ content: next }); }
    catch (e) { alert('Save failed: ' + e.message); }
  }

  function humanSeat(name, roleLabel, key) {
    const current = content[key] || 'Undecided';
    const seat = h('div', {}, [
      h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: `${name} · ${roleLabel}` }),
    ]);
    const row = h('div', { class: 'flex flex-wrap gap-1.5' });
    VERDICTS.forEach(v => {
      row.appendChild(h('button', {
        class: `btn text-xs ${v === current ? 'btn-primary' : 'btn-line'}`,
        style: 'padding:5px 10px;',
        onclick: () => pickVerdict(key, v),
      }, v));
    });
    seat.appendChild(row);
    return seat;
  }

  /* Verdict first — three seats at the table */
  const verdictCard = h('div', { class: 'card p-6 mb-4 max-w-3xl' });
  verdictCard.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--ink-mute);', text: 'Verdict — three seats at the table. Humans decide; the AI argues.' }));

  const aiSeat = h('div', {}, [
    h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'AI assessment · advisory' }),
    latest
      ? h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        chip(latest.leaning, LEANING_TONE[latest.leaning] || 'line'),
        h('span', { class: 'text-xs', style: 'color:var(--ink-mute);', text: fmtDate(latest.created_at) }),
      ])
      : h('div', { class: 'text-xs', style: 'color:var(--ink-mute);', text: 'No assessment yet.' }),
    h('button', { class: 'btn btn-ghost text-xs mt-1', style: 'padding-left:0;', onclick: () => go('decision-brief') }, 'Open Decision Brief →'),
  ]);

  verdictCard.appendChild(h('div', { class: 'grid sm:grid-cols-3 gap-4' }, [
    humanSeat(team.lead, 'lead', 'verdict_lead'),
    humanSeat(team.field, 'field', 'verdict_field'),
    aiSeat,
  ]));

  const leadV = content.verdict_lead || 'Undecided';
  const fieldV = content.verdict_field || 'Undecided';
  if (agreed !== 'Undecided') {
    verdictCard.appendChild(h('div', { class: 'mt-4' }, [chip(`Agreed verdict: ${agreed}`, VERDICT_TONE[agreed])]));
  } else if (leadV !== 'Undecided' && fieldV !== 'Undecided' && leadV !== fieldV) {
    verdictCard.appendChild(h('div', { class: 'banner banner-honey mt-4' }, [
      h('span', { text: `The seats disagree (${team.lead}: ${leadV} · ${team.field}: ${fieldV}). Co-signing needs one shared verdict — talk it through.` }),
    ]));
  }

  /* Override rationale — a record, not a block. Required before signing. */
  if (divergent) {
    const ta = h('textarea', { class: 'textarea', rows: '3', placeholder: 'The assessment leans ' + latest.leaning + '; we decided ' + agreed + ' because…' });
    ta.value = content.override_rationale || '';
    const saveBtn = h('button', { class: 'btn btn-line text-xs mt-2', onclick: async () => {
      try { await saveMemo({ content: { ...content, override_rationale: ta.value.trim() } }); }
      catch (e) { alert('Save failed: ' + e.message); }
    } }, 'Save rationale');
    verdictCard.appendChild(h('div', { class: 'mt-4 pt-4 border-t', style: 'border-color:var(--line-soft);' }, [
      h('div', { class: 'micro mb-1', style: 'color:var(--honey-deep);', text: `Why we're overriding the assessment (AI leans ${latest.leaning}) — required` }),
      ta, saveBtn,
    ]));
  }
  page.appendChild(verdictCard);

  /* Seven sections */
  const card = h('div', { class: 'card max-w-3xl' });
  MEMO_SECTIONS.forEach(s => {
    const section = h('div', { class: 'px-6 py-5 border-b', style: 'border-color:var(--line-soft);' });
    section.appendChild(h('div', { class: 'micro mb-2', style: 'color:var(--clay);', text: s.label }));
    const buttons = h('div', { class: 'mt-2 flex flex-wrap gap-2' });
    if (content[s.key]) {
      section.appendChild(h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: content[s.key] }));
      buttons.appendChild(h('button', { class: 'btn btn-ghost text-xs', onclick: () => editMemoSection(s, content) }, 'Edit'));
    } else {
      section.appendChild(h('div', { class: 'text-sm', style: 'color:var(--ink-mute);', text: s.placeholder }));
      buttons.appendChild(h('button', { class: 'btn btn-line text-xs', onclick: () => editMemoSection(s, content) }, 'Write this section'));
    }
    if (aiAvailable) {
      const draftBtn = h('button', { class: 'btn btn-ghost text-xs', onclick: () => draftMemoSection(s, content, draftBtn) }, 'Draft from evidence');
      buttons.appendChild(draftBtn);
    }
    section.appendChild(buttons);
    card.appendChild(section);
  });

  /* Co-sign block — opens only when both human seats match. Signing
     snapshots the assessment the AI held at decision time. */
  const sig = h('div', { class: 'px-6 py-5' });
  sig.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--ink-mute);', text: 'Co-signatures' }));
  if (memo?.co_signed_at) {
    sig.appendChild(h('div', { class: 'flex flex-wrap items-center gap-2' }, [
      chip(`Co-signed by ${team.lead} & ${team.field} · ${fmtDate(memo.co_signed_at)}`, 'sage'),
      content.signed_leaning
        ? chip(`AI leaning at signing: ${content.signed_leaning}`, LEANING_TONE[content.signed_leaning] || 'line')
        : null,
    ].filter(Boolean)));
  } else {
    const ready = agreed !== 'Undecided';
    sig.appendChild(h('div', { class: 'text-sm mb-3', style: 'color:var(--ink-soft);', text: ready
      ? `Both seats agree on ${agreed}. Signing finalises the memo and records what the AI said at decision time.`
      : `Not yet co-signed. ${team.lead} and ${team.field} must each pick the same verdict above to enable signing.` }));
    const signBtn = h('button', { class: `btn ${ready ? 'btn-primary' : 'btn-line'}`, onclick: async () => {
      if (!memo) { alert('Write the memo before signing it.'); return; }
      if (agreed === 'Undecided') { alert('Both seats must pick the same verdict before signing.'); return; }
      if (divergent && !(content.override_rationale || '').trim()) {
        alert(`The verdict (${agreed}) differs from the AI leaning (${latest.leaning}). Write the override rationale first — divergence is allowed, but it must be written down.`);
        return;
      }
      if (!confirm(`Sign this memo as final? Verdict: ${agreed}.${latest ? ` AI leaning at signing: ${latest.leaning}.` : ''}`)) return;
      try {
        await saveMemo({
          co_signed_at: new Date().toISOString().slice(0, 10),
          content: {
            ...content,
            verdict: agreed,
            signed_assessment_id: latest?.id || null,
            signed_leaning: latest?.leaning || null,
          },
        });
      } catch (e) { alert('Sign failed: ' + e.message); }
    } }, 'Sign this memo');
    if (!ready) signBtn.disabled = true;
    sig.appendChild(signBtn);
  }
  card.appendChild(sig);
  page.appendChild(card);
}

function editMemoSection(section, content, draftText) {
  const isDraft = draftText != null;
  openModal(isDraft ? `AI draft: ${section.label} — edit before saving` : `Edit: ${section.label}`, [
    formField(section.label, section.key, 'textarea', isDraft ? draftText : (content[section.key] || '')),
  ], async (form) => {
    try {
      await saveMemo({ content: { ...content, [section.key]: form[section.key] } });
      closeModal();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

/* Draft one section from the evidence ledger. The draft lands in the edit
   modal pre-filled — the human edits and saves. Never auto-saved. */
async function draftMemoSection(section, content, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Drafting…';
  try {
    const { text } = await draftSectionRequest({
      section_key: section.key,
      section_label: section.label,
      placeholder: section.placeholder,
      phase: CURRENT_PHASE,
      segments: SEGMENTS,
      localData: aiDataSlices(STATE),
    });
    editMemoSection(section, content, text || '');
  } catch (e) {
    alert('Draft failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
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
