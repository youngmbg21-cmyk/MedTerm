/* The five questions — one question: "What do we still not know?"

   This is the spine of the workspace. Everything else exists to move a
   question from Open to Answered, and a question only moves on written
   evidence, never on a feeling. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  openModal, closeModal, formField, setPageActions, evidenceFor, evidenceWeight, fmtDate,
  expandableCard,
} from '../app.js';
import { QUESTION_STATUS_NAMES, questionTone, ownerOptions } from '../config.js';
import { data } from '../data.js';
import { insightCard, insightModal, deleteInsight } from '../evidence.js';
import { aiDraftControls } from '../ai-draft.js';
import { draftSectionRequest, aiDataSlices } from '../data.js';

const sorted = () => [...STATE.questions].sort((a, b) => (a.sort || 0) - (b.sort || 0));

function renderQuestions(page) {
  /* The primary action on this screen is the one you actually take on it:
     attaching what you have learned to a question. Adding a sixth question
     to a screen called "the five questions" happens roughly never, so it
     lives in the quiet tools row below. */
  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => insightModal({}) }, '+ Write down a finding'));

  const qs = sorted();
  if (!qs.length) {
    page.appendChild(emptyState('No questions yet.',
      'The five questions from the research brief should be here. Settings → Reset to the starting workspace will restore them.',
      { label: '+ Add a question', onclick: () => openQuestionForm() }));
    return;
  }

  /* Lead with the exception: the questions nobody has found anything for. */
  const empty = qs.filter(q => evidenceFor(q.id).all.length === 0 && q.status !== 'Parked');
  if (empty.length) {
    page.appendChild(h('div', { class: 'banner banner-gold mb-4' }, [
      h('span', { text: `${empty.length} of ${qs.length} questions have no evidence at all yet: ${empty.map(q => q.ref).join(', ')}. Those are the ones the next conversation should be aimed at.` }),
    ]));
  }

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('div', { class: 'text-sm t-soft flex-1 min-w-[200px]',
      text: 'A question only moves on written evidence. Open one to read what is attached to it and what would answer it.' }),
    h('button', { class: 'btn btn-line', onclick: () => openQuestionForm() }, '+ Add a question'),
  ]));

  qs.forEach(q => page.appendChild(questionCard(q)));
}

function questionCard(q) {
  const e = evidenceFor(q.id);
  const w = evidenceWeight(q.id);

  /* Shut, a question shows where it stands and what the evidence says. That
     is enough to choose which one the next conversation should be aimed at —
     which is the only decision this screen exists to support. Open, it shows
     the argument. Five open cards was four screens of scrolling. */
  const summary = h('div', {}, [
    h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
      chip(q.ref || '—', 'info'),
      chip(q.status || 'Open', questionTone(q.status)),
      chip(w.label, w.tone),
      chip(`${e.supports.length} support`, e.supports.length ? 'green' : 'line'),
      chip(`${e.challenges.length} challenge`, e.challenges.length ? 'rose' : 'line'),
    ]),
    h('div', { class: 'card-title', text: q.short || '' }),
    h('div', { class: 'rec-peek', text: q.leaning
      ? `Where we stand: ${q.leaning}`
      : (q.would_answer ? `What would answer it: ${q.would_answer}` : 'No leaning written down yet.') }),
  ]);

  const tools = h('div', { class: 'flex gap-1' }, [
    h('button', { class: 'btn btn-ghost text-xs', onclick: () => openQuestionForm(q) }, 'Edit'),
  ]);

  const body = h('div', {});
  if (q.why_it_matters) body.appendChild(h('div', { class: 'text-sm t-soft', text: q.why_it_matters }));

  if (q.would_answer) {
    body.appendChild(h('div', { class: 'inset-block mt-3' }, [
      h('div', { class: 'micro t-bronze mb-1', text: 'What would answer it' }),
      h('div', { class: 'text-sm', text: q.would_answer }),
    ]));
  }

  /* The leaning: where we currently stand, in words, co-signed by a person. */
  const leaningBox = h('div', { class: 'mt-3' });
  if (q.leaning) {
    leaningBox.appendChild(h('div', { class: 'inset-block' }, [
      h('div', { class: 'micro t-bronze mb-1', text: `Where we stand${q.owner ? ' · ' + q.owner : ''}${q.leaning_date ? ' · ' + fmtDate(q.leaning_date) : ''}` }),
      h('div', { class: 'text-sm', text: q.leaning }),
    ]));
  }
  leaningBox.appendChild(aiDraftControls({
    filled: !!q.leaning,
    draftLabel: 'Draft where we stand',
    redraftLabel: 'Redraft where we stand',
    manualLabel: 'Write it yourself',
    draftTone: 'line', // five of these on one screen; none of them is the primary
    onDraft: () => draftLeaning(q),
    onManual: () => openLeaningForm(q),
  }));
  body.appendChild(leaningBox);

  /* The evidence itself. The support/challenge tally already rode up into the
     summary; here it only needs the context count and the way to add more. */
  const tally = h('div', { class: 'flex flex-wrap items-center gap-2 mt-4 mb-2' }, [
    e.context.length ? chip(`${e.context.length} context`, 'info') : null,
    h('button', { class: 'btn btn-line text-xs ml-auto', onclick: () => insightModal({ questionId: q.id }) }, '+ Attach a finding'),
  ].filter(Boolean));
  body.appendChild(tally);

  if (!e.all.length) {
    body.appendChild(h('div', { class: 'text-sm t-mute', text: 'Nothing attached yet. Findings arrive from conversations, competitors, market facts and pricing tests — or write one straight in.' }));
  } else {
    const list = h('div', { class: 'flex flex-col gap-2' });
    [...e.supports, ...e.challenges, ...e.context]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .forEach(i => list.appendChild(insightCard(i, {
        showQuestion: false,
        onEdit: () => insightModal({ insight: i }),
        onDelete: () => deleteInsight(i),
      })));
    body.appendChild(list);
  }

  return expandableCard({ key: `question:${q.id}`, summary, detail: body, tools });
}

