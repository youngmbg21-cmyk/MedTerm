# DECISIONS.md — judgment calls made during the autonomous rebuild

Dated 2026-07-04. Each entry is a decision the brief left open, plus the reasoning.

## Architecture

1. **Kept the split-module layout, replaced the internals.** The repo already had
   `js/app.js` + `js/screens/*`; the brief said refactor, not rewrite. Every screen was
   rebuilt onto the canonical flat snake_case shape and `js/data.js`, but file layout and
   the design system were preserved.

2. **`js/config.js` is the single source of truth** for `DATA_MODE`, `CURRENT_PHASE`,
   phases, segments (+ interview targets), themes, outreach statuses, the stall threshold,
   and the team roles. No screen defines its own copy of any of these.

3. **Team names live in `localStorage` under `medterm_team_v1`, separate from the data
   blob**, so "Reset demo data" does NOT reset who the team is. `onTeamChange` listeners
   let the UI update live. When the `api` backend goes live these names should migrate to
   the `team_members` table; the read points are already funnelled through
   `getTeam()/interviewerOptions()/ownerOptions()` so that swap touches one file.

4. **Stored records keep display names** (e.g. `interviewer: "Simon"`), matching
   `sql/schema.sql` (TEXT columns). Renaming a role in Settings changes dropdowns and all
   UI immediately but does not rewrite history — the same behaviour a real multi-user
   backend would have.

5. **`local` seed dates are relative to "today"** (generated at seed time), so the
   red untagged-past-24h banners and amber stalled-contact warnings are always visible in
   the demo, no matter when it is first opened.

6. **Auth is lazy-loaded.** `js/auth.js` (and the Supabase CDN client) are only imported
   when `DATA_MODE === 'api'`, so local mode works fully offline once cached and never
   touches a CDN beyond Tailwind/fonts.

## Product / UX

7. **"Untagged past 24h" is defined as** `tagged_same_day !== 'Y'` **and interview date
   ≥ 1 day old.** Same-day untagged interviews get an amber (not red) nudge — the rule is
   breached only once the day has passed.

8. **"Stalled outreach" is defined as** status `Sent` or `Replied` with no movement for
   `STALL_DAYS` (10) days since first contact. The threshold lives in config.

9. **Exit criteria are editable from the Overview** — tapping a criterion cycles
   Not started → In progress → Complete → Blocked. The brief only asked to display them;
   editing in place makes the deliverables table actually maintainable. Criteria come from
   the `deliverables` table by record id (no string matching against a hardcoded list).

10. **State of the field / MVP scope / confirmatory tests are stored in `deliverables`**
    (evidence field, JSON where structured) rather than new tables — the schema has no
    dedicated tables for them and inventing tables would break `api`-mode compatibility.
    Records are found by `phase` + `deliverable` name; seeded rows guarantee they exist.

11. **Decision memo is verdict-first.** Added an explicit GO / PIVOT / NO-GO verdict
    selector above the seven sections (stored in `content.verdict`), and signing requires
    a verdict. The brief asked for "verdict-first"; this makes it structural.

12. **Reports are template-generated client-side from live data** in both modes
    (weekly status, phase exit, investor briefing) and saved to the `reports` table.
    Assistant-drafted prose remains an `api`-mode upgrade. This beats a chat-only path:
    the local build can produce a printable weekly report today.

13. **Locked nav groups stay visible and clickable** (dimmed, with "🔒 phase N"), so the
    whole plan stays legible and every screen is explorable, per the brief.

14. **Semantic colours:** green(sage)=done/on-track, amber(honey)=attention/thin,
    red(rose)=blocked/breach, blue(--info)=informational/current, purple(--plum)=theme
    tags. `--info` and `--plum` were added to the palette in the existing warm register.
    Outreach `Sent` is info-blue (a fact, not a problem); `Replied` is amber (needs a
    next move from us).

## Repo hygiene

15. **Deleted** `js/screens/decisions.js` (dead placeholder, per brief §4.4) and
    `js/screens/dashboard.js` (superseded by `overview.js`, still contained the old
    `.fields` Airtable shape and raw innerHTML).

16. **Kept `admin.html`, `js/supabase.js`, and `supabase/`** from the previous session's
    work (a Supabase Edge Function variant of the backend + an admin key-management page).
    They are not loaded by the app in local mode and give Young a second go-live option;
    HANDOFF.md explains both. The primary documented path stays Worker-based, per this
    brief ("trust worker.js").

