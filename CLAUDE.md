# CLAUDE.md — MedTerminal Research Workspace

This file is the first thing Claude Code should read. It defines what this project is, what the app does, and the rules that govern every code change.

---

## What This Project Is

`index.html` is a **research workspace** — a single-file browser app used by Simon and Amina to manage a six-phase qualitative research programme. The research programme is investigating whether a patient-side medical tourism platform (for Kenyan patients travelling to India for treatment) is viable enough to build.

**This app is not the MedTerminal product.** It is the tool used to decide whether to build it.

Read `docs/project-overview.md` before making any product or UX decisions.

---

## What the App Does

Nine screens. One AI assistant. One file. ~1,060 lines of vanilla HTML/JS/CSS.

The app:
- Tracks outreach to interview subjects (patients, caregivers, hospital staff, brokers, clinicians)
- - Logs qualitative interviews and enforces same-day tagging
  - - Manages a theme matrix of de-identified quotes tagged by theme, severity, and WTP signal
    - - Shows per-segment saturation progress toward Phase 2 exit criteria
      - - Provides read-only reference: interview scripts, outreach templates, operating manual
        - - Powers a Claude-backed AI assistant that knows the live state of the research
         
          - Read `docs/features.md` for the full screen-by-screen breakdown.
         
          - ---

          ## Who Uses It

          - **Simon** — project lead, strategy, synthesis. Desktop user.
          - - **Amina** — field coordinator in Nairobi. Conducts interviews. Mobile user (375px viewport).
           
            - Both use the app simultaneously. Every screen must work on mobile.
           
            - ---

            ## Core Rules — Never Violate These

            1. **Single file.** Everything lives in `index.html`. Do not split into multiple files or introduce a build system without explicit instruction.
            2. 2. **No frameworks.** Vanilla JavaScript only. No React, Vue, Alpine, or any other JS framework.
               3. 3. **No build tools.** No npm, no Webpack, no Vite. The file opens directly in a browser.
                  4. 4. **Tailwind CDN only.** `<script src="https://cdn.tailwindcss.com">`. No PostCSS pipeline.
                     5. 5. **No direct Claude API calls from the browser.** All Claude calls go through the Supabase Edge Function `claude-proxy`. Data calls use the Supabase JS client with RLS. Never put the Claude API key in the frontend.
                        6. 6. **Use existing CSS variables and component classes.** Check `:root` and `.card`, `.chip`, `.bar-wrap`, `.btn` before creating anything new.
                           7. 7. **Mobile-first.** Design for 375px first. Test at 375px before committing.
                              8. 8. **Respect the same-day-tag rule.** This is the most important data quality mechanism in the app. Never weaken or remove the red warning for untagged interviews.
                                
                                 9. ---
                                
                                 10. ## Architecture in One Paragraph
                                
                                 11. The browser loads `index.html`, which on startup fetches all data from Supabase via the JS client and holds it in memory. Hash routing (`#dashboard`, `#outreach`, etc.) shows and hides screen sections. All data writes go through the Supabase JS client (with RLS). The AI assistant sends a live context snapshot + conversation history to the `claude-proxy` Supabase Edge Function, which reads the Claude API key from the `settings` table, prepends the research-director system prompt, and forwards to Claude. Claude's response returns to the panel.
                                
                                 12. Read `docs/tech-stack.md` for full technical detail and constraints.
                                
                                 13. ---
                                
                                 14. ## File Reference
                                
                                 15. | File | Purpose |
                                 16. |------|---------|
                                 17. | `index.html` | The entire app — HTML, CSS, JS in one file |
                                 18. | `README.md` | Public-facing repository description |
                                 19. | `CLAUDE.md` | This file — start here |
                                 20. | `docs/project-overview.md` | What the research programme is and why |
                                 21. | `docs/features.md` | Every screen and component, in detail |
                                 22. | `docs/tech-stack.md` | Architecture, constraints, development workflow |
                                
                                 23. ---
                                
                                 24. ## Tone & Voice
                                
                                 25. The app's tone is calm, precise, and professional. It is a working tool, not a product demo. UI copy should be direct and functional. The AI assistant speaks in the voice of a senior research director — it references specific data, names specific interview IDs, and gives actionable recommendations, not generic advice.
