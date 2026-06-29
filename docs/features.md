# Features — MedTerminal Research Workspace

> Nine screens. One assistant. One file.

This document describes every screen and component in `index.html`. Use it as the definitive reference when adding, changing, or debugging any feature.

---

## Navigation & Routing

- **Hash routing:** Each screen maps to a URL hash — `#dashboard`, `#outreach`, `#interviews`, `#themes`, `#saturation`, `#scripts`, `#templates`, `#manual`, `#decisions`.
- The active nav item is highlighted in the sidebar.
- The sidebar collapses to an icon strip on mobile (< 768px).

---

## The Nine Screens

### 1. Dashboard (`#dashboard`)

The daily glance. Answers: *"Where are we right now?"*

**Components:**
- **4 KPI cards:** Interviews logged / Same-day tagged % / Outreach contacted / Themes surfaced. Each card shows the current value and a trend indicator.
- **Phase progress card:** All six phases listed. Current phase highlighted. Each phase shows its exit criteria as a checklist — criteria tick green as they are met by live data.
- **Recent interviews list:** The last 5 interviews logged, with segment, date, and same-day tag status.
- **"What should I do today?" button:** Opens the AI assistant panel with a pre-filled prompt that triggers a status check against live data.

---

### 2. Outreach (`#outreach`)

The contact tracker. Answers: *"Who have we approached, and where do they stand?"*

**Components:**
- **Filterable, searchable table:** All outreach contacts. Columns: Name / Organisation / Segment / Status / Last contact date / Notes.
- **Status dropdown per row:** Cold → Sent → Replied → Booked → Done → Declined. Changing status writes directly to Airtable via the Worker.
- **Add contact button:** Opens a modal to add a new contact (name, org, segment, channel, notes).
- **Edit modal:** Click any row to edit all fields.
- **Filter bar:** Filter by segment and/or status. Search by name or org.

**Notes for Claude:** Status changes must POST to the Worker immediately — no deferred saves. The status colour chips use the existing `.chip` component class.

---

### 3. Interviews (`#interviews`)

The interview log. Answers: *"What interviews have we done, and are they properly tagged?"*

**Components:**
- **Interview table:** One row per interview. Columns: ID / Date / Segment / Participant (de-identified code) / Same-day tagged? / Notes.
- **Same-day tag flag:** Prominently shown as a green tick or a red warning. This is the most important data quality indicator in the whole app.
- **Add interview modal:** Pre-fills the next sequential ID (INT-001, INT-002…) and today's date. Fields: date, segment, participant code, interviewer (Simon/Amina), notes.
- **Edit modal:** Click any row to edit.

**Notes for Claude:** The same-day tag flag is calculated from the interview date vs the date themes/quotes were first entered for that interview ID. If no quotes exist for an interview logged more than 24 hours ago, it shows red.

---

### 4. Theme Matrix (`#themes`)

The quote bank. Answers: *"What are people actually saying, and what does it mean?"*

**Components:**
- **Quote table:** One row per quote/signal. Columns: Interview ID / Segment / Quote (de-identified) / Theme / Severity (1–3) / Willingness to pay signal (Yes/No/Unclear).
- **Tag chips:** Theme, severity, and WTP tags rendered as coloured `.chip` components inline.
- **Filter bar:** Filter by theme, segment, severity, WTP signal.
- **Add quote modal:** Fields: interview ID (dropdown from logged interviews), segment (auto-fills from interview), quote text, theme (dropdown + free text), severity, WTP.
- **Edit modal:** Click any row to edit.

**Notes for Claude:** This screen accumulates across Phase 2 and becomes the primary data source for Phase 3 sense-making. The AI assistant draws on this data heavily when surfacing themes.

---

### 5. Saturation (`#saturation`)

The phase gate. Answers: *"Are we done with Phase 2?"*

**Components:**
- **Per-segment progress bars:** One bar per segment showing interviews completed vs target. Segments: Patient (8), Caregiver (6), Hospital IPD (5), Agent (5), Clinician (4).
- **Saturation signal:** Each segment shows a status — On track / Approaching saturation / Saturated. Saturation is a qualitative judgement, not just a number — the bar turns amber when within 1–2 of target.
- **Phase 2 exit checklist:** The four exit criteria listed explicitly. Each ticks green when the data supports it.
- **Notes field:** Free-text per segment for saturation notes (e.g. "Hearing same broker complaint repeatedly — may be saturated at 4").

---

### 6. Scripts (`#scripts`)

Read-only interview reference. Answers: *"What do I ask?"*

**Components:**
- **Tabbed view:** Three tabs — Patient/Caregiver / Hospital IPD / Agent.
- Each tab shows the full interview script: intro, questions, probes, closing.
- **Mobile-optimised:** Amina opens this on her phone before an interview. Font size and line spacing must be readable on a 375px screen without zooming.
- Scripts are hard-coded in the HTML. They do not come from Airtable.

---

### 7. Templates (`#templates`)

Outreach message templates. Answers: *"What do I send?"*

**Components:**
- **Six template cards:** One per outreach type/segment variant.
- Each card shows the message text and a **Copy to clipboard** button.
- Templates are hard-coded in the HTML. They are not editable in the UI.

---

### 8. Operating Manual (`#manual`)

Reference documentation. Answers: *"How do we run this research?"*

**Components:**
- Long-form text, rendered as readable prose with headers.
- Sections: Voice rules / The same-day-tag rule (hard rule — no exceptions) / Coordination rhythm / File naming conventions / Privacy practices / Decision rights (who can change what).
- Hard-coded in the HTML. Read-only.

---

### 9. Decisions (`#decisions`)

Phase 3+ only. Currently a placeholder.

**Components:**
- Placeholder card: "This screen activates at Phase 3."
- Will eventually hold: hypotheses derived from Phase 2 themes, validation status, and the final go/no-go recommendation.

---

## The AI Assistant Panel

A slide-out panel from the right edge of the screen. Accessible from:
- The sidebar (assistant icon, always visible)
- The top navigation bar (assistant button)
- The Dashboard "What should I do today?" button

**Components:**
- **Four quick-action buttons:**
  - *Status check* — summarises where the research stands right now
    - *Phase exit check* — assesses whether Phase 2 exit criteria are met
      - *What now?* — recommends the single most important next action
        - *Surface themes* — lists the top 5 strongest signals from the theme matrix, with supporting quotes
        - **Free-form chat input:** Ask anything about the research.
        - **Conversation history:** Shown in the panel. Persists for the session.

        **How it works:**
        1. On any query, the app builds a live context snapshot from in-memory data: interview counts by segment, untagged interview warnings, outreach by status, top theme frequencies, highest-severity high-WTP quotes.
        2. The snapshot + conversation history is sent via POST to the Cloudflare Worker.
        3. The Worker adds the research-director system prompt and forwards to Claude.
        4. Claude's response is streamed back and rendered in the panel.
        5. Claude references specific data points — interview IDs, participant codes, theme names — not generic advice.

        **Notes for Claude:** The context snapshot must always be rebuilt fresh from in-memory state at the moment of the query — never cached. The assistant panel must not block the main UI; it overlays it.
