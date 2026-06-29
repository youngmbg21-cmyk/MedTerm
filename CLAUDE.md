# CLAUDE.md — MedTerminal Project Instructions

This file tells Claude Code everything it needs to know about MedTerminal before writing a single line of code.

---

## What This Project Is

**MedTerminal** is a patient-side medical tourism platform built for Kenyan families seeking treatment abroad — primarily in India. It is NOT a broker tool, a hospital marketplace, or a lead-generation engine. It is the patient's advocate: one thread, one named coordinator, transparent information, no kickbacks.

Tagline: *"Care abroad — without the guesswork."*

Read `docs/project-overview.md` for the full brief before making any product or UX decisions.

---

## Who You Are Building For

**Primary user:** A Kenyan family (often middle-income, Nairobi-based) with a sick family member who needs treatment — cardiac surgery, oncology, orthopaedics — that is unavailable or unaffordable in Kenya. They are anxious, under-informed, and have likely already been approached by brokers.

**Secondary user:** Amina — the named human coordinator in Nairobi who uses the platform to manage cases on behalf of families.

Design, tone, and UX decisions must always centre the patient family first.

---

## Core Principles — Never Violate These

1. **Patient-side always.** MedTerminal never holds patient money, never receives referral fees from hospitals, and never surfaces a hospital higher because it pays more. If a feature could create a conflict of interest, raise it before building it.

2. **Transparency over conversion.** Show real quotes, real timelines, real success rates — even if they make a hospital look less attractive. Never hide unflattering information to close a deal.

3. **One thread.** The patient experience must feel like one continuous journey, not a series of disconnected forms and emails. Every feature should connect to the patient's case thread.

4. **Human in the loop.** Amina is always visible. The platform supports her — it does not replace her. No automated decision should ever reach the patient without a human review step.

5. **Dignity in design.** Users are dealing with fear, illness, and financial stress. The tone must be calm, clear, and warm. Never clinical or transactional.

---

## Current State of the Codebase

- `index.html` — The main frontend file. Single-file app using Tailwind CSS and Google Fonts (Fraunces + Inter). No backend yet.
- `README.md` — Public-facing project description.
- `CLAUDE.md` — This file.
- `docs/` — Project reference documents.

---

## Technical Rules

- **Keep it a single-file app** (`index.html`) until explicitly told otherwise. Do not split into multiple files or introduce a build system without instruction.
- **Use Tailwind CSS** for all styling. Do not introduce other CSS frameworks.
- **No backend yet.** All state lives in the browser. Use `localStorage` if persistence is needed.
- **Fonts:** Fraunces (headings) and Inter (body) — already loaded via Google Fonts. Do not change these.
- **Colour palette:** Reference the CSS variables already defined in `index.html` (`:root`). Do not introduce new colours without checking against the existing palette first.
- **No external JavaScript libraries** unless explicitly approved. Vanilla JS only.
- **Accessibility matters.** Use semantic HTML. Every interactive element must be keyboard-navigable and have appropriate ARIA labels.
- **Mobile-first.** Design for a 375px screen width first, then scale up.

---

## What To Build Next

See `docs/features.md` for the full feature roadmap, broken down by journey stage.

---

## Tone & Voice

- Calm, clear, warm. Never cold or clinical.
- Plain English. Avoid medical jargon unless it is being explained.
- Address the user as a capable adult making a serious decision, not as a patient to be managed.
- Amina speaks in first person: "I'll walk you through this."

---

## File Reference

| File | Purpose |
|------|---------|
| `index.html` | Main app — all frontend code lives here |
| `README.md` | Project overview for GitHub |
| `CLAUDE.md` | This file — instructions for Claude Code |
| `docs/project-overview.md` | Full project brief, mission, problem, opportunity |
| `docs/features.md` | Feature roadmap by user journey stage |
| `docs/tech-stack.md` | Tech decisions and constraints |
