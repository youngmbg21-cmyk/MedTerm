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
