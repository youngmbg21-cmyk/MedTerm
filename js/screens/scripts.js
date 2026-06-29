import { h, registerRoute } from '../app.js';

const SCRIPTS = {
  'Patient / caregiver': [
    ['Open (3 min)', 'Thank the person. Promise: no quotes with their name without permission. Ask permission to record.'],
    ['Warm-up (5 min)', '"Walk me through the last time you or your family considered or went through this." Anchor in a real, recent story.'],
    ['Core: discovery', 'How did you first start looking for hospitals abroad? — Probe if they mention WhatsApp or a person.'],
    ['Core: trust', 'What made you trust one hospital more than another? — Probe if they say "a friend went there".'],
    ['Core: friction', 'What was the most frustrating moment in the whole process? — Wait through silence.'],
    ['Core: money', 'If you had to do it again, what would you pay someone to handle for you? — Anchor on the number they give.'],
    ['Core: severity', 'Was there a moment you nearly gave up? — That moment is the wedge.'],
    ['Close (3 min)', '"Is there anything I should have asked but didn\'t?" · Ask for two specific introductions · Confirm follow-up permission.']
  ],
  'Hospital IPD': [
    ['Open (2 min)', 'Brief professional intro. Not selling, not asking for referrals. Permission to record.'],
    ['Warm-up (3 min)', '"Tell me how your IPD is structured — who handles East African inquiries?"'],
    ['Core: qualified leads', 'What makes a lead from East Africa qualified vs unqualified? — Which document is missing most often?'],
    ['Core: documents', 'What information do you need before the medical team will review a case? — Would they pay for cases pre-formatted to that standard?'],
    ['Core: response time', 'From first inquiry, how fast do you usually reply, and what slows you down?'],
    ['Core: commissions', 'What do you currently pay agents per converted patient? — Does it vary by specialty?'],
    ['Core: SaaS interest', 'Would you pay for software that pre-qualifies and packages African cases for you? — What would have to be true?'],
    ['Close (5 min)', '"Anything I should have asked?" · "Who else at the hospital?" · Follow-up permission.']
  ],
  'Agent / facilitator': [
    ['Open (3 min)', 'Friendly but specific. Upfront: building patient-side. Their candour matters.'],
    ['Warm-up (5 min)', '"Walk me through your last patient — first call to follow-up at home."'],
    ['Core: workflow', 'Where do you add the most value? — Emotional vs transactional answer = different MVPs.'],
    ['Core: pain', 'What\'s painfully manual? — Quote-chasing or document re-formatting = leverage.'],
    ['Core: money', 'How do you get paid, and by whom? — Both sides? Ask which resists more.'],
    ['Core: adoption', 'What would a tool have to do for you to use it daily? — Which feature, removed, kills adoption?'],
    ['Close (3 min)', 'Anything missed · Two introductions · Follow-up.']
  ]
};

function renderScripts(page) {
  const tabs = h('div', { class: 'flex gap-2 mb-5 border-b pb-3', style: 'border-color:var(--line-soft);' });
  const content = h('div', { class: 'card p-6 max-w-3xl' });
  let active = Object.keys(SCRIPTS)[0];

  function renderTab() {
    tabs.innerHTML = '';
    Object.keys(SCRIPTS).forEach(name => {
      tabs.appendChild(h('button', { class: `btn ${name === active ? 'btn-primary' : 'btn-line'}`, onclick: () => { active = name; renderTab(); } }, name));
    });
    content.innerHTML = '';
    content.appendChild(h('div', { class: 'serif text-xl mb-4', text: active }));
    SCRIPTS[active].forEach(([title, body]) => {
      const titleEl = h('div', { class: 'micro mb-1', text: title });
      titleEl.style.color = 'var(--clay)';
      content.appendChild(h('div', { class: 'mb-4' }, [
        titleEl,
        h('div', { class: 'text-sm leading-relaxed', text: body })
      ]));
    });
  }
  page.appendChild(tabs);
  page.appendChild(content);
  renderTab();
}

registerRoute('scripts', 'Interview scripts', renderScripts);
