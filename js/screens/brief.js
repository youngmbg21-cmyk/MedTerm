/* The decision brief — one question: "If we had to decide today, what would
   we do, and on what evidence?"

   This is the last screen in the working set, and the one the whole workspace
   points at. Everything else collects evidence; this is where the evidence is
   asked to mean something.

   Three rules govern it, and none of them may be relaxed:

   1 · The AI argues; it never decides. The brief is advisory. The verdict is
       a separate field, typed by a human, sitting next to the AI's read so
       that a disagreement between the two is visible rather than quietly
       resolved.

   2 · Briefs are append-only. A brief is never rewritten — you generate a new
       one and the old ones stay. The point is to be able to look back in
       October and see that in August the read was PIVOT on thin evidence, and
       what changed it. A record that edits itself cannot show that.

   3 · No score, ever. The leaning is one of four words. A percentage on top of
       fifteen conversations is false precision dressed as rigour, and the two
       people reading this would argue about the number instead of the
       evidence.

   The honest answer early on is INSUFFICIENT, and the brief says so plainly
   rather than manufacturing a view. That is the feature. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, setPageActions,
  openModal, closeModal, formField, fmtDate, today, renderRich,
  evidenceFor, evidenceWeight, conversationUnmined, factNeedsSource, prospectName, go,
} from '../app.js';
import { ownerOptions, SEGMENTS } from '../config.js';
import { data, aiAvailable, draftSectionRequest, aiDataSlices } from '../data.js';
import { downloadText } from '../export.js';

/* The only four words a leaning may be. They are the same four the shared
   renderer colours into pills, which is why the prompt is told to use them
   exactly and nothing else. */
const LEANINGS = ['GO', 'PIVOT', 'NO-GO', 'INSUFFICIENT'];
const VERDICTS = ['Not yet', 'GO', 'PIVOT', 'NO-GO'];
const leaningTone = (l) => ({ GO: 'green', 'NO-GO': 'rose', PIVOT: 'gold' }[l] || 'line');

const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
const allBriefs = () => [...STATE.briefs].sort(byNewest);

function renderBrief(page) {
  const briefs = allBriefs();
  const latest = briefs[0] || null;

  setPageActions(aiAvailable
    ? h('button', { class: 'btn btn-primary', onclick: (e) => generate(e.target) },
        latest ? 'Write a new brief' : 'Write the first brief')
    : null);

  /* How much there is to reason from, said before the brief rather than
     after it — so a thin brief is read as thin evidence, not bad thinking. */
  page.appendChild(evidenceBar());

  if (!latest) {
    page.appendChild(h('div', { class: 'card card-pad' }, [
      h('div', { class: 'flex flex-wrap items-center gap-2 mb-3' }, [
        h('span', { class: 'micro t-mute', text: 'Current leaning' }),
      ]),
      h('span', { class: 'chip chip-line chip-lg', text: 'INSUFFICIENT' }),
      h('div', { class: 'text-sm t-soft mt-3', text: aiAvailable
        ? 'No brief has been written yet. The assistant reads every finding, every price reaction and every market fact in the workspace, and argues one position from them — including saying the evidence is too thin, which early on is the honest answer.'
        : 'No brief has been written yet, and the assistant is not connected. Turn it on by setting AI_MODE to \'worker\' in js/config.js — see HANDOFF.md.' }),
      aiAvailable
        ? h('button', { class: 'btn btn-primary mt-4', onclick: (e) => generate(e.target) }, 'Write the first brief')
        : h('div', { class: 'text-xs t-mute mt-3', text: 'You can still record a verdict of your own once a brief exists.' }),
    ]));
    return;
  }

  page.appendChild(latestCard(latest));

  if (briefs.length > 1) {
    const hist = h('div', { class: 'card card-pad mt-4' }, [
      h('div', { class: 'card-title mb-1', text: 'How the read has changed' }),
      h('div', { class: 'text-2nd t-mute mb-3', text: 'Every brief is kept. Nothing here is ever rewritten — that is how you can tell whether new evidence moved you or just made you louder.' }),
    ]);
    briefs.slice(1).forEach(b => hist.appendChild(historyRow(b)));
    page.appendChild(hist);
  }
}

/* ------------------------------------------------------------
   What the brief was written from.
   ------------------------------------------------------------ */
