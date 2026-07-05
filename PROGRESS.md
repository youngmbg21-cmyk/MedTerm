# PROGRESS.md

## Decision engine re-architecture — IN PROGRESS (started 2026-07-05)

Hypotheses, kill criteria, evidence links, and versioned AI assessments become
first-class records; a Decision Brief screen and a three-seat Decision memo sit
between the evidence and the verdict. Task ledger (execute in order):

1. [x] Schema: hypotheses / evidence_links / ai_assessments in sql/schema.sql,
       data.js KNOWN_TABLES, app.js STATE, settings export list, seed.js
       (6 hypotheses, 16 demo links, 2 demo assessments INSUFFICIENT→PIVOT).
       Verified: smoke-seed harness (links resolve, trajectory, steelman).
2. [x] Config: AI_MODE in js/config.js; chat/reports/settings/data.js AI
       touchpoints now check aiAvailable, not isLocalMode; boot requires
       magic-link login when AI_MODE='worker' (identity for the worker);
       data.js gained assessmentRequest / proposeLinksRequest /
       draftSectionRequest / aiDataSlices(state).
3. [x] Worker: hypotheses/kill criteria removed from the system prompt and
       injected from the DB (or the request body); POST /api/assessment
       (validate + one retry, append-only insert or return-for-client-persist);
       POST /api/propose-links (0–2, fail-soft); POST /api/draft-section;
       chat tools query_hypotheses / query_evidence_links /
       get_latest_assessment; propose_action gains add_evidence_link +
       update_hypothesis_status; every tool reads via fetchRows(env,
       localData, table) so body-provided data works identically.
       Verified: node --check + smoke-worker harness (validators, extractJson,
       prompt injection).
4. [x] Shared confirm/skip helper extracted from js/chat.js into
       js/actions.js (actionConfirmation/addActionConfirmation/applyAction,
       TABLE_FOR_ACTION incl. add_evidence_link + update_hypothesis_status)
5. [x] Decision Brief screen (js/screens/decision-brief.js) + top-level nav
       entry, ungated: leaning card w/ regenerate (calm AI-off state),
       hypothesis board (status/direction/strength, link counts, top-2
       quoteBlocks, gaps, what-would-change callout), kill-criteria strip,
       trajectory strip (tap → read-only modal), divergence panel.
       Shared helpers in js/evidence.js (latestAssessment, resolveLink,
       openLinkModal, renderMarkdown, runAssessment).
6. [ ] Decision memo rebuild (three seats, override rationale, draft-from-evidence)
7. [ ] Evidence linking in matrix / interviews / field checks (manual always;
       AI proposals when available)