/* ------------------------------------------------------------ forms */
function openQuestionForm(existing) {
  const q = existing || {};
  openModal(existing ? 'Edit question' : 'Add a question', [
    formField('Short reference (Q1, Q2…)', 'ref', 'input', q.ref),
    formField('The question, in one line', 'short', 'textarea', q.short),
    formField('Why it matters', 'why_it_matters', 'textarea', q.why_it_matters),
    formField('What would answer it', 'would_answer', 'textarea', q.would_answer),
    formField('Status', 'status', 'select', q.status || 'Open', QUESTION_STATUS_NAMES),
    formField('Order', 'sort', 'input', q.sort ?? (STATE.questions.length + 1), null, 'number'),
  ], async (form) => {
    form.sort = Number(form.sort) || 0;
    try {
      if (existing) await data.update('questions', existing.id, form);
      else await data.create('questions', form);
      STATE.questions = await data.list('questions');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function openLeaningForm(q, prefill) {
  openModal('Where we stand on ' + (q.ref || 'this question'), [
    formField('Our read, in plain words', 'leaning', 'textarea', prefill ?? q.leaning ?? ''),
    formField('Status', 'status', 'select', q.status || 'Open', QUESTION_STATUS_NAMES),
    formField('Who is signing off on this', 'owner', 'select', q.owner || ownerOptions()[0], ownerOptions()),
  ], async (form) => {
    try {
      await data.update('questions', q.id, {
        leaning: form.leaning, status: form.status, owner: form.owner,
        leaning_date: new Date().toISOString().slice(0, 10),
      });
      STATE.questions = await data.list('questions');
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

/* The assistant drafts; the human edits and saves. Never auto-saved. */
async function draftLeaning(q) {
  const e = evidenceFor(q.id);
  const res = await draftSectionRequest({
    section: 'question_leaning',
    instruction: `Write two to four short sentences saying where the evidence currently leaves question ${q.ref}: "${q.short}". Say plainly if the evidence is too thin to lean either way — that is the honest answer most of the time. Cite the findings you used. Name the single piece of evidence we do not yet have that would move this most.`,
    context: {
      question: { ref: q.ref, short: q.short, full: q.why_it_matters, would_answer: q.would_answer, status: q.status },
      supports: e.supports, challenges: e.challenges, context: e.context,
    },
    localData: aiDataSlices(STATE),
  });
  openLeaningForm(q, (res && (res.text || res.draft)) || '');
}

registerRoute('questions', 'Where we stand', renderQuestions,
  'What do we still not know, and what would answer it?');
