# MedTerminal — Research Workspace

An internal tool for a 2-person team running a six-phase qualitative research programme.
The programme decides whether a medical-tourism concierge for Kenyan families seeking
treatment abroad (mainly the Kenya → India corridor) is worth building.

**This is not the patient-facing product.** It is the workspace used to decide whether to
build that product.

## Run it

Open `index.html` in any modern browser. That's it — no build step, no credentials.

The app starts in **local demo mode**: data is seeded with realistic sample research,
persists in `localStorage`, and every screen is populated and editable. Use
**Settings → Reset demo data** to restore the seed.

## What's inside

- **Overview** — command center: phase rail, KPIs, current-phase exit criteria,
  saturation, and a needs-attention panel (untagged interviews, stalled outreach).
- **Fieldwork** (phases 1–2) — Outreach pipeline, Interviews (master–detail with linked
  quotes and the same-day-tag hard rule), Theme matrix, Saturation.
- **Sense-making** (phase 3) — Theme analysis, Segment cards, Top-3 pains, append-only
  Kill list, State of the field.
- **Economics** (phase 4) — Unit economics with break-point checks, Alternate models,
  Field checks.
- **Decision** (phase 5) — Verdict-first decision memo with co-sign, MVP scope,
  Confirmatory tests.
- **Reference** — Interview scripts (versioned), outreach templates, operating manual.
- **Reports** — print-ready weekly status / phase exit / investor briefing, generated
  from live data.

The sidebar is gated by the current phase: future phases are dimmed but still openable.

## Stack

Vanilla JS ES modules, Tailwind via CDN, one `css/theme.css`. No framework, no build
step, no npm. Data access goes through `js/data.js`, which has two adapters selected by
`DATA_MODE` in `js/config.js`:

- `local` (default) — localStorage, seeded, zero credentials.
- `api` — Cloudflare Worker (`worker.js`) → Supabase (`sql/schema.sql`) → Claude, with
  magic-link login.

## Going live

See `HANDOFF.md` for the full checklist. Short version: stand up Supabase with
`sql/schema.sql`, deploy `worker.js` with its secrets, set `WORKER_URL` and
`DATA_MODE = 'api'` in `js/config.js`.
