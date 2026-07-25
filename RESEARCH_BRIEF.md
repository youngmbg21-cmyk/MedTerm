# HaTi — Research Brief

**Written:** 25 July 2026 · **Source:** a full read of the `mkataba-clm` repository
(source code, README, SECURITY.md, DEPLOYMENT.md, MULTITENANCY-NOTES.md,
SESSION-NOTES.md, the product backlog, and the server code itself).
**Purpose:** this brief defines what the HaTi Research workspace is built to answer.
Everything in Phase 2 exists to move the five questions at the end from open to answered.

---

## 1 · What HaTi does today

HaTi is a **contract lifecycle management (CLM) platform built for the Kenyan market**.
It is at MVP status and it genuinely works — this is not a prototype or a landing page.

**The core loop it supports.** A company puts its contracts into HaTi (typing them from
a built-in Kenyan template, pasting them out of Word, or uploading the counterparty's
PDF), works them through Draft → Under Review → Signed, and keeps the executed copy with
an audit trail. Around that loop it does considerably more than a document store:

| What it does | Why it matters commercially |
|---|---|
| **Twelve Kenyan contract templates** with fill-in blanks, versioning, bulk creation from a spreadsheet | The local moat. Nobody else ships Kenyan paper out of the box. |
| **E-signature with a SHA-256 seal** — freezes the exact rendered text at signature, records signer, method, time, user-agent and IP; counterparty verifies by emailed one-time code; downloadable evidence pack | This is the trust core, and it is honest about its limits (see risks below). |
| **No-login counterparty portal** — send a short link; the other side reviews, redlines, declines or signs without creating an account | Removes the single biggest friction in African B2B contracting: the counterparty won't sign up for your software. |
| **AI reading of contracts** — extracts counterparty, dates, value, renewal type, notice period and governing law from an uploaded PDF; OCR for scanned paper and phone photos; a Kenya playbook review that quotes clauses verbatim and flags deviations (stamp duty, foreign governing law, data protection) | The reason a customer would migrate a back catalogue at all. |
| **Bulk migration** — drop 25 files at a time, dedupe by hash/fingerprint/similarity, auto-file by value stream, optional manifest CSV reconciliation | This is the onboarding product. Without it, adoption dies at "now type in 400 contracts". |
| **Renewal calendar and obligations** — 90/60/30-day reminders plus the notice-period decision deadline, obligations as assignable tasks | The strongest single pitch to a Kenyan CFO: *never miss a notice deadline again.* |
| **Approvals and multi-signer flows** — conditional routing rules (value, type, deviation) and sequential signers | Table stakes against Oneflow. |
| **Portfolio Intelligence** — every contract as a node in an AI-clustered graph you can query in plain English | The demo feature. Sells the room; not what retains the account. |
| **Advice Desk** — a public intake page where a customer submits a contract review/drafting/negotiation request at a published hourly rate, tracked through Submitted → Scoping → In Progress → Delivered | **The only part of HaTi that charges money today.** More on this below. |

**How it runs.** One Node.js process (Express + built-in SQLite), no build step, no native
dependencies, serving both the API and the frontend. It is **self-hosted and
single-tenant**: one server process hosts exactly one customer's workspace. There is a
static/localStorage mode for offline demos. AI runs through a server-side Anthropic proxy;
the API key never reaches the browser.

**What it is honest about not having** (from `SECURITY.md` — and this honesty is an asset
in a sales conversation, not a liability):

- No IPRS identity verification and no CAK-accredited PKI signatures. Signatures rest on
  the Business Laws (Amendment) Act 2020, which is a real legal basis, but it is not the
  accredited tier.
- No ODPC registration, no Data Processing Agreement, no documented retention policy.
- No multi-tenancy and **no billing of any kind** — no M-Pesa, no card, no plans, no
  subscription logic. Multi-tenancy is explicitly groundwork-only; the notes warn against
  enabling multi-org signup before every query is tenant-scoped.
- Rate limiters and spend counters are in-memory and single-instance.

