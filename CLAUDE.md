# CLAUDE.md — HaTi Research

Read this first. It defines what this project is and the rules that govern every change.

## What this is

A **go-to-market research workspace** used by two co-founders — Young and Simon, neither
of them a developer — to answer the five business questions standing between **HaTi** and
its first paying customers.

HaTi (repo: `youngmbg21-cmyk/mkataba-clm`) is the product: a contract lifecycle management
platform for the Kenyan market, at working-MVP status, never sold to anyone, with no
billing. **This app is not that product** — it is the tool used to decide how to sell it.

Read `RESEARCH_BRIEF.md` for what HaTi is, who might buy it, what it could charge, and the
five questions. That brief is the source of everything in here. `sql/schema.sql` and
`supabase/functions/claude-proxy/index.ts` define the real data model.

## Architecture in one paragraph

`index.html` loads vanilla ES modules from `js/`, starting at `js/boot.js`. One app for
laptop and phone — the sidebar becomes a drawer below 768px, and nothing branches on
screen size. All configuration (data mode, AI mode, pipeline stages, segments, categories,
team names) lives in `js/config.js`. All data access goes through `js/data.js` — one
interface (`list/create/update/remove`), two adapters: `local` (localStorage, seeded from
`js/seed.js`, **the default**) and `api` (Supabase Edge Function `claude-proxy` → Supabase,
Bearer JWT from Supabase magic-link auth in `js/auth.js`). Records are flat snake_case
matching `sql/schema.sql`. `js/app.js` holds state, the hash router, the nav, and the
shared component kit. One screen per file in `js/screens/`. AI availability is governed by
`AI_MODE` in `js/config.js`, not by the data mode: `'worker'` (the current setting) enables
the assistant and the AI-drafted writing surfaces through the shared `js/ai-draft.js`
control row and the one `/api/draft-section` seam in the Edge Function; drafts always land
in an edit box, never auto-saved. With local data the client sends the backend the
workspace slices it needs in the request body. The decision spine — the five questions,
the findings linked to them, and the source each finding came from — lives in ordinary
tables and flows through `js/evidence.js`; AI-proposed writes go through the Confirm/Skip
pattern in `js/actions.js`. The sidebar reads in the order the work happens (Overview ·
**the spine**: the five questions, findings · **the research**: prospects, conversations,
pricing, competitors, market & rules), and every list screen renders its records through
`expandableCard()` — a summary row that always shows, detail one tap away.

## Core rules — never violate

1. **No frameworks, no build step, no npm for the app.** Vanilla JS ES modules; Tailwind
   via CDN; one `css/theme.css`. Served over HTTP, opens in a browser.
2. **Screens never call `fetch` or `localStorage` directly.** Everything goes through
   `js/data.js`.
3. **One canonical record shape**: flat snake_case (`question_id`, `source_kind`,
   `next_step_date`, `wtp_signal`). No `.fields` wrapper, ever.
4. **Config has one home.** Pipeline stages, segments, categories, and team names come
   from `js/config.js`. Never redefine them in a screen. Never hardcode a person's name —
   use `getTeam()/teamOptions()/ownerOptions()`.
5. **Never render user-supplied text via `innerHTML`.** Use the `h()` helper /
   `textContent`. `innerHTML` is allowed only for clearing (`= ''`).
6. **Respect the two data-quality rules.** They are this workspace's most important
   mechanism and must never be weakened:
   - **A conversation nobody wrote a finding from is a lost conversation.**
     `conversationUnmined()` in `js/app.js` flags it in red, on the Conversations screen
     and on the Overview, and keeps flagging it.
   - **A fact with no source link is a rumour.** The Market & rules form refuses to save
     one; `factNeedsSource()` flags any that got in another way; `source_url` is `NOT NULL`
     in the schema.
   This app is the team's sole repository for the research. Never add a feature that pushes
   content into an external document the assistant cannot read.
7. **Never seed invented evidence.** `js/seed.js` may contain reference material (real
   competitors, real regulations with real links) and our own ideas (pricing models,
   target companies) — clearly labelled as unverified. It must never contain a fabricated
   conversation, quote, insight or pricing reaction. The assistant would cite them, and a
   research tool that invents findings is worse than an empty one.
8. **Keep the aesthetic**: HaTi's own family — Space Grotesk headings, Inter interface,
   deep green with a gold accent. Semantic colours: green=confirmed/supports,
   gold=attention/leaning, rose=challenges/risk, info=neutral, violet=tags,
   bronze=editorial accent. Use the existing component classes (`.card`, `.chip`,
   `.banner`, `.inset-block`, `.quote-block`, `.bar-wrap`, `.btn`) before inventing new ones.
9. **Mobile-first.** Every screen must be fully usable at 375px. Test both 375px and
   1280px before committing.
10. **Every screen answers one question**, shown as its subheader (the fourth argument to
    `registerRoute`). List screens lead with the exception, not the totals.
