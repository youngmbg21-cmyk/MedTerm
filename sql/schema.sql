-- MedTerminal Supabase Schema
-- Run this in the Supabase SQL editor to set up all tables and RLS policies.

-- ============================================================
-- Team members
-- ============================================================
CREATE TABLE team_members (
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

CREATE POLICY "Active members can read all team members"
  ON team_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "Admins and leads can manage team members"
  ON team_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('admin', 'lead')
  ));

-- ============================================================
-- Outreach
-- ============================================================
CREATE TABLE outreach (
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

CREATE POLICY "Active members can read outreach"
  ON outreach FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "Partners and leads can write outreach"
  ON outreach FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

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
CREATE TABLE interviews (
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

CREATE POLICY "Active members can read interviews"
  ON interviews FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "Partners and leads can insert interviews"
  ON interviews FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

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
CREATE SEQUENCE interview_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_interview_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.interview_id IS NULL OR NEW.interview_id = '' THEN
    NEW.interview_id := 'INT-' || LPAD(nextval('interview_id_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_interview_id
  BEFORE INSERT ON interviews
  FOR EACH ROW EXECUTE FUNCTION generate_interview_id();

-- ============================================================
-- Theme matrix
-- ============================================================
CREATE TABLE matrix (
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

CREATE POLICY "Active members can read matrix"
  ON matrix FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "Partners and leads can insert matrix"
  ON matrix FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

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
CREATE TABLE scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content JSONB NOT NULL,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  revert_note TEXT
);

ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active members can read scripts"
  ON scripts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "Partners and leads can insert scripts"
  ON scripts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

-- ============================================================
-- Deliverables
-- ============================================================
CREATE TABLE deliverables (
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

CREATE POLICY "Active members can read deliverables"
  ON deliverables FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "Partners and leads can write deliverables"
  ON deliverables FOR ALL
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

-- ============================================================
-- Audit log (append-only)
-- ============================================================
CREATE TABLE audit_log (
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

CREATE POLICY "Active members can read audit log"
  ON audit_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

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
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  generated_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active members can read reports"
  ON reports FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "Partners and leads can write reports"
  ON reports FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

-- ============================================================
-- Chat sessions and messages
-- ============================================================
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES team_members(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chat sessions"
  ON chat_sessions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.id = chat_sessions.user_id
  ));

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
CREATE TABLE segment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment TEXT NOT NULL,
  content JSONB NOT NULL,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE segment_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active members can read segment_cards" ON segment_cards FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Partners and leads can write segment_cards" ON segment_cards FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

CREATE TABLE kill_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis TEXT NOT NULL,
  evidence TEXT NOT NULL,
  killed_date DATE NOT NULL,
  killed_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kill_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active members can read kill_list" ON kill_list FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Partners and leads can insert kill_list" ON kill_list FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));
-- No UPDATE or DELETE — append-only

-- ============================================================
-- Phase 4: Economics
-- ============================================================
CREATE TABLE economics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  assumptions JSONB NOT NULL,
  derived JSONB,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE economics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active members can read economics" ON economics FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Partners and leads can write economics" ON economics FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

CREATE TABLE field_checks (
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
CREATE POLICY "Active members can read field_checks" ON field_checks FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Partners and leads can write field_checks" ON field_checks FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

-- ============================================================
-- Phase 5: Decision
-- ============================================================
CREATE TABLE decision_memos (
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
CREATE POLICY "Active members can read decision_memos" ON decision_memos FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
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

CREATE TRIGGER set_updated_at BEFORE UPDATE ON outreach FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON matrix FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON economics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON decision_memos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Field documents (added with the sole-repository upgrade)
-- Files themselves live in the PRIVATE Storage bucket
-- 'field-documents' (create it in Dashboard → Storage → New bucket,
-- public OFF). Only the Worker's service key touches the bucket,
-- so no storage.objects policies are required.
-- ============================================================
CREATE TABLE documents (
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

CREATE POLICY "Active members can read documents"
  ON documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "Partners and leads can insert documents"
  ON documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')
  ));

CREATE POLICY "Owner or lead can update documents"
  ON documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    AND (tm.role = 'lead' OR tm.id = documents.created_by)
  ));

CREATE POLICY "Owner or lead can delete documents"
  ON documents FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    AND (tm.role = 'lead' OR tm.id = documents.created_by)
  ));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Decision engine (added with the decision-engine re-architecture)
-- Hypotheses, kill criteria, evidence links, and AI assessments are
-- first-class records. Nothing may hardcode them — the Worker injects
-- them into every prompt from these tables.
-- ============================================================

-- Buyer hypotheses (H1–H3) and kill criteria (K1–K3). One row each.
CREATE TABLE hypotheses (
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
CREATE POLICY "Active members can read hypotheses" ON hypotheses FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Partners and leads can write hypotheses" ON hypotheses FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON hypotheses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- The six the programme ships with (same statements the Worker previously
-- hardcoded in its system prompt — the DB is now the single source of truth).
INSERT INTO hypotheses (code, kind, title, description, status, sort_order) VALUES
  ('H1', 'buyer_hypothesis', 'Family abroad', 'Diaspora children pay for a Nairobi parent''s care.', 'open', 1),
  ('H2', 'buyer_hypothesis', 'Patient or Nairobi family pays', 'The patient or their Nairobi family pays directly for coordination.', 'open', 2),
  ('H3', 'buyer_hypothesis', 'Hospital IPD pays', 'Hospital IPD (International Patient Department) pays for qualified leads or software.', 'open', 3),
  ('K1', 'kill_criterion', 'CAC exceeds revenue', 'CAC per closed case > revenue per case kills the patient-pays model.', 'unknown', 4),
  ('K2', 'kill_criterion', 'Conversion below 15%', 'Consult-to-travelled conversion < 15% kills the patient-pays model.', 'unknown', 5),
  ('K3', 'kill_criterion', 'Service cost above $300', 'Service cost per case > USD 300 kills the patient-pays model.', 'unknown', 6);

-- Evidence links: one row = one piece of evidence bearing on one hypothesis.
CREATE TABLE evidence_links (
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
CREATE POLICY "Active members can read evidence_links" ON evidence_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Partners and leads can insert evidence_links" ON evidence_links FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));
CREATE POLICY "Owner or lead can delete evidence_links" ON evidence_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    AND (tm.role = 'lead' OR tm.id = evidence_links.created_by)
  ));
-- No UPDATE policy — correct a wrong link by deleting and re-creating it.

-- AI assessments: APPEND-ONLY. Never updated, never deleted — the sequence
-- over time is itself evidence (the confidence trajectory).
CREATE TABLE ai_assessments (
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
CREATE POLICY "Active members can read ai_assessments" ON ai_assessments FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Partners and leads can insert ai_assessments" ON ai_assessments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('lead', 'partner')));
-- No UPDATE or DELETE policies — append-only by design.
