/* ============================================================
   SEED — the workspace as it arrives on day one.

   A deliberate rule governs what is in here: this file contains
   REFERENCE MATERIAL and OUR OWN IDEAS. It contains no invented
   evidence. There are no seeded conversations, no seeded quotes,
   no seeded insights and no seeded pricing reactions, because a
   research tool that ships with fabricated findings is worse than
   an empty one — the assistant would cite them, and the two of you
   would end up arguing about something nobody ever said.

   Everything seeded here is one of:
     · the five questions from RESEARCH_BRIEF.md
     · competitors that exist, with their facts marked unverified
     · Kenyan law and market facts, each with a real source link
       to open and confirm
     · pricing models we might charge — our ideas, clearly ours
     · a starter target list of companies to approach, none of whom
       has been contacted

   Every seeded row that asserts something we have not checked says
   so in its own fields. Verify, then edit.
   ============================================================ */

/* Stable ids so seeded records can point at seeded parents, and so the
   ids survive a reset. */
const Q = {
  buyer:     'q-buyer',
  pay:       'q-pay',
  signature: 'q-signature',
  legal:     'q-legal',
  incumbent: 'q-incumbent',
};

/* ------------------------------------------------------------
   The five questions. These are the spine of the workspace —
   everything else exists to move one of them.
   ------------------------------------------------------------ */
export function buildQuestions() {
  return [
    {
      id: Q.buyer,
      ref: 'Q1',
      short: 'Who is the buyer, and what job do they hire HaTi for?',
      why_it_matters: 'HaTi does storage, signing, renewal tracking, AI review, migration and legal services — all well. That breadth is a symptom of not yet knowing which single pain a buyer will pay to remove. Does a Kenyan Head of Legal buy this to stop missing renewal deadlines, to get contracts signed faster, to find their contracts at all, or to cut outside counsel spend?',
      would_answer: '10–15 discovery conversations where the prospect names their own worst contract moment of the last 12 months, unprompted — without us offering them a list to pick from.',
      status: 'Open',
      leaning: '',
      owner: '',
      sort: 1,
    },
    {
      id: Q.pay,
      ref: 'Q2',
      short: 'Will a Kenyan company pay for CLM software — and in what shape?',
      why_it_matters: 'Not "would you use this" but "what would you pay, on what basis, out of whose budget". Per-seat, flat, per-contract, or services-with-software-attached are four different companies. The answer also decides whether the immediate build is billing and multi-tenancy, or nothing at all.',
      would_answer: 'The same prospects reacting to three concrete priced options, plus at least one signed order. A paid pilot counts. A letter of intent does not.',
      status: 'Open',
      leaning: '',
      owner: '',
      sort: 2,
    },
    {
      id: Q.signature,
      ref: 'Q3',
      short: 'Does the signature stand up without IPRS and CAK-accredited PKI?',
      why_it_matters: 'HaTi’s seal is cryptographically sound and rests on the Business Laws (Amendment) Act 2020, but it is not the accredited tier, and the product says so out loud. If a customer’s legal or IT reviewer treats accreditation as mandatory, the signing flow — the trust core of the product — is blocked, and HaTi is a repository with reminders.',
      would_answer: 'The objection either appearing or not appearing in real conversations, plus a written read on Kenyan e-signature law and what accreditation actually requires, with sources.',
      status: 'Open',
      leaning: '',
      owner: '',
      sort: 3,
    },
    {
      id: Q.legal,
      ref: 'Q4',
      short: 'What does it take to be legally sellable in Kenya?',
      why_it_matters: 'No ODPC registration, no Data Processing Agreement, no documented retention or subject-access path. Self-hosting defers the problem but caps growth at one server per customer. Add stamp duty handling and the e-signature rules, and there is a compliance bill of unknown size in front of the first enterprise deal.',
      would_answer: 'A documented list of every regulatory requirement with a source link, a cost and a time estimate — market size, Data Protection Act, stamp duty, e-signature rules. Facts with sources, not impressions.',
      status: 'Open',
      leaning: '',
      owner: '',
      sort: 4,
    },
    {
      id: Q.incumbent,
      ref: 'Q5',
      short: 'What displaces the incumbent — email, Word and a shared drive?',
      why_it_matters: 'The real competitor is not Ironclad or Juro. It is a folder on a shared drive, a WhatsApp thread, DocuSign for the signature, and a lawyer on retainer. That incumbent is free, already installed and universally understood. HaTi needs one thing it cannot do that a buyer will pay to have.',
      would_answer: 'A maintained competitor map that includes the do-nothing option, and prospects saying in their own words what they use today and what it costs them.',
      status: 'Open',
      leaning: '',
      owner: '',
      sort: 5,
    },
  ];
}

