/* Saturation — one question: "Which segments have we heard enough from?" */
import { STATE, registerRoute, h, progressBar } from '../app.js';
import { SEGMENTS } from '../config.js';

function renderSaturation(page) {
  const cards = h('div', { class: 'grid md:grid-cols-2 gap-4' });

  SEGMENTS.forEach(seg => {
    const done = STATE.interviews.filter(r => r.segment === seg.name).length;
    const pct = Math.min(100, Math.round((done / seg.target) * 100));
    const status = done >= seg.target ? 'Saturating' : done >= seg.target / 2 ? 'In progress' : 'Just starting';
    const color = done >= seg.target ? 'var(--sage)' : done >= seg.target / 2 ? 'var(--honey)' : 'var(--line)';

    cards.appendChild(h('div', { class: 'card p-5' }, [
      h('div', { class: 'flex items-baseline justify-between mb-2' }, [
        h('div', { class: 'serif text-base', text: seg.name }),
        h('div', { class: 'text-xs num', style: 'color:var(--ink-mute);', text: `${done} / ${seg.target}` }),
      ]),
      h('div', { class: 'mb-3' }, [progressBar(pct, color)]),
      h('div', { class: 'text-xs', style: 'color:var(--ink-mute);', text: status }),
    ]));
  });
  page.appendChild(cards);

  const note = h('div', { class: 'card-soft p-5 mt-5 text-sm', style: 'color:var(--ink-soft);' }, [
    h('strong', { text: 'How to read this: ' }),
    'a segment “saturates” when the last three interviews surface 0–1 new themes each. Counts here are necessary but not sufficient — check the matrix for whether new themes are still emerging.',
  ]);
  page.appendChild(note);
}

registerRoute('saturation', 'Saturation', renderSaturation,
  'Which segments have we heard enough from — and which are thin?');
