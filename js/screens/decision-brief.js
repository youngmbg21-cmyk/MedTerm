/* Decision Brief — the judgment center.
   One question: "If we had to decide today, what would we do — and on what evidence?"
   The AI argues; it never decides. The latest assessment is advisory;
   the humans hold the verdict on the Decision memo screen. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, quoteBlock, fmtDate,
} from '../app.js';
import { aiAvailable } from '../data.js';
import {
  LEANING_TONE, HYP_STATUS_TONE, DIRECTION_ARROW,
  buyerHypotheses, killCriteria, latestAssessment, assessmentsOldestFirst,
  linksFor, topQuotesFor, renderMarkdown, runAssessment,
} from '../evidence.js';

function muteText(text, cls = 'text-xs') {
  return h('div', { class: cls, style: 'color:var(--ink-mute);', text });
}

/* ---------- 1 · Leaning card ---------- */
function regenControl() {
  if (!aiAvailable) {
    return h('div', { class: 'flex flex-wrap items-center gap-3 mt-4' }, [
      h('button', { class: 'btn btn-line', disabled: '' }, 'Regenerate brief'),
      muteText('Connect the assistant (AI_MODE = \'worker\' in js/config.js) to generate a fresh brief.'),
    ]);
  }
  const btn = h('button', { class: 'btn btn-primary', onclick: async () => {
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
      await runAssessment('manual');
      renderCurrentRoute();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Regenerate brief';
      alert('Assessment failed: ' + e.message);
    }
  } }, 'Regenerate brief');
  return h('div', { class: 'flex flex-wrap items-center gap-3 mt-4' }, [
    btn,
    muteText('Appends a new assessment — the trajectory below is never rewritten.'),
  ]);
}

function leaningCard(latest) {
  const card = h('div', { class: 'card p-6 mb-5' });
  if (!latest) {
    card.appendChild(h('div', { class: 'micro mb-2', style: 'color:var(--ink-mute);', text: 'Current leaning' }));
    card.appendChild(h('span', { class: 'chip chip-line', style: 'font-size:14px; padding:8px 16px;', text: 'INSUFFICIENT' }));
    card.appendChild(h('div', { class: 'text-sm mt-3', style: 'color:var(--ink-soft);', text: 'No assessment has been generated yet. Early in the programme, the honest answer is INSUFFICIENT — showing that plainly is the point of this screen.' }));
    card.appendChild(regenControl());
    return card;
  }
  card.appendChild(h('div', { class: 'flex flex-wrap items-start justify-between gap-3 mb-3' }, [
    h('div', {}, [
      h('div', { class: 'micro mb-2', style: 'color:var(--ink-mute);', text: 'Current leaning — advisory, not a verdict' }),
      h('span', { class: `chip chip-${LEANING_TONE[latest.leaning] || 'line'}`, style: 'font-size:15px; padding:8px 18px;', text: latest.leaning }),
    ]),
    muteText(`${fmtDate(latest.created_at)} · trigger: ${latest.trigger} · phase ${latest.phase} · ${latest.model || ''}`),
  ]));
  card.appendChild(renderMarkdown(latest.summary_markdown));
  const snap = latest.data_snapshot || {};
  card.appendChild(h('div', { class: 'mt-4 pt-3 border-t text-xs', style: 'border-color:var(--line-soft); color:var(--ink-mute);',
    text: `Based on ${snap.interviews ?? '?'} interviews · ${snap.matrix_entries ?? '?'} matrix entries · ${snap.evidence_links ?? '?'} evidence links · ${snap.field_checks ?? '?'} field checks` }));
  card.appendChild(regenControl());
  return card;
}

