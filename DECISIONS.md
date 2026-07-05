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
