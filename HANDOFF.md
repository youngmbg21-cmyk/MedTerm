# HANDOFF.md — for Young

Written 2026-07-04, at the end of the autonomous rebuild. Everything below is live on
this branch and verified in a real browser at 1280px and 375px.

## What you can do tomorrow, with zero setup

Open `index.html` in a browser. The workspace runs in **local demo mode**: no accounts,
no keys, no server. It is seeded with realistic sample research (20 outreach contacts,
12 interviews, 18 tagged quotes, all six phases' deliverables, 3 scripts, 2 killed
hypotheses, 4 field checks) so every screen is populated and explorable.

Everything works: add/edit outreach contacts, log interviews (IDs auto-assigned),
tag quotes into the matrix, watch saturation fill, cycle exit-criteria statuses from the
Overview, kill hypotheses, run the unit-economics model, draft the decision memo, and
print a weekly status report. Data persists in your browser across reloads.

Two things to know:

- **Settings** (sidebar footer): set the display names for the project lead and field
  coordinator (defaults: Young, Simon). Names update everywhere instantly and are never
  hardcoded. Data management (export, import, resets) also lives here — see below.
- **The assistant ships off by default** (`AI_MODE = 'off'` in `js/config.js`) — it
  needs the Claude API key, which lives server-side. Everything else works without it,
  including the Decision Brief (it renders the seeded assessments) and all manual
  evidence linking. See "Turning on the AI" below — the AI no longer requires the
  live data backend.

## What was built

See `PROGRESS.md` for the full list and `DECISIONS.md` for every judgment call. The
short version:

- **One data layer** (`js/data.js`): screens are storage-agnostic. Local mode and the
  real backend use the same flat snake_case records as `sql/schema.sql`, so flipping to
  the backend changes no screen code.
- **Pipeline navigation**: the sidebar mirrors the six phases. The current phase's group
  is expanded; future phases are dimmed with "🔒 phase N" but still openable. Change
  `CURRENT_PHASE` in `js/config.js` to advance — everything follows.
- **Overview command center**: phase rail with % of exit criteria met, KPI strip,
  this phase's exit criteria (tap to cycle status), saturation, and a needs-attention
  panel that leads with the same-day-tag breaches, then stalled outreach.
- **Interviews are master–detail**: pick an interview, see its details, its tag status,
  and every matrix quote linked to it. Untagged-past-24h interviews are red everywhere.
- **Old defects fixed**: the Airtable-vs-Supabase data-shape mismatch that blanked
  screens, the `/api/Outreach` casing 404s, missing auth headers, three competing
  segment lists, XSS via innerHTML, and hardcoded names.

## To go live (multi-user sync + AI assistant)

About 30–45 minutes:

1. **Supabase**: create a project → SQL editor → run `sql/schema.sql`. Then insert you
   and the field coordinator into `team_members` with `status = 'active'` and roles
   `lead` / `partner` (use your login emails). Also create a **private Storage bucket
   named `field-documents`** (Dashboard → Storage → New bucket, public OFF) — uploaded
   field documents live there.
2. **Worker**: `wrangler deploy worker.js` with secrets `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `CLAUDE_API_KEY`, `ALLOWED_ORIGIN`
   (`wrangler.toml` is already in the repo).
3. **Frontend**: in `js/supabase.js` set your Supabase URL + anon key; in `js/config.js`
   set `WORKER_URL`, `DATA_MODE = 'api'`, and `AI_MODE = 'worker'`.
4. Open the app → magic-link login appears → sign in. Done: shared data, and the
   assistant panel comes alive (it reads live project state and can propose actions you
   confirm).

Note: local demo data does not migrate automatically. The demo is a sandbox; you start
the real programme clean (or ask Claude to write a one-off migration from the
localStorage blob if you've entered real data locally).

## Turning on the AI — with or without the live backend

`AI_MODE` in `js/config.js` decouples the assistant from the data mode:

- `'off'` (default) — no AI anywhere. Calm disabled states; everything else works.
- `'worker'` — the assistant, Decision Brief assessments ("Regenerate brief"),
  evidence-link proposals after saves, phase-exit reviews, and every AI-first
  drafting surface (decision-memo sections, MVP scope, state of the field,
  assistant-drafted report narratives) all come alive — **in either data mode**.
  Every draft lands in an edit modal or preview for human review; nothing an
  AI writes is saved without a human tap.

**The intended production setup is local-first data + live AI**: keep
`DATA_MODE = 'local'` and set `AI_MODE = 'worker'`. Records stay in the browser;
each AI request carries the relevant workspace slices in the request body; new
assessments and confirmed links are persisted back through `js/data.js` locally.

Exact steps (~20 minutes if the Worker isn't deployed yet):

1. **Supabase (identity only in this setup)**: create a project, run
   `sql/schema.sql`, insert the two of you into `team_members` (`status='active'`,
   roles `lead`/`partner`). The Worker authenticates every AI call with a
   Supabase magic-link JWT — that's why this is needed even with local data. No
   research data is stored server-side in this mode.
2. **Worker**: `wrangler deploy worker.js` with secrets `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `CLAUDE_API_KEY`, `ALLOWED_ORIGIN`.
3. **Frontend**: in `js/supabase.js` set the Supabase URL + anon key; in
   `js/config.js` set `WORKER_URL` and `AI_MODE = 'worker'`.