11. **No API keys in the frontend.** The Edge Function holds the Claude key, read from the
    `settings` table that `admin.html` writes. **Do not move, rename or restructure how
    that key is loaded.**
12. **The five questions, insights, and their links are first-class records.** No screen or
    prompt may hardcode them — the Edge Function reads the live question board from the
    `questions` table (or the client's copy in local data mode). The AI argues; it never
    decides — every AI-originated write goes through human confirmation, and no numeric
    confidence scores appear anywhere.
13. **Write for two non-developers.** Every message, empty state and error in the app is
    read by someone who does not code. Plain English, no jargon, and say what to do next.
14. **One word per thing.** The record joining evidence to a question is an `insight` row
    in `sql/schema.sql`, in `js/evidence.js` and in the Edge Function — and it is a
    **finding** in every single word the user reads. Never both. The same discipline
    applies to anything else that grows a second name.
15. **Every screen must stay scannable when the workspace fills up.** A list screen shows
    records through `expandableCard()`, and the shut summary must carry enough to decide
    whether to open it. A record that breaches one of the two data-quality rules opens
    itself and stays flagged — those are never one tap away.

## Design system — how the app must look

All visual decisions live in `css/theme.css` as documented design tokens; screens consume
tokens and component classes, never restyle ad hoc. The full contract is the comment block
at the top of `css/theme.css`; the load-bearing rules:

- **Type scale** (two weights per family — Inter 400/500, Space Grotesk 500/700):
  display 28/34 · page title 22/28 · card title 17/24 · body 14/22 · secondary 13/20 ·
  micro-label 11/16 uppercase. Numerals always tabular (`.num`, automatic in `table.data`).
  `.serif` is the display-face class — a legacy name meaning "set this in the heading face".
- **Spacing**: 4px base scale (4/8/12/16/24/32/48). Card padding is one value app-wide
  (`--card-pad`: 24px desktop / 16px mobile, applied via `.card-pad`).
- **Color roles, never raw hex at point of use**: `--ink/-soft/-mute`, `--line/-soft`,
  `--surface-page/-card/-inset`, and tone trios (bg/border/text) for green, gold, rose,
  info, violet, bronze. Every tone's text colour clears WCAG AA (≥4.5:1) on its own tint —
  keep it that way. Use the utilities `.t-mute .t-soft .t-green .t-gold .t-rose .t-info
  .t-violet .t-bronze .b-line .b-soft` instead of inline `style=` — inline styles are for
  dynamic values only.
- **Elevation**: two levels only — flat cards (hairline border, no shadow) and floating
  layers (modal/drawer/chat, `--shadow-float`). **Radii**: `--r-ctl` 10px controls,
  `--r-card` 14px cards (chips are round by identity).
- **Motion**: 150ms ease-out on hover/focus/press and modal/menu enter only;
  `prefers-reduced-motion` honored globally.
- **One primary action per screen**, placed in the app header via `setPageActions()`;
  everything else is `.btn-line`/`.btn-ghost` in a quiet tools row. Buttons and inputs have
  40px hit targets and `:focus-visible` rings.
- **States are designed**: `emptyState(title, sub, action?)`, `loadingState()` skeleton,
  banners for errors, and the calm-disabled pattern for AI-off (visible + muted + a tap
  explains — `aria-disabled`, never hidden, never a dead click).
- **The shell never depends on the Tailwind CDN.** Sidebar/drawer/header layout and
  stacking live in owned classes in theme.css — utility classes are for in-screen layout
  only. Any grid a screen depends on carries `display:grid` in its own inline style so it
  survives the CDN being slow or blocked.

## File map

| Path | Purpose |
|------|---------|
| `index.html` | Page shell: fonts, one import of `js/boot.js` |
| `js/boot.js` | Builds the app shell, loads screens, starts the router |
| `css/theme.css` | The entire design system |
| `js/config.js` | All configuration — single source of truth. Holds the Supabase credentials block; do not restructure it |
| `js/data.js` | Data interface + local/api adapters + the AI request functions |
| `js/seed.js` | The starting workspace — reference material only, never invented evidence |
| `js/app.js` | State, router, nav, component kit (incl. `expandableCard`), the two data-quality rules |
| `js/auth.js` | Magic-link login (lazy-loaded) |
| `js/chat.js` | Assistant panel |
| `js/actions.js` | Shared Confirm/Skip pattern for AI-proposed writes |
| `js/evidence.js` | Findings: the link between something we learned and a question (`insights` table) |
| `js/ai-draft.js` | The one AI-drafts-you-edit control row |
| `js/export.js` | CSV exports |
| `js/screens/*.js` | One screen per file |
| `admin.html` | Where the Claude API key is set. Reached by five taps on the wordmark |
| `supabase/functions/claude-proxy/index.ts` | The backend: AI endpoints + shared-data CRUD |
| `sql/schema.sql` | Supabase schema + RLS, for when the workspace goes shared |
| `RESEARCH_BRIEF.md` | What HaTi is and the five questions. The source of everything here |
| `HANDOFF.md` | How to run it, and how to move from local to shared data |
