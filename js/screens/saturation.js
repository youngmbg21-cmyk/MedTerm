import { STATE, h, registerRoute } from '../app.js';

function renderSaturation(page) {
  const targets = { Patient: 8, Caregiver: 6, 'Hospital IPD': 5, Aggregator: 3, Agent: 4, 'Insurance broker': 2, 'Diaspora family': 4 };
  const cards = h('div', { class: 'grid md:grid-cols-2 gap-4' });

  Object.entries(targets).forEach(([seg, target]) => {
    const done = STATE.interviews.filter(r => r.fields?.Segment === seg).length;
    const pct = Math.min(100, Math.round((done / target) * 100));
    const status = done >= target ? 'Saturating' : done >= target * 0.5 ? 'In progress' : 'Just starting';
    const barColor = done >= target ? 'var(--sage)' : done >= target * 0.5 ? 'var(--honey)' : 'var(--clay)';

    const statusEl = h('div', { class: 'text-xs', text: status });
    statusEl.style.color = 'var(--ink-mute)';
    const countEl = h('div', { class: 'text-xs num', text: `${done} / ${target}` });
    countEl.style.color = 'var(--ink-mute)';

    cards.appendChild(h('div', { class: 'card p-5' }, [
      h('div', { class: 'flex items-baseline justify-between mb-2' }, [
        h('div', { class: 'serif text-base', text: seg }),
        countEl
      ]),
      h('div', { class: 'bar-wrap mb-3' }, [h('i', { style: `width:${pct}%; background: ${barColor};` })]),
      statusEl
    ]));
  });
  page.appendChild(cards);

  const note = h('div', { class: 'card-soft p-5 mt-5 text-sm' });
  note.style.color = 'var(--ink-soft)';
  const strong = h('strong', { text: 'How to read this: ' });
  note.appendChild(strong);
  note.appendChild(document.createTextNode('a segment "saturates" when the last three interviews surface 0–1 new themes each. Counts here are necessary but not sufficient. Use the assistant — "Surface themes" — to check whether new themes are still emerging.'));
  page.appendChild(note);
}

registerRoute('saturation', 'Saturation', renderSaturation);
