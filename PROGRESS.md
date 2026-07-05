# PROGRESS.md

## AI-first platform pass ✅ (2026-07-05)

The platform now treats AI drafting as the default path everywhere writing
happens *about* the research, while field data collection stays human.
One architecture, four surfaces:

- **`worker.js /api/draft-section` generalised** into the single drafting
  seam: `doc_kind` frames the prompt per surface; a new structured mode
  (`fields[]` → validated JSON) powers multi-field drafts with the same
  one-retry-then-loud-502 discipline as assessments. `validateDraftFields`
  is pure and exported; offline harness passes 7/7 cases.
- **`js/ai-draft.js`** — the shared `aiDraftControls` row every surface
  uses: draft primary when empty, redraft ghost when filled, manual always
  available, calm-disabled with inline explanation when AI is off, busy
  state handled once. The decision memo was refactored onto it (net code
  deletion), so the AI-first pattern has one implementation.
- **State of the field**: "Draft from evidence" (one dated paragraph from
  the whole ledger) → editor modal → human saves. Manual writing intact.
- **MVP scope**: one structured request drafts all six "one of each"
  fields → six-field editor modal prefilled → human saves. Manual intact.
- **Reports**: every report type gains "Draft with assistant" — the
  narrative is AI-drafted, every number/chart section comes from the same
  deterministic templates (the AI never invents figures), and the draft
  shows in a preview (same renderer as the saved-report viewer) with
  Save/Discard. "Generate from template" remains a full peer and the only
  path when AI is off.

Human intervention is now one review-tap per artefact — the minimum the
workspace's own constitution allows (the AI argues; it never decides;
nothing AI-written is stored without human confirmation).

Reviewed and deliberately not AI'd (DECISIONS.md #72): field collection,
the kill list, computed rollup screens, outreach messaging, exit-criteria
one-liners.

