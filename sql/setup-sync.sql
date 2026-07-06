-- ============================================================================
-- MedTerminal — ENABLE SHARED SYNC (DATA_MODE = 'api')
--
-- Paste this whole file into the Supabase SQL Editor and Run it. It is SAFE to
-- run on your existing project and safe to run more than once:
--   * every table/policy/trigger uses IF NOT EXISTS / DROP-then-CREATE,
--   * it does NOT touch your 'settings' table (your Claude API key is untouched),
--   * seed rows are only inserted when a table is still empty.
--
-- AFTER running this, do the two things at the very bottom (team members +
-- storage bucket), then tell Claude to flip the app into shared mode.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables, security policies, and the stock hypothesis board
-- ----------------------------------------------------------------------------
-- MedTerminal Supabase Schema
-- Run this in the Supabase SQL editor to set up all tables and RLS policies.

-- ============================================================
-- Team members
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('lead', 'partner', 'observer', 'admin')) DEFAULT 'partner',
  invited_by UUID REFERENCES team_members(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read all team members" ON team_members;
CREATE POLICY "Active members can read all team members"
  ON team_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Admins and leads can manage team members" ON team_members;
CREATE POLICY "Admins and leads can manage team members"
  ON team_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('admin', 'lead')
  ));

-- ============================================================
-- Outreach
-- ============================================================
CREATE TABLE IF NOT EXISTS outreach (
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

ALTER TABLE outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read outreach" ON outreach;
CREATE POLICY "Active members can read outreach"
  ON outreach FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Partners and leads can write outreach" ON outreach;
CREATE POLICY "Partners and leads can write outreach"
  ON outreach FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

DROP POLICY IF EXISTS "Owner or lead can update outreach" ON outreach;
CREATE POLICY "Owner or lead can update outreach"
  ON outreach FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
      AND (tm.role = 'lead' OR tm.id = outreach.created_by)
    )
  );

-- ============================================================
-- Interviews
-- ============================================================
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id TEXT NOT NULL UNIQUE,
  date DATE NOT NULL,
  segment TEXT,
  initials TEXT,
  interviewer TEXT,
  format TEXT,
  recorded TEXT,
  tagged_same_day TEXT DEFAULT 'N',
  brief_topic TEXT,
  link_to_notes TEXT,
  notes_markdown TEXT,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read interviews" ON interviews;
CREATE POLICY "Active members can read interviews"
  ON interviews FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Partners and leads can insert interviews" ON interviews;
CREATE POLICY "Partners and leads can insert interviews"
  ON interviews FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

DROP POLICY IF EXISTS "Owner or lead can update interviews" ON interviews;
CREATE POLICY "Owner or lead can update interviews"
  ON interviews FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
      AND (tm.role = 'lead' OR tm.id = interviews.created_by)
    )
  );

-- Sequence for human-readable interview IDs
CREATE SEQUENCE IF NOT EXISTS interview_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_interview_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.interview_id IS NULL OR NEW.interview_id = '' THEN
    NEW.interview_id := 'INT-' || LPAD(nextval('interview_id_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_interview_id ON interviews;
CREATE TRIGGER set_interview_id
  BEFORE INSERT ON interviews
  FOR EACH ROW EXECUTE FUNCTION generate_interview_id();

-- ============================================================
-- Theme matrix
-- ============================================================
CREATE TABLE IF NOT EXISTS matrix (
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

ALTER TABLE matrix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read matrix" ON matrix;
CREATE POLICY "Active members can read matrix"
  ON matrix FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Partners and leads can insert matrix" ON matrix;
CREATE POLICY "Partners and leads can insert matrix"
  ON matrix FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

DROP POLICY IF EXISTS "Owner or lead can update matrix" ON matrix;
CREATE POLICY "Owner or lead can update matrix"
  ON matrix FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
      AND (tm.role = 'lead' OR tm.id = matrix.created_by)
    )
  );

-- ============================================================
-- Interview scripts (versioned)
-- ============================================================
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content JSONB NOT NULL,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  revert_note TEXT
);

ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read scripts" ON scripts;
CREATE POLICY "Active members can read scripts"
  ON scripts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Partners and leads can insert scripts" ON scripts;
CREATE POLICY "Partners and leads can insert scripts"
  ON scripts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

