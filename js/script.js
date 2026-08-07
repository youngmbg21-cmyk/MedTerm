/* ============================================================
   THE INTERVIEW SCRIPT — the questions we actually ask, in the
   order we ask them, written differently for each segment.

   Why this exists. A blank box labelled "biggest pain" produces
   a different interview every time, and two founders filling
   their own blank boxes for six weeks end up with notes that
   cannot be compared to each other. A written script means Young
   and Simon ask the same things, in the same words, and the
   answers line up at the end.

   Every question that can move one of the five questions carries
   `aimsAt` — the REF of the question it feeds ('Q1'…'Q5'). That
   ref is resolved against the live `questions` table at render
   time (see js/evidence.js `questionByRef`); nothing here is a
   copy of a question, only a pointer to one. If somebody renames
   or deletes Q3 in the app, the pointer simply stops matching and
   the sheet carries on — the five questions stay first-class
   records, never hardcoded.

   `field` names the column on `conversations` an answer is stored
   in, where one already fits. Answers with no `field` are kept
   together in the `answers` column as JSON, keyed by `key`. That
   way the columns the rest of the app already reads keep working
   and the script can still grow.

   This file is the single home for the script. No screen may
   define its own questions.
   ============================================================ */

/* The blocks of a sheet, in the order they are filled in. Two are
   rendered specially by the sheet screen rather than as a list of
   text questions: 'who' (the structured header) and 'money' (the
   priced options, each with its own reaction). */
export const BLOCKS = [
  { id: 'who',   title: 'Who and when',
    sub: 'Fill this in before you walk in, so you are not typing while they talk.' },
  { id: 'today', title: 'Their world today',
    sub: 'How contracts actually move through this company right now.' },
  { id: 'pain',  title: 'The pain',
    sub: 'Let them name it. Never offer a list — an answer you prompted proves nothing.' },
  { id: 'trust', title: 'Signing and trust',
    sub: 'Only ask these if signing comes up naturally, or near the end.' },
  { id: 'money', title: 'The money',
    sub: 'Read the options out with the real numbers. Write down what they say, not what you think they meant.' },
  { id: 'words', title: 'Their words and what happens next',
    sub: 'One quote worth repeating, and what you agreed to do.' },
];

/* ------------------------------------------------------------
   The questions every interview asks, whoever is in the room.
   ------------------------------------------------------------ */
const COMMON = {
  today: [
    { key: 'walk_through', aimsAt: 'Q5', field: 'current_tools', rows: 4,
      ask: 'Walk me through what happens when a new contract comes in — from the moment it arrives to the moment it is signed and filed.',
      hint: 'Let them narrate. Every tool they name — email, WhatsApp, the shared drive, DocuSign, a lawyer — is the real competitor.' },
    { key: 'where_kept', aimsAt: 'Q5', rows: 2,
      ask: 'Where do the signed ones live, and who can find them?',
      hint: 'If the answer is "a folder on the drive" or "ask Mercy", that is Q5 answered in their own words.' },
    { key: 'who_owns', aimsAt: 'Q1', rows: 2,
      ask: 'Whose job is it to keep track of all this?',
      hint: 'This is the buyer, or the person who tells you who the buyer is. Often not Legal.' },
  ],
  pain: [
    { key: 'worst_moment', aimsAt: 'Q1', field: 'main_pain', rows: 4,
      ask: 'What is the worst contract moment you have had in the last twelve months?',
      hint: 'Ask it exactly like this, then stop talking. Q1 is only answered by a pain they name unprompted — if you offer them a list you have wasted the question.' },
    { key: 'what_it_cost', aimsAt: 'Q1', field: 'pain_cost', rows: 3,
      ask: 'What did that one cost you — in money, in time, or in who had to get involved?',
      hint: 'A number here is worth more than the whole rest of the sheet. Push gently for one.' },
    { key: 'how_often', aimsAt: 'Q1', rows: 2,
      ask: 'How often does something like that happen?',
      hint: 'Once ever is a story. Once a quarter is a budget.' },
    { key: 'tried_already', aimsAt: 'Q5', rows: 3,
      ask: 'Have you tried to fix it before? What happened?',
      hint: 'A failed previous attempt tells you what displacing the incumbent actually costs.' },
  ],
  trust: [
    { key: 'signing_today', aimsAt: 'Q3', rows: 3,
      ask: 'How do contracts get signed today — wet ink, scanned, or something electronic?',
      hint: 'If they already sign electronically, Q3 is much less likely to be a blocker.' },
    { key: 'esign_objection', aimsAt: 'Q3', rows: 3,
      ask: 'If we signed inside our system rather than on paper, who in your organisation would need to be comfortable with that, and what would they ask?',
      hint: 'You are listening for the word "accredited". Do NOT raise IPRS or CAK yourself — whether the objection appears unprompted is the whole of Q3.' },
  ],
  words: [
    { key: 'best_quote', field: 'best_quote', rows: 3,
      ask: 'The one sentence they said that you would repeat to somebody else.',
      hint: 'Their words, not your summary. Write it while you still remember the phrasing.' },
    { key: 'agreed_next', rows: 2,
      ask: 'What did you agree would happen next, and by when?',
      hint: 'Saved onto the prospect as their next step when you finish the sheet.' },
    { key: 'notes', field: 'notes', rows: 5,
      ask: 'Anything else worth keeping.',
      hint: 'Optional. The sheet above is what gets compared; this is for everything that did not fit.' },
  ],
};

/* ------------------------------------------------------------
   What changes by segment. These are added to the common set —
   the extra question you would only ask this kind of company.
   Segment names must match SEGMENTS in js/config.js.
   ------------------------------------------------------------ */
