# Morning report — HaTi Research

**Written overnight, 25–26 July 2026.** Plain English throughout. Nothing below needs a
developer to act on.

---

## The short version

The MedTerminal app is gone. In its place is **HaTi Research** — a workspace for the two of
you to do the business research that gets HaTi its first paying customers.

Before building anything I read the whole HaTi codebase and every document in it, and wrote
up what I found in **`RESEARCH_BRIEF.md`**. That brief is the most useful thing to read
first: what HaTi actually does today, who is likely to buy it, what it could charge, and
the **five questions** standing between it and revenue. Every screen in the new app exists
to answer one of those five.

The app opens, works, and has been tested end to end. It is on the branch
`claude/research-platform-74th0v` and pushed.

---

## What I built

**Nine screens, each answering exactly one question:**

| Screen | What it is for |
|---|---|
| **Overview** | Opens with what is wrong, not what is going well. Overdue next steps, prospects gone quiet, conversations you never wrote up, questions with no evidence. Then the numbers. |
| **The five questions** | The spine. Each question shows the evidence for it, the evidence against it, and where you currently stand — which you write yourself, or ask the assistant to draft and then edit. |
| **Competitors** | Ironclad, Juro, DocuSign, Oneflow — and, at the top of the list on purpose, **the status quo**: a shared drive, email, and a lawyer on retainer. That is the competitor that actually wins these deals. Each one takes dated updates so the map does not go stale. |
| **Market & rules** | Kenyan facts with a source link on every one: the Data Protection Act, e-signature law, stamp duty, market size. |
| **Prospects** | A simple pipeline — To contact → Contacted → Talked → Interested → Pilot → Not a fit. Leads with who has gone quiet and who has no next step written down. |
| **Conversations** | What people actually said, in their words. Logging one automatically moves the prospect to "Talked" and updates their last-touch date. |
| **Pricing** | Four pricing models to test, and what real prospects said about real numbers. Untested ideas sort to the top. |
| **Insights** | Every finding in one place. This is the ledger you argue from. |
| **Settings** | Your names, where the data lives, backup and restore. |

**Two rules the app enforces and will not stop nagging about:**

1. **A conversation nobody wrote a finding from is a lost conversation.** Log one and it
   sits flagged in red until you attach at least one finding to it.
2. **A fact with no source link is a rumour.** The Market & rules form flatly refuses to
   save a fact without a link.

These two are the reason the workspace will still be trustworthy in three months. I would
push back hard on any future change that softens either.

**The assistant** reads the whole workspace and argues with you about it — where the five
questions stand, what to do today, who you have not talked to, whether your pricing is
holding up. It can propose things to write down, but nothing is ever saved without you
tapping Confirm.

**The look** is HaTi's: Space Grotesk headings, Inter for the interface, deep green with a
gold accent. It is one app that works the same on a laptop and on a phone.

---

## What works — and how I know

I ran the app in a real browser and clicked through it, at both phone size (375px) and
laptop size (1280px). All of this was tested and passed:

- Every one of the nine screens loads, at both sizes, with no errors.
- Adding a prospect, adding a person at that prospect, logging a conversation, attaching a
  finding to a question — and the question board immediately showing "1 support".
- Logging a competitor update; recording a pricing reaction (which moves that pricing idea
  from "To test" to "Testing" on its own).
- The market-fact form **refusing** to save a fact with no source link, and saving fine once
  a link is added.
- CSV export from the list screens.
- Downloading a backup, clearing the research, and restoring from the backup — with
  everything coming back.
- Data surviving a page reload.
- The menu drawer, the assistant panel, and the assistant's own button on a phone.

**Two things I could not test**, and you should know it:

- **The live assistant.** Talking to Claude needs your Supabase login and your API key, and
  I have neither. The code path is unchanged from the one that was working before, and the
  key is read from exactly the same place — but I could not press the button and watch a
  reply come back. **Please test this first thing** (open the app, click Assistant, ask it
  anything).
- **Fonts and layout polish.** My sandbox blocks Google Fonts and the styling library the
  app loads from the internet, so I was seeing the app in fallback fonts. On your machine it
  will look better than my screenshots did, not worse — but give it an eye.

---

## What I skipped, and why

**I seeded no fake research.** This is the most important decision I made, so I want to be
explicit. The workspace ships with the five questions, seven competitors, six Kenyan market
facts, four pricing ideas and four suggested target companies. It ships with **zero
conversations, zero findings and zero pricing reactions** — because a research tool that
invents findings is worse than an empty one. The assistant would cite them back to you, and
you would end up arguing about something nobody ever said. The Conversations and Insights
screens will look empty when you open them. That is correct: they are empty because you
have not talked to anybody yet.

