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
  hardcoded. "Reset demo data" restores the seed.
- **The assistant panel is intentionally disabled** in local mode — it needs the Claude
  API key, which lives server-side. Everything else works without it.

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
   set `WORKER_URL` and `DATA_MODE = 'api'`.
4. Open the app → magic-link login appears → sign in. Done: shared data, and the
   assistant panel comes alive (it reads live project state and can propose actions you
   confirm).

Note: local demo data does not migrate automatically. The demo is a sandbox; you start
the real programme clean (or ask Claude to write a one-off migration from the
localStorage blob if you've entered real data locally).

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
