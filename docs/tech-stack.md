# Tech Stack — MedTerminal Research Workspace

> Vanilla modules, one CSS file, zero build. Two data adapters behind one interface.

## Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla JS ES modules | `index.html` + `js/` — no framework, no bundler |
| Styling | Tailwind CDN + `css/theme.css` | Component classes own the visual identity |
| Fonts | Google Fonts | Fraunces (headings, quotes) + Inter (UI) |
| Routing | Hash routing | `#overview`, `#outreach`, … phase-gated nav |
| State | In-memory `STATE` in `js/app.js` | Loaded once via `js/data.js`, Refresh re-fetches |
| Data (local) | localStorage | Seeded demo data, default mode |
| Data (api) | Supabase Postgres | Via Cloudflare Worker only — schema in `sql/schema.sql` |
| Auth (api) | Supabase magic link | `js/auth.js`, lazy-loaded; JWT sent as Bearer to Worker |
| AI (api) | Claude via Worker `/api/chat` | Disabled with a calm notice in local mode |

## The data layer (the important part)

`js/data.js` exposes exactly:

```
data.list(table)              -> array
data.create(table, record)    -> created record
data.update(table, id, patch) -> updated record
data.remove(table, id)        -> { deleted: true }
data.reset()                  -> local mode only: re-seed
```

`DATA_MODE` in `js/config.js` selects the adapter:

- **`local`** (default) — persists the whole DB as one JSON blob in localStorage
  (`medterm_data_v1`), seeded from `js/seed.js` on first run. Interview IDs (`INT-nnn`)
  are assigned by the adapter.
- **`api`** — calls `WORKER_URL/api/<table>` (always lowercase) with the Supabase session
  JWT in the `Authorization` header. The Worker enforces roles and writes to Supabase;
  Postgres assigns interview IDs via trigger.

**Records are flat snake_case matching `sql/schema.sql`** in both modes:
`interview_id`, `date`, `segment`, `tagged_same_day`, `theme_tag`, `severity`, `wtp`,
`first_contact`, `deliverable`, `status`, `evidence`, … No `.fields` wrapper.

File blobs go through the same module: `data.putFile(id, blob)` / `data.getFile(id)` —
IndexedDB in local mode, the private `field-documents` Supabase Storage bucket (via
Worker endpoints `POST /api/documents/:id/file`, `GET /api/documents/:id/link`) in api
mode. Screens never call `fetch`, `localStorage`, or IndexedDB directly.

## Configuration (`js/config.js`)

Single source of truth for:

- `DATA_MODE` — `'local' | 'api'`
- `WORKER_URL` — api mode only
- `CURRENT_PHASE` — drives nav gating and the Overview; change it here to advance
- `PHASES`, `SEGMENTS` (name + interview target), `THEMES`, `OUTREACH_STATUSES`,
  `CHANNELS`, `STALL_DAYS`
- Team roles: `getTeam()/setTeam()` (persisted separately from data so demo resets keep
  names), `interviewerOptions()`, `ownerOptions()`, `onTeamChange()`

## Design system (`css/theme.css`)

Semantic colour, learned once, used everywhere:

| Colour | Meaning |
|--------|---------|
| sage (green) | done / on-track |
| honey (amber) | attention / thin evidence |
| rose (red) | blocked / data-quality breach |
| info (blue) | current / informational |
| plum (purple) | theme tags |

Shared components: `.card`, `.kpi`, `.chip chip-*`, `.bar-wrap`, `.quote-block`
(serif — evidence must look different from chrome), `.banner banner-*`, `.phase-rail`,
`.md-layout` (master–detail, stacks under 900px), `table.data.stack` (stacked rows under
640px). Compose screens from these; don't hand-style.

## Backend (api mode)

`worker.js` (Cloudflare Worker) is the only backend. It:

1. Verifies the Supabase JWT on every `/api/*` call and maps the user to `team_members`.
2. Proxies CRUD to Supabase REST with the service key (never in the browser), enforcing
   lead/partner roles and writing an audit log.
3. Handles `/api/chat`: prepends the research-director system prompt, forwards to the
   Claude API with tool use, and persists chat history. Tools: `query_*` (structured
   records), `search_notes` (full-text across interview notes, outreach notes, matrix
   quotes, deliverable evidence, and document contents), `list_documents`,
   `read_document` (text verbatim; PDFs transcribed once via a nested Claude call and
   cached in `documents.text_content`; images returned as image blocks), and
   `propose_action` (user confirms before any write).

Secrets (Worker env): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`,
`CLAUDE_API_KEY`, `ALLOWED_ORIGIN`.

An alternative Supabase-only backend (Edge Function `supabase/functions/claude-proxy` +
`admin.html` key management) exists from an earlier iteration — see HANDOFF.md. The
documented, wired path is the Worker.

## How to go live

1. Create a Supabase project; run `sql/schema.sql`; insert both team members into
   `team_members` (status `active`, roles `lead`/`partner`).
2. Deploy `worker.js` (`wrangler deploy`) with the five secrets above.
3. In `js/supabase.js`, set the Supabase URL + anon key (used by the login).
4. In `js/config.js`, set `WORKER_URL` and flip `DATA_MODE = 'api'`.
5. Open the app — the magic-link login appears; data now syncs for both users and the
   assistant comes alive.

## Development workflow

1. Edit files; open `index.html` in a browser (serve the folder with any static server
   if your browser blocks module imports from `file://`).
2. Test at 375px and 1280px. Zero console errors is the bar.
3. Local mode needs no backend. For api-mode work, run the Worker via `wrangler dev`.
