/* The interview sheet — one question: "What did they say?"

   This is the screen the whole workspace is built around. One meeting is
   one sheet, and everything that meeting produces is captured here without
   leaving the page: the scripted questions for that prospect's segment,
   their reaction to real prices, and the findings that attach what they
   said to one of the five questions.

   Why it is a full page and not a modal. A six-block form inside a modal on
   a 375px phone is unusable, and this gets filled in during or straight
   after a meeting, often on a phone. It is also why the sheet saves itself
   as you type: nobody should lose an interview because a browser tab closed.

   Why pricing lives here. It used to be on its own screen, and the result
   was a workspace with zero recorded price reactions and an Overview that
   said so. A question you have to remember to go and answer somewhere else
   is a question that never gets answered. The prices are read out in the
   meeting, so they are written down in the meeting.

   The record is a `conversation` row, unchanged — the sheet is how one is
   filled in, not a new kind of thing. */
import {
  STATE, registerRoute, h, chip, emptyState, setPageActions,
  openModal, closeModal, formField, fmtDate, today, fmtKES, routeParams,
  prospectName, go,
} from '../app.js';
import { CHANNELS, teamOptions, REACTION_NAMES, reactionTone, ownerOptions } from '../config.js';
import { scriptFor, allQuestions, scriptLength } from '../script.js';
import { data } from '../data.js';
import { insightModal, insightsForSource, questionByRef } from '../evidence.js';

/* The row being filled in. Held here rather than re-read from STATE on every
   keystroke, so typing never fights an in-flight save. */
let draft = null;
let saveTimer = null;
let saveState = 'idle'; // idle · saving · saved

/* ------------------------------------------------------------
   Reading and writing one answer. A question either names a
   column on `conversations` (the ones the rest of the app
   already reads) or lives in the JSON `answers` bag.
   ------------------------------------------------------------ */
function parseAnswers(conv) {
  try { return JSON.parse(conv.answers || '{}') || {}; } catch { return {}; }
}
function readAnswer(conv, q) {
  return q.field ? (conv[q.field] || '') : (parseAnswers(conv)[q.key] || '');
}
function writeAnswer(conv, q, value) {
  if (q.field) { conv[q.field] = value; return; }
  const bag = parseAnswers(conv);
  if (String(value).trim()) bag[q.key] = value; else delete bag[q.key];
  conv.answers = JSON.stringify(bag);
}

/* How much of the script has been filled in. Counts only the scripted
   questions, so the header's progress line means the same thing every time. */
function answeredCount(conv, segment) {
  return scriptFor(segment)
    .flatMap(b => b.questions)
    .filter(q => String(readAnswer(conv, q) || '').trim()).length;
}

/* ------------------------------------------------------------
   Saving. The sheet writes itself to storage shortly after you
   stop typing; there is no Save button to forget.
   ------------------------------------------------------------ */
function markSaving() {
  saveState = 'saving';
  const el = document.getElementById('sheet-save-state');
  if (el) el.textContent = 'Saving…';
}
function markSaved() {
  saveState = 'saved';
  const el = document.getElementById('sheet-save-state');
  if (el) el.textContent = 'Saved';
}

async function flushSave() {
  if (!draft) return;
  markSaving();
  const row = { ...draft };
  delete row.id; delete row.created_at;
  try {
    if (draft.id) {
      await data.update('conversations', draft.id, row);
    } else {
      const created = await data.create('conversations', row);
      draft.id = created.id;
      /* The address bar catches up, so a refresh mid-meeting reopens the same
         sheet rather than starting a second one for the same conversation. */
      history.replaceState(null, '', `#sheet?id=${encodeURIComponent(created.id)}`);
    }
    STATE.conversations = await data.list('conversations');
    markSaved();
  } catch (e) {
    const el = document.getElementById('sheet-save-state');
    if (el) el.textContent = 'Not saved — ' + e.message;
  }
}

function queueSave() {
  clearTimeout(saveTimer);
  markSaving();
  saveTimer = setTimeout(flushSave, 700);
}

/* A pricing reaction or a finding needs the conversation to exist first. */
async function ensureSaved() {
  clearTimeout(saveTimer);
  await flushSave();
  return draft.id;
}

/* ------------------------------------------------------------
   The screen
   ------------------------------------------------------------ */