-- ============================================================
-- Deliverables
-- ============================================================
CREATE TABLE IF NOT EXISTS deliverables (
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

ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read deliverables" ON deliverables;
CREATE POLICY "Active members can read deliverables"
  ON deliverables FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Partners and leads can write deliverables" ON deliverables;
CREATE POLICY "Partners and leads can write deliverables"
  ON deliverables FOR ALL
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

-- ============================================================
-- Audit log (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES team_members(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read audit log" ON audit_log;
CREATE POLICY "Active members can read audit log"
  ON audit_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "System can insert audit entries" ON audit_log;
CREATE POLICY "System can insert audit entries"
  ON audit_log FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

-- No UPDATE or DELETE policies on audit_log — append-only

-- ============================================================
-- Reports
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  generated_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read reports" ON reports;
CREATE POLICY "Active members can read reports"
  ON reports FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Partners and leads can write reports" ON reports;
CREATE POLICY "Partners and leads can write reports"
  ON reports FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

-- ============================================================
-- Chat sessions and messages
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES team_members(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own chat sessions" ON chat_sessions;
CREATE POLICY "Users can manage own chat sessions"
  ON chat_sessions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.id = chat_sessions.user_id
  ));

DROP POLICY IF EXISTS "Users can manage own chat messages" ON chat_messages;
CREATE POLICY "Users can manage own chat messages"
  ON chat_messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM chat_sessions cs
    JOIN team_members tm ON tm.id = cs.user_id
    WHERE cs.id = chat_messages.session_id AND tm.user_id = auth.uid()
  ));

-- ============================================================
-- Phase 3: Sense-making
-- ============================================================
CREATE TABLE IF NOT EXISTS segment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment TEXT NOT NULL,
  content JSONB NOT NULL,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE segment_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read segment_cards" ON segment_cards;
CREATE POLICY "Active members can read segment_cards" ON segment_cards FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
DROP POLICY IF EXISTS "Partners and leads can write segment_cards" ON segment_cards;
CREATE POLICY "Partners and leads can write segment_cards" ON segment_cards FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

CREATE TABLE IF NOT EXISTS kill_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis TEXT NOT NULL,
  evidence TEXT NOT NULL,
  killed_date DATE NOT NULL,
  killed_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kill_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read kill_list" ON kill_list;
CREATE POLICY "Active members can read kill_list" ON kill_list FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
DROP POLICY IF EXISTS "Partners and leads can insert kill_list" ON kill_list;
CREATE POLICY "Partners and leads can insert kill_list" ON kill_list FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));
-- No UPDATE or DELETE — append-only

-- ============================================================
-- Phase 4: Economics
-- ============================================================
CREATE TABLE IF NOT EXISTS economics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  assumptions JSONB NOT NULL,
  derived JSONB,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE economics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read economics" ON economics;
CREATE POLICY "Active members can read economics" ON economics FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
DROP POLICY IF EXISTS "Partners and leads can write economics" ON economics;
CREATE POLICY "Partners and leads can write economics" ON economics FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

CREATE TABLE IF NOT EXISTS field_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption TEXT NOT NULL,
  confirmed BOOLEAN DEFAULT false,
  confirmed_by TEXT,
  confirmed_date DATE,
  notes TEXT,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE field_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read field_checks" ON field_checks;
CREATE POLICY "Active members can read field_checks" ON field_checks FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
DROP POLICY IF EXISTS "Partners and leads can write field_checks" ON field_checks;
CREATE POLICY "Partners and leads can write field_checks" ON field_checks FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

-- ============================================================
-- Phase 5: Decision
-- ============================================================
CREATE TABLE IF NOT EXISTS decision_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER DEFAULT 1,
  content JSONB NOT NULL,
  co_signed_by UUID[],
  co_signed_at TIMESTAMPTZ,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE decision_memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read decision_memos" ON decision_memos;
CREATE POLICY "Active members can read decision_memos" ON decision_memos FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
DROP POLICY IF EXISTS "Partners and leads can write decision_memos" ON decision_memos;
CREATE POLICY "Partners and leads can write decision_memos" ON decision_memos FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

-- ============================================================
-- Updated-at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON outreach;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON outreach FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON interviews;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON matrix;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON matrix FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON deliverables;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON chat_sessions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON segment_cards;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON economics;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON economics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON decision_memos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON decision_memos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Field documents (added with the sole-repository upgrade)
-- Files themselves live in the PRIVATE Storage bucket
-- 'field-documents' (create it in Dashboard → Storage → New bucket,
-- public OFF). Only the Worker's service key touches the bucket,
-- so no storage.objects policies are required.
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  segment TEXT,
  interview_id TEXT REFERENCES interviews(interview_id),
  description TEXT,
  text_content TEXT,          -- text files verbatim; PDFs transcribed on first read
  storage_path TEXT,          -- object key in the field-documents bucket
  uploaded_by TEXT,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can read documents" ON documents;
CREATE POLICY "Active members can read documents"
  ON documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

DROP POLICY IF EXISTS "Partners and leads can insert documents" ON documents;
CREATE POLICY "Partners and leads can insert documents"
  ON documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

DROP POLICY IF EXISTS "Owner or lead can update documents" ON documents;
CREATE POLICY "Owner or lead can update documents"
  ON documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    AND (tm.role = 'lead' OR tm.id = documents.created_by)
  ));

DROP POLICY IF EXISTS "Owner or lead can delete documents" ON documents;
CREATE POLICY "Owner or lead can delete documents"
  ON documents FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    AND (tm.role = 'lead' OR tm.id = documents.created_by)
  ));

