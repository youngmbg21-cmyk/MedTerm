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

### Batch B — data-safety (P11 silent failure, P2 junk rows, P12)
- **Document upload silently lost the file** `formBody('upload')` / `saveForm('upload')` — the "Tap to choose a file" zone had no `<input type=file>`, and save created a `documents` record but never stored the blob (no `putFile`), so a phantom record was created and the file was lost (violates the sole-repository rule). Fix: a real hidden file input (≤10 MB, image/pdf/text/csv) captured into `UI.form._file`; on save, `data.putFile(id, blob)` stores the bytes and text files also get searchable `text_content`. Verified: upload creates a doc with filename/mime/size + stored blob + extracted text.
- **Failed data load looked like an empty workspace** `boot()` used `data.list(t).catch(()=>[])` per table — a network/401 failure rendered as an empty-but-healthy workspace with no signal. Fix: `loadTables()` distinguishes a real empty result from a fetch error and sets `UI.loadError`; `render()` shows a dismissible rose "Couldn't load — tap to retry" banner wired to `retryLoad()`.
- **Partial multi-step delete left stale UI** `deleteEntry` — the interview branch removes quotes+links+interview in sequence; a mid-sequence failure skipped the STATE refresh, leaving the list inconsistent. Fix: on error, resync the affected tables (interviews/matrix/evidence_links/outreach/field_checks) before showing the alert.
- **Economics form saved missing assumptions as 0** `openEconForm` did `String(current[k])` → "undefined" in the field → `Number("undefined")||0` → silent 0. Fix: blank for missing keys (`current[k] == null ? '' : String`).
- **Junk rows could be saved** `saveForm` — only `kill` validated. An all-blank quote / interview / contact created empty rows. Fix: require quote text + linked interview; interview segment; contact name.
- **Login OTP request could reject unhandled** `auth.js requireLogin` — `signInWithOtp` wasn't wrapped; offline rejected with no message. Fix: try/catch writes a "couldn't reach sign-in" message.

### Batch C — race conditions & a conditional dead-tap (P12, P1)
- **Chat answer could attach to the wrong bubble / crash on Clear** `sendChat` wrote `UI.messages[length-1]` after the await. A second send or a Clear mid-flight made that index wrong (answer on the wrong question, or a bogus `-1` write). Fix: hold the typing placeholder by object identity, replace it via `indexOf`, and bail if it's gone (cleared). Verified: Clear mid-flight drops the pending answer with no crash.
- **Rapid verdict taps created duplicate memo records** `pickVerdict`/`saveMemo` chose create-vs-update from `decision_memos[0]` with no in-flight guard — two quick taps both created a memo, losing a verdict. Fix: `UI.savingMemo` guard + disabled/dimmed seats while saving. Verified: triple-tap creates only one record.
- **Brief leaning card was a dead tap before any assessment** — it was always a `cursor:pointer` button whose handler was `() => {}` when no assessment existed. Fix: render a plain div (no pointer, no dead onclick) until an assessment exists; only then is it the tappable "open the assessment" affordance.

### Batch E — a11y / interaction polish (P13, additive)
- **No `:focus-visible` anywhere** (design contract requires rings) — added a global focus-visible outline for keyboard/switch users.
- **No pressed/`:active` feedback** on any control (no hover on touch → taps felt dead) — added a subtle `filter: brightness(.95)` press state to all buttons/pills/tabs/rows.
- **`.btn-link` was a ~16px tap target** used for primary nav (form Cancel, "‹ More"/"‹ Interviews" back) — now a real 44px inline-flex target. Verified: Cancel is 44px, header still aligned.
- **Bottom tab bar used a hardcoded 22px inset** instead of the iOS home-indicator safe area — now `max(12px, env(safe-area-inset-bottom))`; `.tab` given a 44px min-height hit area. Verified: tab 44px.
- **`.icon-btn` 36→40px** (header/overlay-dismiss — most frequent controls). Inline verdict seats 32→38px and Document "View" 30→36px were bumped in their batches.

## SWEEP PASS 2 (fresh pattern knowledge)

### Batch F — second-pass pattern rescan
- **Second false-100% found** `buildWeekly` (weekly report generator): `Same-day tagging: 100%` was reported when zero interviews were logged — same dangerous false-positive as the Today KPI, this time baked into an exported report. Fix: "n/a — no interviews logged yet" when there are no interviews.
- Re-scanned the whole codebase for the fixed pattern classes:
  - Dead handlers (`onclick: () => {}`): **zero remaining**.
  - `overflow-x:auto` selectable rows: all 4 (sub-nav, phase rail, script tabs, form pill-select) now call `keepActiveInView`.
  - Divide-by-zero / misleading defaults: economics + wtpRate + saturation all guarded; only `buildWeekly` remained (fixed above).
  - Unguarded `[0].prop` / `.find().prop` / `.map`: all guarded (`stalled[0]` behind an `if`, split()[0] always defined, regex `m[0]` always present).
- **Full console-error walk** (populated seed) across all 24 screens + reader/detail/assistant overlays and every More sub-screen: **zero console/page errors**.