8. [ ] Overview additions (leaning panel, phase-exit review button/banner)
9. [ ] Docs: CLAUDE.md, docs/*, DECISIONS.md, HANDOFF.md
10. [ ] Final full verification vs Definition of done (375px + 1280px reasoning)

Verification per unit: node --check every changed js file, import audit,
convention audit (no fetch/localStorage outside data.js, h() not innerHTML,
no hardcoded names/hypotheses), data-shape audit vs sql/schema.sql, smoke
harness in scratchpad.

---

Status of the autonomous rebuild, 2026-07-04.

## Milestone 1 — Usable MVP ✅
- `js/config.js` — DATA_MODE, CURRENT_PHASE, phases, segments + targets, themes,
  statuses, stall threshold, editable team roles (live updates, persisted).
- `js/data.js` — single data interface; `local` adapter (localStorage, seeded) and
  `api` adapter (Cloudflare Worker, lowercase paths, Bearer JWT).
- `js/seed.js` — 20 outreach contacts (3 stalled), 12 interviews (2 untagged past 24h),
  18 matrix quotes, 27 deliverables across all six phases, 3 scripts, 2 killed
  hypotheses, 4 field checks.
- Phase-gated pipeline nav (locked groups dimmed with "unlocks at phase N", all
  screens reachable).
- Overview command center: phase rail with % criteria met, KPI strip, exit-criteria
  panel (tap to cycle status), saturation panel, needs-attention panel.
- Outreach (exception-first: stalled banner, search/filter/add/edit, CSV).
- Interviews (master–detail, linked matrix quotes, red untagged banner, mark-tagged,
  auto INT-nnn ids).
- Theme matrix (quote blocks, filters, add/edit, CSV).
- Saturation (bars fed by the single segment config).
- Reference: Scripts (versioned, edit + history + revert), Templates, Manual.
- Settings (team names live-update, reset demo data, mode display).
- All §4 fixes: snake_case everywhere, lowercase api paths, auth wired, dead files
  deleted, one segment config, no raw innerHTML for user text, no hardcoded names.

## Milestone 2 — Phase 3 ✅
Theme analysis (ranked, thin-evidence flagged), Segment cards, Top-3 pains,
Kill list (append-only + CSV), State of the field (dated paragraph).

## Milestone 3 — Phase 4 ✅
Unit economics (assumptions → derived → three break-point pass/fail checks →
sensitivity table), Alternate models, Field checks (unverified-first).

## Milestone 4 — Phase 5 + output ✅
Decision memo (verdict-first GO/PIVOT/NO-GO + 7 sections + co-sign), MVP scope
("one of each"), Confirmatory tests (metrics), Reports (template-generated from live
data, view + print-ready).

## Milestone 5 — Backend readiness & docs ✅
`api` adapter + magic-link login implemented (untested without secrets, by design).
README, CLAUDE.md, docs/tech-stack.md rewritten to match the code. HANDOFF.md written.

## Verification
- Playwright smoke test: all 21 routes at 1280px and 375px — zero console errors,
  no empty panels, no horizontal overflow, data persists across reload.
- Playwright interaction test: 13 flows (add contact, search, log interview with
  auto-ID, master-detail, mark-tagged clears red state, add + filter quote, live
  team-name propagation into dropdowns, report generate/view, kill-list append,
  deliverable cycling, demo reset, disabled chat state) — all pass.

## Sole-repository upgrade ✅ (2026-07-05)
- Interview field notes: `notes_markdown` on the log form and detail view, with an
  in-place editor; 5 seeded interviews carry realistic full debriefs.
- Documents screen: upload/search/view/download/delete for PDF, text, markdown, CSV,
  images (10 MB cap, Word rejected with guidance, privacy banner). IndexedDB in local
  mode via new `data.putFile/getFile`; Supabase Storage (`field-documents` bucket) via
  new Worker endpoints in api mode. 3 seeded documents (agent debrief, IPD price CSV,
  diaspora money-transfer notes) linked to interviews.
- Interview detail shows linked documents; documents link back by interview ID.
- Assistant now reaches everything: `search_notes` (full-text across interview notes,
  outreach notes, matrix quotes/notes, deliverable evidence, document contents),
  `list_documents`, `read_document` (text verbatim, PDFs transcribed once and cached,
  images returned as image blocks), query limits raised to 50, tool rounds to 5,
  context snapshot now reports notes coverage and the document inventory.
- Settings: storage meter (records vs ~5 MB, browser usage) and "Export everything"
  JSON backup including notes and document text.
- sql/schema.sql: `documents` table + RLS + private-bucket instructions.
- Verified: smoke suite (22 routes × 2 viewports, zero console errors) and a new
  11-assertion interaction suite (upload → search-by-content → reload persistence →
  download roundtrip → notes edit → export contents) all pass.

## Data portability, safer resets, executive reporting ✅ (2026-07-05)
- `js/charts.js`: dependency-free inline SVG bar chart, percent meter, and 2×2
  risk matrix — no charting library, matches the app's palette, renders
  identically on-screen and in the standalone print window.
- Export (Settings → Data management): stamped with `schema_version`; binary
  documents (images/PDFs) now embedded as base64 so a single JSON file is a
  complete, restorable backup. Text-based documents still rely on
  `text_content` (no duplication).
- Import: validates `app` field + `schema_version` (hard reject on mismatch,
  specific error shown), previews record counts per table, requires typing
  IMPORT, auto-downloads a safety export first, then replaces all local data
  via new `data.importAll()`. Local-mode only.
- Two explicit resets: "Reset to demo data" (existing seed, now behind a
  typed RESET confirmation + safety export) and new "Start fresh for real
  fieldwork" (wipes every research table, restores stock scripts at v1, and
  resets the deliverables checklist to "Not started" — segments/themes/
  templates/manual need no reset since they live in code, not storage).
  Both local-mode only; `js/data.js`'s api adapter throws explanatory errors
  and the Settings UI shows a "disabled in live mode" note instead of the
  buttons when `DATA_MODE = 'api'`.
- `js/seed.js` refactored: `buildDeliverables()`/`buildScripts()` extracted
  so the demo seed and the new `buildFreshFieldworkSeed()` share one
  definition of the stock framework and can't drift apart.
- Fourth report type, "Executive briefing": verdict-first executive summary
  (hard-capped at 150 words), methodology with segment-coverage chart and
  same-day tagging rate, core findings citing interview IDs and flagging
  thin evidence (<3 quotes), data-driven strategic implications, a 2×2
  risk-assessment matrix (unit-economics break-points + unconfirmed
  assumptions) with a numbered legend, and next steps with real team-config
  owners and concrete target dates. `economics.js`'s model exported and
  reused rather than re-implemented.
- Existing reports gained one supplementary chart each: weekly status
  (tagging-rate meter), phase exit (segment coverage bars), investor
  briefing (WTP-by-segment bars, shown only when non-empty).
- Verified: full 4-suite regression (smoke, interact, interact2, interact3)
  all pass — including a real export → upload binary doc → Start Fresh →
  reject-bad-import ×2 → import-good-backup → verify-restored-incl-binary
  → reset-to-demo roundtrip, plus a dedicated api-mode check (flipped
  DATA_MODE, confirmed Import/Start Fresh/Demo Reset are hidden with an
  explanatory note while Export stays available, reverted after).