function evidenceBar() {
  const findings = STATE.insights.length;
  const convos = STATE.conversations.length;
  const reactions = STATE.pricing_reactions.length;
  const target = SEGMENTS.reduce((n, s) => n + s.target, 0);

  const thin = convos < Math.ceil(target / 2) || !reactions;
  /* Deliberately worded as "right now" — each brief carries its own snapshot
     of what it was written from, and the two numbers will differ as soon as
     you log another conversation. Saying which is which stops that reading as
     a contradiction. */
  const wrap = h('div', { class: `banner banner-${thin ? 'gold' : 'info'} mb-4` });
  wrap.appendChild(h('span', { text: thin
    ? `The workspace holds ${convos} of ${target} planned conversations right now, with ${findings} finding${findings === 1 ? '' : 's'} and ${reactions} price reaction${reactions === 1 ? '' : 's'}. That is thin, and a brief written today should say so.`
    : `The workspace holds ${convos} conversations right now, with ${findings} findings and ${reactions} price reactions across the five questions.` }));
  return wrap;
}

/* ------------------------------------------------------------
   The current brief, with the human verdict beside it.
   ------------------------------------------------------------ */
function latestCard(b) {
  const card = h('div', { class: 'card card-pad' });

  card.appendChild(h('div', { class: 'flex flex-wrap items-start justify-between gap-3 mb-3' }, [
    h('div', {}, [
      h('div', { class: 'micro t-mute mb-2', text: 'What the evidence says — advisory, not a verdict' }),
      h('span', { class: `chip chip-${leaningTone(b.leaning)} chip-lg`, text: b.leaning || 'INSUFFICIENT' }),
    ]),
    h('div', { class: 'text-xs t-mute text-right' }, [
      h('div', { text: fmtDate(b.created_at) }),
      h('div', { text: `by ${b.owner || '—'}` }),
    ]),
  ]));

  card.appendChild(renderRich(b.summary_markdown || ''));

  const snap = [
    b.snapshot_conversations != null ? `${b.snapshot_conversations} conversations` : null,
    b.snapshot_findings != null ? `${b.snapshot_findings} findings` : null,
    b.snapshot_reactions != null ? `${b.snapshot_reactions} price reactions` : null,
    b.snapshot_facts != null ? `${b.snapshot_facts} sourced facts` : null,
  ].filter(Boolean).join(' · ');
  if (snap) card.appendChild(h('div', { class: 'text-xs t-mute num mt-4 pt-3 border-t b-soft', text: `Written from ${snap}.` }));

  /* ---- the humans' call ---- */
  const decided = b.verdict && b.verdict !== 'Not yet';
  card.appendChild(h('div', { class: `inset-block mt-4${decided ? '' : ' b-rose-hint'}` }, [
    h('div', { class: 'micro t-bronze mb-2', text: 'What the two of you decided' }),
    decided
      ? h('div', {}, [
          h('div', { class: 'flex flex-wrap items-center gap-2 mb-2' }, [
            chip(b.verdict, leaningTone(b.verdict)),
            h('span', { class: 'text-xs t-mute', text: [b.verdict_by, b.verdict_date ? fmtDate(b.verdict_date) : null].filter(Boolean).join(' · ') }),
            b.verdict !== b.leaning ? chip(`differs from the brief (${b.leaning})`, 'violet') : null,
          ].filter(Boolean)),
          b.verdict_note ? h('div', { class: 'text-sm', style: 'white-space:pre-wrap', text: b.verdict_note }) : null,
        ].filter(Boolean))
      : h('div', { class: 'text-sm', text: 'Nothing recorded. The brief above is the assistant\'s argument, not a decision — write down what you actually concluded, especially if you disagree with it.' }),
    h('button', { class: `btn ${decided ? 'btn-ghost' : 'btn-line'} text-xs mt-2`, onclick: () => verdictForm(b) },
      decided ? 'Change the decision' : 'Record the decision'),
  ]));

  card.appendChild(h('div', { class: 'flex flex-wrap gap-2 mt-4 pt-3 border-t b-soft' }, [
    h('button', { class: 'btn btn-line text-xs', onclick: () => downloadBrief(b) }, '↓ Download as a document'),
    h('button', { class: 'btn btn-ghost text-xs', onclick: () => go('questions') }, 'Where we stand →'),
    h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => deleteBrief(b) }, 'Delete'),
  ]));

  return card;
}

function historyRow(b) {
  const decided = b.verdict && b.verdict !== 'Not yet';
  return h('button', {
    class: 'flex flex-wrap items-center gap-2 py-3 border-b b-soft w-full text-left h-row',
    onclick: () => readModal(b),
  }, [
    h('span', { class: 'text-xs t-mute num', style: 'min-width:56px', text: fmtDate(b.created_at) }),
    chip(b.leaning || 'INSUFFICIENT', leaningTone(b.leaning)),
    decided ? chip(`decided ${b.verdict}`, 'info') : null,
    h('span', { class: 'text-xs t-mute', text: `${b.snapshot_findings ?? '?'} findings at the time` }),
  ].filter(Boolean));
}