DROP TRIGGER IF EXISTS set_updated_at ON documents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Decision engine (added with the decision-engine re-architecture)
-- Hypotheses, kill criteria, evidence links, and AI assessments are
-- first-class records. Nothing may hardcode them — the Worker injects
-- them into every prompt from these tables.
-- ============================================================

-- Buyer hypotheses (H1–H3) and kill criteria (K1–K3). One row each.
CREATE TABLE IF NOT EXISTS hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,                 -- 'H1'..'H3', 'K1'..'K3'
  kind TEXT NOT NULL CHECK (kind IN ('buyer_hypothesis', 'kill_criterion')),
  title TEXT NOT NULL,
  description TEXT,
  -- buyer hypotheses: open / strengthening / weakening / dead
  -- kill criteria:  unknown / holding / breached
  status TEXT NOT NULL DEFAULT 'open',
  status_note TEXT,                          -- why the current status, human-editable
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE hypotheses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read hypotheses" ON hypotheses;
CREATE POLICY "Active members can read hypotheses" ON hypotheses FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
DROP POLICY IF EXISTS "Partners and leads can write hypotheses" ON hypotheses;
CREATE POLICY "Partners and leads can write hypotheses" ON hypotheses FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

DROP TRIGGER IF EXISTS set_updated_at ON hypotheses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hypotheses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- The six the programme ships with (same statements the Worker previously
-- hardcoded in its system prompt — the DB is now the single source of truth).
INSERT INTO hypotheses (code, kind, title, description, status, sort_order) VALUES
  ('H1', 'buyer_hypothesis', 'Family abroad', 'Diaspora children pay for a Nairobi parent''s care.', 'open', 1),
  ('H2', 'buyer_hypothesis', 'Patient or Nairobi family pays', 'The patient or their Nairobi family pays directly for coordination.', 'open', 2),
  ('H3', 'buyer_hypothesis', 'Hospital IPD pays', 'Hospital IPD (International Patient Department) pays for qualified leads or software.', 'open', 3),
  ('K1', 'kill_criterion', 'CAC exceeds revenue', 'CAC per closed case > revenue per case kills the patient-pays model.', 'unknown', 4),
  ('K2', 'kill_criterion', 'Conversion below 15%', 'Consult-to-travelled conversion < 15% kills the patient-pays model.', 'unknown', 5),
  ('K3', 'kill_criterion', 'Service cost above $300', 'Service cost per case > USD 300 kills the patient-pays model.', 'unknown', 6)
ON CONFLICT (code) DO NOTHING;

-- Evidence links: one row = one piece of evidence bearing on one hypothesis.
CREATE TABLE IF NOT EXISTS evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('interview', 'matrix', 'field_check', 'document', 'economics')),
  evidence_id TEXT NOT NULL,                 -- linked record's id (interview_id string for interviews)
  direction TEXT NOT NULL CHECK (direction IN ('supports', 'contradicts', 'neutral')),
  strength TEXT CHECK (strength IN ('strong', 'moderate', 'weak')),
  note TEXT,                                 -- one line: why this evidence bears on this hypothesis
  source TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('human', 'ai_confirmed')),
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE evidence_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read evidence_links" ON evidence_links;
CREATE POLICY "Active members can read evidence_links" ON evidence_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
DROP POLICY IF EXISTS "Partners and leads can insert evidence_links" ON evidence_links;
CREATE POLICY "Partners and leads can insert evidence_links" ON evidence_links FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));
DROP POLICY IF EXISTS "Owner or lead can delete evidence_links" ON evidence_links;
CREATE POLICY "Owner or lead can delete evidence_links" ON evidence_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    AND (tm.role = 'lead' OR tm.id = evidence_links.created_by)
  ));
-- No UPDATE policy — correct a wrong link by deleting and re-creating it.

-- AI assessments: APPEND-ONLY. Never updated, never deleted — the sequence
-- over time is itself evidence (the confidence trajectory).
CREATE TABLE IF NOT EXISTS ai_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'phase_exit', 'weekly')),
  phase INTEGER NOT NULL,                    -- CURRENT_PHASE at generation time
  leaning TEXT NOT NULL CHECK (leaning IN ('GO', 'PIVOT', 'NO-GO', 'INSUFFICIENT')),
  summary_markdown TEXT,                     -- the narrative brief
  per_hypothesis JSONB,                      -- [{hypothesis_code, direction, strength, key_evidence:[{type,id,cite,why}], gaps, what_would_change}]
  breakpoints JSONB,                         -- [{code, status, evidence:[{type,id,cite,why}], note}]
  data_snapshot JSONB,                       -- counts at generation time
  model TEXT,                                -- Claude model used
  created_by UUID REFERENCES team_members(id)
);

ALTER TABLE ai_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read ai_assessments" ON ai_assessments;
CREATE POLICY "Active members can read ai_assessments" ON ai_assessments FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
DROP POLICY IF EXISTS "Partners and leads can insert ai_assessments" ON ai_assessments;
CREATE POLICY "Partners and leads can insert ai_assessments" ON ai_assessments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));
-- No UPDATE or DELETE policies — append-only by design.


