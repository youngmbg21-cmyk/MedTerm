# The MedTerm Design Language — a portable spec

This document describes the complete look, feel, and mobile behaviour of the
MedTerminal research workspace, written so the same experience can be rebuilt
on **any platform or stack** (web, native app, another framework). Hand this
file to a designer, developer, or AI assistant and say: *"build it to this spec."*
Nothing in here depends on MedTerm's code.

---

## 1. The feel in one paragraph

A quiet, serious instrument. Warm cream surfaces instead of stark white; sage
green instead of tech blue; a literary serif for headings and quotes over a
plain sans for UI. Editorial restraint: few colors, two radii, almost no
shadows, no decoration that doesn't carry information. Calm confidence — the
design never shouts, never animates for delight, and treats the user's
attention as expensive. Mobile is not an afterthought: every screen is designed
at phone width first.

## 2. Color — exact values

Never use raw hex at the point of use; define these as named tokens (CSS
variables, theme constants, etc.) and reference the token.

### Surfaces & text

| Token | Hex | Use |
|---|---|---|
| `surface-page` | `#F5F1EA` | app background (warm cream, never white) |
| `surface-card` | `#FFFFFF` | cards sit white on the cream page |
| `surface-inset` | `#FAF7F1` | insets, wells, subtle zebra areas |
| `ink` | `#1F2A28` | primary text (13.1:1 contrast on page) |
| `ink-soft` | `#4A5651` | secondary text (6.8:1) |
| `ink-mute` | `#6E6A5E` | tertiary/metadata text (4.8:1 — still AA) |
| `line` | `#E5DDD0` | standard hairline borders |
| `line-soft` | `#EFE9DD` | subtle internal dividers |

### Semantic tone trios

Each tone is a **trio**: a soft background, a border one step darker, and a
text color that clears WCAG AA (≥4.5:1) **on its own soft background**. Tones
carry meaning — never use them decoratively.

| Tone | Meaning | Accent | Soft bg | Border | Text |
|---|---|---|---|---|---|
| sage | positive / done / go | `#5C7A6B` (deep `#3F5A4D`) | `#E6EDE7` | `#D4DFD5` | `#3F5A4D` |
| honey | caution / attention | `#D4A24C` | `#F5E9CF` | `#ECDCB6` | `#755A1E` |
| rose | breach / danger / stop | `#C95F5F` | `#F6E3E3` | `#ECC9C9` | `#9A3F3F` |
| info | neutral information | `#5B7B9A` | `#E4EBF1` | `#CDDAE5` | `#3E5C77` |
| plum | category/tag labels | `#7B5E7E` | `#EEE6EF` | `#DDD0DE` | `#644A67` |
| clay | editorial accent, section labels | `#B8693E` | `#F4E4D8` | `#ECD2BC` | `#96501F` |

Rules:
- **Sage is the only "brand" color.** Primary buttons are deep sage; focus rings are sage.
- **Clay is an accent, not a button color** — it marks section labels (micro-caps), links in prose, small editorial moments.
- Dark UI panels (e.g. a chat surface) may use ink `#1F2A28` as their background.

## 3. Typography

Two families, two weights each — nothing more:

- **Display/serif: Fraunces** (Google Fonts), weights 400 and 600, plus italic.
  Used for: page titles, card titles, pulled quotes, big numbers with
  personality. Letter-spacing −0.01em. Fallback: Georgia, serif.
- **UI/body: Inter**, weights 400 and 500. Used for everything else.
  Fallback: system-ui, sans-serif.

Fixed type scale (size/line-height in px) — snap to it, never freelance:

| Role | Font | Size/Line | Notes |
|---|---|---|---|
| Display | Fraunces | 28/34 | rare — hero numbers, landing moments |
| Page title | Fraunces | 22/28 | one per screen |
| Card title | Fraunces | 17/24 | |
| Body | Inter 400 | 14/22 | the default |
| Secondary | Inter 400 | 13/20 | metadata, buttons |
| Micro-label | Inter 500 | 11/16 | UPPERCASE, +0.06em letter-spacing — section labels, table headers, often in clay |

**All numerals tabular** (`font-variant-numeric: tabular-nums`) anywhere digits
align: tables, counters, stats.

## 4. Geometry, spacing, elevation, motion

- **Spacing**: 4px base scale — 4 / 8 / 12 / 16 / 24 / 32 / 48. Everything snaps to it.
- **Card padding is one value app-wide**: 24px desktop, 16px on mobile (≤768px).
- **Radii — exactly two**: 10px for controls (buttons, inputs), 14px for cards.
  Chips/pills are fully round (999px) by identity — the sole exception.
- **Elevation — exactly two levels**:
  - *Flat*: hairline `line` border, **no shadow**. All cards.
  - *Floating*: modals, menus, drawers, chat panel — one shadow:
    `0 8px 30px rgba(31,42,40,0.14)`. Nothing else casts a shadow.
