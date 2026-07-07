# Overnight UI/UX sweep — summary

**Scope note:** the "Reported bugs" list in the request was left as the
placeholder `[PASTE YOUR BUG LIST HERE]`, so there was no explicit list to work
from. I drove Phase 1 from the bug **patterns** already established and fixed
earlier in this session, then ran the full systematic sweep (two passes) over
the mobile app, the desktop build, the shared layers, and the CSS. Everything
below was **discovered** during the sweep.

Two full passes were completed (pass 1 mobile-led; pass 2 desktop + whole-codebase
rescan with fresh pattern knowledge). All changes are committed in small batches
on `claude/interview-inputs-save-issue-qrejek` and merged to `main`.

## Bugs fixed (reported vs. discovered)
- **Reported:** 0 (no list was pasted).
- **Discovered & fixed:** ~32, across 7 batches. Highlights by severity:

**Data-safety / correctness (highest)**
- Document upload silently lost the file (phantom record, no blob stored) → real file input + `putFile` + text extraction.
- A failed data load rendered as an empty-but-healthy workspace → load-error retry banner.
- "Same-day tagged" reported a reassuring **100%/green** with zero interviews in **four** places (mobile Today KPI, mobile weekly report, desktop overview KPI, desktop report generators) → all show "—"/"n/a".
- Economics assumptions: a missing key silently saved as `0`; a double-click could create duplicate `base` models (mobile + desktop) → guards.
- Partial multi-step delete left a stale list → resync on failure.
- Chat answers could attach to the wrong message / crash on Clear (mobile) and double-send (desktop) → identity-based placeholder + in-flight guards.
- Duplicate-record double-submit across every desktop capture form → `openModal` disables submit during the write.
- `printReport` crashed silently when pop-ups were blocked → null-check.

**Dead ends (P1)**
- 3 mobile buttons that did nothing: Export backup, Document "View", State-of-field "Write manually" — all wired to real behavior.

**Empty / broken states (P10)**
- 5 mobile list screens rendered an empty sliver on no data → empty cards.

**Selection clipped off-frame (P3)**
- Today phase rail didn't scroll its current phase into view → fixed (all 4 horizontal scroll rows now covered).

**A11y / interaction polish (P13)**
- No `:focus-visible`, no `:active` feedback anywhere → added.
- `.btn-link` was a ~16px tap target (used for Cancel/back) → 44px.
- Tab bar ignored iOS safe-area; `.tab`/`.icon-btn` hit areas enlarged.
- Desktop modals had no Escape-to-close → added.
- Junk rows (blank quote/interview/contact) could be saved → validation.
- Login OTP request could reject unhandled offline → try/catch.

## Patterns found (drove the sweep)
P1 dead-end handlers · P2 empty-string→typed-column · P3 selected item clipped in
a horizontal scroll row · P4 one global flag shared across items · P8 AI
fabrication from empty data · P9 raw markdown leaking as text · P10 missing empty
states · P11 silent async failure · P12 post-await state mutation without an
in-flight guard · P13 sub-44px targets / no focus/press states · **plus a new
one this sweep: misleading empty-denominator defaults** (a rate defaulting to a
reassuring 100% when the denominator is 0) — found in 4 places.

## Verification done
- Full click-through console walk of **all 24 mobile screens** + reader/detail/form/assistant overlays: **zero console/page errors**.
- Full **desktop** route walk (22 routes) + `openModal` create round-trip + Escape-to-close: **zero errors**.
- Targeted in-browser checks per batch (empty states, upload round-trip, race guards, landscape, KPI "—", export download, form validation).
- Desktop and mobile builds both boot clean after all shared-file changes (`index.html`, `auth.js`).

## Deferred (see DEFERRED.md — not clearly-broken or would be redesign/feature)
- Kit-wide 44px touch-target bump (design-rhythm decision; the worst offenders were fixed).
- Browser Back/Forward navigation (no `hashchange` listener; deep-links + refresh work).
- Duplicate tone-map consolidation (refactor, no current bug).
- Data-layer blob-error surfacing and mid-session-401 re-login (rare, cross-cutting).
- Full loading skeletons (mitigated by empty states + load-error banner).
- Modal focus-trap/autofocus (larger a11y item; Escape + backdrop dismiss added).

## What to spot-check in the morning
1. **On your phone:** upload a real document (Documents → + Upload) and confirm it opens under "View"; rotate to landscape on a couple of screens; open the assistant and send/clear quickly.
2. **The four "—" fixes:** with a fresh/empty workspace, confirm nothing shows "100% same-day tagged" anymore (Today, desktop Overview, and a generated Weekly/Executive report).
3. **Desktop:** create a record via a capture modal (double-click Save fast — should create only one), and press Escape to close a modal.
4. **⚠️ Redeploy the edge function** for the earlier grounding/strategy changes — the sweep did not touch it, but those still need `supabase functions deploy claude-proxy`.
5. Anything in DEFERRED.md you want promoted to a real task.
