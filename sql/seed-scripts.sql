-- Seed the three interview scripts as version 1
-- Run after schema.sql and after setting up your first team member

INSERT INTO scripts (script_name, version, content) VALUES
('Patient / caregiver', 1, '[
  {"title": "Open (3 min)", "body": "Thank the person. Promise: no quotes with their name without permission. Ask permission to record."},
  {"title": "Warm-up (5 min)", "body": "\"Walk me through the last time you or your family considered or went through this.\" Anchor in a real, recent story."},
  {"title": "Core: discovery", "body": "How did you first start looking for hospitals abroad? — Probe if they mention WhatsApp or a person."},
  {"title": "Core: trust", "body": "What made you trust one hospital more than another? — Probe if they say \"a friend went there\"."},
  {"title": "Core: friction", "body": "What was the most frustrating moment in the whole process? — Wait through silence."},
  {"title": "Core: money", "body": "If you had to do it again, what would you pay someone to handle for you? — Anchor on the number they give."},
  {"title": "Core: severity", "body": "Was there a moment you nearly gave up? — That moment is the wedge."},
  {"title": "Close (3 min)", "body": "\"Is there anything I should have asked but didn''t?\" · Ask for two specific introductions · Confirm follow-up permission."}
]'::jsonb),

('Hospital IPD', 1, '[
  {"title": "Open (2 min)", "body": "Brief professional intro. Not selling, not asking for referrals. Permission to record."},
  {"title": "Warm-up (3 min)", "body": "\"Tell me how your IPD is structured — who handles East African inquiries?\""},
  {"title": "Core: qualified leads", "body": "What makes a lead from East Africa qualified vs unqualified? — Which document is missing most often?"},
  {"title": "Core: documents", "body": "What information do you need before the medical team will review a case? — Would they pay for cases pre-formatted to that standard?"},
  {"title": "Core: response time", "body": "From first inquiry, how fast do you usually reply, and what slows you down?"},
  {"title": "Core: commissions", "body": "What do you currently pay agents per converted patient? — Does it vary by specialty?"},
  {"title": "Core: SaaS interest", "body": "Would you pay for software that pre-qualifies and packages African cases for you? — What would have to be true?"},
  {"title": "Close (5 min)", "body": "\"Anything I should have asked?\" · \"Who else at the hospital?\" · Follow-up permission."}
]'::jsonb),

('Agent / facilitator', 1, '[
  {"title": "Open (3 min)", "body": "Friendly but specific. Upfront: building patient-side. Their candour matters."},
  {"title": "Warm-up (5 min)", "body": "\"Walk me through your last patient — first call to follow-up at home.\""},
  {"title": "Core: workflow", "body": "Where do you add the most value? — Emotional vs transactional answer = different MVPs."},
  {"title": "Core: pain", "body": "What''s painfully manual? — Quote-chasing or document re-formatting = leverage."},
  {"title": "Core: money", "body": "How do you get paid, and by whom? — Both sides? Ask which resists more."},
  {"title": "Core: adoption", "body": "What would a tool have to do for you to use it daily? — Which feature, removed, kills adoption?"},
  {"title": "Close (3 min)", "body": "Anything missed · Two introductions · Follow-up."}
]'::jsonb);