/* ------------------------------------------------------------
   Competitors. Facts here are STARTING POINTS, not research.
   Every price field says what still needs checking, because a
   made-up competitor price is the fastest way to price ourselves
   wrong.
   ------------------------------------------------------------ */
const UNVERIFIED = 'Not verified by us. Open the source link, read the current pricing page, then replace this line and log an update.';

function buildCompetitors() {
  return [
    {
      id: 'c-ironclad', name: 'Ironclad', type: 'Global CLM',
      hq: 'United States',
      positioning: 'Enterprise CLM for large legal teams. Workflow designer, AI clause review, deep integrations. The category leader by name recognition.',
      pricing_model: 'Enterprise, quote-only',
      price_notes: `No public price list; sold through sales with annual contracts. ${UNVERIFIED}`,
      strengths: 'Brand, workflow depth, integrations, enterprise trust.',
      weaknesses: 'Priced far above the Kenyan mid-market. No Kenyan templates, no local law, no local support hours. Long implementations.',
      kenya_presence: 'No local presence known. Would reach Kenya only through a multinational’s global contract.',
      threat: 'Low',
      source_url: 'https://ironcladapp.com/',
      notes: 'Matters mainly as the feature ceiling a sophisticated buyer will compare us to, and as proof the category is real.',
    },
    {
      id: 'c-juro', name: 'Juro', type: 'Global CLM',
      hq: 'United Kingdom',
      positioning: 'CLM aimed at fast-growing companies. Browser-native editor, AI extraction, self-serve templates for non-legal staff.',
      pricing_model: 'Tiered subscription',
      price_notes: `Publishes tiers; entry pricing is the closest global comparison to what we might charge. ${UNVERIFIED}`,
      strengths: 'Excellent product experience, strong self-serve story, well marketed to non-lawyers.',
      weaknesses: 'No Kenyan legal content. Pricing is in GBP/USD, which lands hard on a Kenyan budget.',
      kenya_presence: 'None known.',
      threat: 'Medium',
      source_url: 'https://juro.com/pricing',
      notes: 'The closest thing to a product benchmark for HaTi. Worth reading their pricing page properly and logging the numbers as a market fact.',
    },
    {
      id: 'c-docusign', name: 'DocuSign (eSignature + CLM)', type: 'E-signature',
      hq: 'United States',
      positioning: 'The default e-signature everyone has heard of, with a CLM product attached above it.',
      pricing_model: 'Per user / month, plus envelope limits',
      price_notes: `Public per-seat pricing on eSignature; CLM is quote-only. ${UNVERIFIED}`,
      strengths: 'Universal recognition. A counterparty who refuses an unfamiliar signing tool will accept DocuSign without asking.',
      weaknesses: 'Envelope limits irritate high-volume users. CLM is expensive and separate. Nothing Kenya-specific.',
      kenya_presence: 'Used in Kenya today, mostly for signature only.',
      threat: 'High',
      source_url: 'https://www.docusign.com/products-and-pricing',
      notes: 'The most important competitor to understand: it is what a Kenyan company already uses for the one job HaTi says it does best. Find out what our prospects actually pay for it.',
    },
    {
      id: 'c-oneflow', name: 'Oneflow', type: 'Global CLM',
      hq: 'Sweden',
      positioning: 'Contract automation with live, editable contracts and strong CRM integration. Sells to sales teams as much as to legal.',
      pricing_model: 'Per user / month, tiered',
      price_notes: `Publishes tiered per-user pricing. ${UNVERIFIED}`,
      strengths: 'Multi-signer flows, approval routing, good mid-market fit and pricing transparency.',
      weaknesses: 'European focus. No Kenyan law, templates or support.',
      kenya_presence: 'None known.',
      threat: 'Medium',
      source_url: 'https://oneflow.com/pricing/',
      notes: 'HaTi’s own backlog names Oneflow as the feature benchmark for approvals and multi-signer. Their published pricing is the most usable per-seat comparison we have.',
    },
    {
      id: 'c-local', name: 'Kenyan legal-tech players — to be identified', type: 'Kenyan / local',
      hq: 'Kenya',
      positioning: 'UNKNOWN. We do not currently know who else is selling contract software into the Kenyan market, and that is a hole in our understanding, not an absence of competition.',
      pricing_model: 'Unknown',
      price_notes: 'Nothing recorded. This row exists to make the gap visible.',
      strengths: 'Whoever they are, they will have the same local-law advantage we claim, plus a head start on relationships.',
      weaknesses: 'Unknown.',
      kenya_presence: 'By definition, local.',
      threat: 'Unknown',
      source_url: '',
      notes: 'FIRST RESEARCH TASK. Ask every prospect "who else have you looked at?", and ask two Nairobi commercial lawyers what their clients use. Split this row into real competitors as you find them.',
    },
    {
      id: 'c-statusquo', name: 'Shared drive + Word + email', type: 'Status quo',
      hq: '—',
      positioning: 'Contracts live in a folder. Versions travel by email. The signature is a scan, a wet signature, or DocuSign. Renewal dates live in somebody’s head or a spreadsheet.',
      pricing_model: 'Free (already paid for)',
      price_notes: 'Costs nothing visible. The real cost is a missed renewal, a lost contract, or a week of a lawyer’s time — none of which appears on any budget line.',
      strengths: 'Free. Already installed. Everybody knows how to use it. Nobody has to be trained, approved or migrated.',
      weaknesses: 'Nothing is findable at scale. Nobody knows what is expiring. There is no audit trail worth the name. The pain is invisible until something goes wrong.',
      kenya_presence: 'Universal.',
      threat: 'High',
      source_url: '',
      notes: 'This is the competitor we actually have to beat. Every conversation should establish what it costs them — in money, in time, in one specific incident. If a prospect cannot name an incident, they will not buy.',
    },
    {
      id: 'c-counsel', name: 'Outside counsel on retainer', type: 'Status quo',
      hq: 'Nairobi',
      positioning: 'A law firm handles the contracts that matter. Everything else is done in-house, informally.',
      pricing_model: 'Hourly / retainer',
      price_notes: 'HaTi’s own Advice Desk rate card prices this work at KES 7,500–10,500 per hour, which is our own read of the market rate. Confirm against what prospects actually pay.',
      strengths: 'Trusted, accountable, and someone else carries the risk. A relationship, not a subscription.',
      weaknesses: 'Expensive per matter. Slow. Does nothing about renewals, storage, or finding a contract at 5pm on a Friday.',
      kenya_presence: 'Universal at the top end of the market.',
      threat: 'Medium',
      source_url: '',
      notes: 'Also a potential channel, not only a competitor — see the law-firm segment. A firm that delivers through HaTi turns this row from a threat into a route to market.',
    },
  ];
}

