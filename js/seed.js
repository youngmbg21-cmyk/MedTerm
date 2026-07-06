/* ============================================================
   SEED DATA — realistic MedTerminal demo data for local mode.
   Dates are generated relative to "today" so time-based states
   (untagged past 24h, stalled outreach) are always visible.
   ============================================================ */
import { getTeam } from './config.js';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/* Full timestamp version — the assessment trajectory needs real datetimes
   spanning weeks, not the minute-staggered created_at buildDb assigns. */
function daysAgoIso(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

/* The six hypotheses / kill criteria the programme ships with, in their
   stock state (statuses fresh, no notes). Same statements as sql/schema.sql —
   the DB (or this seed, in local mode) is the single source of truth; no
   screen or prompt may hardcode these. Stable ids so seeded evidence_links
   can reference them. */
export function buildHypotheses() {
  return [
    { id: 'hyp-h1', code: 'H1', kind: 'buyer_hypothesis', title: 'Family abroad',
      description: 'Diaspora children pay for a Nairobi parent\'s care.',
      status: 'open', status_note: '', sort_order: 1 },
    { id: 'hyp-h2', code: 'H2', kind: 'buyer_hypothesis', title: 'Patient or Nairobi family pays',
      description: 'The patient or their Nairobi family pays directly for coordination.',
      status: 'open', status_note: '', sort_order: 2 },
    { id: 'hyp-h3', code: 'H3', kind: 'buyer_hypothesis', title: 'Hospital IPD pays',
      description: 'Hospital IPD (International Patient Department) pays for qualified leads or software.',
      status: 'open', status_note: '', sort_order: 3 },
    { id: 'hyp-k1', code: 'K1', kind: 'kill_criterion', title: 'CAC exceeds revenue',
      description: 'CAC per closed case > revenue per case kills the patient-pays model.',
      status: 'unknown', status_note: '', sort_order: 4 },
    { id: 'hyp-k2', code: 'K2', kind: 'kill_criterion', title: 'Conversion below 15%',
      description: 'Consult-to-travelled conversion < 15% kills the patient-pays model.',
      status: 'unknown', status_note: '', sort_order: 5 },
    { id: 'hyp-k3', code: 'K3', kind: 'kill_criterion', title: 'Service cost above $300',
      description: 'Service cost per case > USD 300 kills the patient-pays model.',
      status: 'unknown', status_note: '', sort_order: 6 },
  ];
}

/* The stock deliverables checklist for all six phases. Reused, with every
   status reset to 'Not started', by buildFreshFieldworkSeed() below — this
   is the literal list of "stock research protocols" the app ships with. */
function buildDeliverables() {
  return [
    { phase: 0, deliverable: "Lead's pre-work completed", status: 'Complete', evidence: 'Market notes + corridor sizing shared in workspace.' },
    { phase: 0, deliverable: 'Workspace live, both have written content', status: 'Complete', evidence: 'Both roles active in the workspace.' },
    { phase: 0, deliverable: 'Interview scripts v1 drafted', status: 'Complete', evidence: 'Segment scripts v1 drafted for every segment — see Scripts.' },
    { phase: 0, deliverable: 'Wedge brief signed and dated', status: 'Complete', evidence: 'Signed: patient-side coordination for Kenya→India corridor.' },
    { phase: 0, deliverable: 'Lead can explain the project unaided', status: 'Complete', evidence: 'Dry-run recorded on the Friday call.' },
    { phase: 0, deliverable: 'Lead has flagged ≥2 plan changes', status: 'Complete', evidence: 'Dropped Turkey corridor; added insurance-broker segment.' },
    { phase: 1, deliverable: 'Target list of 40+ contacts across all segments', status: 'In progress', evidence: '20 contacts listed so far.' },
    { phase: 1, deliverable: 'First outreach wave sent (≥15 contacts)', status: 'In progress', evidence: '13 contacted to date.' },
    { phase: 1, deliverable: '≥8 exploratory interviews completed', status: 'In progress', evidence: '12 logged — criterion nearly met, review quality.' },
    { phase: 1, deliverable: 'All interviews tagged same-day (hard rule holding)', status: 'Blocked', evidence: 'INT-011 and INT-012 are untagged. Fix before Friday.' },
    { phase: 1, deliverable: 'Outreach templates tested and refined once', status: 'Complete', evidence: 'v2 templates live — see Templates.' },
    { phase: 2, deliverable: '~30 depth interviews across segments', status: 'Not started', evidence: '' },
    { phase: 2, deliverable: 'Saturation reached in ≥4 segments', status: 'Not started', evidence: '' },
    { phase: 2, deliverable: 'Theme matrix ≥80 tagged entries', status: 'Not started', evidence: '' },
    { phase: 3, deliverable: 'Theme ranking completed and reviewed', status: 'Not started', evidence: '' },
    { phase: 3, deliverable: 'Segment cards for all interviewed segments', status: 'Not started', evidence: '' },
    { phase: 3, deliverable: 'Top-3 pains agreed, each with 3+ supporting quotes', status: 'Not started', evidence: '' },
    { phase: 3, deliverable: 'Kill list reviewed — dead hypotheses recorded', status: 'Not started', evidence: '' },
    { phase: 3, deliverable: 'State of the field written and dated', status: 'Not started', evidence: '' },
    { phase: 4, deliverable: 'Unit economics model with agreed assumptions', status: 'Not started', evidence: '' },
    { phase: 4, deliverable: 'Break-point analysis: all three checks evaluated', status: 'Not started', evidence: '' },
    { phase: 4, deliverable: 'Alternate models compared side-by-side', status: 'Not started', evidence: '' },
    { phase: 4, deliverable: 'Fragile assumptions field-checked', status: 'Not started', evidence: '' },
    { phase: 5, deliverable: 'Decision memo drafted (all seven sections)', status: 'Not started', evidence: '' },
    { phase: 5, deliverable: 'Memo co-signed by both team members', status: 'Not started', evidence: '' },
    { phase: 5, deliverable: 'If GO: MVP scope defined ("one of each")', status: 'Not started', evidence: '' },
    { phase: 5, deliverable: 'Confirmatory tests specified with metrics', status: 'Not started', evidence: '' },
  ];
}

/* The stock interview scripts — one per config segment, version 1, as the
   app ships. Every script covers the full theme taxonomy (Discovery, Trust,
   Friction, Pain, Money, Buyer, Aftercare) and aims questions at the
   hypothesis board (H1 family abroad · H2 patient/Nairobi family · H3
   Hospital IPD pays) and the kill criteria (K1 CAC · K2 conversion <15% ·
   K3 cost/case >$300) wherever that segment can answer them. Edit freely —
   saving in Scripts creates a new version and the old one is preserved. */
export function buildScripts() {
  return [
    {
      script_name: 'Patient', version: 1, content: [
        { title: 'Open (3 min)', body: 'Thank them. Promise: nothing quoted with their name without permission; notes are de-identified (initials only). Ask permission to record. One line on the project: understanding how Kenyan patients arrange treatment in India.' },
        { title: 'Story anchor (5 min)', body: '"Walk me through the last time you travelled — or seriously considered travelling — for treatment, from the day you knew you needed care abroad." Anchor everything that follows in this real story. Get dates, hospital, condition class (no medical detail needed).' },
        { title: 'Discovery — how the search started', body: '"How did you first start looking for hospitals abroad?" Probe: did a doctor first suggest going abroad? WhatsApp groups? A person who had been? Google? A broker who found YOU? Feeds Discovery — doctor referral · WhatsApp/personal · search/online · broker/agent.' },
        { title: 'Trust — how one option won', body: '"What made you trust one hospital or doctor over another?" Probe: doctor reputation, accreditation, how fast they replied, whether the price was clear up front. "Was there anyone you decided NOT to trust — why?" Feeds Trust — all four tags.' },
        { title: 'Friction — the hardest part', body: '"What was the most frustrating moment of the whole process?" Wait through the silence. Probe: chasing quotes, paperwork and reports, language, moving money to India, response delays. Feeds Friction — all five tags.' },
        { title: 'Pain & severity — the near-quit moment', body: '"Was there a moment you nearly gave up?" That moment is the wedge. Probe whether the pain was financial, emotional, coordination, or fear about the outcome. Rate severity in your notes 1–5. Feeds Pain — all four tags.' },
        { title: 'Money & true cost (K3 check)', body: '"Roughly what did the whole coordination cost — agent fees, calls, document couriering, wasted trips — on top of treatment?" Then: "If you did it again, what would you PAY someone to take off your plate, and how much?" Anchor on their number; do not suggest one. Feeds Money — willingness to pay and the $300/case kill check.' },
        { title: 'Buyer — who decided, who paid (H1/H2)', body: '"Who actually made the final decision to go — and whose money paid for the trip and the help around it?" Probe: self, spouse, children abroad sending money, extended family in Nairobi. This is the direct H1 vs H2 test — record it verbatim.' },
        { title: 'Aftercare — coming home', body: '"Walk me through what happened AFTER you landed back in Kenya. Who managed your follow-up?" Probe: did your Kenyan doctor receive the records from India, or did you carry paper? Where did you turn when something felt wrong? Who paid for follow-up visits? Feeds Aftercare — finding follow-up care · records back home · complications & readmission.' },
        { title: 'Close (3 min)', body: '"What should I have asked that I didn\'t?" Ask for two specific introductions (another patient, the doctor who first advised them). Confirm permission to follow up. Same-day: tag quotes into the matrix.' },
        { title: 'Requirements check (after the call)', body: 'You should now be able to tag: at least one Discovery, one Trust, one Friction, one Pain quote with severity; a WTP answer with a number or a refusal; a clear H1-or-H2 data point; and one Aftercare data point (how follow-up at home was found and handled). If any is missing, note the gap in the interview record.' },
      ],
    },
    {
      script_name: 'Caregiver', version: 1, content: [
        { title: 'Open (3 min)', body: 'Thank them. Acknowledge up front they carried this for someone else — this interview is about THEIR experience, not the patient\'s medical detail. De-identification promise, permission to record.' },
        { title: 'Story anchor (5 min)', body: '"Tell me about the time you organised treatment abroad for your [parent/spouse/relative] — starting from the day you realised local care wasn\'t enough."' },
        { title: 'Discovery — searching on someone\'s behalf', body: '"How did you look for options — and how was that different because it wasn\'t for you?" Probe: did a doctor plant the idea, who in the family network fed you leads, which WhatsApp groups, whether a broker approached the family. Feeds Discovery tags including doctor referral.' },
        { title: 'Trust — trusting for someone else', body: '"How did you decide what was safe enough for someone you love?" Probe: second opinions, accreditation, testimonials from other families, price clarity as a trust signal. "What almost broke your trust?" Feeds Trust tags.' },
        { title: 'Friction — coordinating as the proxy', body: '"What did the coordination actually involve, day to day?" Probe: collecting reports, translating medical language for the family, chasing quotes across time zones, moving money when the account wasn\'t yours. Feeds Friction tags.' },
        { title: 'Pain — the load nobody sees (severity)', body: '"What was the heaviest moment for YOU, separate from the patient\'s health?" Probe emotional load, family pressure, blame risk if it went wrong, money stress. Severity 1–5 in notes. Feeds Pain — emotional/coordination/financial.' },
        { title: 'Money & decision authority (H1/H2)', body: '"Who paid for what — and who had the final say when family members disagreed?" Probe: children abroad vs Nairobi family, whether money arrived as remittances, who a service would have to convince. Then WTP: "What would the family have paid a trustworthy coordinator, honestly?" Feeds H1/H2 and Money tags.' },
        { title: 'Kill checks (K2/K3 signal)', body: '"Did the patient actually travel in the end — and if not, what stopped it?" (conversion signal for K2). "What did the arranging itself cost the family?" (K3 signal).' },
        { title: 'Aftercare — managing the return', body: '"Once they were back home, who organised the follow-up care — and what fell on you?" Probe: chasing records from the Indian hospital, finding a local doctor willing to take over, watching for complications without clinical training, paying for follow-up. Feeds all three Aftercare tags.' },
        { title: 'Close (3 min)', body: 'Anything missed · two introductions (another caregiver, the doctor or agent they used) · follow-up permission · same-day tag.' },
        { title: 'Requirements check (after the call)', body: 'Must-haves: proxy-decision dynamics (who decides vs who pays — H1/H2), one coordination-pain quote with severity, a WTP number or refusal, the travelled/didn\'t-travel outcome, and one Aftercare quote on how the return home was managed.' },
      ],
    },
    {
      script_name: 'Referring doctor', version: 1, content: [
        { title: 'Open (2 min)', body: 'Professional intro. You are researching how Kenyan patients arrange treatment in India; their clinical judgment is why you\'re here, and nothing patient-identifying is needed. Not selling. Permission to record.' },
        { title: 'Warm-up (3 min)', body: '"How often do you see a patient whose condition needs care you\'d advise seeking outside Kenya — and what kinds of cases are they?"' },
        { title: 'The referral moment (Discovery — doctor referral)', body: '"Walk me through the last case where you told a family to consider India or abroad. What tipped that decision — capability, equipment, waiting time, cost?" This is the origin of the journey the patient scripts pick up. Feeds Discovery — doctor referral.' },
        { title: 'The handover gap', body: '"Once you\'ve said \'consider going abroad\' — what do you actually give the family? A hospital name? A report? A phone number?" Probe where their involvement ends and the family is on its own. That gap is the wedge from the clinical side.' },
        { title: 'Documents & case preparation', body: '"What records do you prepare for a family heading to India — and what do Indian hospitals ask for that\'s hard to produce here?" Cross-checks the Hospital IPD document standard from the origin side. Feeds Friction — paperwork.' },
        { title: 'Trust — whose name goes near it', body: '"How do you decide which hospitals abroad you\'d mention to a patient? What would make you refuse to?" Probe: outcomes they\'ve seen, accreditation, colleagues\' experiences, horror stories. Feeds Trust tags.' },
        { title: 'Referral economics — the honest question', body: '"Do agents or hospitals ever offer commissions for referrals? How does that work here, honestly?" Non-judgmental tone; this maps the informal channel. Feeds Money — broker commission.' },
        { title: 'Aftercare — the return handover (core)', body: '"When a patient comes back from treatment in India, how do you resume their care?" Probe: do the records ever arrive, in what form and language; who manages complications; have you ever had to guess at what was done abroad? The referring doctor IS the aftercare system — get specifics. Feeds all three Aftercare tags.' },
        { title: 'Channel test — would they refer into a service?', body: '"If a coordination service packaged your referral properly — full records out, treated patient back with complete notes — would you refer patients into it? What would it have to prove first? Would you expect to be paid?" Channel and adoption evidence for the wedge.' },
        { title: 'Close (3 min)', body: 'Anything missed · two introductions (a family they referred, a colleague who refers often) · follow-up permission · same-day tag.' },
        { title: 'Requirements check (after the call)', body: 'Must-haves: the referral trigger and handover-gap quote (Discovery — doctor referral), one records/paperwork friction quote, a commission yes/no with how it works, an aftercare-handback quote (records, complications), and a channel-willingness answer with conditions.' },
      ],
    },
    {
      script_name: 'Hospital IPD', version: 1, content: [
        { title: 'Open (2 min)', body: 'Brief professional intro. You are researching the Kenya→India corridor; not selling, not asking for referrals. Spell out International Patient Department on first use. Permission to record.' },
        { title: 'Warm-up (3 min)', body: '"Tell me how your IPD is structured — who handles East African inquiries, and how many do you see a month?"' },
        { title: 'Leads — qualified vs noise', body: '"What makes an East African lead qualified vs unqualified for you?" Probe: which document is missing most often, what share of inquiries are complete on arrival. Feeds Trust/Friction from the supply side.' },
        { title: 'Documents & case packaging', body: '"What must be in the file before your medical team reviews a case?" Then: "If cases arrived pre-formatted to that exact standard, what would that be worth to you?" Direct H3 probe.' },
        { title: 'Response time — the reply gap', body: '"From first inquiry to your first substantive reply — how long, honestly, and what slows it down?" Cross-checks the patient-side Friction — slow response theme from the other end.' },
        { title: 'Conversion funnel (K2 check)', body: '"Of 100 East African inquiries, how many get a treatment plan, how many actually travel, how many complete treatment?" Get their real funnel numbers — this is the consult-to-travelled conversion evidence for K2.' },
        { title: 'Commissions & economics (K1 context)', body: '"What do you currently pay agents per converted patient — and does it vary by specialty?" Probe what that implies about acceptable CAC on the corridor. Feeds Money — broker commission and K1.' },
        { title: 'H3 — would the hospital pay?', body: '"Would you pay for software or a service that pre-qualifies and packages African cases to your standard? What would have to be true? Who signs that cheque?" Push past politeness: ask what they REJECTED before and why.' },
        { title: 'Aftercare — discharge across borders', body: '"What does the patient leave with when they fly home — discharge summary, imaging, a follow-up plan? Who receives it in Kenya?" Probe: do they ever hear from the home doctor, how complications abroad-of-them get handled, whether tele-follow-up exists. Feeds Aftercare — records back home · complications & readmission.' },
        { title: 'Close (5 min)', body: '"What should I have asked?" · "Who else at the hospital should I talk to?" · Follow-up permission · same-day tag.' },
        { title: 'Requirements check (after the call)', body: 'Must-haves: funnel numbers (K2), agent commission range (K1), the document standard, a direct H3 willingness answer with the decision-maker named, and their discharge/records-home protocol (Aftercare).' },
      ],
    },
    {
      script_name: 'Aggregator', version: 1, content: [
        { title: 'Open (3 min)', body: 'Peer-to-peer tone — they run or work in a medical-travel platform/aggregator. Honest framing: you are researching the patient side of the corridor; their view of the economics matters. Permission to record.' },
        { title: 'Warm-up (5 min)', body: '"Walk me through your model — where do patients come from, what happens to a lead, and where do you make money?"' },
        { title: 'Acquisition & CAC (K1 check)', body: '"What does it cost you to acquire one patient who actually travels — ads, content, call-centre time, all in?" This is the single most important number: direct K1 evidence. Probe channel by channel.' },
        { title: 'Conversion (K2 check)', body: '"Of the leads you touch, what share converts to a travelled patient? Where does the funnel leak worst?" Direct K2 evidence — get denominators, not vibes.' },
        { title: 'Cost to serve (K3 check)', body: '"Once a patient says yes, what does it cost you to serve one case end-to-end — people-hours, calls, document handling?" Direct K3 evidence.' },
        { title: 'What patients actually pay for', body: '"Where in the journey are patients genuinely willing to pay — and where do they expect free?" Probe how they charge (hospital commission vs patient fee) and which side resists more. Feeds Money tags and H2.' },
        { title: 'The broken parts', body: '"What part of the corridor is most broken from where you sit — discovery, trust, documents, money movement, aftercare?" Feeds Friction/Pain from the operator\'s view; compare against patient answers.' },
        { title: 'Aftercare — where the service ends', body: '"Does your involvement end at the airport? Walk me through what happens to a patient after they land home." Probe: is aftercare a cost, a liability, or an unserved revenue line; do families come back asking for follow-up help; who do they hand back to. Feeds Aftercare tags.' },
        { title: 'Competition or partnership', body: '"If someone built patient-side coordination for this corridor, does that help you or compete with you? What would make you plug into it?" Reveals the wedge\'s room to exist.' },
        { title: 'Close (3 min)', body: 'Anything missed · two introductions (a hospital IPD contact, an agent they rate) · follow-up permission · same-day tag.' },
        { title: 'Requirements check (after the call)', body: 'Must-haves: a CAC number or range (K1), a funnel conversion figure (K2), a cost-to-serve estimate (K3), who-pays evidence for H2/H3, and where aftercare sits in their model. This segment exists to put numbers under the kill criteria — do not leave without them.' },
      ],
    },
    {
      script_name: 'Agent', version: 1, content: [
        { title: 'Open (3 min)', body: 'Friendly but specific. Be upfront: you are exploring building patient-side coordination; their candour matters more than their pitch. Permission to record.' },
        { title: 'Story anchor (5 min)', body: '"Walk me through your last patient — from the first phone call to the follow-up after they came home." Get the real workflow, step by step.' },
        { title: 'Workflow — where the value sits', body: '"Where do you personally add the most value?" An emotional answer (hand-holding, reassurance) and a transactional answer (quotes, visas, transfers) imply different MVPs — note which they lead with.' },
        { title: 'Friction — the manual grind', body: '"What is painfully manual in your week?" Probe: chasing hospital quotes, reformatting medical documents, arranging money transfer, visa paperwork. Quote-chasing or document work = leverage for the platform. Feeds Friction tags.' },
        { title: 'Money — who pays whom (K1/H2/H3)', body: '"How do you get paid — patient side, hospital side, or both? How much per case, and which side resists paying more?" Feeds Money — broker commission, and the buyer question from the middleman\'s seat.' },
        { title: 'Conversion & cost (K2/K3 check)', body: '"Of the families who reach you, how many actually travel? And how many hours does one case take you, end to end?" Their conversion and effort-per-case put field numbers under K2 and K3.' },
        { title: 'Trust — how they win families', body: '"Why do families pick you over searching themselves?" Probe what trust signals they manufacture (testimonials, hospital relationships, being local). Feeds Trust tags — and shows what a product must replicate.' },
        { title: 'Aftercare — after the flight home', body: '"What happens between you and the family after the patient lands back in Kenya?" Probe: do they call you when complications appear, do you chase records from India, is there any follow-up you charge for — or is the relationship simply over? An unserved aftercare need here is wedge evidence. Feeds Aftercare tags.' },
        { title: 'Adoption — the daily-use test', body: '"What would a tool have to do for you to use it every day? Which single feature, if missing, kills it?" Also: "What have you tried and abandoned?"' },
        { title: 'Close (3 min)', body: 'Anything missed · two introductions (a family they served, an IPD contact) · follow-up permission · same-day tag.' },
        { title: 'Requirements check (after the call)', body: 'Must-haves: commission structure with numbers (K1), their conversion rate (K2), hours per case (K3), one manual-grind quote with severity, which side of the market pays (H2 vs H3), and what — if anything — they do after the patient returns (Aftercare).' },
      ],
    },
    {
      script_name: 'Insurance broker', version: 1, content: [
        { title: 'Open (3 min)', body: 'Professional intro. You are researching how Kenyan families finance treatment in India and where insurance fits or fails. Not selling. Permission to record.' },
        { title: 'Warm-up (3 min)', body: '"What share of your clients ask about cover for treatment abroad — and what do you tell them?"' },
        { title: 'Coverage reality — the NHIF/private gap', body: '"When a client needs treatment in India, what does their cover actually pay for — and what falls on the family?" Probe NHIF limits, private policy exclusions, evacuation-only riders. Feeds Money — insurance and the financial Pain theme.' },
        { title: 'Claims friction', body: '"Walk me through what happens when someone tries to claim for cross-border treatment. Where does it break?" Probe pre-authorisation, receipts from Indian hospitals, currency, reimbursement delays. Feeds Friction tags from the finance side.' },
        { title: 'Who actually pays (H1/H2 finance view)', body: '"In the cases you see, whose money ultimately covers an India trip — savings, harambee, children abroad, loans?" The broker sees family finance honestly; this is corroborating H1/H2 evidence.' },
        { title: 'Product gap — insurable or not?', body: '"Could a medical-travel coordination benefit be attached to a policy you sell? Would an insurer underwrite it — and would clients pay the premium?" Tests an alternate buyer and the Money — insurance theme.' },
        { title: 'Aftercare — cover after the return', body: '"Once the patient is back in Kenya, does any policy cover the follow-up — reviews, physio, managing complications from surgery done abroad?" Probe whether complications after foreign treatment are excluded, and what families do when they are. Feeds Aftercare — complications & readmission and Money — insurance.' },
        { title: 'Referral economics', body: '"Do you ever refer clients to agents or hospitals for treatment abroad? Is there a commission in it for you?" Reveals whether brokers are a hidden channel — and their price.' },
        { title: 'Close (3 min)', body: 'Anything missed · two introductions (a client who travelled, an insurer product manager) · follow-up permission · same-day tag.' },
        { title: 'Requirements check (after the call)', body: 'Must-haves: what cover excludes (financial-pain evidence), one claims-friction quote, who-pays corroboration for H1/H2, a yes/no-with-reasons on an insurable coordination product, and whether post-return complications are covered (Aftercare).' },
      ],
    },
    {
      script_name: 'Diaspora family', version: 1, content: [
        { title: 'Open (3 min)', body: 'Warm intro — they organised or funded care for someone back home from abroad. De-identification promise, permission to record. Acknowledge the distance is the story.' },
        { title: 'Story anchor (5 min)', body: '"Tell me about the time you helped a parent or relative in Kenya get treatment in India — from the phone call where you first heard, sitting wherever you were in the world."' },
        { title: 'Discovery — searching from abroad', body: '"How did you research options from another country?" Probe: diaspora Facebook groups, WhatsApp family committees, calling hospitals directly at odd hours, whether the doctor in Kenya suggested it first, whether Kenyan-based relatives fed different information. Feeds Discovery tags and the family-abroad channel.' },
        { title: 'Trust — at a distance (H1 core)', body: '"How did you decide what to trust when you couldn\'t see anything yourself?" Probe: video calls with doctors, accreditation lookups, who on the ground they trusted as eyes and ears, price clarity as proof of honesty. Feeds Trust tags.' },
        { title: 'Money movement — the transfer maze', body: '"Walk me through actually getting money to the hospital." Probe: bank transfer delays, remittance apps, hawala, sending to a relative first, fees, and the fear of paying the wrong account. Feeds Friction — money transfer; this is usually the sharpest diaspora pain.' },
        { title: 'Control & coordination pain', body: '"What was the worst part of managing this from far away?" Probe: information lag, relatives filtering bad news, decisions made without them despite paying, time zones. Severity 1–5. Feeds Pain — emotional/coordination.' },
        { title: 'WTP — the H1 test, directly', body: '"If a service had handled the hospital search, quotes, documents and payments — with you seeing everything in real time — what would you have paid for that, honestly?" Anchor their number. Then: "Who else in the family would have needed to agree?" This is the primary H1 evidence — record verbatim.' },
        { title: 'Kill checks (K2/K3 signal)', body: '"Did the trip happen? What nearly stopped it?" (K2 signal). "Beyond treatment, what did arranging it all cost — fees, calls, a relative\'s travel?" (K3 signal).' },
        { title: 'Aftercare — watching recovery from abroad', body: '"After they returned home, how did you follow the recovery from another country?" Probe: who found the follow-up doctor, whether records from India reached anyone, how they learned about complications (and how late), whether they would pay for structured follow-up reporting. Feeds all three Aftercare tags — and extends the H1 WTP question past the flight home.' },
        { title: 'Close (3 min)', body: 'Anything missed · two introductions (another diaspora buyer, the on-the-ground relative) · follow-up permission · same-day tag.' },
        { title: 'Requirements check (after the call)', body: 'Must-haves: a direct WTP number or refusal from the person who actually paid (H1), one money-transfer friction quote, one at-a-distance trust quote, the decision-authority map (payer abroad vs decider in Nairobi), and one Aftercare quote on following recovery from abroad.' },
      ],
    },
  ];
}

export function buildSeed() {
  const team = getTeam();
  const LEAD = team.lead, FIELD = team.field;

  const outreach = [
    { name: 'Grace W.', segment: 'Caregiver', organisation: '—', country: 'Kenya', channel: 'WhatsApp', status: 'Done', owner: FIELD, first_contact: daysAgo(24), notes: 'Mother treated in Delhi 2024. Interviewed as INT-002.' },
    { name: 'Dr. Anil Mehta', segment: 'Hospital IPD', organisation: 'Apollo Hospitals, Chennai', country: 'India', channel: 'LinkedIn', status: 'Done', owner: LEAD, first_contact: daysAgo(21), notes: 'IPD deputy head. Generous with time. Interviewed as INT-004.' },
    { name: 'Peter K.', segment: 'Agent', organisation: 'MediLink Nairobi', country: 'Kenya', channel: 'In-person', status: 'Done', owner: FIELD, first_contact: daysAgo(19), notes: 'Walk-in follow-up worked. Interviewed as INT-003.' },
    { name: 'Sarah N.', segment: 'Diaspora family', organisation: '—', country: 'UK', channel: 'Facebook', status: 'Booked', owner: LEAD, first_contact: daysAgo(6), notes: 'Coordinated father\'s cardiac care from London. Call booked Thursday.' },
    { name: 'James O.', segment: 'Patient', organisation: '—', country: 'Kenya', channel: 'WhatsApp', status: 'Booked', owner: FIELD, first_contact: daysAgo(5), notes: 'Kidney transplant in Ahmedabad 2023. Referred by Grace W.' },
    { name: 'Dr. Priya Sharma', segment: 'Hospital IPD', organisation: 'Fortis Healthcare', country: 'India', channel: 'Email', status: 'Replied', owner: LEAD, first_contact: daysAgo(14), notes: 'Positive reply, asked for topic list. STALLED — need to send follow-up.' },
    { name: 'Mary A.', segment: 'Caregiver', organisation: '—', country: 'Kenya', channel: 'In-person', status: 'Replied', owner: FIELD, first_contact: daysAgo(12), notes: 'Met at church group. Interested but busy — chase this week.' },
    { name: 'Faith M.', segment: 'Patient', organisation: '—', country: 'Kenya', channel: 'WhatsApp', status: 'Sent', owner: FIELD, first_contact: daysAgo(15), notes: 'Oncology patient, referred by Peter K. No reply yet — STALLED.' },
    { name: 'Robert G.', segment: 'Insurance broker', organisation: 'Jubilee Allianz', country: 'Kenya', channel: 'Email', status: 'Sent', owner: LEAD, first_contact: daysAgo(11), notes: 'Cross-border claims desk. No reply — try warm intro via Peter K.' },
    { name: 'Vikram Rao', segment: 'Aggregator', organisation: 'Vaidam Health', country: 'India', channel: 'LinkedIn', status: 'Sent', owner: LEAD, first_contact: daysAgo(4), notes: 'Runs African desk. Peer-conversation framing.' },
    { name: 'Esther L.', segment: 'Diaspora family', organisation: '—', country: 'USA', channel: 'Facebook', status: 'Replied', owner: LEAD, first_contact: daysAgo(3), notes: 'Sister\'s oncology case coordinated from Boston. Scheduling.' },
    { name: 'Daniel M.', segment: 'Agent', organisation: 'AfyaBridge', country: 'Kenya', channel: 'Phone', status: 'Declined', owner: FIELD, first_contact: daysAgo(16), notes: 'Sees us as competition. Keep the door open; do not push.' },
    { name: 'Dr. Susan O.', segment: 'Caregiver', organisation: 'Nairobi Hospital', country: 'Kenya', channel: 'In-person', status: 'Done', owner: FIELD, first_contact: daysAgo(13), notes: 'Nurse who guided brother\'s spine surgery abroad. INT-007.' },
    { name: 'Hassan A.', segment: 'Patient', organisation: '—', country: 'Kenya', channel: 'WhatsApp', status: 'Done', owner: FIELD, first_contact: daysAgo(11), notes: 'Cardiac patient, Mombasa. INT-008.' },
    { name: 'Lucy W.', segment: 'Diaspora family', organisation: '—', country: 'Canada', channel: 'Facebook', status: 'Done', owner: LEAD, first_contact: daysAgo(9), notes: 'Paid for mother\'s hip replacement in Mumbai. INT-010.' },
    { name: 'Rajesh Iyer', segment: 'Aggregator', organisation: 'MediGence', country: 'India', channel: 'LinkedIn', status: 'Cold', owner: LEAD, first_contact: null, notes: 'Second aggregator target. Draft ready in Templates.' },
    { name: 'Agnes K.', segment: 'Caregiver', organisation: '—', country: 'Kenya', channel: 'WhatsApp', status: 'Cold', owner: FIELD, first_contact: null, notes: 'Referred by Grace W. — daughter handled mother\'s Delhi trip.' },
    { name: 'Dr. Wanjiru N.', segment: 'Hospital IPD', organisation: 'Aga Khan University Hospital', country: 'Kenya', channel: 'Email', status: 'Cold', owner: LEAD, first_contact: null, notes: 'Kenyan referring-side view. Useful contrast to Indian IPDs.' },
    { name: 'Tom B.', segment: 'Insurance broker', organisation: 'Minet Kenya', country: 'Kenya', channel: 'LinkedIn', status: 'Cold', owner: LEAD, first_contact: null, notes: 'Corporate schemes with overseas cover.' },
    { name: 'Beatrice O.', segment: 'Patient', organisation: '—', country: 'Kenya', channel: 'WhatsApp', status: 'Booked', owner: FIELD, first_contact: daysAgo(2), notes: 'Orthopaedic case, travelled to Chennai 2025. Call Monday.' },
  ];

  const interviews = [
    { interview_id: 'INT-001', date: daysAgo(18), segment: 'Patient', initials: 'JM', interviewer: FIELD, format: 'In-person', recorded: 'Y', tagged_same_day: 'Y', brief_topic: 'Kidney treatment journey, Nairobi → Ahmedabad', link_to_notes: '', notes_markdown: 'Met at his shop in Kariobangi, 70 minutes.\n\nJourney: diagnosed 2022, dialysis at KNH for 8 months while family searched for a transplant option. Cousin\'s friend had gone to Ahmedabad — that single personal connection decided everything. Never seriously compared alternatives.\n\nMoney: total cost ~KES 2.8M. Raised through family + church harambee + selling a plot. The $9,000→$13,500 quote jump (tagged) nearly collapsed the plan mid-journey; brother-in-law in the US covered the gap.\n\nStrongest moment: "You are sick, far from home, and every day the number changes." Visibly angry retelling it, two years later.\n\nFollow-ups: will introduce me to two other transplant patients from his WhatsApp support group.' },
    { interview_id: 'INT-002', date: daysAgo(16), segment: 'Caregiver', initials: 'GW', interviewer: FIELD, format: 'In-person', recorded: 'Y', tagged_same_day: 'Y', brief_topic: 'Daughter coordinating mother\'s Delhi oncology care', link_to_notes: '', notes_markdown: 'Her sister\'s flat, Umoja. 55 minutes, mother present for part of it.\n\nShe ran the whole process on nights and weekends while holding two jobs. Sent identical scan packages to four hospitals: two never replied at all, one replied in 3 weeks, one in 4 days (they chose that one largely on responsiveness).\n\nThe unprompted "50,000 shillings just to handle the back-and-forth" quote is tagged — she repeated the number twice without being asked. Anchor for WTP in this segment.\n\nPaper trail chaos: visa letter errors, three re-issues. Kept everything in a physical folder — worth photographing for Documents next visit.' },
    { interview_id: 'INT-003', date: daysAgo(14), segment: 'Agent', initials: 'PK', interviewer: FIELD, format: 'In-person', recorded: 'N', tagged_same_day: 'Y', brief_topic: 'Agent workflow, commissions, quote-chasing', link_to_notes: '', notes_markdown: 'His office off Kimathi Street. No recording (his request) — notes written up same evening.\n\nWorkflow: ~6 active cases at a time. Estimates half his week goes on chasing hospital quotes and reformatting patient documents. Would use software that did this "if it did not touch my commission".\n\nEconomics: 10–15% of package value from the hospital side, varies by specialty (cardiac highest). Patients also pay him a "registration fee" KES 5–15K upfront — confirmed separately (see field checks).\n\nRead: transactional operator, not hostile. The commission opacity is the business model; any patient-side transparency play threatens it. He knows this.' },
    { interview_id: 'INT-004', date: daysAgo(12), segment: 'Hospital IPD', initials: 'AM', interviewer: LEAD, format: 'Video', recorded: 'Y', tagged_same_day: 'Y', brief_topic: 'What makes an East African lead qualified', link_to_notes: '', notes_markdown: 'Video, 40 minutes, he was generous and precise.\n\nKey numbers: ~80% of African inquiries arrive with incomplete documents; a complete case gets a treating-doctor opinion inside 48h; incomplete ones can sit for weeks. They pay agents 10–12% but "would rather pay for quality than volume".\n\nSaaS probe: cautiously positive on paying for pre-qualified, standardised case files — asked who else would be on the platform (network effects matter to them). Shared an indicative price list for common procedures (uploaded to Documents).\n\nFollow-up: he offered an intro to their Nairobi liaison office.' },
    { interview_id: 'INT-005', date: daysAgo(11), segment: 'Diaspora family', initials: 'SN', interviewer: LEAD, format: 'Video', recorded: 'Y', tagged_same_day: 'Y', brief_topic: 'Paying for father\'s cardiac care from London', link_to_notes: '' },
    { interview_id: 'INT-006', date: daysAgo(9), segment: 'Patient', initials: 'FM', interviewer: FIELD, format: 'Phone', recorded: 'N', tagged_same_day: 'Y', brief_topic: 'Oncology second opinion, gave up mid-way', link_to_notes: '' },
    { interview_id: 'INT-007', date: daysAgo(8), segment: 'Caregiver', initials: 'SO', interviewer: FIELD, format: 'In-person', recorded: 'Y', tagged_same_day: 'Y', brief_topic: 'Nurse guiding brother\'s spine surgery abroad', link_to_notes: '' },
    { interview_id: 'INT-008', date: daysAgo(6), segment: 'Patient', initials: 'HA', interviewer: FIELD, format: 'In-person', recorded: 'Y', tagged_same_day: 'Y', brief_topic: 'Cardiac patient, Mombasa; financing via harambee', link_to_notes: '' },
    { interview_id: 'INT-009', date: daysAgo(5), segment: 'Hospital IPD', initials: 'PS', interviewer: LEAD, format: 'Video', recorded: 'Y', tagged_same_day: 'Y', brief_topic: 'Fortis IPD intake process and response times', link_to_notes: '' },
    { interview_id: 'INT-010', date: daysAgo(4), segment: 'Diaspora family', initials: 'LW', interviewer: LEAD, format: 'Video', recorded: 'Y', tagged_same_day: 'Y', brief_topic: 'Hip replacement paid from Canada; money transfer pain', link_to_notes: '' },
    { interview_id: 'INT-011', date: daysAgo(3), segment: 'Caregiver', initials: 'MA', interviewer: FIELD, format: 'In-person', recorded: 'N', tagged_same_day: 'N', brief_topic: 'Husband\'s neuro case — notes taken, NOT YET TAGGED', link_to_notes: '', notes_markdown: 'Raw notes, not yet tagged into the matrix:\n\nHusband needed neurosurgery consult; NHIF covered nothing abroad. She described "begging three different agents for the same information". One agent quoted the consult at $500, another at $150 — same hospital.\n\nMoney moved through a friend\'s hawala contact because bank transfer took too long. She was never sure the hospital had received it.\n\nCandidate tags when processed: Friction — quote chasing (sev 4), Friction — money transfer (sev 4, WTP Maybe), Trust — price clarity (sev 5).' },
    { interview_id: 'INT-012', date: daysAgo(2), segment: 'Agent', initials: 'DK', interviewer: FIELD, format: 'Phone', recorded: 'N', tagged_same_day: 'N', brief_topic: 'Freelance facilitator, Eastleigh — NOT YET TAGGED', link_to_notes: '' },
  ];

  /* Rows referenced by seeded evidence_links carry stable ids (buildDb keeps
     an explicit id instead of generating one), so the links always resolve. */
  const matrix = [
    { id: 'mx-int001-discovery', interview_id: 'INT-001', quote: 'I found the hospital because my cousin\'s friend had gone there. We didn\'t trust anything we found on Google.', theme_tag: 'Discovery — WhatsApp/personal', segment: 'Patient', severity: 3, wtp: 'Maybe', notes: '' },
    { id: 'mx-int001-price', interview_id: 'INT-001', quote: 'The hospital quoted $9,000, then when we arrived it became $13,500. Nobody could explain the difference.', theme_tag: 'Trust — price clarity', segment: 'Patient', severity: 5, wtp: 'Y', notes: 'Strongest quote so far on price opacity.' },
    { interview_id: 'INT-002', quote: 'I sent the same scans to four hospitals. Two never replied. One replied after three weeks. By then my mother was worse.', theme_tag: 'Friction — slow response', segment: 'Caregiver', severity: 5, wtp: 'Y', notes: '' },
    { id: 'mx-int002-wtp', interview_id: 'INT-002', quote: 'I would have paid anyone serious 50,000 shillings just to handle the back-and-forth. I was working two jobs and doing this at night.', theme_tag: 'Money — willingness to pay', segment: 'Caregiver', severity: 4, wtp: 'Y', notes: 'Unprompted WTP number (~USD 380).' },
    { id: 'mx-int003-chasing', interview_id: 'INT-003', quote: 'Half my week goes on chasing quotes from hospitals. The same forms, the same follow-ups, every single case.', theme_tag: 'Friction — quote chasing', segment: 'Agent', severity: 4, wtp: 'Maybe', notes: 'Agent-side pain mirrors patient-side pain.' },
    { interview_id: 'INT-003', quote: 'The hospital pays me 10 to 15 percent of the package. The patient doesn\'t know that. That\'s the business.', theme_tag: 'Money — broker commission', segment: 'Agent', severity: 3, wtp: 'N', notes: 'Confirms commission range.' },
    { id: 'mx-int004-ipd', interview_id: 'INT-004', quote: 'Eighty percent of African inquiries are missing the basic documents. A case that arrives complete gets a doctor\'s opinion in 48 hours.', theme_tag: 'Buyer — Hospital IPD', segment: 'Hospital IPD', severity: 4, wtp: 'Y', notes: 'IPD would pay for pre-qualified cases — probe pricing next time.' },
    { id: 'mx-int004-agents', interview_id: 'INT-004', quote: 'We reply fast to agents we know. An unknown patient email sits in a queue.', theme_tag: 'Trust — speed of reply', segment: 'Hospital IPD', severity: 3, wtp: 'N', notes: '' },
    { interview_id: 'INT-005', quote: 'I was wiring money from London and praying. No receipts, no tracking. My father was in the hospital and I couldn\'t verify anything.', theme_tag: 'Friction — money transfer', segment: 'Diaspora family', severity: 5, wtp: 'Y', notes: '' },
    { id: 'mx-int005-payer', interview_id: 'INT-005', quote: 'It was me paying — my father would never spend that on himself. The children abroad are the real customers.', theme_tag: 'Buyer — family abroad', segment: 'Diaspora family', severity: 4, wtp: 'Y', notes: 'Direct support for H1.' },
    { id: 'mx-int006-gaveup', interview_id: 'INT-006', quote: 'We gave up. Too many forms, no answers, and the agent wanted money upfront just to "register the case".', theme_tag: 'Pain — coordination', segment: 'Patient', severity: 5, wtp: 'Maybe', notes: 'Abandonment case — the wedge moment.' },
    { interview_id: 'INT-007', quote: 'Being a nurse, I could read the reports. An ordinary family has no chance of comparing two hospital quotes.', theme_tag: 'Trust — price clarity', segment: 'Caregiver', severity: 4, wtp: 'Y', notes: '' },
    { interview_id: 'INT-007', quote: 'The visa letter took two weeks because the hospital kept sending it with the wrong passport number.', theme_tag: 'Friction — paperwork', segment: 'Caregiver', severity: 3, wtp: 'Maybe', notes: '' },
    { id: 'mx-int008-harambee', interview_id: 'INT-008', quote: 'The village raised 800,000 shillings in one harambee. Money was not the blocker — knowing where to send it was.', theme_tag: 'Pain — financial', segment: 'Patient', severity: 4, wtp: 'Maybe', notes: 'Financing is communal; trust is the gap.' },
    { interview_id: 'INT-008', quote: 'I chose the hospital because the doctor there had treated another man from our mosque. One name carried everything.', theme_tag: 'Trust — doctor reputation', segment: 'Patient', severity: 3, wtp: 'N', notes: '' },
    { id: 'mx-int009-ipdwtp', interview_id: 'INT-009', quote: 'If someone sent us complete, verified case files for East African patients, yes — that is worth paying for. Our desk wastes days on incomplete files.', theme_tag: 'Buyer — Hospital IPD', segment: 'Hospital IPD', severity: 4, wtp: 'Y', notes: 'Second independent IPD WTP signal.' },
    { interview_id: 'INT-010', quote: 'I compared three hospitals for months. In the end I picked the one whose WhatsApp replied the same day.', theme_tag: 'Trust — speed of reply', segment: 'Diaspora family', severity: 4, wtp: 'Y', notes: 'Response speed as trust proxy — recurring.' },
    { id: 'mx-int010-fees', interview_id: 'INT-010', quote: 'Sending $12,000 through three different transfer services cost me almost $600 in fees and a week of anxiety.', theme_tag: 'Friction — money transfer', segment: 'Diaspora family', severity: 4, wtp: 'Y', notes: '' },
  ];

  const deliverables = buildDeliverables();
  const scripts = buildScripts();

  const kill_list = [
    { hypothesis: 'Patients will use a self-serve web portal to compare hospital quotes', evidence: 'Zero of twelve interviewees started with a website. Every journey began with a person — a relative, a nurse, an agent. Discovery is social, not searched. (INT-001, INT-002, INT-008, INT-010)', killed_date: daysAgo(4) },
    { hypothesis: 'The Turkey corridor is comparable to India for Kenyan patients', evidence: 'No interviewee had considered Turkey. Agents report <5% of cases go there; language and flight cost dominate. Corridor dropped from scope in Phase 0.', killed_date: daysAgo(15) },
  ];

  const field_checks = [
    { id: 'fc-registration-fee', assumption: 'Agents charge patients a registration fee upfront', confirmed: true, confirmed_by: FIELD, confirmed_date: daysAgo(7), notes: 'Confirmed at two Nairobi agencies: KES 5,000–15,000 upfront.' },
    { id: 'fc-agent-reply-speed', assumption: 'Hospitals reply faster to known agents than to direct patients', confirmed: true, confirmed_by: LEAD, confirmed_date: daysAgo(5), notes: 'Confirmed by both IPD interviews (INT-004, INT-009).' },
    { assumption: 'M-Pesa cannot be used directly for Indian hospital deposits', confirmed: false, confirmed_by: '', confirmed_date: null, notes: 'Needs checking with a bank or forex bureau.' },
    { assumption: 'Diaspora payers outnumber local payers for planned procedures', confirmed: false, confirmed_by: '', confirmed_date: null, notes: 'Directional from interviews; needs a bigger sample.' },
  ];

  const documents = [
    {
      id: 'doc-agent-debrief',
      filename: 'debrief-agent-walkins.md', mime_type: 'text/markdown', size_bytes: 1180,
      segment: 'Agent', interview_id: 'INT-003', uploaded_by: FIELD,
      description: 'Same-evening debrief after the MediLink office visit and two other agent walk-ins.',
      text_content: `# Debrief — Nairobi agent walk-ins

Three offices visited in one afternoon (MediLink, plus two smaller operators near Kimathi Street).

Common pattern across all three:
- Everyone claims exclusive hospital relationships; none could show a contract.
- Quote-chasing is universal — each office had a wall/whiteboard tracking pending hospital replies.
- Two of three asked patients for an upfront "registration fee" before any hospital contact.
- WhatsApp is the operating system. One agent showed 40+ active patient chats.

Watch: the smaller operators are hungrier and may talk more openly about economics.
Next step: return to MediLink with the follow-up template (done — became INT-003).`,
    },
    {
      id: 'doc-apollo-prices',
      filename: 'apollo-ipd-price-indication.csv', mime_type: 'text/csv', size_bytes: 610,
      segment: 'Hospital IPD', interview_id: 'INT-004', uploaded_by: LEAD,
      description: 'Indicative package prices shared by the Apollo IPD deputy head after INT-004. Not a formal quote.',
      text_content: `procedure,indicative_package_usd,typical_stay_days,notes
Kidney transplant (related donor),13000-16000,21,Excludes donor workup
CABG (bypass),7000-9500,10,Most requested from East Africa
Hip replacement (unilateral),5500-7000,7,Implant grade affects price
Spinal fusion (2-level),8000-11000,9,Imaging review required first
Oncology consult + PET-CT,900-1400,2,Often the entry point
Liver transplant,32000-40000,30,Requires committee approval`,
    },
    {
      id: 'doc-diaspora-transfer',
      filename: 'diaspora-money-transfer-notes.md', mime_type: 'text/markdown', size_bytes: 760,
      segment: 'Diaspora family', interview_id: 'INT-005', uploaded_by: LEAD,
      description: 'Notes on how money actually moved in the two diaspora cases (INT-005, INT-010).',
      text_content: `# How the money actually moved — diaspora cases

INT-005 (London → Delhi): three wire attempts. First bounced (name mismatch),
second took 6 working days, third went via a UK remittance app to a Nairobi
relative who re-sent via bank. No receipts matched to hospital invoices at any point.

INT-010 (Toronto → Mumbai): ~$600 in cumulative fees on ~$12,000 moved across
three services. She kept a spreadsheet; screenshots promised.

Pattern: the payer abroad has zero visibility once money leaves their app.
Verification is a phone call to a relative. This is a trust product waiting to exist —
tagged under Friction — money transfer.`,
    },
  ];

  /* Demo hypothesis board: stock statements with lively statuses so the
     Decision Brief reads like a programme three weeks in. */
  const hypotheses = buildHypotheses().map(hyp => {
    const demo = {
      H1: { status: 'strengthening', status_note: 'Two independent diaspora payers (INT-005, INT-010); no WTP number from that side yet.' },
      H2: { status: 'weakening', status_note: 'Stated WTP exists (INT-002) but INT-006 abandoned rather than pay upfront; financing is communal (INT-008).' },
      H3: { status: 'strengthening', status_note: 'Both IPD interviews (INT-004, INT-009) independently said verified case files are worth paying for.' },
      K1: { status: 'unknown', status_note: 'No CAC data yet — Phase 4 work.' },
      K2: { status: 'unknown', status_note: 'No conversion data yet; INT-006 abandonment is a warning sign.' },
      K3: { status: 'unknown', status_note: 'Coordination is heavily manual today (INT-003) — cost per case unmeasured.' },
    }[hyp.code];
    return { ...hyp, ...demo };
  });

  /* ~15 demo evidence links, mixed directions across H1–H3 plus one per kill
     criterion. For kill criteria, 'supports' means the evidence pushes the
     criterion toward breach. evidence_id: interviews link by their INT-nnn
     string; everything else by record id (stable ids assigned above). */
  const evidence_links = [
    // H1 — family abroad
    { hypothesis_id: 'hyp-h1', evidence_type: 'matrix', evidence_id: 'mx-int005-payer', direction: 'supports', strength: 'strong', note: 'Diaspora daughter was the payer, unprompted: "the children abroad are the real customers."', source: 'human' },
    { hypothesis_id: 'hyp-h1', evidence_type: 'interview', evidence_id: 'INT-010', direction: 'supports', strength: 'moderate', note: 'Second independent diaspora payer — daughter in Toronto paid for the hip replacement.', source: 'human' },
    { hypothesis_id: 'hyp-h1', evidence_type: 'matrix', evidence_id: 'mx-int010-fees', direction: 'supports', strength: 'moderate', note: '$600 in fees tolerated on $12k moved — the diaspora payer absorbs cost, the channel is broken.', source: 'ai_confirmed' },
    { hypothesis_id: 'hyp-h1', evidence_type: 'document', evidence_id: 'doc-diaspora-transfer', direction: 'supports', strength: 'moderate', note: 'Both diaspora cases show the payer abroad carrying the whole transaction blind.', source: 'human' },
    // H2 — patient / Nairobi family pays
    { hypothesis_id: 'hyp-h2', evidence_type: 'matrix', evidence_id: 'mx-int002-wtp', direction: 'supports', strength: 'strong', note: 'Unprompted KES 50,000 willingness-to-pay for coordination (~USD 380).', source: 'human' },
    { hypothesis_id: 'hyp-h2', evidence_type: 'matrix', evidence_id: 'mx-int001-price', direction: 'supports', strength: 'moderate', note: 'Price opacity is the pain patients say they would pay to remove.', source: 'ai_confirmed' },
    { hypothesis_id: 'hyp-h2', evidence_type: 'matrix', evidence_id: 'mx-int006-gaveup', direction: 'contradicts', strength: 'strong', note: 'Family abandoned mid-journey rather than pay an upfront registration fee.', source: 'human' },
    { hypothesis_id: 'hyp-h2', evidence_type: 'matrix', evidence_id: 'mx-int008-harambee', direction: 'neutral', strength: 'moderate', note: 'Financing is communal (harambee); unclear one individual buyer exists at decision time.', source: 'human' },
    { hypothesis_id: 'hyp-h2', evidence_type: 'field_check', evidence_id: 'fc-registration-fee', direction: 'supports', strength: 'weak', note: 'Patients already pay agents KES 5–15K upfront — some direct willingness exists today.', source: 'human' },
    // H3 — Hospital IPD pays
    { hypothesis_id: 'hyp-h3', evidence_type: 'matrix', evidence_id: 'mx-int004-ipd', direction: 'supports', strength: 'strong', note: '80% of inquiries arrive incomplete; complete cases reviewed in 48h — the IPD pain is real.', source: 'human' },
    { hypothesis_id: 'hyp-h3', evidence_type: 'matrix', evidence_id: 'mx-int009-ipdwtp', direction: 'supports', strength: 'strong', note: 'Second independent IPD: verified case files are "worth paying for".', source: 'human' },
    { hypothesis_id: 'hyp-h3', evidence_type: 'document', evidence_id: 'doc-apollo-prices', direction: 'supports', strength: 'moderate', note: 'IPD shared indicative package prices after one call — engagement signal from the buyer side.', source: 'ai_confirmed' },
    { hypothesis_id: 'hyp-h3', evidence_type: 'matrix', evidence_id: 'mx-int004-agents', direction: 'contradicts', strength: 'weak', note: 'IPDs already have trusted agent channels; a new entrant must displace them.', source: 'human' },
    // Kill criteria — one early warning each
    { hypothesis_id: 'hyp-k1', evidence_type: 'matrix', evidence_id: 'mx-int001-discovery', direction: 'supports', strength: 'weak', note: 'Discovery is social, not searched — paid acquisition channels unproven, CAC risk.', source: 'human' },
    { hypothesis_id: 'hyp-k2', evidence_type: 'interview', evidence_id: 'INT-006', direction: 'supports', strength: 'weak', note: 'Mid-journey abandonment — conversion risk if coordination stays this hard.', source: 'human' },
    { hypothesis_id: 'hyp-k3', evidence_type: 'matrix', evidence_id: 'mx-int003-chasing', direction: 'supports', strength: 'weak', note: 'Coordination is heavily manual today — service cost per case could exceed $300.', source: 'human' },
  ];

  /* Two historical demo assessments so the Decision Brief and trajectory
     strip are alive: an early honest INSUFFICIENT, then a PIVOT leaning.
     Append-only in real use — these are never updated. */
  const ai_assessments = [
    {
      id: 'assess-early',
      created_at: daysAgoIso(12),
      trigger: 'manual', phase: 1, leaning: 'INSUFFICIENT', model: 'demo-seed',
      summary_markdown: 'If we had to decide today, the honest answer is **INSUFFICIENT**. Five interviews across three segments is a sketch, not a picture. The pains are loud and consistent — price opacity (INT-001), slow hospital response (INT-002), manual coordination (INT-003) — but pain is not a buyer. Only one willingness-to-pay number exists (INT-002, unprompted, ~USD 380) and no hypothesis has more than one independent source behind it.\n\nWhat the early signal does say: the Hospital IPD side (H3) produced the most concrete language about paying for anything — INT-004 called complete case files a quality problem worth money. That is worth chasing before the patient-side story hardens.\n\n### The case against this leaning\nWaiting has a cost. The pains repeat across every interview so far, and an INSUFFICIENT verdict can become a habit that outlasts its honesty. If the next five interviews repeat the same three pains with the same intensity, the evidence base is thicker than the interview count suggests, and this caution should be re-examined rather than renewed by default.',
      per_hypothesis: [
        {
          hypothesis_code: 'H1', direction: 'unclear', strength: 'thin',
          key_evidence: [
            { type: 'matrix', id: 'mx-int005-payer', cite: 'INT-005', why: 'diaspora daughter was the payer, unprompted' },
          ],
          gaps: 'Only one diaspora payer interviewed; no willingness-to-pay number from the diaspora side.',
          what_would_change: 'Three or more diaspora interviews with a concrete per-case payment number.',
        },
        {
          hypothesis_code: 'H2', direction: 'unclear', strength: 'thin',
          key_evidence: [
            { type: 'matrix', id: 'mx-int002-wtp', cite: 'INT-002', why: 'unprompted KES 50,000 coordination willingness-to-pay' },
          ],
          gaps: 'A single stated-WTP datapoint; no test of actual payment behaviour.',
          what_would_change: 'A second unprompted WTP number, or one refusal pattern repeating.',
        },
        {
          hypothesis_code: 'H3', direction: 'strengthening', strength: 'thin',
          key_evidence: [
            { type: 'matrix', id: 'mx-int004-ipd', cite: 'INT-004', why: '80% of African inquiries incomplete; IPD would "rather pay for quality than volume"' },
          ],
          gaps: 'One IPD voice; no price point.',
          what_would_change: 'A second IPD confirming independently, with an indicative per-case fee.',
        },
      ],
      breakpoints: [
        { code: 'K1', status: 'unknown', evidence: [], note: 'No unit-economics inputs exist yet — Phase 4 work.' },
        { code: 'K2', status: 'unknown', evidence: [], note: 'No conversion data yet.' },
        { code: 'K3', status: 'unknown', evidence: [], note: 'No service-cost data yet.' },
      ],
      data_snapshot: { interviews: 5, matrix_entries: 9, evidence_links: 6, field_checks: 2, documents: 1 },
    },
    {
      id: 'assess-recent',
      created_at: daysAgoIso(2),
      trigger: 'weekly', phase: 1, leaning: 'PIVOT', model: 'demo-seed',
      summary_markdown: 'The leaning this week is **PIVOT** — away from patient-pays as the lead wedge, toward the hospital side. Not NO-GO: the corridor pain is real and repeating. But the buyer evidence is diverging. H3 now has two independent IPD sources saying verified case files are worth paying for (INT-004, INT-009), plus an indicative price list volunteered after a single call. H2 is moving the other way: stated willingness exists (INT-002) yet the one family actually asked for money upfront walked away (INT-006), and INT-008 shows financing is communal — a harambee is not a checkout flow. H1 has two genuine diaspora payers (INT-005, INT-010) but still no number from that side.\n\nIf this trajectory holds, the next phase should lead with the IPD wedge and treat diaspora-pays as the secondary test. The kill criteria remain unknown — nothing here is an economics verdict yet.\n\n### The case against this leaning\nTwelve interviews skew toward the loudest voices, and IPDs are professionally enthusiastic about free pipeline improvements — enthusiasm is not a purchase order. H2\'s "weakening" rests heavily on one abandonment (INT-006) that had confounding factors (an untrusted agent, not a tested price). A dozen more patient-side interviews could restore H2; do not preempt Phase 3 sense-making with an early pivot.',
      per_hypothesis: [
        {
          hypothesis_code: 'H1', direction: 'strengthening', strength: 'moderate',
          key_evidence: [
            { type: 'matrix', id: 'mx-int005-payer', cite: 'INT-005', why: 'diaspora daughter was the payer, unprompted' },
            { type: 'interview', id: 'INT-010', cite: 'INT-010', why: 'second independent diaspora payer (Toronto → Mumbai hip replacement)' },
          ],
          gaps: 'No diaspora-side interviews yet on payment willingness — payers confirmed, price untested.',
          what_would_change: 'Three or more diaspora interviews confirming willingness to pay >$200 per case.',
        },
        {
          hypothesis_code: 'H2', direction: 'weakening', strength: 'moderate',
          key_evidence: [
            { type: 'matrix', id: 'mx-int006-gaveup', cite: 'INT-006', why: 'family abandoned mid-journey rather than pay upfront' },
            { type: 'matrix', id: 'mx-int008-harambee', cite: 'INT-008', why: 'financing is communal — no individual buyer at decision time' },
          ],
          gaps: 'Willingness is stated (INT-002), never revealed — no one has actually paid for coordination.',
          what_would_change: 'One caregiver actually paying a deposit for coordination — or a third upfront-payment refusal.',
        },
        {
          hypothesis_code: 'H3', direction: 'strengthening', strength: 'moderate',
          key_evidence: [
            { type: 'matrix', id: 'mx-int004-ipd', cite: 'INT-004', why: '80% of inquiries incomplete; complete cases reviewed in 48h' },
            { type: 'matrix', id: 'mx-int009-ipdwtp', cite: 'INT-009', why: 'second IPD: verified case files "worth paying for"' },
            { type: 'document', id: 'doc-apollo-prices', cite: 'apollo-ipd-price-indication.csv', why: 'indicative prices volunteered after one call' },
          ],
          gaps: 'No IPD has named a per-case fee; no Kenyan referring-side view yet.',
          what_would_change: 'An IPD naming a per-case fee of $200 or more — or refusing to name one.',
        },
      ],
      breakpoints: [
        { code: 'K1', status: 'unknown', evidence: [{ type: 'matrix', id: 'mx-int001-discovery', cite: 'INT-001', why: 'discovery is social, not searched — paid CAC channels unproven' }], note: 'No CAC data yet; social discovery hints acquisition may not be paid-media shaped.' },
        { code: 'K2', status: 'unknown', evidence: [{ type: 'interview', id: 'INT-006', cite: 'INT-006', why: 'mid-journey abandonment' }], note: 'No conversion data; one abandonment is a warning, not a rate.' },
        { code: 'K3', status: 'unknown', evidence: [{ type: 'matrix', id: 'mx-int003-chasing', cite: 'INT-003', why: 'half an agent\'s week goes on quote-chasing' }], note: 'Manual coordination load is the main service-cost risk.' },
      ],
      data_snapshot: { interviews: 12, matrix_entries: 18, evidence_links: 16, field_checks: 4, documents: 3 },
    },
  ];

  return {
    outreach, interviews, matrix, deliverables, scripts, kill_list, field_checks,
    documents, hypotheses, evidence_links, ai_assessments,
    economics: [], segment_cards: [], decision_memos: [], reports: [],
  };
}

/**
 * "Start fresh for real fieldwork" seed: every research input is wiped
 * (outreach, interviews, matrix, documents, reports, kill list, field
 * checks, economics, memos, segment cards, evidence links, AI assessments),
 * but the stock framework the app ships with is restored — the three
 * interview scripts at their original version, the six phases' deliverables
 * checklist reset to "Not started" (evidence cleared), and the six
 * hypotheses / kill criteria in their stock open/unknown state. Segments/
 * themes/templates/the manual are not stored data at all (they live in
 * js/config.js and the Reference screens), so they survive automatically
 * without any action here.
 */
export function buildFreshFieldworkSeed() {
  return {
    outreach: [], interviews: [], matrix: [], documents: [], reports: [],
    kill_list: [], field_checks: [], economics: [], segment_cards: [], decision_memos: [],
    evidence_links: [], ai_assessments: [],
    hypotheses: buildHypotheses(),
    scripts: buildScripts(),
    deliverables: buildDeliverables().map(d => ({ ...d, status: 'Not started', evidence: '' })),
  };
}
