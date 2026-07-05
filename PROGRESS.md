# PROGRESS.md

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