-- ----------------------------------------------------------------------------
-- 2. Seed the phase checklist and the interview scripts (only if empty)
-- ----------------------------------------------------------------------------
INSERT INTO deliverables (phase, deliverable, status, evidence)
SELECT v.phase, v.deliverable, v.status, v.evidence FROM (VALUES
  (0, 'Lead''s pre-work completed', 'Not started', ''),
  (0, 'Workspace live, both have written content', 'Not started', ''),
  (0, 'Interview scripts v1 drafted', 'Not started', ''),
  (0, 'Wedge brief signed and dated', 'Not started', ''),
  (0, 'Lead can explain the project unaided', 'Not started', ''),
  (0, 'Lead has flagged ≥2 plan changes', 'Not started', ''),
  (1, 'Target list of 40+ contacts across all segments', 'Not started', ''),
  (1, 'First outreach wave sent (≥15 contacts)', 'Not started', ''),
  (1, '≥8 exploratory interviews completed', 'Not started', ''),
  (1, 'All interviews tagged same-day (hard rule holding)', 'Not started', ''),
  (1, 'Outreach templates tested and refined once', 'Not started', ''),
  (2, '~30 depth interviews across segments', 'Not started', ''),
  (2, 'Saturation reached in ≥4 segments', 'Not started', ''),
  (2, 'Theme matrix ≥80 tagged entries', 'Not started', ''),
  (3, 'Theme ranking completed and reviewed', 'Not started', ''),
  (3, 'Segment cards for all interviewed segments', 'Not started', ''),
  (3, 'Top-3 pains agreed, each with 3+ supporting quotes', 'Not started', ''),
  (3, 'Kill list reviewed — dead hypotheses recorded', 'Not started', ''),
  (3, 'State of the field written and dated', 'Not started', ''),
  (4, 'Unit economics model with agreed assumptions', 'Not started', ''),
  (4, 'Break-point analysis: all three checks evaluated', 'Not started', ''),
  (4, 'Alternate models compared side-by-side', 'Not started', ''),
  (4, 'Fragile assumptions field-checked', 'Not started', ''),
  (5, 'Decision memo drafted (all seven sections)', 'Not started', ''),
  (5, 'Memo co-signed by both team members', 'Not started', ''),
  (5, 'If GO: MVP scope defined ("one of each")', 'Not started', ''),
  (5, 'Confirmatory tests specified with metrics', 'Not started', '')
) AS v(phase, deliverable, status, evidence)
WHERE NOT EXISTS (SELECT 1 FROM deliverables);

