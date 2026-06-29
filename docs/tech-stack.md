# Tech Stack — MedTerminal Research Workspace

> The simplest architecture that works. No build step. No framework. Supabase as the full backend.

---

## Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla HTML/CSS/JS | Modular: `index.html` + `js/` modules |
| Styling | Tailwind CSS (CDN) | No build step — CDN only |
| Fonts | Google Fonts | Fraunces (headings) + Inter (body) |
| Routing | Hash routing | `#dashboard`, `#outreach`, etc. |
| State | In-memory JavaScript | Loaded from Supabase on page load |
| Data store | Supabase (PostgreSQL) | Via Supabase JS client (with RLS) |
| API layer | Supabase Edge Functions | Claude API proxy + system prompt injection |
| AI | Claude (Anthropic) | Via Supabase Edge Function `claude-proxy` |
| Auth | Supabase Auth | Magic link, admin-only settings page |
| Hosting | TBD | Static files — any host works |

---

## Frontend

### Rules
- **No JavaScript frameworks.** No React, Vue, Svelte, Alpine, or any other framework. Vanilla JS only.
- **No build tools.** No Webpack, Vite, Parcel, or npm. The file must open directly in a browser without any build step.
- **Tailwind via CDN only.** `<script src="https://cdn.tailwindcss.com">`. Do not introduce a PostCSS pipeline.
- **Supabase JS client via ESM CDN.** Loaded from `https://esm.sh/@supabase/supabase-js@2` — no npm install needed.

### CSS Architecture
- `:root` CSS variables define the colour palette. Always use these — never hardcode hex values.
- Component classes: `.card`, `.chip`, `.bar-wrap`, `.btn` — already defined. Use these before creating new component classes.
- Tailwind utility classes are used for layout and spacing. Component classes handle visual identity.

### State Management
- All data loads from Supabase **once on page load** via the JS client.
- Data is stored in memory as JavaScript objects/arrays.
- All reads come from memory — never re-fetch on every render.
- A **Refresh button** in the top bar triggers a full re-fetch.
- Writes POST immediately via the Supabase JS client. Update in-memory state optimistically on success.

---

## Supabase

### Database (PostgreSQL)
The data store. Key tables:

| Table | Key fields |
|-------|-----------|
| outreach | name, organisation, segment, status, last_contact, notes |
| interviews | id, date, segment, participant_code, interviewer, notes, tagged_same_day |
| matrix | interview_id, segment, quote, theme_tag, severity, wtp |
| settings | key (unique), value, updated_at |
| chat_sessions | user_id, title |
| chat_messages | session_id, role, content, tool_calls |

- Row Level Security (RLS) is enabled on all tables.
- The `settings` table stores the Claude API key — only the admin user can read/write it.
- The Edge Function uses the `service_role` key to read the API key at runtime.

### Auth
- **Supabase Auth** with magic link (email-based, passwordless).
- Admin page (`admin.html`) is additionally gated by a hardcoded password.
- Only the admin email can access the `settings` table (enforced by RLS).

### Edge Functions
- **`claude-proxy`**: The only Edge Function. Handles all Claude API calls.
  - Reads the Claude API key from the `settings` table at call time.
  - Prepends the research-director system prompt.
  - Supports tool use (query_outreach, query_interviews, etc.).
  - Persists chat sessions and messages.
  - The frontend never touches the Claude API directly.

---

## AI Assistant

- **Model:** Claude (Anthropic) — model version specified in the Edge Function.
- **Context window strategy:** The frontend builds a compact context snapshot (not raw data dumps) to stay within token limits, plus a full content snapshot from all tabs.
- **System prompt:** Lives in the Edge Function. Defines Claude as a research director with deep knowledge of the MedTerminal project.
- **API key management:** Stored in the `settings` table, managed via the admin page. Never exposed to the frontend.

---

## Constraints — Do Not Change Without Discussion

1. **Supabase as the only backend.** No Cloudflare Workers, no separate Node.js server.
2. **No npm/package.json.** This project has no dependency manifest and no `node_modules`.
3. **Supabase as the only persistence layer.** Do not introduce Firebase, Airtable, or any other database.
4. **Never call Claude directly from the browser.** All AI calls go through the `claude-proxy` Edge Function.
5. **No API keys in the frontend.** The Supabase anon key is safe to expose (RLS enforces security). The Claude API key lives only in the `settings` table and is read server-side.

---

## Development Workflow

1. Edit files locally or directly on GitHub.
2. Open `index.html` in any browser — no server needed for most work.
3. For Supabase-dependent features, the Supabase project must be running (cloud or local via `supabase start`).
4. Deploy Edge Functions via `supabase functions deploy claude-proxy`.
5. Test on both desktop (1280px+) and mobile (375px) before committing.