function renderSheet(page) {
  const params = routeParams();
  const id = params.get('id');
  const prospectId = params.get('prospect');

  if (id) {
    const existing = STATE.conversations.find(c => String(c.id) === String(id));
    if (!existing) {
      page.appendChild(emptyState('That sheet is not here.',
        'It may have been deleted. The list of conversations has everything that was kept.',
        { label: 'Back to conversations', onclick: () => go('conversations') }));
      return;
    }
    if (!draft || String(draft.id) !== String(id)) draft = { ...existing };
  } else if (prospectId) {
    if (!draft || draft.id || String(draft.prospect_id) !== String(prospectId)) {
      draft = {
        prospect_id: prospectId, date: today(),
        channel: 'In person', interviewer: teamOptions()[0],
      };
      saveState = 'idle';
    }
  } else {
    draft = null;
    renderPicker(page);
    return;
  }

  const prospect = STATE.prospects.find(p => String(p.id) === String(draft.prospect_id)) || {};
  const segment = prospect.segment || '';
  const script = scriptFor(segment);

  setPageActions(h('button', { class: 'btn btn-primary', onclick: () => finish(prospect) }, 'Done'));

  /* ---- the header: who, and how far through ---- */
  const total = scriptLength(segment);
  const done = answeredCount(draft, segment);
  page.appendChild(h('div', { class: 'card card-pad mb-4' }, [
    h('div', { class: 'flex flex-wrap items-start justify-between gap-3' }, [
      h('div', { class: 'flex-1 min-w-[200px]' }, [
        h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
          chip(prospect.company || 'No company', 'info'),
          segment ? chip(segment, 'violet') : chip('No segment set', 'gold'),
        ]),
        h('div', { class: 'card-title', text: prospect.company || 'Interview sheet' }),
        h('div', { class: 'text-2nd t-mute mt-1', text: segment
          ? `The questions below are the ones worth asking a ${segment.toLowerCase()}.`
          : 'Set this prospect\'s segment to get the questions written for their kind of company. The common set is below either way.' }),
      ]),
      h('div', { class: 'text-right' }, [
        h('div', { class: 'micro t-mute', text: 'Answered' }),
        h('div', { class: 'kpi-num num', text: `${done}/${total}` }),
        h('div', { class: 'micro t-mute', id: 'sheet-save-state',
          text: saveState === 'saved' ? 'Saved' : (draft.id ? 'Saved' : 'Nothing typed yet') }),
      ]),
    ]),
  ]));

  /* A real conversation does not go in the order the sheet does — they bring
     up money in minute three, or the signing question never comes up at all.
     The strip jumps to a block so you are never scrolling while somebody
     talks. It sticks under the header for exactly that reason. */
  const jump = h('div', { class: 'sheet-jump' });
  script.forEach(block => {
    jump.appendChild(h('button', {
      class: 'chip chip-line', type: 'button',
      onclick: () => document.getElementById(`block-${block.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    }, block.title));
  });
  page.appendChild(jump);

  script.forEach(block => {
    const el = block.id === 'who' ? whoBlock(block, prospect)
      : block.id === 'money' ? moneyBlock(block)
      : questionBlock(block);
    el.id = `block-${block.id}`;
    el.classList.add('sheet-block');
    page.appendChild(el);
  });

  /* An answer recorded before the prospect was re-segmented is still an
     answer. It shows here rather than disappearing. */
  const orphans = orphanedAnswers(draft, segment);
  if (orphans.length) {
    const card = blockCard({ title: 'Answered under a different segment',
      sub: 'This prospect was in another segment when these were written. Kept so nothing is lost.' });
    orphans.forEach(({ q, value }) => {
      card.appendChild(h('div', { class: 'sheet-q' }, [
        h('div', { class: 'sheet-ask', text: q.ask }),
        h('div', { class: 'inset-block mt-2' }, [h('div', { class: 'text-sm', style: 'white-space:pre-wrap', text: value })]),
      ]));
    });
    page.appendChild(card);
  }

  page.appendChild(h('div', { class: 'flex flex-wrap gap-2 mt-4' }, [
    h('button', { class: 'btn btn-primary', onclick: () => finish(prospect) }, 'Done'),
    h('button', { class: 'btn btn-line', onclick: () => go('conversations') }, 'Back to the list'),
  ]));
}

/* ------------------------------------------------------------
   Who are you meeting? — the only thing between you and a sheet.
   ------------------------------------------------------------ */
function renderPicker(page) {
  setPageActions();
  if (!STATE.prospects.length) {
    page.appendChild(emptyState('No prospects yet.',
      'A sheet belongs to a company. Add the company first — four you can get an introduction to this week is a good start.',
      { label: 'Go to Prospects', onclick: () => go('prospects') }));
    return;
  }
  page.appendChild(h('div', { class: 'card card-pad mb-4' }, [
    h('div', { class: 'card-title mb-1', text: 'Who are you meeting?' }),
    h('div', { class: 'text-2nd t-mute', text: 'Pick the company and the sheet loads the questions written for their kind of business.' }),
  ]));

  const list = h('div', { class: 'flex flex-col gap-2' });
  [...STATE.prospects]
    .sort((a, b) => String(a.company || '').localeCompare(String(b.company || '')))
    .forEach(p => {
      const had = STATE.conversations.filter(c => String(c.prospect_id) === String(p.id)).length;
      list.appendChild(h('button', {
        class: 'card card-pad text-left h-row', style: 'display:block;width:100%',
        onclick: () => go(`sheet?prospect=${encodeURIComponent(p.id)}`),
      }, [
        h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
          p.segment ? chip(p.segment, 'violet') : chip('No segment set', 'gold'),
          had ? chip(`${had} already`, 'info') : null,
        ].filter(Boolean)),
        h('div', { class: 'card-title', text: p.company || '—' }),
        h('div', { class: 'text-xs t-mute mt-0.5', text: [p.sector, p.city].filter(Boolean).join(' · ') }),
      ]));
    });
  page.appendChild(list);
}

/* ------------------------------------------------------------
   Block 1 — the structured header. Filled in before you walk in.
   ------------------------------------------------------------ */
function whoBlock(block, prospect) {
  const card = blockCard(block);
  const grid = h('div', { class: 'grid gap-3 sm:grid-cols-2', style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))' });

  const field = (label, key, type = 'input', options = null, inputType = null) => {
    const wrap = h('div', {}, [h('label', { class: 'label', text: label })]);
    let el;
    if (type === 'select') {
      el = h('select', { class: 'select' }, options.map(o => {
        const opt = h('option', { value: o }, o || '—');
        if ((draft[key] || '') === o) opt.selected = true;
        return opt;
      }));
      el.addEventListener('change', () => { draft[key] = el.value; queueSave(); });
    } else {
      el = h('input', { class: 'input', value: draft[key] || '', type: inputType || 'text' });
      el.addEventListener('input', () => { draft[key] = el.value; queueSave(); });
    }
    wrap.appendChild(el);
    return wrap;
  };

  grid.appendChild(h('div', {}, [
    h('label', { class: 'label', text: 'Company' }),
    h('div', { class: 'inset-block' }, [h('div', { class: 'text-sm', text: prospect.company || '—' })]),
  ]));
  grid.appendChild(field('Who you spoke to', 'person'));
  grid.appendChild(field('Their role', 'person_role'));
  grid.appendChild(field('Date', 'date', 'input', null, 'date'));
  grid.appendChild(field('Channel', 'channel', 'select', CHANNELS));
  grid.appendChild(field('Ran by', 'interviewer', 'select', teamOptions()));
  card.appendChild(grid);
  return card;
}

/* ------------------------------------------------------------
   Blocks 2–4 and 6 — the scripted questions.
   ------------------------------------------------------------ */
function questionBlock(block) {
  const card = blockCard(block);
  if (!block.questions.length) {
    card.appendChild(h('div', { class: 'text-sm t-mute', text: 'Nothing scripted for this block.' }));
    return card;
  }
  block.questions.forEach(q => card.appendChild(questionRow(q)));
  return card;
}

function questionRow(q) {
  const wrap = h('div', { class: 'sheet-q' });
  wrap.appendChild(h('div', { class: 'sheet-ask', text: q.ask }));
  if (q.hint) wrap.appendChild(h('div', { class: 'sheet-hint', text: q.hint }));

  /* Boxes start small and grow as they fill. An empty sheet with eighteen
     four-row boxes is five thousand pixels of nothing, which reads as work
     before a word has been said. */
  const box = h('textarea', { class: 'textarea mt-2', rows: '2', value: readAnswer(draft, q) });
  const grow = () => {
    box.style.height = 'auto';
    box.style.height = Math.max(box.scrollHeight, 44) + 'px';
  };

  const attach = attachRow(q, () => box.value);
  /* An empty answer cannot become a finding, so the row that turns one into
     evidence stays out of the way until there is something to attach. */
  const syncAttach = () => { if (attach) attach.style.display = box.value.trim() ? '' : 'none'; };

  box.addEventListener('input', () => {
    writeAnswer(draft, q, box.value);
    grow(); syncAttach(); queueSave();
  });
  wrap.appendChild(box);
  if (attach) { wrap.appendChild(attach); syncAttach(); }

  /* Size to content once the box is in the document and has a width. */
  requestAnimationFrame(grow);
  return wrap;
}

/* The tightest loop in the app: an answer becomes evidence without leaving
   the sheet. One tap opens the finding already written from what they said,
   pointed at the question the script was aiming for — you edit the sentence
   and save. Never automatic: the AI does not decide, and neither does a
   button. */
function attachRow(q, getValue) {
  const target = questionByRef(q.aimsAt);
  if (!target) return null;

  const row = h('div', { class: 'sheet-attach' });
  const already = () => insightsForSource('Conversation', draft.id)
    .filter(i => String(i.question_id) === String(target.id));

  const paint = () => {
    row.innerHTML = '';
    const mine = draft.id ? already() : [];
    row.appendChild(h('span', { class: 'micro t-mute', text: `Feeds ${target.ref}` }));
    if (mine.length) {
      mine.forEach(i => row.appendChild(chip(i.direction || 'Context', 'green')));
    }
    ['Supports', 'Challenges', 'Context'].forEach(dir => {
      row.appendChild(h('button', {
        class: 'btn btn-ghost text-xs',
        onclick: async () => {
          const text = String(getValue() || '').trim();
          if (!text) { alert('Write the answer down first — the finding is drawn from what they said.'); return; }
          await ensureSaved();
          insightModal({
            questionId: target.id,
            sourceKind: 'Conversation',
            sourceId: draft.id,
            sourceLabel: `${prospectName(draft.prospect_id)}${draft.person ? ' — ' + draft.person : ''}, ${fmtDate(draft.date)}`,
            quote: draft.best_quote || '',
            afterSave: paint,
          });
          /* The modal opens with the direction the button named and the
             answer already in the sentence box. */
          const dirSel = document.querySelector('.modal [name="direction"]');
          if (dirSel) dirSel.value = dir;
          const findingBox = document.querySelector('.modal [name="finding"]');
          if (findingBox && !findingBox.value) findingBox.value = text;
        },
      }, mine.length ? `+ ${dir}` : dir));
    });
  };
  paint();
  return row;
}

/* ------------------------------------------------------------
   Block 5 — the money. Every priced option, read out and reacted
   to, in the meeting, on this page.
   ------------------------------------------------------------ */
function moneyBlock(block) {
  const card = blockCard(block);

  block.questions.forEach(q => card.appendChild(questionRow(q)));

  /* The overall signal, kept as a column because the rest of the app
     (the conversation list, the assistant's context) already reads it. */
  const WTP = ['Not discussed', 'Said no', 'Vague yes', 'Named a number', 'Asked for a quote'];
  const sigWrap = h('div', { class: 'sheet-q' }, [
    h('div', { class: 'sheet-ask', text: 'Overall, where did they land on paying?' }),
  ]);
  const sig = h('select', { class: 'select mt-2' }, WTP.map(w => {
    const o = h('option', { value: w }, w);
    if ((draft.wtp_signal || 'Not discussed') === w) o.selected = true;
    return o;
  }));
  sig.addEventListener('change', () => { draft.wtp_signal = sig.value; queueSave(); });
  sigWrap.appendChild(sig);
  card.appendChild(sigWrap);

  if (!STATE.pricing_ideas.length) {
    card.appendChild(h('div', { class: 'inset-block mt-3' }, [
      h('div', { class: 'text-sm', text: 'No priced options to read out yet. Add them under Reference → Pricing options, then they appear here with their numbers.' }),
      h('button', { class: 'btn btn-line text-xs mt-2', onclick: () => go('pricing') }, 'Set up the options'),
    ]));
    return card;
  }

  card.appendChild(h('div', { class: 'micro t-bronze mt-4 mb-2', text: 'Read these out, with the numbers' }));
  STATE.pricing_ideas.forEach(idea => card.appendChild(priceRow(idea)));
  return card;
}

function priceRow(idea) {
  const priceLine = idea.price_low || idea.price_high
    ? `${fmtKES(idea.price_low)}${idea.price_high && idea.price_high !== idea.price_low ? ' – ' + fmtKES(idea.price_high) : ''}${idea.unit ? ' ' + idea.unit : ''}`
    : 'No number set — put one on it before you read it out.';

  const existing = () => STATE.pricing_reactions.find(r =>
    String(r.pricing_idea_id) === String(idea.id) && String(r.conversation_id) === String(draft.id));

  const box = h('div', { class: 'inset-block mb-2' });

  const paint = () => {
    box.innerHTML = '';
    const r = draft.id ? existing() : null;
    box.appendChild(h('div', { class: 'flex flex-wrap items-center gap-1.5 mb-1' }, [
      chip(idea.model || 'Model not set', 'violet'),
      r ? chip(r.reaction, reactionTone(r.reaction)) : chip('no reaction yet', 'line'),
    ]));
    box.appendChild(h('div', { class: 'text-sm', text: idea.name || '—' }));
    box.appendChild(h('div', { class: 'text-sm t-bronze num', text: priceLine }));

    const btns = h('div', { class: 'flex flex-wrap gap-1 mt-2' });
    REACTION_NAMES.forEach(name => {
      btns.appendChild(h('button', {
        class: `btn ${r && r.reaction === name ? 'btn-primary' : 'btn-line'} text-xs`,
        onclick: () => recordReaction(idea, name, paint),
      }, name));
    });
    box.appendChild(btns);

    if (r) {
      if (r.verbatim) box.appendChild(h('div', { class: 'quote-text mt-2', text: `“${r.verbatim}”` }));
      box.appendChild(h('div', { class: 'flex flex-wrap gap-2 mt-2' }, [
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => reactionDetail(idea, r, paint) },
          r.verbatim ? 'Edit their words' : '+ Their exact words'),
        h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: async () => {
          await data.remove('pricing_reactions', r.id);
          STATE.pricing_reactions = await data.list('pricing_reactions');
          paint();
        } }, 'Clear'),
      ]));
    }
  };
  paint();
  return box;
}

async function recordReaction(idea, reaction, after) {
  await ensureSaved();
  const found = STATE.pricing_reactions.find(r =>
    String(r.pricing_idea_id) === String(idea.id) && String(r.conversation_id) === String(draft.id));
  if (found) {
    await data.update('pricing_reactions', found.id, { reaction });
  } else {
    await data.create('pricing_reactions', {
      pricing_idea_id: idea.id, conversation_id: draft.id, prospect_id: draft.prospect_id,
      reaction, date: draft.date || today(), owner: draft.interviewer || ownerOptions()[0],
    });
    /* An idea somebody has now reacted to is being tested, not waiting. */
    if (idea.status === 'To test') {
      await data.update('pricing_ideas', idea.id, { status: 'Testing' });
      STATE.pricing_ideas = await data.list('pricing_ideas');
    }
  }
  STATE.pricing_reactions = await data.list('pricing_reactions');
  after();
}

function reactionDetail(idea, r, after) {
  openModal(`What did they say about "${idea.name}"?`, [
    formField('Word for word', 'verbatim', 'textarea', r.verbatim || ''),
    formField('A number they gave, if any (KES)', 'their_number', 'input', r.their_number ?? '', null, 'number'),
    formField('Notes', 'notes', 'textarea', r.notes || ''),
  ], async (form) => {
    await data.update('pricing_reactions', r.id, {
      verbatim: form.verbatim,
      their_number: form.their_number == null || form.their_number === '' ? null : Number(form.their_number),
      notes: form.notes,
    });
    STATE.pricing_reactions = await data.list('pricing_reactions');
    closeModal();
    after();
  });
}

/* ------------------------------------------------------------
   Done — save, keep the pipeline honest, and go back.
   ------------------------------------------------------------ */
async function finish(prospect) {
  await ensureSaved();
  if (prospect && prospect.id) {
    const patch = { last_touch: draft.date || today() };
    /* A conversation is a touch, and "we spoke" is a stage. Neither should
       need a second trip to the Prospects screen to record. */
    if (['To contact', 'Contacted'].includes(prospect.status)) patch.status = 'Talked';
    const agreed = String(parseAnswers(draft).agreed_next || '').trim();
    if (agreed) patch.next_step = agreed;
    await data.update('prospects', prospect.id, patch);
    STATE.prospects = await data.list('prospects');
  }
  draft = null;
  go('conversations');
}

/* A block is a card with a heading and a line saying how to use it. */
function blockCard(block) {
  return h('div', { class: 'card card-pad mb-4' }, [
    h('div', { class: 'card-title', text: block.title }),
    h('div', { class: 'text-2nd t-mute mb-3', text: block.sub }),
  ]);
}

/* Reading an old sheet whose segment has since changed must never hide an
   answer. Anything recorded under a question no longer in this segment's
   script is shown at the bottom rather than silently dropped. */
function orphanedAnswers(conv, segment) {
  const inScript = new Set(scriptFor(segment).flatMap(b => b.questions).map(q => q.key));
  return allQuestions()
    .filter(q => !inScript.has(q.key) && String(readAnswer(conv, q) || '').trim())
    .map(q => ({ q, value: readAnswer(conv, q) }));
}

registerRoute('sheet', 'Interview sheet', renderSheet,
  'What did they say?');
