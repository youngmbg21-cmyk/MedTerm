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

  const matrix = [
    { interview_id: 'INT-001', quote: 'I found the hospital because my cousin\'s friend had gone there. We didn\'t trust anything we found on Google.', theme_tag: 'Discovery — WhatsApp/personal', segment: 'Patient', severity: 3, wtp: 'Maybe', notes: '' },
    { interview_id: 'INT-001', quote: 'The hospital quoted $9,000, then when we arrived it became $13,500. Nobody could explain the difference.', theme_tag: 'Trust — price clarity', segment: 'Patient', severity: 5, wtp: 'Y', notes: 'Strongest quote so far on price opacity.' },
    { interview_id: 'INT-002', quote: 'I sent the same scans to four hospitals. Two never replied. One replied after three weeks. By then my mother was worse.', theme_tag: 'Friction — slow response', segment: 'Caregiver', severity: 5, wtp: 'Y', notes: '' },
    { interview_id: 'INT-002', quote: 'I would have paid anyone serious 50,000 shillings just to handle the back-and-forth. I was working two jobs and doing this at night.', theme_tag: 'Money — willingness to pay', segment: 'Caregiver', severity: 4, wtp: 'Y', notes: 'Unprompted WTP number (~USD 380).' },
    { interview_id: 'INT-003', quote: 'Half my week goes on chasing quotes from hospitals. The same forms, the same follow-ups, every single case.', theme_tag: 'Friction — quote chasing', segment: 'Agent', severity: 4, wtp: 'Maybe', notes: 'Agent-side pain mirrors patient-side pain.' },
    { interview_id: 'INT-003', quote: 'The hospital pays me 10 to 15 percent of the package. The patient doesn\'t know that. That\'s the business.', theme_tag: 'Money — broker commission', segment: 'Agent', severity: 3, wtp: 'N', notes: 'Confirms commission range.' },
    { interview_id: 'INT-004', quote: 'Eighty percent of African inquiries are missing the basic documents. A case that arrives complete gets a doctor\'s opinion in 48 hours.', theme_tag: 'Buyer — Hospital IPD', segment: 'Hospital IPD', severity: 4, wtp: 'Y', notes: 'IPD would pay for pre-qualified cases — probe pricing next time.' },
    { interview_id: 'INT-004', quote: 'We reply fast to agents we know. An unknown patient email sits in a queue.', theme_tag: 'Trust — speed of reply', segment: 'Hospital IPD', severity: 3, wtp: 'N', notes: '' },
    { interview_id: 'INT-005', quote: 'I was wiring money from London and praying. No receipts, no tracking. My father was in the hospital and I couldn\'t verify anything.', theme_tag: 'Friction — money transfer', segment: 'Diaspora family', severity: 5, wtp: 'Y', notes: '' },
    { interview_id: 'INT-005', quote: 'It was me paying — my father would never spend that on himself. The children abroad are the real customers.', theme_tag: 'Buyer — family abroad', segment: 'Diaspora family', severity: 4, wtp: 'Y', notes: 'Direct support for H1.' },
    { interview_id: 'INT-006', quote: 'We gave up. Too many forms, no answers, and the agent wanted money upfront just to "register the case".', theme_tag: 'Pain — coordination', segment: 'Patient', severity: 5, wtp: 'Maybe', notes: 'Abandonment case — the wedge moment.' },
    { interview_id: 'INT-007', quote: 'Being a nurse, I could read the reports. An ordinary family has no chance of comparing two hospital quotes.', theme_tag: 'Trust — price clarity', segment: 'Caregiver', severity: 4, wtp: 'Y', notes: '' },
    { interview_id: 'INT-007', quote: 'The visa letter took two weeks because the hospital kept sending it with the wrong passport number.', theme_tag: 'Friction — paperwork', segment: 'Caregiver', severity: 3, wtp: 'Maybe', notes: '' },
    { interview_id: 'INT-008', quote: 'The village raised 800,000 shillings in one harambee. Money was not the blocker — knowing where to send it was.', theme_tag: 'Pain — financial', segment: 'Patient', severity: 4, wtp: 'Maybe', notes: 'Financing is communal; trust is the gap.' },
    { interview_id: 'INT-008', quote: 'I chose the hospital because the doctor there had treated another man from our mosque. One name carried everything.', theme_tag: 'Trust — doctor reputation', segment: 'Patient', severity: 3, wtp: 'N', notes: '' },
    { interview_id: 'INT-009', quote: 'If someone sent us complete, verified case files for East African patients, yes — that is worth paying for. Our desk wastes days on incomplete files.', theme_tag: 'Buyer — Hospital IPD', segment: 'Hospital IPD', severity: 4, wtp: 'Y', notes: 'Second independent IPD WTP signal.' },
    { interview_id: 'INT-010', quote: 'I compared three hospitals for months. In the end I picked the one whose WhatsApp replied the same day.', theme_tag: 'Trust — speed of reply', segment: 'Diaspora family', severity: 4, wtp: 'Y', notes: 'Response speed as trust proxy — recurring.' },
    { interview_id: 'INT-010', quote: 'Sending $12,000 through three different transfer services cost me almost $600 in fees and a week of anxiety.', theme_tag: 'Friction — money transfer', segment: 'Diaspora family', severity: 4, wtp: 'Y', notes: '' },
  ];

  const deliverables = [
    { phase: 0, deliverable: "Lead's pre-work completed", status: 'Complete', evidence: 'Market notes + corridor sizing shared in workspace.' },
    { phase: 0, deliverable: 'Workspace live, both have written content', status: 'Complete', evidence: 'Both roles active in the workspace.' },
    { phase: 0, deliverable: 'Interview scripts v1 drafted', status: 'Complete', evidence: 'Three scripts drafted — see Scripts.' },
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

  const scripts = [
    {
      script_name: 'Patient / caregiver', version: 1, content: [
        { title: 'Open (3 min)', body: 'Thank the person. Promise: no quotes with their name without permission. Ask permission to record.' },
        { title: 'Warm-up (5 min)', body: '"Walk me through the last time you or your family considered or went through this." Anchor in a real, recent story.' },
        { title: 'Core: discovery', body: 'How did you first start looking for hospitals abroad? — Probe if they mention WhatsApp or a person.' },
        { title: 'Core: trust', body: 'What made you trust one hospital more than another? — Probe if they say "a friend went there".' },
        { title: 'Core: friction', body: 'What was the most frustrating moment in the whole process? — Wait through silence.' },
        { title: 'Core: money', body: 'If you had to do it again, what would you pay someone to handle for you? — Anchor on the number they give.' },
        { title: 'Core: severity', body: 'Was there a moment you nearly gave up? — That moment is the wedge.' },
        { title: 'Close (3 min)', body: '"Is there anything I should have asked but didn\'t?" · Ask for two specific introductions · Confirm follow-up permission.' },
      ],
    },
    {
      script_name: 'Hospital IPD', version: 1, content: [
        { title: 'Open (2 min)', body: 'Brief professional intro. Not selling, not asking for referrals. Permission to record.' },
        { title: 'Warm-up (3 min)', body: '"Tell me how your IPD is structured — who handles East African inquiries?"' },
        { title: 'Core: qualified leads', body: 'What makes a lead from East Africa qualified vs unqualified? — Which document is missing most often?' },
        { title: 'Core: documents', body: 'What information do you need before the medical team will review a case? — Would they pay for cases pre-formatted to that standard?' },
        { title: 'Core: response time', body: 'From first inquiry, how fast do you usually reply, and what slows you down?' },
        { title: 'Core: commissions', body: 'What do you currently pay agents per converted patient? — Does it vary by specialty?' },
        { title: 'Core: SaaS interest', body: 'Would you pay for software that pre-qualifies and packages African cases for you? — What would have to be true?' },
        { title: 'Close (5 min)', body: '"Anything I should have asked?" · "Who else at the hospital?" · Follow-up permission.' },
      ],
    },
    {
      script_name: 'Agent / facilitator', version: 1, content: [
        { title: 'Open (3 min)', body: 'Friendly but specific. Upfront: building patient-side. Their candour matters.' },
        { title: 'Warm-up (5 min)', body: '"Walk me through your last patient — first call to follow-up at home."' },
        { title: 'Core: workflow', body: 'Where do you add the most value? — Emotional vs transactional answer = different MVPs.' },
        { title: 'Core: pain', body: 'What\'s painfully manual? — Quote-chasing or document re-formatting = leverage.' },
        { title: 'Core: money', body: 'How do you get paid, and by whom? — Both sides? Ask which resists more.' },
        { title: 'Core: adoption', body: 'What would a tool have to do for you to use it daily? — Which feature, removed, kills adoption?' },
        { title: 'Close (3 min)', body: 'Anything missed · Two introductions · Follow-up.' },
      ],
    },
  ];

  const kill_list = [
    { hypothesis: 'Patients will use a self-serve web portal to compare hospital quotes', evidence: 'Zero of twelve interviewees started with a website. Every journey began with a person — a relative, a nurse, an agent. Discovery is social, not searched. (INT-001, INT-002, INT-008, INT-010)', killed_date: daysAgo(4) },
    { hypothesis: 'The Turkey corridor is comparable to India for Kenyan patients', evidence: 'No interviewee had considered Turkey. Agents report <5% of cases go there; language and flight cost dominate. Corridor dropped from scope in Phase 0.', killed_date: daysAgo(15) },
  ];

  const field_checks = [
    { assumption: 'Agents charge patients a registration fee upfront', confirmed: true, confirmed_by: FIELD, confirmed_date: daysAgo(7), notes: 'Confirmed at two Nairobi agencies: KES 5,000–15,000 upfront.' },
    { assumption: 'Hospitals reply faster to known agents than to direct patients', confirmed: true, confirmed_by: LEAD, confirmed_date: daysAgo(5), notes: 'Confirmed by both IPD interviews (INT-004, INT-009).' },
    { assumption: 'M-Pesa cannot be used directly for Indian hospital deposits', confirmed: false, confirmed_by: '', confirmed_date: null, notes: 'Needs checking with a bank or forex bureau.' },
    { assumption: 'Diaspora payers outnumber local payers for planned procedures', confirmed: false, confirmed_by: '', confirmed_date: null, notes: 'Directional from interviews; needs a bigger sample.' },
  ];

  const documents = [
    {
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

  return {
    outreach, interviews, matrix, deliverables, scripts, kill_list, field_checks,
    documents,
    economics: [], segment_cards: [], decision_memos: [], reports: [],
  };
}
