/* Settings — one question: "Who is on the team, and how is the workspace configured?" */
import { registerRoute, renderCurrentRoute, h, chip, loadAllData } from '../app.js';
import { getTeam, setTeam, CURRENT_PHASE, PHASES, DATA_MODE } from '../config.js';
import { data, isLocalMode } from '../data.js';

function renderSettings(page) {
  const team = getTeam();
  const wrap = h('div', { class: 'max-w-xl flex flex-col gap-4' });

  /* Team names */
  const teamCard = h('div', { class: 'card p-6' });
  teamCard.appendChild(h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Team' }));
  teamCard.appendChild(h('div', { class: 'text-sm mb-4', style: 'color:var(--ink-soft);', text: 'Display names used everywhere — interviewer and owner dropdowns, and any name shown in the UI. Changes apply immediately.' }));

  const leadInput = h('input', { class: 'input', value: team.lead });
  const fieldInput = h('input', { class: 'input', value: team.field });
  const savedNote = h('span', { class: 'chip chip-sage', text: 'Saved', style: 'display:none;' });

  function save() {
    setTeam({ lead: leadInput.value.trim() || 'Lead', field: fieldInput.value.trim() || 'Field' });
    savedNote.style.display = '';
    setTimeout(() => { savedNote.style.display = 'none'; }, 1500);
  }
  leadInput.addEventListener('change', save);
  fieldInput.addEventListener('change', save);

  teamCard.appendChild(h('div', { class: 'mb-3' }, [
    h('label', { class: 'label', text: 'Project lead (desktop, analysis & synthesis)' }), leadInput,
  ]));
  teamCard.appendChild(h('div', { class: 'mb-3' }, [
    h('label', { class: 'label', text: 'Field coordinator (mobile, runs the interviews)' }), fieldInput,
  ]));
  teamCard.appendChild(savedNote);
  wrap.appendChild(teamCard);

  /* Phase */
  const phase = PHASES.find(p => p.n === CURRENT_PHASE);
  const phaseCard = h('div', { class: 'card p-6' }, [
    h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Current phase' }),
    h('div', { class: 'serif text-lg', text: `Phase ${CURRENT_PHASE} — ${phase?.long || ''}` }),
    h('div', { class: 'text-xs mt-2', style: 'color:var(--ink-mute);', text: 'To advance the phase, edit CURRENT_PHASE in js/config.js. The nav unlocks the matching group automatically.' }),
  ]);
  wrap.appendChild(phaseCard);

  /* Data mode + reset */
  const modeCard = h('div', { class: 'card p-6' });
  modeCard.appendChild(h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Data' }));
  modeCard.appendChild(h('div', { class: 'flex items-center gap-2 mb-3' }, [
    h('span', { class: 'text-sm', text: 'Mode:' }),
    chip(DATA_MODE === 'api' ? 'Live backend' : 'Local demo', DATA_MODE === 'api' ? 'sage' : 'info'),
  ]));
  if (isLocalMode) {
    modeCard.appendChild(h('div', { class: 'text-sm mb-4', style: 'color:var(--ink-soft);', text: 'Data lives in this browser (localStorage) and persists across reloads. To go live with team sync and the AI assistant, set DATA_MODE = \'api\' in js/config.js and add the backend secrets — see HANDOFF.md.' }));
    const resetBtn = h('button', { class: 'btn btn-line', onclick: async () => {
      if (!confirm('Reset all demo data to the original seed? Your local changes will be lost.')) return;
      await data.reset();
      await loadAllData();
      renderCurrentRoute();
    } }, 'Reset demo data');
    modeCard.appendChild(resetBtn);
  } else {
    modeCard.appendChild(h('div', { class: 'text-sm', style: 'color:var(--ink-soft);', text: 'Connected to the live backend. Data is shared across the team.' }));
  }
  wrap.appendChild(modeCard);

  page.appendChild(wrap);
}

registerRoute('settings', 'Settings', renderSettings,
  'Who is on the team, and how is the workspace configured?');
