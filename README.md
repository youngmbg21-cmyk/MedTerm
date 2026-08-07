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
2. **Meet them and fill in the sheet** — the questions written for their kind of company,
   your prices with their real numbers, and what they said, all on one page
3. **Tick which answers mattered** — that attaches them to one of the five questions, and
   you do it on the sheet, in the room
4. **Read where the five questions now stand**, and aim the next meeting at the thinnest one

## What is in it

Four screens you work in:

| Screen | The one question it answers |
|---|---|
| **Overview** | What should we do today? |
| **Prospects** | Who are we talking to, and who is going cold? |
| **Conversations** | What did people actually tell us? |
| **Where we stand** | What do we still not know, and what would answer it? |

And a **Reference** shelf you set up once and visit rarely: all findings, pricing options,
competitors, market & rules.

### The sheet

Tap **+ New sheet**, pick the company, and you get the interview written for their kind of
business — a law firm is asked different things from an insurance broker. Everything about
that meeting goes on that one page:

- the questions, with a note under each on how to ask it
- your priced options, with the real numbers, and a row of buttons for their reaction
- under any answer that matters, one tap to attach it to Q1–Q5 as supporting or challenging

It saves itself as you type, so nothing is lost if the phone rings. The strip at the top
jumps between blocks, because real conversations do not go in order.

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