/* ---------- 2 · Hypothesis board ---------- */
function hypothesisCard(hyp, latest) {
  const assessed = (latest?.per_hypothesis || []).find(p => p.hypothesis_code === hyp.code);
  const links = linksFor(hyp.id);
  const sup = links.filter(l => l.direction === 'supports').length;
  const con = links.filter(l => l.direction === 'contradicts').length;

  const card = h('div', { class: 'card p-5' });
  card.appendChild(h('div', { class: 'flex items-start justify-between gap-2 mb-1' }, [
    h('div', { class: 'serif text-lg', text: `${hyp.code} · ${hyp.title}` }),
    chip(hyp.status, HYP_STATUS_TONE[hyp.status] || 'line'),
  ]));
  card.appendChild(h('div', { class: 'text-xs mb-3', style: 'color:var(--ink-soft);', text: hyp.description || '' }));

  const assessRow = h('div', { class: 'flex flex-wrap items-center gap-2 mb-3' });
  if (assessed) {
    assessRow.appendChild(chip(`${DIRECTION_ARROW[assessed.direction] || '→'} ${assessed.direction}`,
      assessed.direction === 'strengthening' ? 'sage' : assessed.direction === 'weakening' ? 'honey' : 'line'));
    assessRow.appendChild(chip(`evidence: ${assessed.strength}`, assessed.strength === 'strong' ? 'sage' : assessed.strength === 'moderate' ? 'honey' : 'line'));
  } else {
    assessRow.appendChild(chip('not yet assessed', 'line'));
  }
  assessRow.appendChild(h('span', { class: 'text-xs num', style: 'color:var(--ink-mute);', text: `${sup} supporting · ${con} contradicting` }));
  card.appendChild(assessRow);

  const quotes = topQuotesFor(hyp.id, 2);
  if (quotes.length) {
    const qWrap = h('div', { class: 'mb-3 -mx-2' });
    quotes.forEach(q => qWrap.appendChild(quoteBlock(q)));
    card.appendChild(qWrap);
  } else {
    card.appendChild(h('div', { class: 'text-xs mb-3', style: 'color:var(--ink-mute);', text: 'No linked quotes yet — link matrix evidence to this hypothesis.' }));
  }

  if (assessed?.gaps) {
    card.appendChild(h('div', { class: 'mb-3' }, [
      h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Gaps' }),
      h('div', { class: 'text-sm', text: assessed.gaps }),
    ]));
  }
  const flip = assessed?.what_would_change || hyp.status_note;
  if (flip) {
    card.appendChild(h('div', { class: 'banner banner-info', style: 'align-items:flex-start; flex-direction:column; gap:4px;' }, [
      h('span', { class: 'micro', text: assessed?.what_would_change ? 'What would change this' : 'Status note' }),
      h('span', { style: 'font-weight:400;', text: flip }),
    ]));
  }
  return card;
}

/* ---------- Kill-criteria strip ---------- */
function killStrip(latest) {
  const card = h('div', { class: 'card p-5 mb-5' });
  card.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--ink-mute);', text: 'Kill criteria — any breach kills the patient-pays model' }));
  killCriteria().forEach(k => {
    const bp = (latest?.breakpoints || []).find(b => b.code === k.code);
    const row = h('div', { class: 'flex flex-wrap items-center gap-2 py-2 border-b', style: 'border-color:var(--line-soft);' }, [
      chip(k.status, HYP_STATUS_TONE[k.status] || 'line'),
      h('span', { class: 'text-sm font-medium', text: `${k.code} · ${k.title}` }),
      h('span', { class: 'text-xs flex-1', style: 'color:var(--ink-mute); min-width:180px;', text: bp?.note || k.status_note || k.description }),
      ...(bp?.evidence || []).map(ev => chip(ev.cite, 'info')),
    ]);
    card.appendChild(row);
  });
  if (card.lastChild) card.lastChild.style.borderBottom = 'none';
  return card;
}

/* ---------- 3 · Trajectory strip ---------- */
function viewAssessmentModal(a) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const body = h('div', { class: 'modal p-6' }, [
    h('div', { class: 'flex flex-wrap items-center justify-between gap-2 mb-1' }, [
      h('div', { class: 'serif text-xl', text: `Assessment · ${fmtDate(a.created_at)}` }),
      chip(a.leaning, LEANING_TONE[a.leaning] || 'line'),
    ]),
    muteText(`Read-only — assessments are never edited. Trigger: ${a.trigger} · phase ${a.phase} · ${a.model || ''}`),
    h('div', { class: 'mt-4' }, [renderMarkdown(a.summary_markdown)]),
    h('div', { class: 'mt-4 flex flex-col gap-2' }, (a.per_hypothesis || []).map(p =>
      h('div', { class: 'text-sm py-2 border-t', style: 'border-color:var(--line-soft);' }, [
        h('div', { class: 'flex items-center gap-2 mb-1' }, [
          h('span', { class: 'font-medium', text: p.hypothesis_code }),
          chip(`${DIRECTION_ARROW[p.direction] || '→'} ${p.direction} · ${p.strength}`, p.direction === 'strengthening' ? 'sage' : p.direction === 'weakening' ? 'honey' : 'line'),
        ]),
        h('div', { class: 'text-xs', style: 'color:var(--ink-soft);', text: `Would change it: ${p.what_would_change || '—'}` }),
      ]))),
    h('div', { class: 'flex justify-end mt-5 pt-4 border-t', style: 'border-color:var(--line-soft);' }, [
      h('button', { class: 'btn btn-line', onclick: () => { root.innerHTML = ''; } }, 'Close'),
    ]),
  ]);
  root.appendChild(h('div', {
    class: 'modal-bg fade-in',
    onclick: (e) => { if (e.target.classList.contains('modal-bg')) root.innerHTML = ''; },
  }, [body]));
}