/* ------------------------------------------------------------
   Market & regulation facts. Every one carries a real source
   link, and every one is marked "Needs checking" on purpose:
   they are the right documents to read, not a summary you can
   rely on. Read the link, then write what it actually says and
   change the strength.
   ------------------------------------------------------------ */
function buildMarketFacts() {
  return [
    {
      category: 'Data Protection Act',
      claim: 'Kenya’s Data Protection Act 2019 governs how we may hold customer and counterparty personal data, and the Office of the Data Protection Commissioner runs registration of data controllers and processors.',
      detail: 'What we need from this: (1) does HaTi need to register as a data processor, and at what fee; (2) what a compliant Data Processing Agreement with a customer must contain; (3) what a breach obligates us to do. Self-hosting shifts some of this to the customer — confirm how much.',
      value: '',
      source_name: 'Office of the Data Protection Commissioner',
      source_url: 'https://www.odpc.go.ke/',
      strength: 'Needs checking',
      affects_question: Q.legal,
      checked_on: '',
      notes: 'Seeded as the right place to start, not as an answer. Nobody has read this yet.',
    },
    {
      category: 'E-signature law',
      claim: 'Electronic signatures are legally recognised in Kenya, and the Business Laws (Amendment) Act 2020 is the basis HaTi currently relies on.',
      detail: 'The open question is whether an ordinary electronic signature is enough, or whether an "advanced electronic signature" — which requires a certificate from an accredited certification service provider — is needed for the contract types our customers care about. This is the single fact Q3 turns on.',
      value: '',
      source_name: 'Kenya Law',
      source_url: 'https://www.kenyalaw.org/',
      strength: 'Needs checking',
      affects_question: Q.signature,
      checked_on: '',
      notes: 'Read the Act itself, then the Kenya Information and Communications Act provisions on advanced electronic signatures. Write down which contract types need which tier.',
    },
    {
      category: 'E-signature law',
      claim: 'The Communications Authority of Kenya accredits Electronic Certification Service Providers, whose certificates underpin advanced electronic signatures.',
      detail: 'What we need: the list of accredited providers, what it costs to work with one, and whether HaTi can integrate with an accredited provider rather than becoming one. If integration is possible and affordable, Q3 stops being a blocker and becomes a roadmap item.',
      value: '',
      source_name: 'Communications Authority of Kenya',
      source_url: 'https://www.ca.go.ke/',
      strength: 'Needs checking',
      affects_question: Q.signature,
      checked_on: '',
      notes: '',
    },
    {
      category: 'Stamp duty',
      claim: 'Certain instruments in Kenya attract stamp duty, and an unstamped instrument can be inadmissible in evidence.',
      detail: 'Matters to HaTi twice over: the AI review already flags stamp duty, and a customer will ask whether HaTi handles stamping. Establish which contract types are dutiable, the current rates, and how stamping is done today.',
      value: '',
      source_name: 'Kenya Revenue Authority',
      source_url: 'https://www.kra.go.ke/',
      strength: 'Needs checking',
      affects_question: Q.legal,
      checked_on: '',
      notes: 'Also check the Stamp Duty Act (Cap 480) on Kenya Law for the schedule of dutiable instruments.',
    },
    {
      category: 'Market size',
      claim: 'We do not have a defensible estimate of how many Kenyan companies are large enough to need contract lifecycle management.',
      detail: 'The number we need is not "the African legal tech market" — it is how many Kenyan firms have 100+ live contracts and at least one person responsible for them. The Kenya National Bureau of Statistics business data and the Nairobi Securities Exchange listed-company list are two honest starting points for a bottom-up count.',
      value: '',
      source_name: 'Kenya National Bureau of Statistics',
      source_url: 'https://www.knbs.or.ke/',
      strength: 'Needs checking',
      affects_question: Q.pay,
      checked_on: '',
      notes: 'Build this bottom-up and write down the arithmetic. A top-down market-size number from a report we did not commission is worth nothing in a decision.',
    },
    {
      category: 'Competitor pricing',
      claim: 'HaTi’s only existing price list is the Advice Desk rate card: KES 7,500–10,500 per hour depending on the service, with priority work at +25%.',
      detail: 'Review KES 8,500/h (3–6h, 3 days) · Drafting KES 9,500/h (4–8h, 5 days) · Advice KES 7,500/h (1–2h, 2 days) · Negotiation KES 10,500/h (3–6h, 4 days) · Compliance KES 9,000/h (2–4h, 4 days). This is the one number in the whole product that says what we think our work is worth.',
      value: 'KES 7,500–10,500 / hour',
      source_name: 'HaTi source code — server/server.js, ADVICE_DEFAULT_RATES',
      source_url: 'https://github.com/youngmbg21-cmyk/mkataba-clm',
      strength: 'Primary source',
      affects_question: Q.pay,
      checked_on: '',
      notes: 'Confirmed — read directly out of HaTi’s own source code. It is the baseline every pricing conversation should start from.',
    },
  ];
}