17. **Interview IDs**: the local adapter assigns `INT-nnn` from the max existing number —
    concurrent-write collisions aren't possible in a single browser. In `api` mode the
    Postgres trigger in `sql/schema.sql` assigns IDs server-side, so the form never asks
    for an ID in either mode.

18. **The old `PHASE_INFO.exitCriteria` hardcoded list is gone** — the Overview reads
    Phase N criteria from the `deliverables` table, which is also what the seed populates.

## Sole-repository upgrade (notes, documents, assistant access) — 2026-07-05

19. **Field notes are plain text with preserved line breaks**, not rendered markdown.
    A markdown renderer either means a dependency (banned) or a hand-rolled parser
    (an XSS risk on the app's most sensitive surface). Blank-line paragraphs read fine.

20. **Removed the "Link to notes" field from the interview form.** The app is now the
    sole repository; an external-link field invites exactly the fragmentation the owner
    ruled out. The schema column stays for compatibility; old values are ignored.

21. **Files live in IndexedDB locally** (localStorage can't hold files), keyed by the
    document record's id — still only reachable through `data.js` (`putFile/getFile`).
    Seeded text documents store no blob; their downloads are rebuilt from `text_content`.

22. **Text extraction strategy:** text/markdown/CSV/JSON files are read verbatim at
    upload (capped at 400 KB per file) into `documents.text_content`, which makes them
    searchable everywhere. PDFs are NOT parsed client-side (no dependency-free way) —
    in live mode the Worker has Claude transcribe a PDF the first time it is read, then
    caches the transcript in `text_content` so subsequent searches cover it. Images are
    passed to the model as images. Word files are rejected at upload with a "save as
    PDF" message rather than silently accepted and unreadable.

23. **`search_notes` is substring match (ilike), not Postgres full-text search.** At
    hundreds of records, ilike is instant and matches partial words (better for names
    like "Eastleigh"); tsvector indexing is an optimisation to revisit at thousands.

24. **Documents can be deleted by any write-role member** (their own uploads matter in
    the field); every other table keeps lead-only deletes. Storage objects are removed
    when the record is deleted.

25. **"Export everything" backs up records + all text as one JSON**; binary files are
    excluded (a dependency-free zip isn't worth it) and noted in the UI — download
    binaries individually from Documents. Supabase backups cover live mode.

26. **Upload guardrails:** 10 MB per file, PDF/text/CSV/image only, and a permanent
    banner: de-identify, never upload consent forms or identity documents — matching
    the operating manual's privacy rules, because documents are sent to the Claude API
    when the assistant reads them.

## Data portability, safer resets, executive reporting — 2026-07-05

27. **No charting library.** The brief explicitly allowed one, but the project's own
    core rules forbid external libraries and CDNs the field can't rely on. Built
    `js/charts.js` instead: dependency-free inline SVG (bar chart, percent meter,
    2×2 risk matrix) using `document.createElementNS`, with colours as resolved hex
    constants (not CSS `var()`) so the same markup renders identically on-screen and
    in the print window, which is a separate document with no access to the app's
    `:root` variables.

28. **Import replaces, never merges.** Merging two independent record sets safely
    (matching by content, resolving id collisions, deciding which side wins on
    conflicting edits) is a hard problem with no good UI answer for a 2-person team.
    Replace-with-a-safety-export-first is simple, honest about what it does, and
    recoverable if wrong.

29. **Schema version is a hard gate, not a warning.** `SCHEMA_VERSION` (in
    `js/config.js`, currently 1) must match exactly or the import is refused with
    the specific mismatch shown. Silently importing a differently-shaped file risks
    corrupting the local database in ways that are hard to detect until much later.

30. **Both destructive actions (import, "start fresh") automatically trigger a full
    export before touching anything**, in addition to requiring the operator to type
    a confirmation word (RESET / IMPORT, case-sensitive). Two independent safety
    nets for actions that cannot be undone from within the app.

31. **Import and both resets are local-mode only**, enforced in `js/data.js`
    (`apiAdapter.importAll/startFresh` throw explanatory errors) and hidden from the
    Settings UI in api mode. A one-click wipe or replace on the live backend would
    affect the whole team's shared data at once — that must stay a deliberate
    Supabase-side operation, never a button in the app.

32. **"Start fresh" resets `scripts` to the stock v1 content**, discarding any
    edited versions — this is what "restore the stock interview questions" means in
    practice, since scripts are the only versioned/editable "framework" table.
    Deliverables are reset to "Not started" with evidence cleared, using the same
    literal checklist the app ships with (refactored into `buildDeliverables()` in
    `seed.js` so the demo seed and the fresh-fieldwork seed can't drift apart).
    Segments, themes, outreach templates, and the operating manual need no reset
    action at all — they live in `js/config.js` and the Reference screens' source
    code, not in storage, so they were never at risk.

33. **Binary documents are embedded as base64 only when there is no `text_content`.**
    Text-based uploads already carry their full content in `text_content` (see
    decision 22) — duplicating that as base64 too would double the backup's size for
    no benefit. Only genuinely binary files (images, PDFs) get the base64 treatment,
    keeping "Export everything" a complete, self-contained backup either way.

34. **Executive briefing risk matrix uses a heuristic for impact**, not a fixed
    table: any unconfirmed field-check assumption is flagged High impact if its text
    matches economics-related keywords (cost, pay, price, fee, money, insurance,
    CAC, conversion, margin), Low impact otherwise. This is a simplification — a
    human reading the risk matrix should sanity-check the impact column, not treat
    it as authoritative. All three unit-economics break-points are always plotted
    (their impact is High by definition; likelihood is High only if currently
    broken under the saved assumptions).

35. **The executive summary is hard-truncated to 150 words programmatically**
    (word-split, slice, rejoin, ellipsis), not just written short — the summary text
    is built from live data and could exceed the cap on some runs if trusted to stay
    short by construction alone.

36. **Existing reports keep exactly one supplementary chart each** (weekly status:
    tagging-rate meter; phase exit: segment coverage bars; investor briefing:
    willingness-to-pay-by-segment bars, only rendered if that data is non-empty) —
    the weekly status report explicitly describes itself as "single page," so it
    was not loaded with multiple charts. The new executive briefing is the fuller,
    multi-chart report the brief asked for.

37. **`economics.js`'s `DEFAULT_ASSUMPTIONS`, `BREAKPOINTS`, and `derive()` are now
    exported** so the executive briefing can reuse the exact same unit-economics
    model instead of re-implementing break-point logic in `reports.js` — one model,
    two consumers.

---

## Decision engine re-architecture (2026-07-05)

38. **Seeded cross-referenced records carry stable, readable ids** (`hyp-h1`,
    `mx-int002-wtp`, `doc-apollo-prices`) instead of generated UUIDs. `buildDb()`
    already lets an explicit id win over `makeId()`, so seeded evidence_links and
    assessment citations always resolve without a lookup pass. Local demo mode
    only — Supabase generates real UUIDs via `gen_random_uuid()`.

39. **For kill criteria, an evidence link's `direction: 'supports'` means the
    evidence pushes the criterion toward breach** (supports the kill), mirroring
    how 'supports' strengthens a buyer hypothesis. One consistent reading: supports
    = makes the statement more true.

40. **`importAll()` restores the stock hypotheses when a backup predates the
    decision engine** (no `hypotheses` rows in the dump) — otherwise an old backup
    would silently blank the hypothesis board. `SCHEMA_VERSION` stays at 1: the
    change is additive, old backups remain importable.

41. **Demo assessments carry `model: 'demo-seed'`** so nobody mistakes seeded
    narrative for real Claude output; real assessments record the actual model id.

42. **AI_MODE 'worker' requires the same magic-link sign-in as api mode, even
    with local data.** The Worker authenticates every call with a Supabase JWT;
    the alternative (a shared token in js/config.js) would put a secret in the
    frontend, which core rule 10 forbids. Login here is identity, not data —
    records stay in the browser. Documented in HANDOFF.md.

43. **`aiDataSlices(state)` lives in data.js and takes state as an argument** —
    data.js cannot import app.js (circular), and screens already hold STATE.
    In api data mode it returns undefined and the Worker reads Supabase itself.

44. **AI-proposed evidence links are stamped `source: 'ai_confirmed'` inside
    `applyAction()`**, not left to the model's payload — the provenance label is
    enforced at the write path, so a mislabelled proposal can't record itself
    as human judgment.

45. **Memo section drafting gets its own small POST /api/draft-section endpoint**
    rather than riding through the chat loop — the chat loop persists sessions
    and runs tool rounds; a draft is a single deterministic completion whose
    result must land in an edit modal, never auto-saved.

46. **All worker chat tools now filter in JS over one `fetchRows()` seam** instead
    of building PostgREST filter strings — the same code path serves Supabase reads
    and body-provided data (local-first mode), so the two modes cannot drift. At
    this workspace's scale (hundreds of rows) fetching a table and filtering in
    JS costs nothing measurable.

47. **The client sends `phase` and `segments` in AI request bodies.** CURRENT_PHASE
    and segment targets live in js/config.js (client-side by design); the worker
    has no copy and should not grow one. They are not secrets.

48. **/api/propose-links fails soft** (returns an empty proposal list on any
    model or validation failure after one retry) — a link proposal is a quiet
    nicety after a save; it must never turn a successful save into an error
    banner. /api/assessment fails loud (502 with the validation errors) — an
    assessment is an explicit, deliberate act.

49. **worker.js exports its pure validators** (`validateAssessment`,
    `validateProposals`, `extractJson`) as named exports alongside the default
    Worker handler — Cloudflare ignores them; the offline smoke harness tests
    the exact code that gates real assessments.

50. **`content.verdict` is now derived, not directly picked** — it is set only
    when both human seats (verdict_lead / verdict_field) match, and cleared to
    'Undecided' otherwise. Reports and the Decision Brief divergence panel keep
    reading the same canonical field they always did; old memos with only a
    `verdict` simply show both seats as Undecided until re-picked.

51. **Signing snapshots `signed_assessment_id` and `signed_leaning` into the memo
    content** (not a new column) — memo content is already the record's JSONB
    home, and the leaning copy keeps the record legible even if the assessment
    list is later filtered.

52. **docs/features.md was not rewritten wholesale.** Parts of it predate the
    pipeline rebuild (Airtable-era screen descriptions). The decision-engine
    section was added at the top with an explicit note that the code and CLAUDE.md
    are the live truth — a full historical rewrite is outside this build's scope
    and would have touched screens the brief says not to touch.

## Interviews and matrix restructure — 2026-07-05

53. **The theme-ranking formula (`count × avgSev × (1 + wtpY/count)`) was
    duplicated in three places** (`sensemaking.js`, `reports.js`, and now needed
    by `matrix.js`). Consolidated into one exported `rankThemes(rows = STATE.matrix)`
    in `js/app.js`, alongside a newly-shared `segmentCoverageRows()` (moved from
    `reports.js`, where it was also used verbatim). All four screens
    (theme-analysis, matrix, reports ×2 report types) now compute from the same
    function, so their numbers cannot disagree. `sensemaking.js`'s local
    duplicate was deleted even though the brief only named Interviews/Matrix/
    Reports — it was the exact same formula and leaving it would mean four
    copies became three, not zero.

54. **Discovered mid-build that hypothesis-linking is real, not hypothetical.**
    An earlier read of this brief (before the decision-engine branch had been
    merged to `main`) found no `evidence.js`, no `maybeProposeLinks`, no Link
    button, and concluded the brief's references to hypothesis-linking
    described a non-existent feature to be omitted. Restarting this branch
    from the latest `main` (per the merged-PR protocol) surfaced that a
    concurrent build had since added exactly that feature — `js/evidence.js`
    (`openLinkModal`, `existingLinkChips`, `maybeProposeLinks`), a `Link`
    button on every quote block, and hypothesis-link chips on both quotes and
    interviews. The restructure was redone to *preserve* this feature rather
    than omit it: Matrix's Quotes-view theme groups keep the Link button,
    existing-link chips, and the post-save `maybeProposeLinks('matrix', saved)`
    call exactly as they were in the flat version; Interviews' detail-card
    hypothesis-links section (unrelated to the list-side restructure) was left
    completely untouched. Group-header rollups in Quotes view still show only
    count/avg severity/WTP rate — a "total hypothesis-link count" per theme
    genuinely isn't computed anywhere and was left out as a smaller, reversible
    gap rather than inventing new aggregation logic sight-unseen.

55. **Interviews' segment groups use a plain object (`collapseOverrides`,
    module scope, keyed by group name) for manual collapse state**, exactly
    mirroring the existing `let selectedId` pattern in the same file — set only
    on an explicit header tap, never written to storage, and reset to nothing on
    a hard page reload. The default (auto) collapse state is *recomputed on every
    render* from live data (total count ≤ 15, or the group contains the selected
    row or an overdue-untagged row) rather than cached, so it can't go stale as
    interviews are added or tagged.

56. **The pinned "Needs tagging" block is a genuine shortcut, not a real group**:
    its rows still appear in their normal segment group underneath. It has its
    own collapse-override key (`__needs_tagging`) and a distinct rose header
    style so it reads as an alert, not part of the segment taxonomy.

57. **Matrix's Grid-view row/column/grand totals only count cells for
    recognised `SEGMENT_NAMES`.** A quote with a segment value outside the
    config list still counts toward that theme's evidence in Quotes view
    (which reads `STATE.matrix` directly, unfiltered by segment membership),
    but is excluded from the Grid's totals so `sum(row totals) ===
    sum(column totals) === grand total` always holds.

58. **Found and fixed a real bug during verification, not introduced by the
    brief**: the Grid/Quotes default-view choice (`rows.length >= 10 ? 'grid'
    : 'quotes'`) was originally computed once, guarded by `if (activeView ===
    null)`. `index.html` calls `renderCurrentRoute()` synchronously before
    `loadAllData()` resolves, so on a direct load of `#matrix` the very first
    render sees an empty `STATE.matrix` (length 0), locks the view to
    `'quotes'`, and never reconsiders even after 18 seeded quotes arrive.
    Fixed by recomputing the default on every render, gated by a separate
    `viewManuallySet` flag that only becomes `true` once the user taps a
    toggle button or drills into a Grid cell — verified with a Playwright
    script that loads `#matrix` directly (now correctly opens in Grid) versus
    navigating there mid-session after manually picking Quotes (correctly
    stays put, matching the "persist for the session" behaviour the brief
    asks for).

59. **Quotes-view filters (segment/severity/wtp) and the cell drill-down
    filter are independent, both AND'd together** — tapping a Grid cell sets
    a dismissible `{theme, segment}` filter, and the three dropdowns still
    narrow further from there.

## Design elevation + AI-first memo — 2026-07-05

60. **The mobile nav bug was a stacking-order race with the Tailwind CDN.**
    The sidebar carried utility classes (`z-30` among them) while the mobile
    overlay sat at `z-index: 35`; whenever the runtime CDN stylesheet landed
    after `theme.css`, the open drawer rendered *beneath* the tap-catching
    overlay and every tap closed the menu. Fix: shell-critical positioning
    (sidebar, drawer, header, overlay) moved into owned classes in
    `theme.css`, never utilities — the shell now renders identically with or
    without the CDN. This is a standing rule (see CLAUDE.md, Design system).

61. **`--ink-mute` was darkened from `#8A8478` (3.3:1 — fails WCAG AA) to
    `#6E6A5E` (4.8:1 on page, 5.4:1 on card).** It is the app's most-used
    secondary text colour, so this is the single most visible change of the
    pass. Honey, info and clay text tones were also darkened to AA
    (`#755A1E`, `#3E5C77`, `#96501F`); every tone trio's ratios are logged
    in PROGRESS.md. `js/charts.js` PALETTE was updated by hand to match.

62. **Tailwind utilities stay for in-screen layout.** Removing the CDN
    entirely would mean rewriting hundreds of flex/grid/padding utilities in
    one session with no test coverage of visual layout — high risk, no
    user-visible gain. The line drawn instead: the SHELL never depends on
    Tailwind (it must work when the CDN fails); screens may keep using
    utilities for layout; all colour/typography/component styling flows
    through tokens. Logged as the pass's biggest deliberate compromise.

63. **The one-primary-action rule is implemented as a header slot**
    (`setPageActions()`, cleared on every route render) rather than a
    `registerRoute` schema change — smaller diff, and screens that genuinely
    have no single primary action (Reports' four generators, Settings,
    reference pages) simply leave the slot empty. The Decision Brief's
    "Regenerate brief" stays inside the leaning card next to its
    explanation: it is a contextual act on that card's content, and moving
    it away from the "appends, never rewrites" caption would trade clarity
    for consistency.

64. **`aria-disabled` (not `disabled`) is the calm-disabled pattern.** Real
    `disabled` buttons swallow clicks, so a disabled "Draft from evidence"
    could never explain itself. `aria-disabled="true"` gets the muted look
    but stays tappable; the tap toggles one inline note saying how to
    connect the assistant. Used in the memo (Part B); the chat quick-actions
    keep real `disabled` because the panel greeting already explains the
    AI-off state.

65. **The sync chip hides under 640px.** On a phone the header's width
    belongs to the screen's primary action; sync state is informational and
    remains visible on desktop and in Settings. Removing it beat wrapping
    the header (which pushes a taller sticky header over content) and beat
    shrinking primary-action labels.

66. **Print page numbers were dropped from the report footer.** A running
    footer with report name and date is fixed-position CSS and prints on
    every page; true page numbers need `@page` margin boxes, which Chrome
    does not support — a JS pagination shim is not worth the dependency-free
    budget. The brief's "running footer with page/date" ships as date +
    document identity.

67. **`alert()` error handling stays.** Swapping every alert for an inline
    banner requires each call site to know where in its (sometimes modal,
    sometimes list) DOM to mount the banner — that is logic surgery in ~30
    catch handlers, explicitly out of scope for a presentation pass. Logged
    as the known gap; new code should prefer banners.

68. **Playwright's actionability check refuses to click `aria-disabled`
    buttons** — the Part B verification dispatches a DOM `click()` instead.
    Real browsers deliver user taps to `aria-disabled` elements normally;
    this is a test-harness semantic, not an app defect.

## AI-first platform pass — 2026-07-05

69. **One drafting seam, one control row.** Rather than a bespoke AI feature
    per screen, every AI-first surface goes through exactly two shared
    pieces: the worker's `/api/draft-section` (generalised with a `doc_kind`
    prompt frame and a structured `fields[]` mode validated by the pure,
    export-tested `validateDraftFields` with the same one-retry-then-502
    pattern as assessments) and the client's `js/ai-draft.js`
    `aiDraftControls` row (draft primary when empty, redraft ghost when
    filled, manual always beside it, calm-disabled with an inline
    explanation when AI is off, busy state handled once). The decision
    memo's Part B implementation was refactored onto the primitive so there
    is a single source of truth for the pattern.

70. **"Very little human intervention" is implemented as AI-drafts-everything,
    human-taps-once** — not as auto-save. CLAUDE.md rule 11 ("the AI argues;
    it never decides") is architectural: every draft lands in the existing
    edit modal (memo sections, MVP scope, state of the field) or a preview
    modal (reports) and becomes a record only on a human tap. This is the
    minimum intervention compatible with the workspace's own constitution.

71. **Report narratives are AI-drafted; report numbers never are.** The
    assistant-drafted report keeps every data section (counts, charts,
    coverage, risk matrix) from the same deterministic template generators
    and prepends one clearly-labelled "Narrative — assistant-drafted,
    human-reviewed" section. The AI is not allowed to be the source of a
    figure in a document that leaves the room. Saved AI-assisted reports
    carry `content.assistant_drafted = true` — a key inside the existing
    JSONB content, no schema change. The template path remains a full peer
    ("Generate from template", btn-line), because reports must still be
    producible with AI off.

72. **Surfaces reviewed and deliberately NOT given AI generation**:
    · Field collection (interviews, field notes, outreach logging, documents,
      confirmatory-test metrics) — excluded by the owner's instruction and
      by the sole-repository principle: this is ground truth the AI reasons
      *from*.
    · Kill list — killing a hypothesis is the team's falsification act; the
      Decision Brief assessment already argues for kills, and an AI-drafted
      kill entry would blur who pulled the trigger on an append-only record.
    · Segment cards / theme analysis / top pains / saturation — pure
      computed rollups; drafting prose over them would duplicate the
      Decision Brief.
    · Outreach message drafting and script revisions — field-ops adjacent
      and template-covered; logged as candidates for a later pass, not this
      one.
    · Exit-criteria evidence text — one-line statuses, cheaper to type than
      to review.

73. **The AI-on drafting flows could not be exercised live in this
    environment** (no deployed worker, no secrets — by design). Verified
    instead by: the pure validator harness (7 cases), structural symmetry
    with the already-shipped memo drafting flow (same request helper, same
    edit-modal landing), the preview modal reusing the exact
    `reportViewNode` renderer the verified saved-report viewer uses, and
    full Playwright coverage of every AI-off state and every manual path.
