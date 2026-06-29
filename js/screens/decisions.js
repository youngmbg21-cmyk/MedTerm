import { h, registerRoute } from '../app.js';

function renderDecisions(page) {
  const title = h('div', { class: 'serif text-2xl mb-3', text: 'Decision tools' });
  const desc = h('div', { class: 'text-sm mb-5', text: 'Wedge brief authoring, kill-list, and decision memo composition.' });
  desc.style.color = 'var(--ink-soft)';
  const phase = h('div', { class: 'micro mb-2', text: 'Activates at Phase 3' });
  phase.style.color = 'var(--clay)';
  const note = h('div', { class: 'text-xs', text: 'For now, use the docx templates from MedTerminal_Phases2to5_Templates.docx and check in here when sense-making begins.' });
  note.style.color = 'var(--ink-mute)';

  page.appendChild(h('div', { class: 'card p-8 max-w-2xl text-center' }, [title, desc, phase, note]));
}

registerRoute('decisions', 'Decisions', renderDecisions);