function readModal(b) {
  openModal(`Brief of ${fmtDate(b.created_at)}`, [
    { key: '_', el: h('div', {}, [
      h('div', { class: 'mb-3' }, [h('span', { class: `chip chip-${leaningTone(b.leaning)} chip-lg`, text: b.leaning || 'INSUFFICIENT' })]),
      renderRich(b.summary_markdown || ''),
    ]) },
  ], async () => closeModal(), 'Close');
}

/* ------------------------------------------------------------
   Writing one. The assistant reads the workspace and argues.
   ------------------------------------------------------------ */
async function generate(btn) {
  if (!aiAvailable) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Reading the workspace…';
  try {
    const context = buildContext();
    const res = await draftSectionRequest({
      section: 'decision_brief',
      instruction: BRIEF_INSTRUCTION,
      context,
      localData: aiDataSlices(STATE),
    });
    const text = String((res && (res.text || res.draft)) || '').trim();
    if (!text) throw new Error('The assistant returned nothing.');

    /* The first line declares the leaning. Anything else — a missing line, a
       word we do not recognise — falls back to INSUFFICIENT, which is the
       safe direction to be wrong in. */
    const m = text.match(/^\s*LEANING:\s*(GO|PIVOT|NO-GO|INSUFFICIENT)\s*$/im);
    const leaning = m && LEANINGS.includes(m[1].toUpperCase()) ? m[1].toUpperCase() : 'INSUFFICIENT';
    const body = text.replace(/^\s*LEANING:.*$/im, '').trim();

    await data.create('briefs', {
      leaning,
      summary_markdown: body,
      snapshot_conversations: STATE.conversations.length,
      snapshot_findings: STATE.insights.length,
      snapshot_reactions: STATE.pricing_reactions.length,
      snapshot_facts: STATE.market_facts.filter(f => !factNeedsSource(f)).length,
      verdict: 'Not yet',
      owner: ownerOptions()[0],
      created_at: new Date().toISOString(),
    });
    STATE.briefs = await data.list('briefs');
    renderCurrentRoute();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = label;
    alert('The brief could not be written: ' + e.message);
  }
}

const BRIEF_INSTRUCTION = `Write the decision brief for two founders deciding whether to take HaTi to market.

Begin with exactly one line, on its own:
LEANING: GO
(or PIVOT, or NO-GO, or INSUFFICIENT — one of those four words, nothing else, no punctuation after it.)

Choose INSUFFICIENT whenever the evidence cannot carry a call. Early in a research
programme that is the correct answer and you must not talk yourself out of it. A brief
that manufactures a view from four conversations is worse than one that says the work
has not been done.

Then, under short headings:

1. The call, in three sentences. What you would do on Monday and why.
2. Question by question. For each of Q1-Q5: where the evidence leaves it, and the ONE
   piece of evidence that would move it most. Cite findings by what they say and who
   said it. If a question has nothing attached, say so — do not fill the gap with
   reasoning from the seeded reference material.
3. What would change your mind. The specific thing that would flip the leaning.
4. What to do next. Three actions at most, each one a thing a person could do this week.

Rules you must not break:
- Never invent a quote, a company, a price somebody gave, or a conversation. Every
  specific must be traceable to a record you were given.
- No percentages, no confidence scores, no "70% likely". The leaning plus a reason.
- Say plainly when the evidence is thin. Distinguish what prospects actually said from
  what we believe.
- Short sentences. The readers are not developers and not analysts.`;

/* The slice the brief reasons from — assembled here rather than sent raw, so
   the model gets the shape of the argument (question, evidence, gap) instead
   of a table dump it has to reconstruct. */