**I did not research competitor prices.** Every price field on Ironclad, Juro, DocuSign and
Oneflow says "not verified — open the link and check". I could have written plausible
numbers from memory. Plausible numbers you then price against are worse than a blank you
know is blank. Half an hour with four pricing pages fixes this, and the app has a "log an
update" button waiting for it.

**I removed the separate phone app.** The old project carried two entirely separate
versions of itself — one for laptops, one for phones — about 140,000 characters of
duplicated code. For a two-person tool that is a maintenance trap: every change has to be
made twice. There is now one app that adapts to the screen. Everything is available on both.

**I deleted `worker.js` and `wrangler.toml`.** These were a second, unused copy of the
backend for a service (Cloudflare) you are not using. Your actual backend is the Supabase
function, and it is untouched in the ways that matter.

**I did not touch HaTi itself.** As instructed, I cloned it read-only. Nothing in
`mkataba-clm` was changed.

**The API key setup is exactly as it was.** Same file, same table, same way of loading it. I
added no keys, passwords or secrets anywhere.

---

## How to start it and try it

Open a terminal in the project folder and run:

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser. Leave the terminal window open while
you use the app; close it when you are done.

(You cannot just double-click `index.html` — browsers block it. The command above is the
one-line workaround, and it is in `README.md` too.)

**A ten-minute tour worth taking:**

1. **Overview** — read what it says needs attention. Right now it will tell you all five
   questions have no evidence, which is exactly true.
2. **The five questions** — read Q1 and Q5. These are the two that decide everything else.
3. **Competitors** — scroll to "Shared drive + Word + email" and read the notes on it.
4. **Market & rules** — try adding a fact without a source link, and watch it refuse.
5. **Prospects** — the four listed are placeholders from HaTi's own demo data. Replace one
   with a real company you can get an introduction to.
6. **Assistant** (bottom of the sidebar, or the round button on a phone) — ask it "where do
   we stand?" and see whether it answers. This is the bit I could not test.
7. **Settings → Download a backup.** Do this now and email it to yourself, so you have the
   habit.

---

## Three decisions I need from you

### 1 · The colours and type — which HaTi is the real one?

You told me to match HaTi's design language: **Space Grotesk, Inter, green and gold**. That
is what I built. But the HaTi code I read this evening actually renders in **IBM Plex Sans
with a steel-blue accent** — no Space Grotesk and no green anywhere.

So one of two things is true: either HaTi is being rebranded and the app I read is behind,
or the instruction was from memory. I followed what you told me, because you know your own
brand better than the codebase does — but if HaTi is staying steel-blue, these two tools
will not look like a family, and I should reskin this one. It is a small change: all the
colours and fonts live in one file.

**What I need:** which of the two is HaTi's real identity today?

### 2 · Shared workspace, or stay browser-only?

Right now everything you type is saved **in that browser**. Your laptop and Simon's phone
would each keep a separate copy. That was a deliberate choice so the app would open and
work tonight with nothing to set up.

Moving you both onto one shared workspace takes about twenty minutes and three steps
(they are written out in `HANDOFF.md`): run one SQL file in Supabase, add your two email
addresses to a table, redeploy the assistant function, and change one word in one file.
Two of those steps need your Supabase login, so I cannot do them for you.

**What I need:** do you want to go shared now, or work browser-only for a couple of weeks
first? If shared, I would suggest doing it *before* you log real conversations, so nothing
has to be migrated. My recommendation is to go shared — the moment you both start recording
things, two separate copies becomes a real problem.

### 3 · The branch, and whether you want a pull request

I was told to work on a branch called `research-platform`. The session was set up with a
branch already named `claude/research-platform-74th0v`, and pushing anywhere else without
asking is something I will not do. So the work is on **`claude/research-platform-74th0v`**,
pushed and safe. `main` is untouched.

**What I need:** do you want me to open a pull request into `main`, rename the branch, or
leave it exactly as it is? (I have not opened a PR, because you did not ask for one.)

---

## If you only do three things this week

Not decisions — just what I would do next if this were mine:

1. **Have one conversation.** The whole workspace is preparation until somebody real tells
   you what their contract mess costs them. One conversation, written up the same day, beats
   ten remembered later.
2. **Find out who the Kenyan competitors are.** There is a competitor row that says
   literally "to be identified". Not knowing who else sells contract software into Kenya is
   the biggest hole in the picture, and two phone calls to Nairobi commercial lawyers would
   half-fill it.
3. **Check the four competitor pricing pages** and log what they actually charge. Forty
   minutes, and it turns the whole pricing conversation from guesswork into arithmetic.
