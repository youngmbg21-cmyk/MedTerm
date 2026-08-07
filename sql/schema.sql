-- ============================================================
-- HaTi Research — Supabase schema
--
-- Run this in the Supabase SQL editor ONLY when you are ready to move from
-- the local (this-browser) workspace to the shared one. See HANDOFF.md.
--
-- IMPORTANT — what this file deliberately does NOT do:
--   * It never touches your existing `settings` table. That table holds the
--     Claude API key set from admin.html, and the Edge Function reads it from
--     there. Nothing here creates, alters or drops it.
--   * It never drops anything. Every statement is CREATE IF NOT EXISTS, so
--     running it twice is safe and running it will not delete data.
--
-- Access model: the Edge Function talks to these tables with the service
-- role, so it bypasses RLS. RLS is still switched on and written properly,
-- because a table with RLS off is readable by anyone holding the anon key.
-- ============================================================

-- ------------------------------------------------------------
-- Team members — who is allowed into the shared workspace.
-- The Edge Function checks this: a valid login is not enough,
-- you must also be an ACTIVE row here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('lead', 'partner', 'observer', 'admin')) DEFAULT 'partner',
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read the team" ON team_members;
CREATE POLICY "Active members can read the team"
  ON team_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Leads and admins manage the team" ON team_members;
CREATE POLICY "Leads and admins manage the team"
  ON team_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('admin', 'lead')
  ));

-- ------------------------------------------------------------
-- The five questions — the spine. Everything else points here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  ref TEXT,
  short TEXT NOT NULL,
  why_it_matters TEXT,
  would_answer TEXT,
  status TEXT DEFAULT 'Open',
  leaning TEXT,
  leaning_date DATE,
  owner TEXT,
  sort INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- Competitors, and how they change over time.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  hq TEXT,
  positioning TEXT,
  pricing_model TEXT,
  price_notes TEXT,
  strengths TEXT,
  weaknesses TEXT,
  kenya_presence TEXT,
  threat TEXT,
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitor_updates (
  id TEXT PRIMARY KEY,
  competitor_id TEXT REFERENCES competitors(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  source_url TEXT,
  owner TEXT,
  date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitor_updates ON competitor_updates(competitor_id);

-- ------------------------------------------------------------
-- Prospects, the people in them, and what they told us.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  segment TEXT,
  sector TEXT,
  city TEXT,
  size TEXT,
  why_fit TEXT,
  status TEXT DEFAULT 'To contact',
  owner TEXT,
  channel TEXT,
  next_step TEXT,
  next_step_date DATE,
  first_contact DATE,
  last_touch DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_prospect ON contacts(prospect_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  person TEXT,
  person_role TEXT,
  date DATE,
  channel TEXT,
  interviewer TEXT,
  current_tools TEXT,
  main_pain TEXT,
  pain_cost TEXT,
  wtp_signal TEXT,
  wtp_detail TEXT,
  best_quote TEXT,
  notes TEXT,
  -- Answers to the scripted interview questions that do not have a column of
  -- their own, as a JSON object keyed by the question key in js/script.js.
  -- The named columns above stay because the rest of the app and the Edge
  -- Function read them directly; this is only for the segment-specific extras.
  answers TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_prospect ON conversations(prospect_id);

-- ------------------------------------------------------------
-- Pricing: our ideas, and what real prospects said about them.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_ideas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  price_low NUMERIC,
  price_high NUMERIC,
  unit TEXT,
  rationale TEXT,
  risk TEXT,
  status TEXT DEFAULT 'To test',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_reactions (
  id TEXT PRIMARY KEY,
  pricing_idea_id TEXT REFERENCES pricing_ideas(id) ON DELETE CASCADE,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  -- The meeting the price was read out in. Reactions are recorded on the
  -- interview sheet, so there is almost always one.
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  reaction TEXT,
  verbatim TEXT,
  their_number NUMERIC,
  notes TEXT,
  owner TEXT,
  date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reactions_idea ON pricing_reactions(pricing_idea_id);

-- ------------------------------------------------------------
-- Market and regulation facts. source_url is NOT NULL on
-- purpose: a fact without a source is a rumour, and the
-- database should refuse it as firmly as the form does.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_facts (
  id TEXT PRIMARY KEY,
  category TEXT,
  claim TEXT NOT NULL,
  detail TEXT,
  value TEXT,
  source_name TEXT,
  source_url TEXT NOT NULL,
  strength TEXT DEFAULT 'Needs checking',
  affects_question TEXT REFERENCES questions(id) ON DELETE SET NULL,
  checked_on DATE,
  added_on DATE,
  owner TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- Insights — the link between a finding and a question.
-- source_label is kept alongside source_id so an insight still
-- reads correctly if the record it came from is later deleted.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  question_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
  direction TEXT,
  finding TEXT NOT NULL,
  quote TEXT,
  source_kind TEXT,
  source_id TEXT,
  source_label TEXT,
  owner TEXT,
  date DATE,
  source TEXT DEFAULT 'human',   -- 'human' | 'ai_confirmed'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insights_question ON insights(question_id);
CREATE INDEX IF NOT EXISTS idx_insights_source ON insights(source_kind, source_id);

-- ------------------------------------------------------------
-- RLS for every workspace table. One rule, applied uniformly:
-- an active team member can read and write; nobody else can
-- touch anything. Written as a loop so no table is forgotten.
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'questions', 'competitors', 'competitor_updates', 'prospects', 'contacts',
    'conversations', 'pricing_ideas', 'pricing_reactions', 'market_facts', 'insights'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Active members read %s" ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY "Active members read %s" ON %I FOR SELECT
      USING (EXISTS (SELECT 1 FROM team_members tm
                     WHERE tm.user_id = auth.uid() AND tm.status = 'active'))
    $f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Active members write %s" ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY "Active members write %s" ON %I FOR ALL
      USING (EXISTS (SELECT 1 FROM team_members tm
                     WHERE tm.user_id = auth.uid() AND tm.status = 'active'
                     AND tm.role IN ('lead', 'partner', 'admin')))
      WITH CHECK (EXISTS (SELECT 1 FROM team_members tm
                          WHERE tm.user_id = auth.uid() AND tm.status = 'active'
                          AND tm.role IN ('lead', 'partner', 'admin')))
    $f$, t, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Keep updated_at honest without the app having to remember.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'questions', 'competitors', 'competitor_updates', 'prospects', 'contacts',
    'conversations', 'pricing_ideas', 'pricing_reactions', 'market_facts', 'insights'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_touch_%s BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Last step, done by hand: add yourselves to the team.
-- Replace the two email addresses, then run these two lines.
-- Until a row here is 'active', the Edge Function will refuse
-- the request even with a valid login — which is the point.
-- ------------------------------------------------------------
-- INSERT INTO team_members (email, display_name, role, status)
--   VALUES ('you@example.com', 'Young', 'lead', 'active')
--   ON CONFLICT (email) DO UPDATE SET status = 'active';
-- INSERT INTO team_members (email, display_name, role, status)
--   VALUES ('simon@example.com', 'Simon', 'partner', 'active')
--   ON CONFLICT (email) DO UPDATE SET status = 'active';
