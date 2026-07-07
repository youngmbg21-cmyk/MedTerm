# DEFERRED — found during the sweep, intentionally not changed

These are real observations that are **not** clearly-broken bugs, or that would
require a redesign/architecture change / feature work the sweep brief excludes.
Each has the reasoning for deferring.

## Design-system / rhythm (would touch the whole component kit)
1. **Blanket 44px touch targets.** The mobile kit is sized to a ~36–40px rhythm:
   base `.btn`/`.btn-line`/`.btn-primary` = 36px (`.tall` = 40px), `.pill` = 30px
   (`.pill.tall` = 34px), `.seg-btn` = 40px. Raising them all to 44px changes the
   vertical rhythm of nearly every screen — a design-token decision, not a bug
   fix. The sweep bumped the worst/most-frequent ones (`.btn-link`→44, `.tab`→44,
   `.icon-btn`→40, verdict seats→38, "View"→36) and added focus/press states.
   Recommend the team decide on a kit-wide bump deliberately.
2. **`--ink-mute` (#6E6A5E) on the page tint measures ~4.8:1** — passes AA but with
   almost no margin, and it's on the smallest text (9.5px tab labels, 10.5px
   `.micro`). Not a failure today; flagging before any future tint change erodes it.

## Behaviour that may be intentional (fix only if the team confirms it's a bug)
3. **No `hashchange` listener.** The mobile app writes the URL hash on every
   render and restores it on boot (deep links + refresh work), but changing the
   hash at runtime or using the browser Back/Forward button does not navigate.
   Adding history-based back/forward is a navigation-model change with overlay
   interactions (should Back close a form? a reader?) — deliberate design work,
   not a one-line fix. Deferred pending a decision on desired back behavior.
4. **Duplicate tone maps.** `LEANING_TONE`, `VERDICT_TONE`, `LEANING_PILL`, and
   three local `dirTone`/`dir` maps encode overlapping GO/PIVOT/NO-GO colors by
   hand. No current divergence/bug; consolidating is a refactor (excluded by
   "do not refactor architecture"). Low drift risk — logged for future cleanup.
5. **`decision_memos` uses `[0]`** as "the memo" throughout. Correct as long as
   exactly one memo row exists (now enforced by the save-guard added in Batch C).
   A cleaner design would key the memo explicitly; deferred as non-breaking.

## Data-layer robustness (desktop-shared; not a mobile-visible break today)
6. **`js/data.js` file-blob ops swallow errors** (`idbDelete`/`idbClear`/`idbPut`
   with `.catch(()=>{})`). A failed IndexedDB write during import could drop a
   document blob while keeping its record. Not reachable from a normal mobile
   flow; fixing well means surfacing a per-file warning in the import path
   (a desktop Settings feature). Logged for the data-layer owner.
7. **Mid-session token expiry → cryptic 401 alert.** If the Supabase refresh
   token expires *during* a session, an action shows `Save failed: API 401 …`
   with no re-login prompt (boot-time login is handled). A proper fix detects 401
   in action catch blocks and re-invokes `requireLogin()` + retry — a cross-cutting
   change to every write path. Deferred as an enhancement over a rare edge case.

## Loading affordance
8. **No skeleton/loading state during the initial data fetch.** `boot()` paints
   the shell with empty arrays, then populates. Batch A (empty states) and Batch B
   (the load-error retry banner + the false-100% fix) remove the worst of the
   "flash of empty/misleading UI"; a true skeleton (`loadingState()`) across every
   screen is a larger addition. Deferred — mitigated, not eliminated.