**The one-sentence version:** HaTi is a working, Kenya-specific CLM with a genuine
technical moat (local templates, sealed signing, no-login counterparty portal, AI
migration) that has never been sold to anyone, cannot yet bill anyone, and runs one
server per customer.

---

## 2 · Who its likely first customers are

Nothing in the repository records a real customer, a pilot, or a conversation with a
buyer. So this section is **inference from what was built**, not evidence — and turning it
into evidence is the first job of the research workspace.

The demo portfolio is the strongest signal of intent: 30 contracts modelled on a
**diversified Kenyan FMCG company**, spanning procurement, manufacturing, warehousing and
cold chain, distribution, retail listing (Naivas, Carrefour, Copia), marketing, and
corporate/compliance. Someone built this for a mid-size Kenyan corporate with a real
supply chain.

**Tier 1 — the shape the product was built for.** Mid-size Kenyan corporates, roughly
50–500 staff, with 100–1,000 live agreements and a **one-to-three-person legal or company
secretarial function**: FMCG manufacturers and distributors, logistics and warehousing
firms, agri-processors, and commercial property managers. They have enough contracts that
missing a renewal costs real money, and not enough legal staff to track them in Excel
without something slipping. The buyer is most likely the **Head of Legal / Company
Secretary**, with the **CFO** signing the cheque.

**Tier 2 — high contract volume, thin legal cover.** Insurance brokers and agencies,
SACCOs and microfinance institutions, private hospitals and school groups, and NGOs with
donor-funded procurement (these have compliance obligations that make an audit trail
genuinely valuable). Cheaper to reach, faster decisions, smaller budgets.

**Tier 3 — the services wedge.** Boutique law firms and independent counsel who could use
HaTi as their own delivery tool, or resell it to their clients. This tier is interesting
because the **Advice Desk is already built for it** — it is the one revenue mechanism in
the product.

**Who is probably not the first customer, despite being tempting:** the large banks,
telcos and multinationals. They have procurement processes, vendor security reviews, and
the ODPC/DPA paperwork HaTi does not yet have. They will ask for a DPA and a penetration
test before they ask about the price.

---

## 3 · What it charges, and what it could charge

**Today: nothing.** There is no billing code in the repository. No plans, no seats, no
subscription, no M-Pesa or card integration — all explicitly deferred.

**The one published price in the whole product** is the Advice Desk rate card, hard-coded
in `server/server.js` as the default (and admin-editable):

| Service | Rate | Typical effort | Turnaround |
|---|---|---|---|
| Contract review | KES 8,500 / hour | 3–6 hours | 3 days |
| Drafting | KES 9,500 / hour | 4–8 hours | 5 days |
| Advice | KES 7,500 / hour | 1–2 hours | 2 days |
| Negotiation support | KES 10,500 / hour | 3–6 hours | 4 days |
| Compliance | KES 9,000 / hour | 2–4 hours | 4 days |

Priority work is +25% on the rate with the turnaround halved. In practice that is a
**KES 7,500 – 63,000 per matter** legal-services business, priced like a mid-tier Nairobi
firm — not like software.

**What it could charge — four models worth testing, not one to assume:**

1. **Per-seat SaaS**, the Ironclad/Juro/Oneflow default. Global CLM lists at roughly
   USD 30–100 per user per month at the low end and enterprise pricing above that. For a
   Kenyan mid-market buyer, KES 3,000–8,000 per user per month is the plausible band, but
   this is exactly the assumption most likely to be wrong — Kenyan buyers routinely resist
   per-seat pricing because it punishes them for adding users.
2. **Flat workspace subscription** — KES 25,000–120,000 per month for the whole company,
   possibly banded by contract count. Fits how HaTi is actually deployed (one server per
   customer) and avoids the per-seat objection.
3. **Onboarding / migration fee** — a one-off KES 150,000–500,000 to bring a back
   catalogue in. HaTi's migration tooling is genuinely good and the work is genuinely
   painful; this may be the easiest first cheque to collect and the fastest route to a
   reference customer.
