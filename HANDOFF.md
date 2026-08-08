# HANDOFF — running it, and going shared

Written for two people who do not write code. Nothing here needs a developer.

---

## 1 · Running it, every day

From the project folder:

```bash
python3 -m http.server 8000
```

Open **http://localhost:8000**.

That is the whole thing. Leave the command running in the terminal window while you use the
app; close the window when you are done.

**Why not just double-click `index.html`?** Browsers block the kind of JavaScript this app
uses when it is opened straight from a folder. Serving it on a local address is a
one-command workaround, and it is why the command above exists.

---

## 2 · Where your data lives right now

Everything is saved **inside the browser you typed it into** — technically, in something
called local storage. That has three consequences worth knowing:

- Young's laptop and Simon's phone each keep their **own separate copy**. Nothing syncs.
- If you clear your browsing data, the workspace goes with it.
- Nobody else can see it, which is fine while you are getting started.

**So: download a backup regularly.** Settings → *Download a backup* gives you one file with
everything in it — questions, competitors, prospects, conversations, pricing, facts and
findings. Email it to yourself. It takes ten seconds and it is the only safety net local
storage has.

---

## 2b · Turning the assistant on

**Sign-in is currently switched off.** The app never asks you for an account, and the
assistant and the decision brief work straight away. Two things still have to be true:

1. **The tables exist.** Run `sql/schema.sql` in the Supabase SQL editor — Step 1 below.
   Safe to run twice, deletes nothing.
2. **The Claude API key is set.** Tap the HaTi wordmark five times to open the admin page,
   or put it in with SQL:

   ```sql
   insert into settings (key, value, updated_at)
   values ('claude_api_key', 'sk-ant-api03-YOUR-KEY', now())
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```

Then click **Write the first brief**.

### What switching sign-in off costs, and how to put it back

The sign-in was the thing stopping a stranger who finds the site from spending your Claude
credit. With it off, anyone who does can. The key itself is still safe — it never leaves
Supabase and never reaches the browser — but the spending is open. It is a small site
nobody knows about, so the risk is low, not zero.

To turn it back on, when the email problem is sorted:

1. In `supabase/functions/claude-proxy/index.ts`, change `REQUIRE_TEAM_MEMBER = false` to
   `true`, and redeploy the function.
2. In `js/data.js`, the comment marked **SIGN-IN IS OFF** says which one line to restore.
3. Rotate the Claude key on the admin page, in case it was used while open.

Everything the login needs is still in `js/auth.js` — it takes an email and a password as
well as an emailed link, so the two-emails-an-hour cap need never block you again. Set a
password from Supabase → **Authentication** → **Users**.

---

## 3 · Going shared (both of you, one workspace)

Do this when you start having real conversations and it matters that you both see the same
thing. It is three steps and takes about twenty minutes.

### Step 1 — Create the tables in Supabase

1. Go to **supabase.com**, sign in, open your project.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open the file `sql/schema.sql` from this project, copy all of it, paste it in, and press
   **Run**.

It is safe to run twice. It does not delete anything, and it deliberately does not touch
the `settings` table where your Claude API key lives.

### Step 2 — Add yourselves to the team

At the very bottom of `sql/schema.sql` there are two lines that are commented out (they
start with `--`). Copy those two lines into a new SQL query, remove the `--` from the front
of each line, replace the two example email addresses with your real ones, and Run.

This matters: signing in is not enough on its own. The backend checks that your email is on
that list before it will show you anything. That is what keeps the workspace private.

### Step 3 — Redeploy the assistant, then flip the switch

1. **Redeploy the function.** The file
   `supabase/functions/claude-proxy/index.ts` has been rewritten so the assistant knows
   about HaTi rather than the old project. Deploy it the same way you deployed it the first
   time. *(Until you do this, the assistant still works — it just talks about the wrong
   business, and it cannot read the new tables.)*
2. **Flip the switch.** Open `js/config.js` in any text editor. The thirteenth line reads:

   ```js
   export const DATA_MODE = 'local';
   ```

   Change `'local'` to `'api'`, save, and reload the app.

You will now be asked to sign in with your email. Supabase sends you a link; click it and
you are in. From then on, whatever one of you types, the other sees.

**Before you flip the switch**, download a backup — the shared workspace starts empty, and
you can restore your local work into it from Settings → *Restore from a backup*.

---

## 4 · The Claude API key

This has not changed and should not be changed.

The key lives in your Supabase database, in the `settings` table, and only the backend ever
reads it. It is never in the app, never in the browser, never in this repository.

To see or replace it: open the app, **tap the HaTi Research logo in the top-left corner
five times quickly**. That opens the admin page, where you can check the key is active,
replace it, or test the connection.

If the assistant ever says the key is not configured, that page is where you fix it.

---

## 5 · If something goes wrong

**The page is blank or looks unstyled.**
The app loads its fonts and some layout helpers from the internet. On a bad connection it
can look plain for a moment. Reload. If it stays broken, hold Shift and reload — that
forces the browser to stop using an old cached copy.

**"Not authorised" when using the assistant.**
Either your email is not on the team list in Supabase, or it is on the list but has not
been linked to the account you signed in with. Run the `UPDATE team_members` statement at
the very bottom of `sql/schema.sql` — that joins the two. See section 2b.

**The assistant answers about medical tourism, patients, or interviews.**
The Supabase function has not been redeployed yet. See Step 3, part 1.

**You lost data.**
Settings → *Restore from a backup*, and pick your most recent backup file. This is the
reason to download one regularly.

**You want to start over.**
Settings, at the bottom, has two options. *Clear our research* keeps the questions,
competitors, market facts and pricing ideas and deletes everything you have recorded.
*Reset the workspace* puts everything back exactly as it arrived. Both ask you to type a
word to confirm, and neither can be undone — download a backup first.
