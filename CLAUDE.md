# CLAUDE.md — MedTerminal Research Workspace

Read this first. It defines what this project is and the rules that govern every change.

## What this is

A **research workspace** used by a 2-person team (a project lead on desktop, a field
coordinator on a 375px phone) to run a six-phase qualitative research programme. The
programme decides whether a patient-side medical-tourism service (Kenya → India) is
viable enough to build. **This app is not that product** — it is the tool used to decide
whether to build it.

Read `docs/project-overview.md` for research intent and `docs/features.md` for screen
detail. `sql/schema.sql` and `worker.js` define the real data model.

## Architecture in one paragraph

`index.html` loads vanilla ES modules from `js/`. All configuration (data mode, AI mode,
current phase, segments + targets, themes, team display names) lives in `js/config.js`.
All data access goes through `js/data.js` — one interface (`list/create/update/remove`),
two adapters: `local` (localStorage, seeded from `js/seed.js`, the default) and `api`
(Cloudflare Worker `worker.js` → Supabase, Bearer JWT from Supabase magic-link auth in
`js/auth.js`). Records are flat snake_case matching `sql/schema.sql`. `js/app.js` holds
state, the hash router, the phase-gated nav, and the shared component kit. One screen per
file in `js/screens/`. AI availability is governed by `AI_MODE` in `js/config.js`, not by
the data mode: `'worker'` enables the assistant, assessments, link proposals, and memo
drafting in either data mode (with local data, the client sends the worker the workspace
slices it needs in the request body); `'off'` (default) shows calm disabled states. The
decision spine — hypotheses, kill criteria, evidence links, versioned AI assessments —
lives in ordinary tables and flows through `js/evidence.js` helpers; AI-proposed writes
go through the Confirm/Skip pattern in `js/actions.js`.

## Core rules — never violate

1. **No frameworks, no build step, no npm for the app.** Vanilla JS ES modules; Tailwind
   via CDN; one `css/theme.css`. Opens directly in a browser.
2. **Screens never call `fetch`, `localStorage`, or IndexedDB directly.** Everything —
   records AND file blobs (`putFile/getFile`) — goes through `js/data.js`.
3. **One canonical record shape**: flat snake_case (`interview_id`, `tagged_same_day`,
   `theme_tag`, `first_contact`). No `.fields` wrapper, ever.
4. **Config has one home.** Segments, themes, current phase, stall threshold, and team
   names come from `js/config.js`. Never redefine them in a screen. Never hardcode a
   person's name — use `getTeam()/interviewerOptions()/ownerOptions()`.
5. **Never render user-supplied text via `innerHTML`.** Use the `h()` helper /
   `textContent`. `innerHTML` is allowed only for clearing (`= ''`).
6. **Respect the same-day-tag rule.** The red warnings for untagged interviews are the
   app's most important data-quality mechanism. Never weaken them.
   The app is the team's **sole repository**: interview field notes live in
   `notes_markdown`, files live in Documents. Never add features that push content into
   external docs the assistant cannot search.
7. **Keep the aesthetic**: warm/editorial, sage + clay palette, Fraunces for headings and
   quotes, Inter for UI. Semantic colours: sage=done, honey=attention, rose=breach,
   info-blue=informational, plum=theme tags. Use the existing component classes
   (`.card`, `.chip`, `.banner`, `.quote-block`, `.bar-wrap`, `.btn`) before inventing new ones.
8. **Mobile-first.** Every screen must be fully usable at 375px. Test both 375px and
   1280px before committing.
9. **Every screen answers one question**, shown as its subheader (the fourth argument to
   `registerRoute`). List screens lead with the exception, not the totals.
10. **No API keys in the frontend.** The Worker (or Supabase Edge Function) holds all
    secrets in `api` mode.
11. **Hypotheses, kill criteria, evidence links, and AI assessments are first-class
    records.** No screen or prompt may hardcode them — the Worker injects the live
    hypothesis board into every prompt from the `hypotheses` table (or the client's
    copy in local data mode). Assessments are append-only: never updated, never
    deleted; the sequence over time is itself evidence. The AI argues; it never
    decides — every AI-originated write goes through human confirmation, a diverging
    human verdict requires a written override rationale, and no numeric confidence
    scores appear anywhere.

## File map

| Path | Purpose |
|------|---------|
| `index.html` | Shell: sidebar, header, chat panel, boot script |
| `css/theme.css` | The entire design system |
| `js/config.js` | All configuration — single source of truth |
| `js/data.js` | Data interface + local/api adapters |
| `js/seed.js` | Demo seed data (dates relative to today) |
| `js/app.js` | State, router, phase-gated nav, component kit |
| `js/auth.js` | Magic-link login (api mode / AI worker mode, lazy-loaded) |
| `js/chat.js` | Assistant panel |
| `js/actions.js` | Shared Confirm/Skip pattern for AI-proposed writes |
| `js/evidence.js` | Hypothesis board, evidence links, assessments, link modal |
| `js/export.js` | CSV exports |
| `js/screens/*.js` | One screen per file (incl. `decision-brief.js`, `documents.js`) |
| `worker.js` | Cloudflare Worker backend (api mode + all AI endpoints) |
| `sql/schema.sql` | Supabase schema + RLS |
| `HANDOFF.md` | How to go live |
| `DECISIONS.md` | Judgment calls made during the rebuild |