/* ------------------------------------------------------------
   Pricing ideas. These are OURS — four models to put in front of
   prospects, straight out of the research brief. No prospect has
   reacted to any of them yet.
   ------------------------------------------------------------ */
function buildPricingIdeas() {
  return [
    {
      name: 'Per seat, per month',
      model: 'Per seat / month',
      price_low: 3000, price_high: 8000, unit: 'per user / month',
      rationale: 'What every global CLM does, so a buyer who has looked at Juro or Oneflow will recognise it. Revenue scales with the customer.',
      risk: 'Kenyan buyers routinely resist per-seat pricing because it punishes them for adding users — which is exactly what we want them to do. Expect "so if I add my whole finance team it doubles?"',
      status: 'To test',
    },
    {
      name: 'Flat workspace subscription',
      model: 'Flat workspace / month',
      price_low: 25000, price_high: 120000, unit: 'per company / month',
      rationale: 'Fits how HaTi is actually deployed — one server per customer — and removes the per-seat objection entirely. Band it by contract count if needed.',
      risk: 'Harder to grow revenue inside an account. A small customer at the bottom band may cost more to serve than they pay.',
      status: 'To test',
    },
    {
      name: 'Onboarding / migration fee',
      model: 'Onboarding fee (one-off)',
      price_low: 150000, price_high: 500000, unit: 'one-off',
      rationale: 'HaTi’s migration tooling is genuinely good and the work is genuinely painful. This may be the easiest first cheque to collect and the fastest route to a reference customer.',
      risk: 'One-off revenue. Does not prove anyone will pay recurring, and could anchor the buyer into thinking of HaTi as a project rather than a product.',
      status: 'To test',
    },
    {
      name: 'Services-led, software included',
      model: 'Services retainer',
      price_low: 7500, price_high: 10500, unit: 'per hour (Advice Desk rate)',
      rationale: 'The shortest path to revenue, and the only model the product already supports end to end. Sell the legal work; the platform comes with it.',
      risk: 'Slowest to scale and hardest to reverse — it makes us a law firm with software rather than a software company. Choose it deliberately, not by drift.',
      status: 'To test',
    },
  ];
}

