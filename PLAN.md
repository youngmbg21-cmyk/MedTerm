# Plan — MedTerminal Research Workspace Build-Out

> Written 2026-06-29. Pending Young's sign-off before any code changes.

---

## Summary

Split `index.html` into vanilla JS modules (no framework, no build step). Replace Airtable with Supabase for data and auth. Add team management with magic-link invitations and role-based access. Build out Phase 3, 4, and 5 screens. Make interview scripts editable with version history. Upgrade the AI assistant with tool use, multi-turn memory, and report generation. Total estimated effort: ~90–110 hours across seven phases. Monthly run cost at current team size: ~USD 30–50.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│  index.html + js/screens/*.js + css/theme.css                │
│  (vanilla JS modules, Tailwind CDN, no build step)           │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Hash router  │  │ State store  │  │ Chat panel       │    │
│  │ (js/app.js)  │  │ (in-memory)  │  │ (js/chat.js)     │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘    │
│         │                 │                    │              │
│         └─────────────────┼────────────────────┘              │
│                           │ fetch()                           │
└───────────────────────────┼───────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────┼───────────────────────────────────┐
│  Cloudflare Worker        │                                   │
│  worker.js                ▼                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Auth middleware (validates Supabase JWT)              │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │ /api/*         → Supabase REST (CRUD, RLS enforced)  │    │
│  │ /api/chat      → Claude API (system prompt + tools)  │    │
│  │ /api/report    → Claude API (long-form generation)   │    │
│  │ /auth/*        → Supabase Auth (magic link, session) │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────┬───────────────────────────────────┘
                            │
              ┌─────────────┼─────────────────┐
              ▼                               ▼
┌──────────────────────┐        ┌──────────────────────┐
│  Supabase                │        │  Claude API            │
│  - Postgres (data)       │        │  (Anthropic)           │
│  - Auth (magic links)    │        │                        │
│  - RLS (row security)    │        │                        │
│  - Storage (if needed)   │        │                        │
└──────────────────────┘        └──────────────────────┘
```

**Data flow:** Browser → Worker → Supabase/Claude. No direct calls from the browser to Supabase or Claude. The Worker holds all secrets.

---

## Tech stack decisions

| Decision | Choice | Rationale | Cost |
|----------|--------|-----------|------|
| Frontend | Vanilla JS modules | Stays true to the "no framework" rule. `<script type="module">` works in all modern browsers. No build step. | Free |
| CSS | Tailwind CDN + extracted `theme.css` | Same as today. Variables and component classes move to their own file for readability. | Free |
| Data | Supabase (free tier) | Postgres, REST API, auth, RLS, realtime — all in one. Free tier: 500 MB, unlimited API requests, 50K monthly active users. | Free → USD 25/mo if exceeding free tier |
| Auth | Supabase Auth (magic links) | Built-in to Supabase. Handles email magic links, session tokens, JWT verification. No additional service needed. | Included in Supabase |
| API proxy | Cloudflare Worker (free tier) | Already in the architecture. 100K requests/day free. Handles auth middleware, Supabase calls, Claude calls. | Free |
| AI | Claude API (via Worker) | Already in the architecture. Tool use for data queries. Streaming for chat. Long-form generation for reports. | ~USD 5–15/mo at this usage level |
| Hosting | Netlify (free tier) | Auto-deploy on `main` merge. Static site — no server needed. | Free |

**Monthly total at current team size: USD 5–25.** The only real cost is Claude API usage. Supabase and Cloudflare stay on free tier comfortably.

---

## Supabase schema

### Tables

```sql
-- Team members and auth
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('lead', 'partner', 'observer', 'admin')),
  invited_by UUID REFERENCES team_members(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Outreach contacts
CREATE TABLE outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  segment TEXT,
  organisation TEXT,
  country TEXT,
  channel TEXT,
  status TEXT DEFAULT 'Cold',
  owner TEXT,
  first_contact DATE,
  notes TEXT,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Interviews
CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id TEXT NOT NULL UNIQUE,  -- human-readable: INT-001
  date DATE NOT NULL,
  segment TEXT,
  initials TEXT,
  interviewer TEXT,
  format TEXT,
  recorded TEXT,
  tagged_same_day TEXT DEFAULT 'N',
  brief_topic TEXT,
  link_to_notes TEXT,
  notes_markdown TEXT,  -- long-form debrief notes
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Theme matrix
CREATE TABLE matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id TEXT REFERENCES interviews(interview_id),
  quote TEXT,
  theme_tag TEXT,
  segment TEXT,
  severity INTEGER CHECK (severity BETWEEN 1 AND 5),
  wtp TEXT CHECK (wtp IN ('Y', 'Maybe', 'N')),
  notes TEXT,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Interview scripts (versioned)
CREATE TABLE scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_name TEXT NOT NULL,  -- 'Patient / caregiver', 'Hospital IPD', 'Agent / facilitator'
  version INTEGER NOT NULL DEFAULT 1,
  content JSONB NOT NULL,     -- array of {title, body} sections
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  revert_note TEXT            -- populated if this version is a revert
);

-- Phase deliverables and exit criteria
CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase INTEGER NOT NULL,
  deliverable TEXT NOT NULL,
  status TEXT DEFAULT 'Not started',
  evidence TEXT,
  completed_by UUID REFERENCES team_members(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log (append-only)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES team_members(id),
  action TEXT NOT NULL,       -- 'create', 'update', 'delete'
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Generated reports (versioned)
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,  -- 'weekly_status', 'phase_exit', 'investor_briefing', 'decision_memo'
  title TEXT NOT NULL,
  content JSONB NOT NULL,     -- structured report content
  version INTEGER DEFAULT 1,
  generated_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 3: Sense-making artefacts
CREATE TABLE segment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment TEXT NOT NULL,
  content JSONB NOT NULL,     -- structured card content with quotes
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE kill_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis TEXT NOT NULL,
  evidence TEXT NOT NULL,
  killed_date DATE NOT NULL,
  killed_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
  -- append-only: no updated_at, no updates allowed
);

-- Phase 4: Economics
CREATE TABLE economics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,   -- 'base', 'hospital_referral', 'hospital_saas', 'premium_case'
  assumptions JSONB NOT NULL, -- parametric cells
  derived JSONB,              -- calculated outputs
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE field_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption TEXT NOT NULL,
  confirmed BOOLEAN DEFAULT false,
  confirmed_by UUID REFERENCES team_members(id),
  confirmed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 5: Decision artefacts
CREATE TABLE decision_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER DEFAULT 1,
  content JSONB NOT NULL,     -- seven-section structure
  co_signed_by UUID[],
  co_signed_at TIMESTAMPTZ,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI assistant conversation memory
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES team_members(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Row-level security (summary)

- **Observers** can SELECT all tables. Cannot INSERT, UPDATE, or DELETE.
- **Partners and Leads** can SELECT and INSERT on all tables. Can UPDATE rows they created, or any row if they are a Lead.
- **Admins** can manage team_members (invite, remove, change roles).
- **The Lead** can UPDATE and DELETE any row in any table.
- **audit_log** is INSERT-only. No one can UPDATE or DELETE audit entries.
- **kill_list** is INSERT-only. No one can UPDATE — append-only by design.

RLS policies will be enforced at the Supabase level. The Worker verifies the JWT and passes it through; Supabase enforces the actual permission.

---

## Sequenced feature list with effort estimates

### Phase B — Foundation (20–25 hours)

| Task | Hours | Notes |
|------|-------|-------|
| Split `index.html` into modules | 3 | Mechanical extraction. No logic changes. |
| Set up Supabase project + schema | 3 | Create tables, RLS policies, seed data |
| Write Cloudflare Worker (Supabase version) | 5 | Auth middleware, CRUD endpoints, chat proxy |
| Supabase Auth integration (magic links) | 4 | Login page, session management, JWT handling |
| Team management UI | 4 | Invite, remove, role changes, ownership transfer |
| Airtable migration script (if data exists) | 2 | Read Airtable, write Supabase. One-time run. |
| XSS fix — sanitise all innerHTML | 2 | Switch user data rendering to textContent |
| Interview ID generation (server-side) | 1 | Unique sequence via Supabase, no client collision |
| Test pass + fix mobile sidebar toggle | 1 | Add hamburger button for < 768px |

### Phase C — New screens (20–25 hours)

| Task | Hours | Notes |
|------|-------|-------|
| Phase 3: Theme analysis view | 4 | Rank themes by frequency × severity × WTP |
| Phase 3: Segment card composer | 4 | Interactive builder, pull quotes from matrix |
| Phase 3: Kill-list editor | 2 | Append-only table with audit log |
| Phase 3: Top-3 pains template | 2 | One page, three pains, three quotes each |
| Phase 3: "State of the field" editor | 1 | Single editable text block, dated and authored |
| Phase 4: Unit-economics model | 5 | Parametric cells, derived outputs, sensitivity table, break-point indicators |
| Phase 4: Alternate models comparison | 2 | Three models side-by-side |
| Phase 4: Field-check log | 1 | Simple table: assumption, confirmed, by whom |
| Phase 5: Decision memo composer | 3 | Seven-section structure, co-signature workflow |
| Phase 5: MVP scope composer | 1 | Structured single-page form |
| Phase 5: Confirmatory test trackers | 1 | Two trackers: digital + on-ground |
| Long-form interview notes (markdown) | 2 | Textarea with basic markdown rendering |

### Phase D — Editable scripts (8–10 hours)

| Task | Hours | Notes |
|------|-------|-------|
| Migrate hardcoded scripts to Supabase | 2 | Seed the three scripts as version 1 |
| Editable script UI | 3 | Edit sections inline, save creates new version |
| Version history view | 2 | List previous versions, view diff, revert |
| Mobile read optimisation | 1 | Ensure 375px readability for current script |

### Phase E — Assistant tier-up (15–20 hours)

| Task | Hours | Notes |
|------|-------|-------|
| Multi-turn memory (Supabase persistence) | 3 | Chat sessions + messages tables, session picker |
| Tool definitions for Claude | 4 | query_outreach, query_interviews, query_matrix, query_deliverables, query_scripts, propose_action |
| Worker tool execution layer | 4 | Execute tool calls against Supabase, return results |
| Action confirmation UI | 3 | Assistant proposes → user confirms → Worker executes |
| Proactive pattern surfacing | 2 | Detect repeated themes, suggest tags |
| System prompt update | 2 | Embed six-phase plan, brand voice, break-points, tool descriptions |
| Streaming response rendering | 1 | Progressive token display in chat panel |

### Phase F — Reports (10–12 hours)

| Task | Hours | Notes |
|------|-------|-------|
| Report generation tool for Claude | 3 | generate_report with type + parameters |
| Weekly status template | 2 | Single-page, data-driven |
| Phase exit assessment template | 2 | Multi-page, evidence-based |
| Investor briefing template | 2 | 5–8 pages, on-brand charts |
| Decision memo template | 1 | Phase 5 final output, structured |
| Print CSS + save to Supabase | 2 | Print-ready view, version control |

### Phase G — Polish (8–10 hours)

| Task | Hours | Notes |
|------|-------|-------|
| Mobile pass (all new screens) | 3 | Test at 375px, fix layout issues |
| CSV exports | 2 | One function per table |
| Performance audit | 2 | Check load time, bundle size, API call count |
| Final QA + documentation | 2 | Update README, test all flows end-to-end |

**Total: ~85–105 hours.**

---

## What's not in this plan and why

| Feature | Why it's excluded |
|---------|-------------------|
| Real-time collaboration | Two users, async workflow. Overkill. Supabase realtime is available if needed later. |
| Offline mode / write queue | Engineering-heavy for uncertain need. Defer until field use proves it necessary. |
| WhatsApp-style mobile UI | Polish item. Current mobile layout works. Revisit in Phase G if Simon asks for it. |
| Multi-language support | Not needed — both users speak English. |
| Audio transcription integration | Out of scope — the app doesn't process recordings. |
| Custom domain | Young can set this up on Netlify whenever he wants. No code change needed. |
| Public retrospective composer | Included in Phase 5 decision memo as a section. Doesn't need its own screen. |

---

## Monthly cost estimate

| Service | Free tier | Paid tier (if exceeded) |
|---------|-----------|------------------------|
| Supabase | USD 0 (500 MB, 50K MAU) | USD 25/mo |
| Cloudflare Worker | USD 0 (100K req/day) | USD 5/mo |
| Claude API | ~USD 5–15/mo | Depends on usage |
| Netlify | USD 0 (100 GB bandwidth) | USD 19/mo |
| **Total** | **USD 5–15/mo** | **USD 50–65/mo worst case** |

At the current team size (2–4 people), the free tiers will not be exceeded. Claude API is the only real cost, and at ~50–100 assistant queries per week plus occasional report generation, it should stay under USD 15/month.

---

## Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Auth complexity delays Phase B.** Magic links, session handling, RLS policies, ownership transfer — this is the most technically dense phase. If it slips, everything downstream slips. | High | Timebox Phase B auth to 8 hours. Ship with email + magic link only. Don't add password auth or OAuth — they're not needed. |
| **Claude tool use adds latency.** Each tool call is a round-trip: Claude decides to call a tool → Worker executes → result sent back → Claude continues. Multi-tool queries could take 10–15 seconds. | Medium | Limit tool calls to 3 per turn. Pre-build the context snapshot (as today) so most questions don't need tools at all. Tools are for specific queries the snapshot can't answer. |
| **Scope creep on Phase 3–5 screens.** The brief describes rich interactive features (drag-and-drop, co-signature workflows, sensitivity tables). Each could expand beyond the estimate if requirements aren't pinned down. | Medium | Build the simplest version of each screen first. Ship it. Let Young and Simon use it and request changes. Don't over-build on the first pass. |

---

## Time to first deploy

**Phase B (foundation) should be deployable within the first 20–25 hours of work.** This gives Young:

- A working auth flow (magic link login)
- Team management (invite Simon, add an observer later)
- All existing screens working against Supabase instead of Airtable
- XSS fixes and mobile sidebar toggle
- The file split into manageable modules

After Phase B, Young merges to `main` and Netlify deploys. From that point on, every subsequent phase (C, D, E, F, G) is independently deployable — each PR adds a screen or capability without breaking what already works.

---

## Next step

Young reviews this plan and the audit. If approved, I begin Phase B on the `dev` branch. Each logical change gets its own PR for review before merging.
