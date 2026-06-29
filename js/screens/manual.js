import { h, registerRoute } from '../app.js';

const MANUAL = [
  { h: 'How this project runs', body: 'Three commitments override anything else:\n• Exits over deadlines. Each phase ends when its exit criteria are met.\n• Distributed by design. Sweden + Kenya. Three short meetings per week hold the team together.\n• Trust beats access. Simon\'s local network is the project\'s biggest strategic asset. No interview is worth a burned relationship.' },
  { h: 'The hard rule', body: 'Every interview gets tagged in the matrix the same day. Untagged interviews are lost interviews. This is the single most common failure mode in distributed research. If a Friday sense-making call finds an interview still untagged, the interview is re-run if needed.' },
  { h: 'Coordination rhythm', body: '• Monday 09:00 SE / 10:00 KE — weekly planning (45 min)\n• Wednesday 09:00 / 10:00 — mid-week checkpoint (30 min)\n• Friday 16:00 / 17:00 — end-of-week sense-making (45 min)\n• Async: shared workspace + dedicated WhatsApp. No question waits more than 24 hours for a written reply.' },
  { h: 'Voice rules', body: 'Direct, warm, honest. Editorial, not corporate. Conservative on claims.\n• Don\'t use "synthesis" — use sense-making.\n• Don\'t use "sprint" — use phase.\n• Avoid "it\'s worth noting", "in conclusion", "leverage" as a verb.\n• Numbers without sources are suspicious. Either cite or hedge.\n• First-use rule: spell out Hospital IPD (International Patient Department) on first appearance.' },
  { h: 'File naming', body: '• Interviews: YYYY-MM-DD_segment_initials_brief-tag (e.g. 2026-07-08_patient_AM_cardiac-mother)\n• Documents: MedTerminal_<Area>_<Version>.<ext>\n• Consent forms: per person, by initials and date. Stored separately from interview content.' },
  { h: 'Privacy and consent', body: '• Verbal consent before any recording. Asked twice for in-person interviews.\n• Personal data lives in encrypted folders. Consent forms stored separately from notes.\n• No medical advice given. Ever.\n• Participants can withdraw at any point.\n• Quotes are de-identified unless explicit written permission was given.' },
  { h: 'Decision rights', body: '• Joint, written, dated: wedge choice, research design, spending, phase exits, final GO / PIVOT / NO-GO.\n• Owned individually: day-to-day execution within each person\'s domain.\n• If we cannot agree on a phase exit, we don\'t vote. We gather the evidence that resolves the disagreement, then revisit.' }
];

function renderManual(page) {
  const wrap = h('div', { class: 'max-w-3xl' });
  MANUAL.forEach(s => {
    const heading = h('div', { class: 'serif text-lg mb-2', text: s.h });
    heading.style.color = 'var(--sage-deep)';
    wrap.appendChild(h('div', { class: 'mb-6' }, [
      heading,
      h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: s.body })
    ]));
  });
  page.appendChild(wrap);
}

registerRoute('manual', 'Operating manual', renderManual);