/* ------------------------------------------------------------
   A starter target list. NOBODY HERE HAS BEEN CONTACTED. These
   are drawn from the value streams in HaTi's own demo portfolio,
   which is the clearest statement of who the product was built
   for. Treat them as suggestions to accept, replace or delete.
   ------------------------------------------------------------ */
const NOT_CONTACTED = 'Seeded as a suggested target from HaTi’s demo portfolio. Nobody has been contacted. Replace the name with a real company and delete this line when you make the first approach.';

function buildProspects() {
  return [
    {
      company: 'A mid-size FMCG manufacturer', segment: 'Mid-size corporate', sector: 'FMCG / manufacturing',
      city: 'Nairobi', size: '100–500 staff',
      why_fit: 'The exact shape HaTi’s demo portfolio was modelled on: supplier agreements, co-packing, distribution, retail listings — hundreds of live contracts against a legal function of one or two people.',
      status: 'To contact', owner: '', channel: 'Intro / referral',
      next_step: 'Find a warm introduction to the Head of Legal or Company Secretary.',
      next_step_date: '', last_touch: '', notes: NOT_CONTACTED,
    },
    {
      company: 'A logistics & warehousing operator', segment: 'Mid-size corporate', sector: 'Logistics & warehousing',
      city: 'Mombasa / Nairobi', size: '100–500 staff',
      why_fit: 'High contract volume with a long tail of small counterparties, plus cold-chain and 3PL agreements carrying real penalty clauses. Renewal deadlines matter here in a way they do not everywhere.',
      status: 'To contact', owner: '', channel: 'LinkedIn',
      next_step: 'Identify who actually owns contracts — often Commercial rather than Legal in this sector.',
      next_step_date: '', last_touch: '', notes: NOT_CONTACTED,
    },
    {
      company: 'An insurance broker', segment: 'High-volume, thin legal', sector: 'Insurance & brokerage',
      city: 'Nairobi', size: '20–100 staff',
      why_fit: 'Very high document volume against almost no in-house legal cover, and a regulator that expects records. Cheaper to reach and faster to decide than a corporate.',
      status: 'To contact', owner: '', channel: 'Intro / referral',
      next_step: 'Test whether the pain here is contracts or policy documents — they are not the same product.',
      next_step_date: '', last_touch: '', notes: NOT_CONTACTED,
    },
    {
      company: 'A boutique commercial law firm', segment: 'Law firm / counsel', sector: 'Professional services',
      city: 'Nairobi', size: '5–30 staff',
      why_fit: 'The services wedge. A firm could use HaTi as its own delivery tool, or put its clients on it. The Advice Desk is already built for exactly this.',
      status: 'To contact', owner: '', channel: 'Intro / referral',
      next_step: 'Ask two questions: what do your clients use today, and would you put a client on this?',
      next_step_date: '', last_touch: '',
      notes: NOT_CONTACTED + ' Also our best source for answering Q3 (signature validity) and Q4 (what it takes to be sellable).',
    },
  ];
}

/* ------------------------------------------------------------
   The two seeds.
   ------------------------------------------------------------ */

/* First run, and "Reset to the starting workspace". */
export function buildSeed() {
  return {
    questions: buildQuestions(),
    competitors: buildCompetitors(),
    competitor_updates: [],
    prospects: buildProspects(),
    contacts: [],
    conversations: [],
    pricing_ideas: buildPricingIdeas(),
    pricing_reactions: [],
    market_facts: buildMarketFacts(),
    insights: [],
  };
}

/* "Start fresh" — keeps the reference material we did not gather
   ourselves, clears every record of our own research. */
export function buildFreshSeed() {
  return {
    questions: buildQuestions(),
    competitors: buildCompetitors(),
    competitor_updates: [],
    prospects: [],
    contacts: [],
    conversations: [],
    pricing_ideas: buildPricingIdeas(),
    pricing_reactions: [],
    market_facts: buildMarketFacts(),
    insights: [],
  };
}
