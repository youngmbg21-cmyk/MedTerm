# Project Overview — MedTerminal Research Workspace

> This app is not the MedTerminal product. It is the research tool used to decide whether and how to build it.

---

## What This App Is

`index.html` is a single-file browser app — a **research workspace** for managing the MedTerminal six-phase discovery project. It runs in the browser, talks to a Cloudflare Worker, and gives the research team (Simon and Amina) everything they need to run structured qualitative research on the medical tourism market.

It is a management layer for the research process — not a product for end users.

---

## The Research Project It Manages

MedTerminal is a proposed patient-side medical tourism platform for Kenyan families seeking treatment abroad (primarily India). Before building it, the team is running a six-phase research programme to validate the problem, the solution, and the business model.

**The six phases:**

| Phase | Name | Purpose |
|-------|------|---------|
| 1 | Outreach & recruitment | Identify and contact the right interview subjects |
| 2 | Qualitative interviews | Run 30–40 structured interviews across five segments |
| 3 | Sense-making | Surface themes, patterns, and the strongest signals |
| 4 | Validation | Test hypotheses derived from Phase 3 findings |
| 5 | Synthesis | Write the research report and investment brief |
| 6 | Decision | Go / no-go on building the product |

The app is the operational home of Phases 1–3, and a reference for all six.

---

## The Five Interview Segments

| Segment | Target interviews |
|---------|------------------|
| Patient (travelled abroad) | 8 |
| Caregiver (accompanied patient) | 6 |
| Hospital IPD / international patient desk | 5 |
| Medical travel agent / broker | 5 |
| Kenyan clinician (referring doctor) | 4 |

**Total target: ~28 interviews.** Phase 2 exit gate requires saturation — not just hitting numbers.

---

## The Research Team

- **Simon** — project lead, strategy, synthesis
- **Amina** — field coordinator, Nairobi-based, conducts patient and caregiver interviews in Swahili and English

The app is designed for both of them to use simultaneously. Amina uses it in the field on her phone. Simon uses it on desktop for analysis and coordination.

---

## What the App Does

See `docs/features.md` for the full screen-by-screen breakdown. In summary:

- **Tracks outreach** — every contact approached, their status, and next action
- **Logs interviews** — one row per interview, with same-day tagging enforced
- **Manages the theme matrix** — de-identified quotes tagged by theme, segment, severity, and willingness to pay
- **Shows saturation** — per-segment progress toward Phase 2 exit criteria
- **Provides reference material** — interview scripts, outreach templates, operating manual
- **Powers an AI assistant** — a Claude-backed chat panel that knows the live state of the research and can answer "what should I do today?", run phase exit checks, and surface the strongest signals from the data

---

## What It Is Not

- It is **not** the MedTerminal patient-facing product
- It does **not** process audio recordings or generate transcripts
- It does **not** host files or documents
- It is **not** a CRM or a project management tool in the general sense — it is purpose-built for this specific research programme