INSERT INTO scripts (script_name, version, content)
SELECT v.script_name, v.version, v.content::jsonb FROM (VALUES
  ('Patient', 1, '[{"title":"Open (3 min)","body":"Thank them. Promise: nothing quoted with their name without permission; notes are de-identified (initials only). Ask permission to record. One line on the project: understanding how Kenyan patients arrange treatment in India."},{"title":"Story anchor (5 min)","body":"\"Walk me through the last time you travelled — or seriously considered travelling — for treatment, from the day you knew you needed care abroad.\" Anchor everything that follows in this real story. Get dates, hospital, condition class (no medical detail needed)."},{"title":"Discovery — how the search started","body":"\"How did you first start looking for hospitals abroad?\" Probe: did a doctor first suggest going abroad? WhatsApp groups? A person who had been? Google? A broker who found YOU? Feeds Discovery — doctor referral · WhatsApp/personal · search/online · broker/agent."},{"title":"Trust — how one option won","body":"\"What made you trust one hospital or doctor over another?\" Probe: doctor reputation, accreditation, how fast they replied, whether the price was clear up front. \"Was there anyone you decided NOT to trust — why?\" Feeds Trust — all four tags."},{"title":"Friction — the hardest part","body":"\"What was the most frustrating moment of the whole process?\" Wait through the silence. Probe: chasing quotes, paperwork and reports, language, moving money to India, response delays. Feeds Friction — all five tags."},{"title":"Pain & severity — the near-quit moment","body":"\"Was there a moment you nearly gave up?\" That moment is the wedge. Probe whether the pain was financial, emotional, coordination, or fear about the outcome. Rate severity in your notes 1–5. Feeds Pain — all four tags."},{"title":"Money & true cost (K3 check)","body":"\"Roughly what did the whole coordination cost — agent fees, calls, document couriering, wasted trips — on top of treatment?\" Then: \"If you did it again, what would you PAY someone to take off your plate, and how much?\" Anchor on their number; do not suggest one. Feeds Money — willingness to pay and the $300/case kill check."},{"title":"Buyer — who decided, who paid (H1/H2)","body":"\"Who actually made the final decision to go — and whose money paid for the trip and the help around it?\" Probe: self, spouse, children abroad sending money, extended family in Nairobi. This is the direct H1 vs H2 test — record it verbatim."},{"title":"Aftercare — coming home","body":"\"Walk me through what happened AFTER you landed back in Kenya. Who managed your follow-up?\" Probe: did your Kenyan doctor receive the records from India, or did you carry paper? Where did you turn when something felt wrong? Who paid for follow-up visits? Feeds Aftercare — finding follow-up care · records back home · complications & readmission."},{"title":"Close (3 min)","body":"\"What should I have asked that I didn''t?\" Ask for two specific introductions (another patient, the doctor who first advised them). Confirm permission to follow up. Same-day: tag quotes into the matrix."},{"title":"Requirements check (after the call)","body":"You should now be able to tag: at least one Discovery, one Trust, one Friction, one Pain quote with severity; a WTP answer with a number or a refusal; a clear H1-or-H2 data point; and one Aftercare data point (how follow-up at home was found and handled). If any is missing, note the gap in the interview record."}]'),
  ('Caregiver', 1, '[{"title":"Open (3 min)","body":"Thank them. Acknowledge up front they carried this for someone else — this interview is about THEIR experience, not the patient''s medical detail. De-identification promise, permission to record."},{"title":"Story anchor (5 min)","body":"\"Tell me about the time you organised treatment abroad for your [parent/spouse/relative] — starting from the day you realised local care wasn''t enough.\""},{"title":"Discovery — searching on someone''s behalf","body":"\"How did you look for options — and how was that different because it wasn''t for you?\" Probe: did a doctor plant the idea, who in the family network fed you leads, which WhatsApp groups, whether a broker approached the family. Feeds Discovery tags including doctor referral."},{"title":"Trust — trusting for someone else","body":"\"How did you decide what was safe enough for someone you love?\" Probe: second opinions, accreditation, testimonials from other families, price clarity as a trust signal. \"What almost broke your trust?\" Feeds Trust tags."},{"title":"Friction — coordinating as the proxy","body":"\"What did the coordination actually involve, day to day?\" Probe: collecting reports, translating medical language for the family, chasing quotes across time zones, moving money when the account wasn''t yours. Feeds Friction tags."},{"title":"Pain — the load nobody sees (severity)","body":"\"What was the heaviest moment for YOU, separate from the patient''s health?\" Probe emotional load, family pressure, blame risk if it went wrong, money stress. Severity 1–5 in notes. Feeds Pain — emotional/coordination/financial."},{"title":"Money & decision authority (H1/H2)","body":"\"Who paid for what — and who had the final say when family members disagreed?\" Probe: children abroad vs Nairobi family, whether money arrived as remittances, who a service would have to convince. Then WTP: \"What would the family have paid a trustworthy coordinator, honestly?\" Feeds H1/H2 and Money tags."},{"title":"Kill checks (K2/K3 signal)","body":"\"Did the patient actually travel in the end — and if not, what stopped it?\" (conversion signal for K2). \"What did the arranging itself cost the family?\" (K3 signal)."},{"title":"Aftercare — managing the return","body":"\"Once they were back home, who organised the follow-up care — and what fell on you?\" Probe: chasing records from the Indian hospital, finding a local doctor willing to take over, watching for complications without clinical training, paying for follow-up. Feeds all three Aftercare tags."},{"title":"Close (3 min)","body":"Anything missed · two introductions (another caregiver, the doctor or agent they used) · follow-up permission · same-day tag."},{"title":"Requirements check (after the call)","body":"Must-haves: proxy-decision dynamics (who decides vs who pays — H1/H2), one coordination-pain quote with severity, a WTP number or refusal, the travelled/didn''t-travel outcome, and one Aftercare quote on how the return home was managed."}]'),
  ('Referring doctor', 1, '[{"title":"Open (2 min)","body":"Professional intro. You are researching how Kenyan patients arrange treatment in India; their clinical judgment is why you''re here, and nothing patient-identifying is needed. Not selling. Permission to record."},{"title":"Warm-up (3 min)","body":"\"How often do you see a patient whose condition needs care you''d advise seeking outside Kenya — and what kinds of cases are they?\""},{"title":"The referral moment (Discovery — doctor referral)","body":"\"Walk me through the last case where you told a family to consider India or abroad. What tipped that decision — capability, equipment, waiting time, cost?\" This is the origin of the journey the patient scripts pick up. Feeds Discovery — doctor referral."},{"title":"The handover gap","body":"\"Once you''ve said ''consider going abroad'' — what do you actually give the family? A hospital name? A report? A phone number?\" Probe where their involvement ends and the family is on its own. That gap is the wedge from the clinical side."},{"title":"Documents & case preparation","body":"\"What records do you prepare for a family heading to India — and what do Indian hospitals ask for that''s hard to produce here?\" Cross-checks the Hospital IPD document standard from the origin side. Feeds Friction — paperwork."},{"title":"Trust — whose name goes near it","body":"\"How do you decide which hospitals abroad you''d mention to a patient? What would make you refuse to?\" Probe: outcomes they''ve seen, accreditation, colleagues'' experiences, horror stories. Feeds Trust tags."},{"title":"Referral economics — the honest question","body":"\"Do agents or hospitals ever offer commissions for referrals? How does that work here, honestly?\" Non-judgmental tone; this maps the informal channel. Feeds Money — broker commission."},{"title":"Aftercare — the return handover (core)","body":"\"When a patient comes back from treatment in India, how do you resume their care?\" Probe: do the records ever arrive, in what form and language; who manages complications; have you ever had to guess at what was done abroad? The referring doctor IS the aftercare system — get specifics. Feeds all three Aftercare tags."},{"title":"Channel test — would they refer into a service?","body":"\"If a coordination service packaged your referral properly — full records out, treated patient back with complete notes — would you refer patients into it? What would it have to prove first? Would you expect to be paid?\" Channel and adoption evidence for the wedge."},{"title":"Close (3 min)","body":"Anything missed · two introductions (a family they referred, a colleague who refers often) · follow-up permission · same-day tag."},{"title":"Requirements check (after the call)","body":"Must-haves: the referral trigger and handover-gap quote (Discovery — doctor referral), one records/paperwork friction quote, a commission yes/no with how it works, an aftercare-handback quote (records, complications), and a channel-willingness answer with conditions."}]'),
  ('Hospital IPD', 1, '[{"title":"Open (2 min)","body":"Brief professional intro. You are researching the Kenya→India corridor; not selling, not asking for referrals. Spell out International Patient Department on first use. Permission to record."},{"title":"Warm-up (3 min)","body":"\"Tell me how your IPD is structured — who handles East African inquiries, and how many do you see a month?\""},{"title":"Leads — qualified vs noise","body":"\"What makes an East African lead qualified vs unqualified for you?\" Probe: which document is missing most often, what share of inquiries are complete on arrival. Feeds Trust/Friction from the supply side."},{"title":"Documents & case packaging","body":"\"What must be in the file before your medical team reviews a case?\" Then: \"If cases arrived pre-formatted to that exact standard, what would that be worth to you?\" Direct H3 probe."},{"title":"Response time — the reply gap","body":"\"From first inquiry to your first substantive reply — how long, honestly, and what slows it down?\" Cross-checks the patient-side Friction — slow response theme from the other end."},{"title":"Conversion funnel (K2 check)","body":"\"Of 100 East African inquiries, how many get a treatment plan, how many actually travel, how many complete treatment?\" Get their real funnel numbers — this is the consult-to-travelled conversion evidence for K2."},{"title":"Commissions & economics (K1 context)","body":"\"What do you currently pay agents per converted patient — and does it vary by specialty?\" Probe what that implies about acceptable CAC on the corridor. Feeds Money — broker commission and K1."},{"title":"H3 — would the hospital pay?","body":"\"Would you pay for software or a service that pre-qualifies and packages African cases to your standard? What would have to be true? Who signs that cheque?\" Push past politeness: ask what they REJECTED before and why."},{"title":"Aftercare — discharge across borders","body":"\"What does the patient leave with when they fly home — discharge summary, imaging, a follow-up plan? Who receives it in Kenya?\" Probe: do they ever hear from the home doctor, how complications abroad-of-them get handled, whether tele-follow-up exists. Feeds Aftercare — records back home · complications & readmission."},{"title":"Close (5 min)","body":"\"What should I have asked?\" · \"Who else at the hospital should I talk to?\" · Follow-up permission · same-day tag."},{"title":"Requirements check (after the call)","body":"Must-haves: funnel numbers (K2), agent commission range (K1), the document standard, a direct H3 willingness answer with the decision-maker named, and their discharge/records-home protocol (Aftercare)."}]'),
  ('Aggregator', 1, '[{"title":"Open (3 min)","body":"Peer-to-peer tone — they run or work in a medical-travel platform/aggregator. Honest framing: you are researching the patient side of the corridor; their view of the economics matters. Permission to record."},{"title":"Warm-up (5 min)","body":"\"Walk me through your model — where do patients come from, what happens to a lead, and where do you make money?\""},{"title":"Acquisition & CAC (K1 check)","body":"\"What does it cost you to acquire one patient who actually travels — ads, content, call-centre time, all in?\" This is the single most important number: direct K1 evidence. Probe channel by channel."},{"title":"Conversion (K2 check)","body":"\"Of the leads you touch, what share converts to a travelled patient? Where does the funnel leak worst?\" Direct K2 evidence — get denominators, not vibes."},{"title":"Cost to serve (K3 check)","body":"\"Once a patient says yes, what does it cost you to serve one case end-to-end — people-hours, calls, document handling?\" Direct K3 evidence."},{"title":"What patients actually pay for","body":"\"Where in the journey are patients genuinely willing to pay — and where do they expect free?\" Probe how they charge (hospital commission vs patient fee) and which side resists more. Feeds Money tags and H2."},{"title":"The broken parts","body":"\"What part of the corridor is most broken from where you sit — discovery, trust, documents, money movement, aftercare?\" Feeds Friction/Pain from the operator''s view; compare against patient answers."},{"title":"Aftercare — where the service ends","body":"\"Does your involvement end at the airport? Walk me through what happens to a patient after they land home.\" Probe: is aftercare a cost, a liability, or an unserved revenue line; do families come back asking for follow-up help; who do they hand back to. Feeds Aftercare tags."},{"title":"Competition or partnership","body":"\"If someone built patient-side coordination for this corridor, does that help you or compete with you? What would make you plug into it?\" Reveals the wedge''s room to exist."},{"title":"Close (3 min)","body":"Anything missed · two introductions (a hospital IPD contact, an agent they rate) · follow-up permission · same-day tag."},{"title":"Requirements check (after the call)","body":"Must-haves: a CAC number or range (K1), a funnel conversion figure (K2), a cost-to-serve estimate (K3), who-pays evidence for H2/H3, and where aftercare sits in their model. This segment exists to put numbers under the kill criteria — do not leave without them."}]'),
  ('Agent', 1, '[{"title":"Open (3 min)","body":"Friendly but specific. Be upfront: you are exploring building patient-side coordination; their candour matters more than their pitch. Permission to record."},{"title":"Story anchor (5 min)","body":"\"Walk me through your last patient — from the first phone call to the follow-up after they came home.\" Get the real workflow, step by step."},{"title":"Workflow — where the value sits","body":"\"Where do you personally add the most value?\" An emotional answer (hand-holding, reassurance) and a transactional answer (quotes, visas, transfers) imply different MVPs — note which they lead with."},{"title":"Friction — the manual grind","body":"\"What is painfully manual in your week?\" Probe: chasing hospital quotes, reformatting medical documents, arranging money transfer, visa paperwork. Quote-chasing or document work = leverage for the platform. Feeds Friction tags."},{"title":"Money — who pays whom (K1/H2/H3)","body":"\"How do you get paid — patient side, hospital side, or both? How much per case, and which side resists paying more?\" Feeds Money — broker commission, and the buyer question from the middleman''s seat."},{"title":"Conversion & cost (K2/K3 check)","body":"\"Of the families who reach you, how many actually travel? And how many hours does one case take you, end to end?\" Their conversion and effort-per-case put field numbers under K2 and K3."},{"title":"Trust — how they win families","body":"\"Why do families pick you over searching themselves?\" Probe what trust signals they manufacture (testimonials, hospital relationships, being local). Feeds Trust tags — and shows what a product must replicate."},{"title":"Aftercare — after the flight home","body":"\"What happens between you and the family after the patient lands back in Kenya?\" Probe: do they call you when complications appear, do you chase records from India, is there any follow-up you charge for — or is the relationship simply over? An unserved aftercare need here is wedge evidence. Feeds Aftercare tags."},{"title":"Adoption — the daily-use test","body":"\"What would a tool have to do for you to use it every day? Which single feature, if missing, kills it?\" Also: \"What have you tried and abandoned?\""},{"title":"Close (3 min)","body":"Anything missed · two introductions (a family they served, an IPD contact) · follow-up permission · same-day tag."},{"title":"Requirements check (after the call)","body":"Must-haves: commission structure with numbers (K1), their conversion rate (K2), hours per case (K3), one manual-grind quote with severity, which side of the market pays (H2 vs H3), and what — if anything — they do after the patient returns (Aftercare)."}]'),
  ('Insurance broker', 1, '[{"title":"Open (3 min)","body":"Professional intro. You are researching how Kenyan families finance treatment in India and where insurance fits or fails. Not selling. Permission to record."},{"title":"Warm-up (3 min)","body":"\"What share of your clients ask about cover for treatment abroad — and what do you tell them?\""},{"title":"Coverage reality — the NHIF/private gap","body":"\"When a client needs treatment in India, what does their cover actually pay for — and what falls on the family?\" Probe NHIF limits, private policy exclusions, evacuation-only riders. Feeds Money — insurance and the financial Pain theme."},{"title":"Claims friction","body":"\"Walk me through what happens when someone tries to claim for cross-border treatment. Where does it break?\" Probe pre-authorisation, receipts from Indian hospitals, currency, reimbursement delays. Feeds Friction tags from the finance side."},{"title":"Who actually pays (H1/H2 finance view)","body":"\"In the cases you see, whose money ultimately covers an India trip — savings, harambee, children abroad, loans?\" The broker sees family finance honestly; this is corroborating H1/H2 evidence."},{"title":"Product gap — insurable or not?","body":"\"Could a medical-travel coordination benefit be attached to a policy you sell? Would an insurer underwrite it — and would clients pay the premium?\" Tests an alternate buyer and the Money — insurance theme."},{"title":"Aftercare — cover after the return","body":"\"Once the patient is back in Kenya, does any policy cover the follow-up — reviews, physio, managing complications from surgery done abroad?\" Probe whether complications after foreign treatment are excluded, and what families do when they are. Feeds Aftercare — complications & readmission and Money — insurance."},{"title":"Referral economics","body":"\"Do you ever refer clients to agents or hospitals for treatment abroad? Is there a commission in it for you?\" Reveals whether brokers are a hidden channel — and their price."},{"title":"Close (3 min)","body":"Anything missed · two introductions (a client who travelled, an insurer product manager) · follow-up permission · same-day tag."},{"title":"Requirements check (after the call)","body":"Must-haves: what cover excludes (financial-pain evidence), one claims-friction quote, who-pays corroboration for H1/H2, a yes/no-with-reasons on an insurable coordination product, and whether post-return complications are covered (Aftercare)."}]'),
  ('Diaspora family', 1, '[{"title":"Open (3 min)","body":"Warm intro — they organised or funded care for someone back home from abroad. De-identification promise, permission to record. Acknowledge the distance is the story."},{"title":"Story anchor (5 min)","body":"\"Tell me about the time you helped a parent or relative in Kenya get treatment in India — from the phone call where you first heard, sitting wherever you were in the world.\""},{"title":"Discovery — searching from abroad","body":"\"How did you research options from another country?\" Probe: diaspora Facebook groups, WhatsApp family committees, calling hospitals directly at odd hours, whether the doctor in Kenya suggested it first, whether Kenyan-based relatives fed different information. Feeds Discovery tags and the family-abroad channel."},{"title":"Trust — at a distance (H1 core)","body":"\"How did you decide what to trust when you couldn''t see anything yourself?\" Probe: video calls with doctors, accreditation lookups, who on the ground they trusted as eyes and ears, price clarity as proof of honesty. Feeds Trust tags."},{"title":"Money movement — the transfer maze","body":"\"Walk me through actually getting money to the hospital.\" Probe: bank transfer delays, remittance apps, hawala, sending to a relative first, fees, and the fear of paying the wrong account. Feeds Friction — money transfer; this is usually the sharpest diaspora pain."},{"title":"Control & coordination pain","body":"\"What was the worst part of managing this from far away?\" Probe: information lag, relatives filtering bad news, decisions made without them despite paying, time zones. Severity 1–5. Feeds Pain — emotional/coordination."},{"title":"WTP — the H1 test, directly","body":"\"If a service had handled the hospital search, quotes, documents and payments — with you seeing everything in real time — what would you have paid for that, honestly?\" Anchor their number. Then: \"Who else in the family would have needed to agree?\" This is the primary H1 evidence — record verbatim."},{"title":"Kill checks (K2/K3 signal)","body":"\"Did the trip happen? What nearly stopped it?\" (K2 signal). \"Beyond treatment, what did arranging it all cost — fees, calls, a relative''s travel?\" (K3 signal)."},{"title":"Aftercare — watching recovery from abroad","body":"\"After they returned home, how did you follow the recovery from another country?\" Probe: who found the follow-up doctor, whether records from India reached anyone, how they learned about complications (and how late), whether they would pay for structured follow-up reporting. Feeds all three Aftercare tags — and extends the H1 WTP question past the flight home."},{"title":"Close (3 min)","body":"Anything missed · two introductions (another diaspora buyer, the on-the-ground relative) · follow-up permission · same-day tag."},{"title":"Requirements check (after the call)","body":"Must-haves: a direct WTP number or refusal from the person who actually paid (H1), one money-transfer friction quote, one at-a-distance trust quote, the decision-authority map (payer abroad vs decider in Nairobi), and one Aftercare quote on following recovery from abroad."}]')
) AS v(script_name, version, content)
WHERE NOT EXISTS (SELECT 1 FROM scripts);