function buildContext() {
  const questions = [...STATE.questions]
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map(q => {
      const e = evidenceFor(q.id);
      const w = evidenceWeight(q.id);
      const say = (list) => list.map(i => ({
        finding: i.finding, quote: i.quote || undefined,
        source: `${i.source_kind}: ${i.source_label || '—'}`,
      }));
      return {
        ref: q.ref, question: q.short, why_it_matters: q.why_it_matters,
        what_would_answer_it: q.would_answer,
        status: q.status || 'Open', evidence_weight: w.label,
        our_current_read: q.leaning || null,
        supporting: say(e.supports), challenging: say(e.challenges), context: say(e.context),
      };
    });

  const pricing = STATE.pricing_ideas.map(idea => {
    const rs = STATE.pricing_reactions.filter(r => String(r.pricing_idea_id) === String(idea.id));
    return {
      option: idea.name, model: idea.model,
      price_low: idea.price_low, price_high: idea.price_high, unit: idea.unit,
      status: idea.status,
      reactions: rs.map(r => ({
        company: prospectName(r.prospect_id), reaction: r.reaction,
        their_words: r.verbatim || undefined, their_number: r.their_number || undefined,
      })),
    };
  });

  return {
    questions,
    pricing,
    conversations_logged: STATE.conversations.length,
    conversations_with_no_finding: STATE.conversations.filter(c => conversationUnmined(c)).length,
    segment_targets: SEGMENTS.map(s => ({ segment: s.name, target: s.target })),
    market_facts: STATE.market_facts.map(f => ({
      category: f.category, claim: f.claim, value: f.value || undefined,
      strength: f.strength, source: f.source_name || undefined,
      sourced: !factNeedsSource(f),
    })),
    competitors: STATE.competitors.map(c => ({
      name: c.name, type: c.type, threat: c.threat,
      what_they_charge: [c.pricing_model, c.price_notes].filter(Boolean).join(' — ') || undefined,
    })),
    previous_briefs: allBriefs().slice(0, 3).map(b => ({
      written: b.created_at, leaning: b.leaning, our_verdict: b.verdict,
    })),
  };
}

/* ------------------------------------------------------------
   The verdict — the only part of this screen a human writes.
   ------------------------------------------------------------ */
function verdictForm(b) {
  openModal('What did the two of you decide?', [
    { key: '_', el: h('div', { class: 'inset-block mb-3' }, [
      h('div', { class: 'micro t-bronze mb-1', text: 'The brief says' }),
      h('div', { class: 'text-sm', text: `${b.leaning || 'INSUFFICIENT'} — you are free to disagree with it, and if you do, say why below.` }),
    ]) },
    formField('Our decision', 'verdict', 'select', b.verdict || 'Not yet', VERDICTS),
    formField('Why — in your own words', 'verdict_note', 'textarea', b.verdict_note || ''),
    formField('Who agreed this', 'verdict_by', 'select', b.verdict_by || ownerOptions()[2], ownerOptions()),
  ], async (form) => {
    await data.update('briefs', b.id, {
      verdict: form.verdict,
      verdict_note: form.verdict_note,
      verdict_by: form.verdict_by,
      verdict_date: today(),
    });
    STATE.briefs = await data.list('briefs');
    closeModal();
    renderCurrentRoute();
  }, 'Save the decision');
}

function deleteBrief(b) {
  openModal('Delete this brief?', [
    { key: '_', el: h('div', { class: 'text-sm t-soft' }, [
      h('div', { text: `The brief of ${fmtDate(b.created_at)}, leaning ${b.leaning || 'INSUFFICIENT'}.` }),
      h('div', { class: 'text-xs mt-2 t-mute', text: 'Briefs are meant to be kept — the trail of how your thinking changed is worth more than any single one of them. Write a new brief instead unless this one was generated by mistake.' }),
    ]) },
  ], async () => {
    await data.remove('briefs', b.id);
    STATE.briefs = await data.list('briefs');
    closeModal(); renderCurrentRoute();
  }, 'Delete', { danger: true });
}

/* Something you can send to somebody who does not have the app. */
function downloadBrief(b) {
  const lines = [
    'HaTi — decision brief',
    `Written ${fmtDate(b.created_at)}${b.owner ? ' by ' + b.owner : ''}`,
    '',
    `WHAT THE EVIDENCE SAYS: ${b.leaning || 'INSUFFICIENT'}`,
    '',
    b.summary_markdown || '',
    '',
    '---',
    `Written from ${b.snapshot_conversations ?? '?'} conversations, ${b.snapshot_findings ?? '?'} findings, ` +
      `${b.snapshot_reactions ?? '?'} price reactions and ${b.snapshot_facts ?? '?'} sourced facts.`,
  ];
  if (b.verdict && b.verdict !== 'Not yet') {
    lines.push('', `OUR DECISION: ${b.verdict}${b.verdict_by ? ' — ' + b.verdict_by : ''}${b.verdict_date ? ', ' + fmtDate(b.verdict_date) : ''}`);
    if (b.verdict_note) lines.push('', b.verdict_note);
  } else {
    lines.push('', 'OUR DECISION: not yet recorded. The above is the assistant\'s argument, not a decision.');
  }
  downloadText(`hati-decision-brief-${String(b.created_at || '').slice(0, 10)}.txt`, lines.join('\n'));
}

registerRoute('brief', 'Decision brief', renderBrief,
  'If we had to decide today, what would we do — and on what evidence?');