const BY_SEGMENT = {
  'Mid-size corporate': {
    today: [
      { key: 'renewals', aimsAt: 'Q1', rows: 3,
        ask: 'How do you know when a contract is coming up for renewal or needs notice given?',
        hint: 'The renewal calendar is HaTi\'s strongest single pitch. If they have no answer here, say nothing yet — just write it down.' },
    ],
    pain: [
      { key: 'missed_renewal', aimsAt: 'Q1', rows: 3,
        ask: 'Has a renewal or a notice deadline ever gone past without anyone noticing?',
        hint: 'Only ask if they did not already raise it. A yes here, with a cost attached, is the clearest Q1 evidence you can get.' },
    ],
    money: [
      { key: 'whose_budget', aimsAt: 'Q2', rows: 2,
        ask: 'If you wanted this, whose budget would it come out of, and who signs it off?',
        hint: 'Usually Legal wants it and the CFO pays. Q2 needs both names.' },
    ],
  },

  'High-volume, thin legal': {
    today: [
      { key: 'volume', aimsAt: 'Q1', rows: 2,
        ask: 'Roughly how many agreements or policy documents go through here in a month?',
        hint: 'Volume is this tier\'s whole argument. Get a number, even a rough one.' },
      { key: 'regulator', aimsAt: 'Q4', rows: 3,
        ask: 'Does a regulator ever ask you to produce these, and what do they want to see?',
        hint: 'An audit-trail requirement is a reason to buy that has nothing to do with convenience.' },
    ],
    pain: [
      { key: 'legal_cover', aimsAt: 'Q1', rows: 2,
        ask: 'Who reviews these when nobody in-house has time?',
        hint: 'If the answer is "we send them out", that is outside-counsel spend you can quantify.' },
    ],
    money: [
      { key: 'per_doc_thinking', aimsAt: 'Q2', rows: 2,
        ask: 'Do you think about a cost like this per document, per person, or as one bill for the company?',
        hint: 'This tier often thinks per document. That is a different pricing model from everyone else.' },
    ],
  },

  'Law firm / counsel': {
    today: [
      { key: 'client_delivery', aimsAt: 'Q1', rows: 3,
        ask: 'When you draft or review for a client, how does the document get to them and back?',
        hint: 'You are testing whether HaTi is their delivery tool rather than their filing cabinet.' },
      { key: 'client_stack', aimsAt: 'Q5', rows: 2,
        ask: 'What do your clients use on their side?',
        hint: 'A law firm sees twenty companies\' setups. This is the cheapest market research available to you.' },
    ],
    pain: [
      { key: 'unbilled', aimsAt: 'Q1', rows: 3,
        ask: 'How much of your week goes on work you cannot bill for — chasing signatures, re-sending versions, finding old drafts?',
        hint: 'For this tier the pain is unbilled hours, not missed renewals.' },
    ],
    money: [
      { key: 'resale', aimsAt: 'Q2', rows: 3,
        ask: 'Would you put a client on this, and would you want to charge them for it or include it?',
        hint: 'This is the services wedge and the Advice Desk is already built for it. A yes here is a different business model, not a different customer — flag it as Q2 evidence either way.' },
      { key: 'rate_card', aimsAt: 'Q2', rows: 3,
        ask: 'Our published review rate is KES 8,500 an hour and drafting is 9,500. How does that sit against what you charge?',
        hint: 'The only real price HaTi has. A law firm is the one prospect who can tell you whether it is right.' },
    ],
  },

  'Enterprise': {
    today: [
      { key: 'procurement', aimsAt: 'Q4', rows: 3,
        ask: 'What does it take to get a new supplier of this kind approved here?',
        hint: 'Expect a vendor security review. Write down every step — this is the Q4 compliance bill, itemised for free.' },
    ],
    trust: [
      { key: 'dpa_ask', aimsAt: 'Q4', rows: 3,
        ask: 'What would your data protection or IT people need from us before this could be used on real contracts?',
        hint: 'You are listening for: ODPC registration, a Data Processing Agreement, retention policy, penetration test. Each one named is a Q4 finding with a cost attached.' },
    ],
    money: [
      { key: 'procure_cycle', aimsAt: 'Q2', rows: 2,
        ask: 'How long does something like this normally take from first conversation to signed order?',
        hint: 'If the honest answer is nine months, that is worth knowing before you spend a quarter on them.' },
    ],
  },
};

/* No segment recorded yet — ask the common set and nothing more. */
const NO_SEGMENT = {};

/* ------------------------------------------------------------
   The script for one interview: the common questions, plus the
   ones that belong to this segment, block by block.
   ------------------------------------------------------------ */
export function scriptFor(segment) {
  const extra = BY_SEGMENT[segment] || NO_SEGMENT;
  return BLOCKS.map(block => ({
    ...block,
    questions: [...(COMMON[block.id] || []), ...(extra[block.id] || [])],
  }));
}

/* Every question in every script, flattened — used to read a saved
   answer back out without knowing which segment wrote it, so a
   prospect who moves from one segment to another never loses one. */
export function allQuestions() {
  const out = [];
  const push = (set) => Object.values(set).forEach(list => list.forEach(q => {
    if (!out.some(x => x.key === q.key)) out.push(q);
  }));
  push(COMMON);
  Object.values(BY_SEGMENT).forEach(push);
  return out;
}

/* How many questions a segment's script asks — used to show progress
   on the sheet without counting inside a render loop. */
export function scriptLength(segment) {
  return scriptFor(segment).reduce((n, b) => n + b.questions.length, 0);
}