-- ----------------------------------------------------------------------------
-- 3. Add your team  << EDIT the names and Simon's email, then this runs >>
--
--    Each person must sign in to the app ONCE first (so Supabase creates their
--    account), then run this section. Re-running it is harmless.
-- ----------------------------------------------------------------------------
INSERT INTO team_members (user_id, email, display_name, role, status, joined_at)
SELECT u.id, u.email, 'Young', 'lead', 'active', now()
FROM auth.users u WHERE u.email = 'youngmbg21@gmail.com'
ON CONFLICT (email) DO UPDATE
  SET user_id = EXCLUDED.user_id, display_name = EXCLUDED.display_name,
      role = EXCLUDED.role, status = 'active';

INSERT INTO team_members (user_id, email, display_name, role, status, joined_at)
SELECT u.id, u.email, 'Simon', 'partner', 'active', now()
FROM auth.users u WHERE u.email = 'SIMON-EMAIL-HERE@example.com'   -- << CHANGE THIS
ON CONFLICT (email) DO UPDATE
  SET user_id = EXCLUDED.user_id, display_name = EXCLUDED.display_name,
      role = EXCLUDED.role, status = 'active';

-- ----------------------------------------------------------------------------
-- 4. Storage for uploaded field documents (do this in the dashboard, not here):
--    Dashboard -> Storage -> New bucket -> name it exactly:  field-documents
--    Leave "Public bucket" OFF. The edge function reaches it with the service key.
-- ----------------------------------------------------------------------------
