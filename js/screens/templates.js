import { h, registerRoute } from '../app.js';

const TEMPLATES = [
  { name: 'Hospital IPD — LinkedIn (cold)', subject: null, body: `Hi [name], I lead a small research project on how East African patients (mostly Kenya → India) experience cross-border care. We're trying to understand what makes a lead qualified or unqualified for an IPD like yours, and where the early-stage friction lives.\n\nI'm not selling anything and not asking for referrals — I am asking for 30 minutes of your perspective. Would you be open?`, ask: '30-minute video call in the next two weeks.' },
  { name: 'Hospital IPD — email (warm intro)', subject: 'Brief research on East African patient flow — 30 min?', body: `Dear [name],\n\n[Mutual contact] suggested I reach out. I'm leading a research project on how Kenyan and East African families navigate care abroad. The bulk of patients still flow to Indian hospitals like yours, and I'm trying to understand the IPD side of that journey — what makes a referral qualified, where time gets lost, what would actually be useful from the African end.\n\nThis is research, not sales. I would value your perspective for 30 minutes. I can work to your time zone.`, ask: '30-minute video call this month.' },
  { name: 'Aggregator (cold)', subject: 'Research on East African medical travel — 30 min for a peer conversation?', body: `Hi [name],\n\nI'm researching how Kenyan families currently navigate medical travel to India. You've been doing this for [X] years and run a substantial African desk — I would value your view of how the market actually works, including where you see gaps that the current model doesn't serve.\n\nI'm not a competitor — we are building patient-side tooling, not a referral business. Happy to share what we learn in return.`, ask: '30-minute peer call in the next two weeks.' },
  { name: 'Diaspora family (Facebook group)', subject: null, body: `Hi everyone — I'm working on a small research project for Kenyan families navigating medical care abroad (mostly India, some Turkey). If you have helped a parent or relative back home through a treatment journey — booking a hospital, sending money, coordinating from a distance — I would love 30 minutes of your time to understand what worked and what was painful.\n\nThis is research, not a service pitch. Your story stays anonymous. Please DM me if you're open.`, ask: '30-minute video call. Reply with a free time.' },
  { name: 'Nairobi agent (Simon, walk-in follow-up)', subject: 'Research on medical-travel facilitation in Kenya', body: `Hi [name],\n\nI was in your office briefly last week. I'm doing research on how the medical-travel business actually works in Kenya — what agents do day-to-day, where the time goes, how the economics flow. I am not a competitor. I'm trying to understand the work before I decide whether to do anything in this space.\n\nWould you be open to 30 minutes? Happy to come to you again — chai included.`, ask: '30-minute in-person conversation at his office.' },
  { name: 'Insurance broker (warm intro)', subject: 'Research on cross-border medical claims — 30 min?', body: `Dear [name],\n\n[Mutual contact] suggested I reach out. I'm researching how Kenyan families navigate medical care abroad — and specifically how insurance fits in (or doesn't). You see a side of this that most people don't: which claims get declined, who travels anyway, and how the financing actually flows.\n\nWould 30 minutes work? I'm not selling anything; I'm trying to understand the market.`, ask: '30-minute video or in-person call.' }
];

function renderTemplates(page) {
  const intro = h('div', { class: 'mb-5 text-sm' });
  intro.style.color = 'var(--ink-soft)';
  intro.appendChild(document.createTextNode('Ready to send with light personalisation. Click '));
  intro.appendChild(h('strong', { text: 'Copy' }));
  intro.appendChild(document.createTextNode(' on any template, then replace [name] / [mutual contact] / [X].'));
  page.appendChild(intro);

  TEMPLATES.forEach(t => {
    const copyBtn = h('button', { class: 'btn btn-line text-xs', onclick: () => {
      const full = (t.subject ? `Subject: ${t.subject}\n\n` : '') + t.body + `\n\nSpecific ask: ${t.ask}`;
      navigator.clipboard.writeText(full);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    }}, 'Copy');

    const children = [
      h('div', { class: 'flex items-baseline justify-between mb-3' }, [
        h('div', { class: 'serif text-lg', text: t.name }),
        copyBtn
      ])
    ];

    if (t.subject) {
      const subEl = h('div', { class: 'text-xs mb-2' });
      subEl.style.color = 'var(--ink-mute)';
      const subLabel = h('strong', { text: 'Subject: ' });
      subLabel.style.color = 'var(--ink-soft)';
      subEl.appendChild(subLabel);
      subEl.appendChild(document.createTextNode(t.subject));
      children.push(subEl);
    }

    children.push(h('div', { class: 'text-sm whitespace-pre-line leading-relaxed', text: t.body }));

    const askEl = h('div', { class: 'mt-3 text-xs' });
    askEl.style.color = 'var(--clay)';
    askEl.appendChild(h('strong', { text: 'Ask: ' }));
    askEl.appendChild(document.createTextNode(t.ask));
    children.push(askEl);

    page.appendChild(h('div', { class: 'card p-6 mb-4 max-w-3xl' }, children));
  });
}

registerRoute('templates', 'Outreach templates', renderTemplates);