4. **Services-led, software-included** — sell the Advice Desk at the rates above and give
   the platform away with the retainer. Slowest to scale, but the shortest path to
   revenue, and it is the model the product already supports end to end.

The honest position: **HaTi has a price list for lawyering and no price for software.**
Which of the four models the market will actually pay for is unknown, and it is the
question with the most money attached to it.

---

## 4 · The five biggest unanswered questions between HaTi and paying customers

These are the five that the research workspace is built around. Each one is written so
that a real answer changes what gets built or sold next.

### Q1 · Who is the buyer, and what job do they hire HaTi for?
The product does storage, signing, renewal tracking, AI review, migration and legal
services — all well. That breadth is a symptom of not yet knowing which single pain a
buyer will pay to remove. Does a Kenyan Head of Legal buy this to **stop missing renewal
deadlines**, to **get contracts signed faster**, to **find their contracts at all**, or to
**cut outside counsel spend**? Until one job is named, positioning, the demo, and the
first screen of the product cannot be settled.
**What would answer it:** 10–15 discovery conversations where the prospect names their own
worst contract moment of the last 12 months, unprompted.

### Q2 · Will a Kenyan company pay for CLM software — and in what shape?
Not "would you use this" but "what would you pay, on what basis, out of whose budget".
Per-seat, flat, per-contract, or services-with-software-attached are four different
companies. The answer also decides whether the immediate build is billing and
multi-tenancy (SaaS) or nothing at all (services-led, invoice by hand).
**What would answer it:** the same prospects reacting to three concrete priced options,
plus at least one signed order — a paid pilot counts, a letter of intent does not.

### Q3 · Does the signature stand up without IPRS and CAK-accredited PKI?
HaTi's seal is cryptographically sound and rests on the Business Laws (Amendment) Act
2020, but it is not the accredited tier, and the product says so out loud. If a customer's
legal or IT reviewer treats accreditation as mandatory, the whole signing flow — the trust
core of the product — is blocked, and HaTi is a repository with reminders. If they don't,
the accreditation work can wait years.
**What would answer it:** the objection either appearing or not appearing in real
conversations, plus a written read on Kenyan e-signature law and what accreditation
actually requires, with sources.

### Q4 · What does it take to be legally sellable in Kenya?
No ODPC registration, no Data Processing Agreement, no documented retention or
subject-access path. Self-hosting defers the problem (the customer holds the data) but
also caps growth at one server per customer. Add stamp duty handling and the e-signature
rules above, and there is a compliance bill of unknown size sitting in front of the first
enterprise deal.
**What would answer it:** a documented list of every regulatory requirement with a source
link, a cost, and a time estimate — market size, Data Protection Act 2019, stamp duty,
e-signature rules. Facts with sources, not impressions.

### Q5 · What actually displaces the incumbent — which is email, Word and a shared drive?
The real competitor is not Ironclad or Juro. It is a folder on a shared drive, a WhatsApp
thread, DocuSign for the signature, and a lawyer on retainer. That incumbent is free,
already installed, and universally understood. Ironclad, Juro, DocuSign CLM and Oneflow
matter mainly as a **pricing and feature ceiling** and as the comparison a sophisticated
buyer will make; local players matter as the realistic alternative. HaTi needs one thing
the incumbent cannot do that a buyer will pay to have.
**What would answer it:** a maintained competitor map including the do-nothing option, and
prospects saying in their own words what they use today and what it costs them.

---

## 5 · What this means for the research workspace

The five questions above are the spine of the tool built in Phase 2. Every screen exists
to feed one of them:

| Question | Fed by |
|---|---|
| Q1 Buyer & job | Prospects, conversations, insights |
| Q2 Willingness to pay | Pricing ideas and recorded prospect reactions |
| Q3 Signature validity | Market & regulation facts, plus objections raised in conversations |
| Q4 Legal to sell | Market & regulation facts, every one with a source link |
| Q5 Displacing the incumbent | Competitors, including "do nothing" as a tracked competitor |

A finding only counts when it is written down as an insight and attached to the question
it supports or challenges. That link is the whole point of the tool.