4. Open the app → magic-link sign-in appears once → the assistant panel, the
   Decision Brief's Regenerate button, and the memo's Draft-from-evidence buttons
   are live against your local data.

Going fully live later (team sync) is unchanged: also set `DATA_MODE = 'api'` —
the AI endpoints then read Supabase directly instead of the request body.

One caveat of local-first AI: binary documents (images, PDFs without extracted
text) can't be read by the assistant, since the files live only in the browser's
IndexedDB. Text, markdown, and CSV uploads ride along fully.

## The sole-repository upgrade (notes + documents + assistant access)

Added after the initial rebuild, working in both modes:

- **Field notes live inside each interview** — a full-debrief text area on the log form
  and in the interview detail. Four seeded interviews show the expected depth.
- **Documents screen** (sidebar, above Reports): upload PDFs, text/markdown, CSVs and
  images (10 MB each). Files are stored in the browser (IndexedDB) in demo mode and in
  the `field-documents` Supabase bucket when live. Text contents are fully searchable in
  the screen's search box. The upload form blocks Word files (save as PDF) and reminds
  the team never to upload consent forms or identity documents.
- **The assistant reaches everything** (live mode): a `search_notes` tool covers every
  notes field and document contents across the whole database; `read_document` returns a
  document's full text — PDFs are transcribed by Claude on first read and cached, images
  are shown to the model directly; sharing works via 60-minute signed links.
- **Backups**: Settings → "Export everything" downloads one JSON with every record,
  including full notes and document text. A storage meter shows demo-mode headroom.
  Do the export weekly until the backend is live.

## Data portability, safer resets, and the executive briefing report

Added after the sole-repository upgrade, in Settings → Data management:

- **Export everything** now stamps a `schema_version` and embeds any uploaded binary
  files (images, PDFs) as base64, so the single JSON file is a complete, restorable
  backup — not just a record dump.
- **Import a backup**: choose a previously exported file; it's checked against the
  app and schema version (a mismatch is refused with a specific reason, not a silent
  failure), then a preview shows exactly how many records of each type will come in.
  Importing REPLACES all current data — nothing is merged — and always downloads a
  safety export of what you had first. Type IMPORT to confirm. **Local mode only** —
  on the live backend this would silently overwrite the whole team's shared data, so
  it's deliberately not available there.
- **Start fresh for real fieldwork**: a second, more specific reset. Wipes every
  outreach contact, interview, matrix quote, document, report, kill-list entry, field
  check, economics model, and decision memo — but keeps the three stock interview
  scripts and resets the six phases' deliverables checklist to "Not started". This is
  the button to use the day real fieldwork begins, once you're done exploring the
  demo. Type RESET to confirm; a safety export downloads first. Local mode only.
- **Reset to demo data** still works as before, now behind the same typed
  confirmation and safety export.
- **A fourth report type, "Executive briefing"**, in Reports: a verdict-first
  executive summary, methodology with a segment-coverage chart, core findings citing
  interview IDs (thin-evidence themes flagged explicitly), data-driven strategic
  implications, a 2×2 risk-assessment matrix built from the unit-economics
  break-points and unverified field checks, and next steps with real owners (from
  Settings' team names) and concrete target dates. The three existing reports each
  gained one small chart too (tagging-rate meter, coverage bars, WTP-by-segment
  bars). All charts are dependency-free inline SVG — no charting library — and print
  identically to how they look on screen.

## Alternative backend (optional)

An earlier iteration built a Supabase-only path: an Edge Function
(`supabase/functions/claude-proxy/`) that reads the Claude key from a `settings` table,
plus a hidden `admin.html` page for managing that key (password gate + Supabase auth,
schema in `supabase/schema.sql`). It is not wired into the app. If you'd rather run
without Cloudflare entirely, that's the starting point — but the wired, documented path
is the Worker (step list above).

## Where to look

- `README.md` — what this is, how to run it
- `CLAUDE.md` — rules for any future Claude Code session
- `docs/tech-stack.md` — architecture in detail
- `DECISIONS.md` — every judgment call and improvement, with reasoning
- `PROGRESS.md` — milestone-by-milestone status + how it was verified
