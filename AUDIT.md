# Audit — MedTerminal Research Workspace

> Written 2026-06-29 as Phase A of the MedTerminal build-out.
> This is an honest assessment of what exists, what works, what doesn't, and what matters.

---

## 1. Is the single-file HTML still the right shape?

**No.** It was right for the prototype — no build step, instant preview, zero tooling overhead. At ~1,060 lines it's still readable. But the brief asks for auth, team management, six new screens, editable scripts with version history, a report engine, and a substantially upgraded AI assistant. That will push the file past 4,000–5,000 lines, and two people editing it simultaneously on GitHub will create constant merge conflicts.

**What it should become:** A small number of vanilla JS modules loaded with `<script type="module">`. No framework. No bundler. Same Tailwind CDN. The structure would look like:

```
index.html          ← shell: nav, header, modal root, chat panel, boot script
css/theme.css       ← extracted :root variables and component classes
js/app.js           ← router, state, API client, helpers
js/screens/*.js     ← one file per screen (dashboard.js, outreach.js, etc.)
js/chat.js          ← assistant panel logic
```

This keeps the "open in browser" workflow. No build step. The cost is a few hours of mechanical extraction — the code already has clear section markers. The risk is low because nothing changes functionally; it's a file-split with no logic changes.

**Recommendation:** Do the split in Phase B, before adding any new screens. If you want to stay single-file longer, Phase B can still work, but Phases C–F will become painful.

---

## 2. Airtable → Supabase migration

### What the migration looks like

1. Design the Supabase schema (8 tables, see PLAN.md).
2. Stand up the Supabase project (free tier, takes 5 minutes).
3. Write a one-time migration script (Node.js or Deno) that reads from the Airtable API and writes to Supabase. This is ~100 lines per table — mechanical work.
4. Update the Cloudflare Worker to call Supabase instead of Airtable. The Worker endpoints stay the same from the frontend's perspective.
5. Update the frontend API client to match any response-shape changes.
6. Verify by loading the app with real data.
7. Remove all Airtable references.

### What could go wrong

- **Field name mismatches.** Airtable uses display names as field keys ("Tagged same-day", "Interview ID"). Supabase uses column names. The Worker will need to map between them, or the frontend will need to update its field references. I'd update the frontend — cleaner long-term.
- **ID format change.** Airtable uses `rec` IDs. Supabase uses UUIDs. The frontend currently uses `r.id` in several places. This is a find-and-replace, but it touches every screen.
- **Empty Airtable.** If there's no data in Airtable yet (the WORKER_URL is still a placeholder), the migration script is unnecessary — just start fresh on Supabase. Worth confirming with Young.

### Right order of operations

1. Schema first, with row-level security policies written at design time.
2. Auth second (Supabase Auth with magic links).
3. Worker updated third.
4. Frontend updated fourth.
5. Migration script runs only if live data exists in Airtable.

---

## 3. What the current chatbot does well — and where it falls short

### What it does well

- **Context snapshot is smart.** It builds a compact summary of the project state — interview counts by segment, untagged warnings, outreach by status, top theme frequencies, high-severity WTP quotes. This is better than dumping raw data into the prompt.
- **Quick actions are well-chosen.** "Status check", "Phase exit check", "What now?", "Surface themes" — these are the four questions the team actually asks every day.
- **The panel doesn't block the UI.** It overlays correctly and the UX is clean.

### Where it falls short

- **Single-turn.** The `chatHistory` array exists in memory but is not persisted. Refresh the page and it's gone. Multi-turn conversations across sessions are not possible.
- **No tool use.** The assistant can only read the pre-built snapshot. It can't query the matrix for specific filters, can't look up a particular interview, can't cross-reference outreach status with interview completion.
- **No actions.** It can't add an interview, update a deliverable, or tag a quote — even with user confirmation.
- **Context snapshot is lossy.** Only the top 8 high-severity WTP quotes are included. Theme frequencies are counts only — the assistant can't see the actual quotes behind a theme unless they happen to be in the top 8.
- **No streaming in the current code.** The `sendChat` function awaits a full response. The Worker may stream, but the frontend renders only after completion.
- **System prompt is invisible.** It lives in the Worker (good for security), but there's no way to inspect or iterate on it from the workspace.

---

## 4. The biggest risk nobody has noticed

**XSS through innerHTML.** The app uses `innerHTML` extensively to render data from Airtable — names, quotes, notes, topics. If any Airtable field contains a `<script>` tag or an `onerror` handler, it executes in the browser. Right now this is low-risk because Simon and Young are the only writers. But with team management and multiple users, this becomes a real vulnerability.

Every place that renders user-supplied data via `.innerHTML` or the `html:` attribute in the `h()` helper needs to be switched to `.textContent` or escaped before rendering. This is ~30 call sites and should be done in Phase B.

**Secondary risk: no optimistic-update rollback.** When a write to Airtable (or later Supabase) fails, the in-memory state may already have been updated. The `alert('Save failed')` fires, but the UI shows the new data as if it saved. A page refresh will correct it, but the user may not know to do that.

---

## 5. What should Young drop or defer?

| Feature | Verdict | Reason |
|---------|---------|--------|
| Real-time collaboration | **Drop** | Two users, async workflow. Supabase realtime is available later if needed, but building for it now adds complexity for no return. |
| Offline mode / write queue | **Defer to Phase G** | Simon uses 4G in Nairobi — it's spotty but not offline. A proper write queue with conflict resolution is substantial engineering. Revisit only if field use proves it necessary. |
| WhatsApp-style mobile experience | **Defer** | The current mobile layout is functional. A WhatsApp-like chat UI is a polish item, not a blocker. |
| Quote-to-segment-card drag workflow | **Defer to Phase C** | Nice UX but not needed until Phase 3. Build the segment card composer first; drag can be added later. |
| Long-form notes per interview (markdown) | **Include in Phase C** | Low effort, high value. Simon needs somewhere to put debrief notes. A markdown textarea with basic rendering is ~2 hours of work. |
| CSV exports of raw data | **Include in Phase G** | Simple and useful for backup or handoff. One function per table. |
| Version history on key text fields | **Include where specified** | Scripts: yes (explicitly required). Segment cards and decision memo: yes (these are collaborative documents). Kill-list: append-only by design, so versioning is inherent. |

---

## 6. Which architecture decision would cost the most to undo?

**The auth and permissions model.** If you get row-level security wrong — or skip it and enforce permissions only in the UI — you'll have to retrofit it later across every table, every Worker endpoint, and every frontend write. Supabase RLS policies should be designed before the first row is written, not bolted on after.

Second most expensive to undo: the interview ID scheme. Currently `INT-001` is generated by counting the in-memory array. With multiple users and concurrent writes, this will collide. Moving to UUIDs later means updating every matrix entry that references an interview ID. Fix this in Phase B: use UUIDs as the primary key and `INT-001` as a human-readable display label generated server-side.

---

## Summary

The prototype is clean, well-structured, and does what it was built to do. The aesthetic and UX are strong. The code is readable and the architecture is simple in the right way. But it's a prototype — it has no auth, no error boundaries, no data safety, and no room to grow in a single file. The path forward is clear: split the file, migrate the data layer, add auth, then build the new screens on a solid foundation.
