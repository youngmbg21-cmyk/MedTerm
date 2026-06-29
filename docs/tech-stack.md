# Tech Stack — MedTerminal Research Workspace

> The simplest architecture that works. No build step. No framework. No backend server.

---

## Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla HTML/CSS/JS | Single file: `index.html` |
| Styling | Tailwind CSS (CDN) | No build step — CDN only |
| Fonts | Google Fonts | Fraunces (headings) + Inter (body) |
| Routing | Hash routing | `#dashboard`, `#outreach`, etc. |
| State | In-memory JavaScript | Loaded from Airtable on page load |
| Data store | Airtable | Via Cloudflare Worker (never direct) |
| API layer | Cloudflare Worker | Proxy + system prompt injection |
| AI | Claude (Anthropic) | Via Cloudflare Worker |
| Hosting | TBD | Static file — any host works |

---

## Frontend (`index.html`)

### Rules
- **Single file only.** All HTML, CSS, and JavaScript lives in `index.html`. Do not split into separate files unless explicitly instructed.
- **No JavaScript frameworks.** No React, Vue, Svelte, Alpine, or any other framework. Vanilla JS only.
- **No build tools.** No Webpack, Vite, Parcel, or npm. The file must open directly in a browser without any build step.
- **Tailwind via CDN only.** `<script src="https://cdn.tailwindcss.com">`. Do not introduce a PostCSS pipeline.
- **No external JS libraries** without explicit approval. No lodash, no axios, no chart libraries.

### CSS Architecture
- `:root` CSS variables define the colour palette. Always use these — never hardcode hex values.
- Component classes: `.card`, `.chip`, `.bar-wrap`, `.btn` — already defined. Use these before creating new component classes.
- Tailwind utility classes are used for layout and spacing. Component classes handle visual identity.

### Fonts
- **Fraunces** — all headings (`h1`–`h3`, dashboard titles, screen names).
- **Inter** — all body text, labels, table content, buttons.
- Both loaded from Google Fonts in the `<head>`. Do not change or add fonts.

### State Management
- All data loads from Airtable **once on page load** via the Worker.
- Data is stored in memory as JavaScript objects/arrays.
- All reads come from memory — never re-fetch on every render.
- A **Refresh button** in the top bar triggers a full re-fetch from Airtable.
- Writes (add contact, log interview, tag quote) POST immediately to the Worker → Airtable. Update in-memory state optimistically on success.

---

## Cloudflare Worker

The Worker is the only backend. It does three things:

### 1. Airtable proxy
- All Airtable reads and writes go through the Worker. The Airtable API key is never exposed to the browser.
- The Worker handles CORS, rate limiting, and error formatting.
- Endpoints (approximate):
  - `GET /outreach` — fetch all contacts
    - `POST /outreach` — add contact
      - `PATCH /outreach/:id` — update contact status
        - `GET /interviews` — fetch all interviews
          - `POST /interviews` — log interview
            - `GET /themes` — fetch all quotes
              - `POST /themes` — add quote

              ### 2. Claude API proxy
              - The Worker holds the Claude API key. It is never in the browser.
              - On receiving a chat request from the frontend, the Worker:
                1. Receives the context snapshot + conversation history from the frontend
                  2. Prepends the research-director system prompt
                    3. Forwards to Claude API
                      4. Streams the response back to the browser

                      ### 3. System prompt injection
                      - The research-director system prompt is defined in the Worker, not in the frontend.
                      - This means the system prompt can be updated without touching `index.html`.
                      - The frontend sends only: context snapshot + conversation history.

                      ---

                      ## Airtable

                      The data store. Three tables:

                      | Table | Key fields |
                      |-------|-----------|
                      | Outreach | Name, Organisation, Segment, Status, LastContact, Notes |
                      | Interviews | ID, Date, Segment, ParticipantCode, Interviewer, Notes, TaggedDate |
                      | Themes | InterviewID, Segment, Quote, Theme, Severity, WTP |

                      - The Worker is the only thing that reads/writes Airtable directly.
                      - The frontend never knows the Airtable base ID or API key.

                      ---

                      ## AI Assistant

                      - **Model:** Claude (Anthropic) — model version specified in the Worker.
                      - **Context window strategy:** The frontend builds a compact context snapshot (not raw data dumps) to stay within token limits.
                      - **Streaming:** Claude's response is streamed token-by-token back to the browser and rendered progressively in the assistant panel.
                      - **System prompt:** Lives in the Worker. Defines Claude as a research director with deep knowledge of the MedTerminal project, the six-phase programme, and qualitative research methods.

                      ---

                      ## Constraints — Do Not Change Without Discussion

                      1. **No backend server** beyond the Cloudflare Worker. No Node.js server, no Python server, no database other than Airtable.
                      2. **No npm/package.json.** This project has no dependency manifest and no `node_modules`.
                      3. **Single HTML file** until explicitly told to split.
                      4. **Airtable as the only persistence layer.** Do not introduce Firebase, Supabase, or any other database.
                      5. **Cloudflare Worker as the only API.** Do not call Claude or Airtable directly from the browser.

                      ---

                      ## Development Workflow

                      1. Edit `index.html` locally or directly on GitHub.
                      2. Open in any browser — no server needed for most work.
                      3. For Worker-dependent features (Airtable reads/writes, AI assistant), the Worker must be running locally via `wrangler dev` or deployed to Cloudflare.
                      4. Test on both desktop (1280px+) and mobile (375px) before committing.