function trajectoryStrip() {
  const all = assessmentsOldestFirst();
  const card = h('div', { class: 'card p-5 mb-5' });
  card.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--ink-mute);', text: 'Trajectory — every assessment, oldest first. The sequence is itself evidence.' }));
  if (!all.length) {
    card.appendChild(muteText('No assessments yet. The first one starts the trajectory.', 'text-sm'));
    return card;
  }
  const strip = h('div', { class: 'flex flex-wrap items-center gap-2' });
  all.forEach((a, i) => {
    const c = chip(`${a.leaning} · ${fmtDate(a.created_at)}`, LEANING_TONE[a.leaning] || 'line');
    c.style.cursor = 'pointer';
    if (i === all.length - 1) c.style.boxShadow = '0 0 0 2px var(--sage)';
    c.title = `Trigger: ${a.trigger} · phase ${a.phase} — tap to read`;
    c.addEventListener('click', () => viewAssessmentModal(a));
    strip.appendChild(c);
    if (i < all.length - 1) strip.appendChild(h('span', { class: 'text-xs', style: 'color:var(--ink-mute);', text: '→' }));
  });
  card.appendChild(strip);
  return card;
}

/* ---------- 4 · Divergence panel ---------- */
function divergencePanel(latest) {
  const memo = STATE.decision_memos[0];
  const verdict = memo?.content?.verdict;
  if (!latest || !verdict || verdict === 'Undecided' || verdict === latest.leaning) return null;

  const card = h('div', { class: 'card p-5 mb-5', style: 'border-color:var(--honey);' });
  card.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--honey-deep);', text: 'Divergence — the team and the assessment disagree' }));
  card.appendChild(h('div', { class: 'grid sm:grid-cols-2 gap-4 mb-3' }, [
    h('div', {}, [
      h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Team verdict (memo)' }),
      chip(verdict, LEANING_TONE[verdict] || 'line'),
    ]),
    h('div', {}, [
      h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'AI leaning (advisory)' }),
      chip(latest.leaning, LEANING_TONE[latest.leaning] || 'line'),
    ]),
  ]));
  const rationale = memo?.content?.override_rationale;
  if (rationale) {
    card.appendChild(h('div', {}, [
      h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Why we\'re overriding the assessment' }),
      h('div', { class: 'text-sm whitespace-pre-line', text: rationale }),
    ]));
  } else {
    card.appendChild(h('div', { class: 'banner banner-honey' }, [
      h('span', { text: 'No override rationale written yet — the memo requires one before co-signing.' }),
    ]));
  }
  return card;
}

/* ---------- Screen ---------- */
function renderDecisionBrief(page) {
  const latest = latestAssessment();

  page.appendChild(leaningCard(latest));

  const div = divergencePanel(latest);
  if (div) page.appendChild(div);

  page.appendChild(h('div', { class: 'micro mb-3', style: 'color:var(--ink-mute);', text: 'Buyer hypotheses — who pays?' }));
  const board = h('div', { class: 'grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-5' });
  buyerHypotheses().forEach(hyp => board.appendChild(hypothesisCard(hyp, latest)));
  if (!board.children.length) board.appendChild(h('div', { class: 'card p-5 text-sm', style: 'color:var(--ink-mute);', text: 'No hypotheses defined.' }));
  page.appendChild(board);

  page.appendChild(killStrip(latest));
  page.appendChild(trajectoryStrip());
}

registerRoute('decision-brief', 'Decision Brief', renderDecisionBrief,
  'If we had to decide today, what would we do — and on what evidence?');