Verified: `node --check` on every changed module; offline validator
harness 7/7; Playwright at 375px — state of the field (draft muted first,
note on tap, manual write → saved → filled state flips to Redraft/Edit),
MVP scope (six-field manual editor saves), decision memo (refactor
regression: identical buttons + 7 shared helper lines), reports (template
generate still saves; saved-report viewer renders; AI draft card buttons
correct); all 23 routes × 2 viewports, zero page errors. AI-on flows
verified structurally (no worker secrets in this environment — see
DECISIONS.md #73).

## Designer's note — design elevation pass (2026-07-05)

**What changed visually.** The app now runs on a documented design system
(`css/theme.css` header block): one type scale with two weights per family,
a 4px spacing scale, colour roles with AA-passing tone trios, two elevation
levels, two radii, one motion rule. The shell was redrawn — Fraunces 22
page titles over the screen's one-line question, the screen's single
primary action top-right in the header, content centred at 1120px, a
tightened sidebar with right-aligned phase badges and a filled active
state. Secondary text app-wide got darker (the old `--ink-mute` failed
WCAG AA), 139 inline styles became utility classes, quotes read as
editorial pull quotes (Fraunces italic, hairline left rule), empty states
carry a first action, loading is one skeleton pattern, and report printing
is typeset like a deliverable (title block, running footer). The decision
memo now leads with "Draft from evidence" — AI-first, human-signed. And
the phone works: the mobile drawer was functionally broken (trapped under
its own overlay whenever the Tailwind CDN loaded) and is now a real
drawer pattern with scroll lock, Escape, and focus management.

**The five decisions that most affect future screens.**
1. The shell never depends on the Tailwind CDN — shell layout lives in
   owned classes; utilities are for in-screen layout only (DECISIONS #60/62).
2. One primary action per screen, mounted in the header via
   `setPageActions()`; everything else is line/ghost in a quiet tools row.
3. Colour is roles + tone trios, all AA; charts mirror the palette by hand.
4. States are components: `emptyState(title, sub, action?)`,
   `loadingState()`, banners, and calm-disabled via `aria-disabled` (muted
   but tappable — a tap explains, never a dead click).
5. Every interactive element: 40px hit target + `:focus-visible` ring.

**Deliberate compromises.** Tailwind utilities remain inside screens
(removing the CDN wholesale was too risky for one pass); `alert()` error
handling remains in ~30 catch handlers (banner swaps are logic surgery);
print footers carry date + document identity but no page numbers (Chrome
lacks `@page` margin boxes); ~29 inline styles remain, all dynamic values
or one-off viewer sizing (grep-audited).

### Contrast ratios (computed, WCAG AA threshold 4.5:1 for text)
| Pair | Ratio |
|---|---|
| ink `#1F2A28` on page | 13.13 |
| ink-soft `#4A5651` on page | 6.80 |
| ink-mute `#6E6A5E` on card / page | 5.40 / 4.80 |
| sage text `#3F5A4D` on sage-soft | 6.34 |
| honey text `#755A1E` on honey-soft | 5.39 |
| rose text `#9a3f3f` on rose-soft | 5.39 |
| info text `#3E5C77` on info-soft | 5.81 |
| plum text `#644A67` on plum-soft | 6.33 |
| clay text `#96501F` on page / clay-soft | 5.38 / 4.89 |
| white on sage-deep (btn-primary) | 7.55 |

### Mobile checklist — every route walked at 375px (Playwright, touch)
All 23 routes render with no page errors and no horizontal page overflow
(the matrix pivot's internal scroll is the one sanctioned exception) at
both 375px and 1280px. Capability checks at 375px, all passing:
- Drawer: opens above overlay (z 45>35), nav tap navigates + closes, Escape
  closes + returns focus to the hamburger, backdrop closes, body scroll
  locks while open, works with a late-injected utility stylesheet
  (the old failure mode, simulated).
- Forms: interviews add/edit modal opens from the header action; submit
  button 40px and reachable; Cancel works.
- Master–detail: list tap swaps the detail pane (INT-012 → INT-006 verified).
- Matrix grid: horizontally scrollable inside its card with the theme
  column `position: sticky` pinned left.
- Decision memo: verdict seat buttons 40px; AI-off draft button shows its
  inline note on tap; "Write manually" opens the edit modal.
- Chat panel opens and closes; CSV export fires a real download event.

---

## Decision engine re-architecture — COMPLETE ✅ (2026-07-05)

**Closing summary.** The workspace's spine is inverted: hypotheses (H1–H3), kill
criteria (K1–K3), evidence links, and versioned AI assessments are now first-class
records (`sql/schema.sql`, seeded in `js/seed.js`, flowing through `js/data.js`).
A new ungated **Decision Brief** screen renders the latest leaning with its
narrative brief, a record-driven hypothesis board with cited quotes and
"what would change this" callouts, the kill-criteria strip, the append-only
assessment trajectory (seeded INSUFFICIENT → PIVOT so demo mode is alive), and a
divergence panel. The **Decision memo** verdict row is three seats — lead, field
coordinator, AI (advisory, read-only); co-sign opens only when both humans agree,
overriding the AI requires a written rationale, and signing snapshots the
assessment id. Evidence linking is woven into capture (matrix, interviews, field
checks, economics): manual linking works fully offline; in AI mode saves surface
quiet, skippable proposals through the shared Confirm/Skip pattern
(`js/actions.js`), and confirmed links carry `source: 'ai_confirmed'`. The Worker
no longer hardcodes any hypothesis: prompts inject the live board, and new
endpoints POST /api/assessment (JSON-validated, one retry, append-only),
/api/propose-links (fail-soft), /api/draft-section (never auto-saved) work in
both data modes — `AI_MODE` in `js/config.js` decouples the AI from DATA_MODE,
enabling local-first data + live AI.

**Judgment calls** are logged as DECISIONS.md items 38–52 (notable: worker-mode
AI reuses magic-link identity rather than putting any token in the frontend;
`content.verdict` became derived from the two human seats; kill-criterion links
read "supports = pushes toward breach"; propose-links fails soft while
/assessment fails loud).

**Verified** (no build step; browserless): `node --check` on every js file and
worker.js; import-path + named-export static audits; convention audit (no
fetch/localStorage outside data.js, no innerHTML with content, no hardcoded
names or hypotheses); data-shape audit vs sql/schema.sql; smoke harnesses —
seed integrity (all 16 links resolve to real records, both assessments carry
citations + steelman + valid enums, trajectory ordered), worker validators
(11 fabricated invalid payloads rejected for the right reasons, extractJson
fence/prose tolerance), app behavior (local-adapter roundtrip on the new
tables, latest-assessment selector, three-seat co-sign gate truth table).
Layout verified by responsive-class inspection at 375px/1280px: hypothesis
board `md:grid-cols-2 xl:grid-cols-3` stacks to one column, verdict seats
`sm:grid-cols-3` stack, kill rows and trajectory chips flex-wrap, field-check
table keeps its `.stack` mobile mode.

**Remaining human steps** (the only things a human was ever needed for): deploy
`worker.js` with the five secrets, run `sql/schema.sql` in Supabase (identity
rows in `team_members`), set `WORKER_URL` + `AI_MODE = 'worker'` in
`js/config.js` — full steps in HANDOFF.md "Turning on the AI". Live-AI behaviors
(Regenerate brief producing a real stored assessment, save-time link proposals)
are built and validated against the config seam but need those secrets to
exercise end-to-end — done, pending secrets.

## Decision engine re-architecture — task ledger (started 2026-07-05)

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
6. [x] Decision memo rebuild: three verdict seats (lead / field via getTeam,
       AI read-only from latest assessment); content.verdict now derived —
       only set when both human seats match (reports/divergence keep reading
       it); required override_rationale when the agreed verdict diverges
       from the AI leaning; co-sign gate opens only on agreement and
       snapshots signed_assessment_id + signed_leaning; per-section
       "Draft from evidence" (AI mode) lands in the edit modal, never
       auto-saves.
7. [x] Evidence linking woven into capture: matrix quotes get Link buttons +
       link chips + a quiet skippable AI proposal card after save; interview
       detail gets a Hypothesis links block; field checks get per-row Link +
       an AI proposal when a check resolves; unit economics gets
       "Link to kill criterion" + a proposal when assumptions change. All
       manual paths work in local mode with AI off (openLinkModal in
       js/evidence.js, source 'human'); maybeProposeLinks fails soft.
8. [x] Overview additions: "If we decided today" pulse card (latest leaning +
       strengthening/weakening counts + Decision Brief link); "Run phase exit
       review" (AI mode) + honey advisory banner when the current phase has no
       phase_exit assessment. Overview stays the operations center.
9. [x] Docs: CLAUDE.md core rule 11 + AI_MODE architecture + file map;
       docs/features.md decision-engine section; docs/project-overview.md
       decision-engine bullet; HANDOFF.md "Turning on the AI" (local-first +
       live AI path, identity-only Supabase note); DECISIONS.md 38–52.
10. [x] Final full verification vs Definition of done (see closing summary):
        demo mode renders the seeded INSUFFICIENT→PIVOT trajectory with cited
        evidence per hypothesis; the memo shows three verdict seats; a matrix
        entry links manually to H2 via the Link affordance; the AI paths
        (regenerate, proposals, drafts) are gated on AI_MODE with validated
        server-side pipelines — pending secrets to exercise live.

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

## Interviews and matrix restructure ✅ (2026-07-05)
- `js/app.js`: new shared `rankThemes(rows = STATE.matrix)` and
  `segmentCoverageRows()`, consolidating three copies of the theme-ranking
  formula (`sensemaking.js`, `reports.js`, matrix's new Quotes view) and two
  copies of the segment-coverage rollup (`reports.js`, interviews' new
  coverage strip) into one each. `sensemaking.js`'s local `rankThemes()`
  deleted in favour of the import.
- **Interviews**: list side restructured around segment structure. Coverage
  strip (compact `barChart(segmentCoverageRows())`) above the list. Rows
  grouped by segment in `SEGMENTS` config order with sticky, tappable/
  collapsible headers showing an `n/target` chip (rose/honey/sage by
  progress) and an untagged-count dot. A pinned "Needs tagging (shortcut)"
  block surfaces every overdue-untagged row above the groups when any exist,
  without removing them from their real group. Unknown/missing segment rows
  land in a honey-headed "Unassigned" tail group. Row metadata line now
  shows format instead of segment (segment moved to the header). Master–
  detail pattern, overdue banner, detail card (including its existing
  hypothesis-links section), notes editor, mark-tagged, and the add/edit
  form are all untouched.
- **Theme matrix**: replaced the flat quote feed with a Grid | Quotes toggle
  (segmented control, defaults to Grid at ≥10 matrix rows else Quotes,
  recomputed live until the user picks a view manually). Grid is a true
  theme × segment pivot (`THEMES` rows × `SEGMENT_NAMES` columns, config
  order) with per-cell quote counts tinted by average severity (sage/honey/
  rose), a sticky-left theme-name column (the one deliberate horizontal
  scroll in the app), and row/column/grand totals computed self-consistently
  from the same cell matrix. Tapping a non-empty cell drills into Quotes view
  pre-filtered to that theme+segment with a dismissible chip. Quotes view
  groups by theme (ranked via shared `rankThemes`, evidence-weight order),
  collapsible headers show count/avg severity/WTP rate, with a final honey
  "Untagged" group for quotes with no theme_tag. The four-dropdown filter row
  became three (segment/severity/WTP — theme filtering now happens via
  grouping/drill-down). `+ Add quote`, CSV export, the add/edit form, the
  Link-to-hypothesis button, existing-link chips, and the post-save
  `maybeProposeLinks` call are all preserved from the pre-restructure version
  (see DECISIONS.md #54 — an earlier draft of this change, based on a stale
  `main`, had mistakenly planned to drop hypothesis-linking as nonexistent).
- **Reports**: weekly status's "Top themes so far" and executive briefing's
  "Core analytical findings" each gained a theme-frequency `barChart()` (top
  6 by mention count, `PALETTE.plum`), rendered identically on-screen
  (`buildChartNode`) and in print (`chartToHtml`) — no changes needed to
  either dispatch function, both already handle `type: 'bar'` generically.
  Numbers come from the same `rankThemes()`/`topThemes()` rollup the matrix
  screen uses.
- **CSS**: `.md-list-scroll` (own scroll container so sticky group headers
  never collide with the app's own sticky top header), `.group-header` +
  honey/pinned variants, `.seg-toggle`/`.seg-toggle-btn` (Grid|Quotes
  control), `.grid-pivot`/`.grid-row-header` (sticky-left pivot column),
  `.theme-group-header` + honey variant.
- **Bug found and fixed during verification**: the Grid/Quotes default view
  was computed once on the very first render, which fires before async data
  has loaded — on a direct load of `#matrix` this locked the view to Quotes
  permanently even with 18 seeded quotes. Fixed to recompute live until
  manually overridden (DECISIONS.md #58).
- Rebuilt on the latest `main` after discovering this feature branch's prior
  PR had already merged (per protocol): reset the branch to `origin/main`
  (which had picked up an unrelated, concurrently-merged decision-engine
  build adding real hypothesis-linking) and reapplied every edit above by
  hand against the new base rather than blindly restoring the old files, so
  the decision-engine's `evidence.js` integration in Interviews and Matrix
  was not clobbered.
- Verified: `node --check` on every changed module (`app.js`, `interviews.js`,
  `matrix.js`, `reports.js`, `sensemaking.js`) — all pass. Import audit:
  every import resolves to a real export. Convention audit: all `innerHTML`
  uses are `= ''` clears only, no raw HTML from user data. No data-shape,
  table, or column changes. Playwright walkthrough at 1280px and 375px:
  Interviews shows the coverage chart, correct grouped counts, pinned
  needs-tagging block, the detail card's hypothesis-links section still
  renders, no header/sticky-header overlap, no horizontal page overflow.
  Matrix opens in Grid on direct load with correct cell counts (16 non-empty
  cells against the seed data), toggling to Quotes and back works, the
  sticky column reports `position: sticky`, cell-tap drills into Quotes with
  a working dismissible chip, the Link button and existing-link chips render
  on every quote (18 Link buttons matching the 18 seeded quotes), no
  unintended horizontal page overflow (the grid's own internal `.table-wrap`
  scroll is the one exception, as designed). Reports: the weekly-status
  "View" modal renders two charts (tagging meter + new theme bar chart) on
  screen. Zero console/page errors across both viewports.