- **Motion**: 150ms ease-out, applied ONLY to hover/focus/press feedback and
  modal/menu/drawer entrances. No scroll animations, no decorative motion.
  Honor `prefers-reduced-motion` by disabling all of it.
- Content max width 1120px, centered; gutter 32px desktop / 16px mobile.

## 5. Core components

Rebuild these shapes with whatever technology the new platform uses:

- **Card**: white, 1px `line` border, 14px radius, flat. List-style cards keep
  the card flush and pad each row (16–24px) with `line-soft` dividers.
- **Chip** (status/tag pill): 22px tall, 0 10px padding, fully round, 11px
  medium text, tone-trio colors (soft bg + border + AA text). Chips never
  shrink or truncate in a row — neighbouring text wraps instead.
- **Button**: min-height 40px, 10px radius, 13px text.
  - *Primary* — deep sage bg, white text. **One per screen, maximum.**
  - *Line* — white bg, `line` border, ink text (the workhorse).
  - *Ghost* — borderless, quiet, for tertiary actions.
  - Destructive actions: line button with rose text — never a big red slab.
- **Inputs/selects/textareas**: min-height 40px, 10px radius, 1px `line`
  border, white bg; sage focus ring.
- **Banner**: full-width rounded strip in a tone trio (soft bg, border, AA
  text) for persistent notices — rose for rule breaches, honey for advisories,
  info for context. Not toasts; banners sit in the layout.
- **Progress bar**: 6px tall track in `line-soft`, sage fill, 4px radius.
- **Quote block**: for verbatim human quotes — Fraunces italic, 16/24px
  padding, hairline divider between quotes. Quotes are first-class content;
  give them typographic dignity.
- **Empty state**: centered, min-height 200px: one calm sentence of what
  belongs here, one secondary sentence of how to add it, optionally one line
  button. Never a sad-face illustration.
- **Loading state**: skeleton blocks in `line-soft`, not spinners.
- **Modal**: floating elevation, 14px radius, max-width ~800px, dimmed overlay
  `rgba(31,42,40,0.4)`; tapping the overlay closes.

## 6. Mobile UX — the behaviours that make it feel like MedTerm

Design at **375px width first**; the desktop layout is the enhancement.
Verify every screen at 375px and 1280px before shipping.

1. **Navigation = a fixed 240px left sidebar** on desktop. On mobile it becomes
   a **slide-in drawer** over a dim overlay (`rgba(31,42,40,0.3)`), opened by a
   hamburger in the top header. The drawer must stack **above** the overlay.
   Nav items: 36px min-height desktop, 40px mobile, with a small 6px status dot
   that can carry state color.
2. **Sticky top header** per screen: page title (Fraunces 22px), a one-line
   subheader, and at most one primary action button placed here — not floating
   FABs.
3. **Every screen answers exactly one question**, and that question is shown as
   the subheader in plain language (e.g. *"Who have we approached, and where do
   they stand?"*). If you can't phrase the screen as one question, split it.
4. **Lists lead with the exception, not the totals** — the overdue, breached,
   or stalled items appear first and in rose; healthy items follow. The user's
   scarce attention goes to what's wrong.
5. **Touch targets ≥ 40px** for every interactive element. Visible
   `:focus-visible` ring (2px sage, 2px offset) on everything.
6. **Calm disabled states**: when a feature is unavailable (no connection, no
   permission, module off), keep it **visible, muted, and explaining** — it's
   never hidden and a tap tells you why (`aria-disabled`, not `display:none`,
   never a dead click).
7. **Wide content scrolls inside its own container** (tables get horizontal
   scroll with a sticky first column if needed); the page body never scrolls
   sideways.
8. **Confirmations, not toasts, for consequential moves**: destructive actions
   ask a plain-language confirm; irreversible ones require typing a word.
   Machine-proposed changes (e.g. AI suggestions) always render as a quiet
   **Confirm / Skip** card — nothing writes itself.
9. **Semantic color is behaviour**: a red (rose) element always means a rule is
   breached and always leads to the fix. Users learn to trust that red = act now.

## 7. Voice in the interface

- Sentence case everywhere; no Title Case buttons, no exclamation marks.
- Buttons say exactly what happens ("Send magic link", "Save report").
- Errors say what went wrong and what to do next — no apologies, no codes-only.
- Numbers always carry context ("12 of 30 interviews", never a bare "12").
- Micro-labels (11px caps, clay) name sections like a field notebook:
  "GENERATED REPORTS", "PHASE 1 EXIT CRITERIA".

## 8. How to hand this to a builder

Paste this whole file into the new project's brief (for an AI assistant, into
its project instructions), then add one line:

> Build every screen to the design language above. When in doubt: fewer
> colors, flatter surfaces, quieter motion, one question per screen.

If the new platform is also a web app, the fastest path is to copy MedTerm's
`css/theme.css` verbatim as the starting stylesheet — this document is its
prose equivalent — and load the two Google Fonts:
`Fraunces (400, 600, italic)` and `Inter (400, 500)`.
