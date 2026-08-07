# HaTi Research

A go-to-market research workspace for two people: **Young** and **Simon**.

It exists to answer the five questions standing between HaTi — a contract lifecycle
management platform for the Kenyan market — and its first paying customers. Those five
questions are set out in [`RESEARCH_BRIEF.md`](RESEARCH_BRIEF.md), and every screen in the
app exists to move one of them.

## Start it

The app is plain HTML, CSS and JavaScript. There is nothing to install and nothing to
build. It does need to be *served* over HTTP rather than opened from the file system,
because browsers refuse to load JavaScript modules from a `file://` address.

From this folder:

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000** in Chrome, Safari or Edge. It works on a phone browser
at 375px wide just as well as on a laptop.

## The loop

Everything in here serves one loop, and the Overview shows it until you hide it:

1. **Line up a company worth talking to** — Prospects
2. **Have the conversation, write it up the same day** — Conversations
3. **Turn what they said into a finding, attached to one of the five questions** — Findings
4. **Read where the five questions now stand, and aim the next conversation at the thinnest
   one** — The five questions

## What is in it

The sidebar is in that order too: the spine first, then the research that feeds it.

| Screen | The one question it answers |
|---|---|
| **Overview** | What should we do today? |
| **The five questions** | What do we still not know, and what would answer it? |
| **Findings** | What have we learned, and what does it change? |
| **Prospects** | Who are we talking to, and who is going cold? |
| **Conversations** | What did people actually tell us? |
| **Pricing** | What will they actually pay, and for what shape? |
| **Competitors** | Who else could they buy instead of us — including nobody? |
| **Market & rules** | What is true about Kenya, and who says so? |

On the list screens each record starts as a single summary line — tap it to open the
detail. Anything the app has flagged opens itself.

The **assistant** (the button at the bottom of the sidebar) reads the whole workspace and
argues with you about it. It can propose things to write down, but nothing is ever saved
without you tapping Confirm.

## Two rules the app enforces

These are what make the workspace worth trusting, and the app will not stop nagging about
either one:

1. **A conversation nobody wrote a finding from is a lost conversation.** Log a
   conversation and it is flagged in red until at least one finding is attached to it.
2. **A fact with no source link is a rumour.** The Market & rules form refuses to save a
   fact without a link to where it came from.

## Where the data lives

Out of the box, everything is saved **in the browser you typed it into**. That means
Young's laptop and Simon's phone would each hold a separate copy. It works immediately,
with no setup, which is why it is the default.

To put both of you on one shared workspace, follow [`HANDOFF.md`](HANDOFF.md). It is three
steps and the app tells you the same thing on the Settings screen.

Whichever mode you are in, **Settings → Download a backup** gives you one file containing
everything. Do that before anything risky, and keep a copy somewhere that is not your
laptop.

## For whoever works on the code next

[`CLAUDE.md`](CLAUDE.md) is the contract: what this project is, the rules that govern every
change, and the design system. Read it before touching anything.
