# BUGLOG — Autonomous UI/UX sweep

Scope note: the "Reported bugs" section of the sweep request was a placeholder
(`[PASTE YOUR BUG LIST HERE]`) — no explicit list was pasted. Phase 1 therefore
starts from the bug **patterns** already established and fixed earlier in this
session, and drives the systematic sweep (Phases 2–5) from them plus the
baseline checklist. Mobile app is `js/mobile-app.js` + `css/mobile.css`; desktop
is `js/screens/*` + `css/theme.css`. Focus is the mobile front end (where the
recent work and the reported symptoms live), with desktop checked where shared.

## Patterns established earlier this session (Phase 1 retro / Phase 2 seeds)

| # | Pattern | Search strategy |
|---|---------|-----------------|
| P1 | Dead-end buttons (`onclick: () => {}`) | grep `onclick: () => {}`, `href:'#'` |
| P2 | Empty `''` sent for date/number → DB error | grep date/number field builders; normalize `''`→null |
| P3 | Horizontal-scroll row hides the selected item off-frame | grep `overflow-x:auto` rows with `.active`; ensure `keepActiveInView` |
| P4 | One global flag (`UI.busy`) shared across many rendered items | grep `UI.busy`, per-item encode |
| P5 | Stale/expired token; no login gate | auth/token paths |
| P6 | Body-as-scroll-container wheel bug | `overflow-x` on html+body |
| P7 | Viewport/orientation switch by width only | matchMedia width |
| P8 | AI fabrication from empty/thin data | grounding rules + client thin-data guard |
| P9 | Raw markdown leaking as text (`#`, `----`) | renderRich vs pre-line/textContent |
| P10 | Missing empty states on list screens | every `STATE.<t>.map` without length guard |
| P11 | Silent async failure (`.catch(()=>[])`, empty catch) hides errors | grep `.catch(() =>`, empty `catch {}` |
| P12 | Race: state mutated after `await` with no in-flight guard | async handlers writing `UI.*` post-await |
| P13 | Touch targets < 44px; no focus-visible / :active | CSS heights on interactive classes |

---

## FIXED

### Batch 0 — dead-end buttons (pattern P1)
- **`renderReports` "From template" / mobile Reports** — (fixed earlier this session).
- **Settings "Export everything (backup)"** `js/mobile-app.js` — was `onclick: () => {}`.
  Root cause: promised capability never wired; the data layer already exports
  `blobToBase64` for exactly this. Fix: implemented `exportEverything()` mirroring
  desktop Settings — dumps all 15 tables to one JSON, embeds binary docs as
  base64. Verified: downloads a valid backup.
- **Documents "View"** `js/mobile-app.js` — was `onclick: () => {}`.
  Root cause: no viewer wired though `data.getFile` exists. Fix: `viewDocument()`
  opens an in-app reader — images inline, text verbatim, other binaries an
  open/download link (anchor keeps the user gesture; no popup-block).
- **State-of-the-field "Write manually"** `js/mobile-app.js` — was `onclick: () => {}`.
  Root cause: only the assistant-draft path existed; no manual editor. Fix:
  `openStateEditor()` + `saveStateOfField()` write the paragraph to the phase-3
  "State of the field" deliverable (update if present, else create). Also added
  an "Edit" affordance to the populated view. Verified: saves round-trip.

_(further batches appended below as they land)_

### Batch A — missing empty states + phase-rail clip + false-100% (P10, P3)
- **`renderInterviews` / `renderOutreach` / `renderMatrix` / `renderThemes` / `renderPains`** — on empty data these rendered a count line over an empty `.listcard` sliver (or, for pains, a completely blank screen). Root cause (P10): list screens mapped over `STATE.<table>` with no length guard. Fix: early-return an `emptyCard(...)` when the source is empty. Verified: all six show a proper empty state, zero empty `.listcard`s, no console errors.
- **Today phase rail** — `overflow-x:auto` row highlighting the current phase but NOT calling `keepActiveInView` (P3, a missed instance of the earlier sub-nav fix). Fix: capture the current-phase cell and `keepActiveInView(rail, cell)` so it's never clipped off-frame. (Also removed a dead unused `const t` in the loop.)
- **Today "Same-day tagged" KPI showed 100% with zero interviews** — `taggedPct = interviews.length ? … : 100` made an empty ledger read as a perfect, green, rule-satisfied 100% (dangerous — weakens the same-day hard rule, CLAUDE.md rule 6). Fix: null → render "—" in a neutral color when there are no interviews. Verified: empty Today shows "—".

Note discovered (logged in DEFERRED): the mobile app writes the URL hash on render but has no `hashchange` listener, so runtime hash edits / browser back-forward don't navigate (deep-links on load do work).
