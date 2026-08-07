/* Settings — one question: "How is this workspace set up, and how do I back it up?" */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, sectionCard,
  openModal, closeModal, formField, setPageActions, loadAllData,
} from '../app.js';
import {
  DATA_MODE, AI_MODE, SCHEMA_VERSION, getTeam, setTeam, STAGES, CURRENT_STAGE,
} from '../config.js';
import { data, isLocalMode, aiAvailable, KNOWN_TABLES } from '../data.js';

function renderSettings(page) {
  setPageActions();

  /* ---- Who we are ---- */
  const team = getTeam();
  const teamBody = h('div', { class: 'flex flex-col gap-3' }, [
    nameRow('Lead', team.lead, v => setTeam({ lead: v })),
    nameRow('Partner', team.partner, v => setTeam({ partner: v })),
    h('div', { class: 'text-xs t-mute', text: 'These names fill every "who did this" dropdown in the app. Changing one here changes it everywhere; records already saved keep the old name.' }),
  ]);
  page.appendChild(sectionCard('The two of you', 'Names used across the workspace', teamBody));

  /* ---- How it is running ---- */
  const stage = STAGES.find(s => s.n === CURRENT_STAGE) || STAGES[0];
  const modeBody = h('div', { class: 'flex flex-col gap-3' }, [
    row('Where the data lives', isLocalMode
      ? 'This browser only'
      : 'Shared through Supabase — both of you see the same workspace', isLocalMode ? 'gold' : 'green'),
    row('Assistant', aiAvailable ? 'On — through your Supabase function' : 'Off', aiAvailable ? 'green' : 'line'),
    row('Stage', `${stage.n} · ${stage.name}`, 'info'),
    row('Backup format version', String(SCHEMA_VERSION), 'line'),
    isLocalMode ? h('div', { class: 'inset-block' }, [
      h('div', { class: 'micro t-bronze mb-1', text: 'To share this workspace between the two of you' }),
      h('div', { class: 'text-sm', text: 'Right now everything is saved in whichever browser you typed it into — Young\'s laptop and Simon\'s phone would each have their own copy. To put you both on one shared workspace: run sql/schema.sql in Supabase, redeploy the claude-proxy function, then change one word in js/config.js from \'local\' to \'api\'. HANDOFF.md has the steps in order.' }),
    ]) : null,
  ].filter(Boolean));
  page.appendChild(sectionCard('How this is running',
    `Data mode: ${DATA_MODE} · AI mode: ${AI_MODE}`, modeBody));

  /* ---- Backup ---- */
  const backupBody = h('div', { class: 'flex flex-col gap-3' }, [
    h('div', { class: 'text-sm t-soft', text: 'A backup is a single file with everything in it: questions, competitors, prospects, conversations, pricing, facts and findings. Download one before anything risky, and keep one somewhere that is not this laptop.' }),
    h('div', { class: 'flex flex-wrap gap-2' }, [
      h('button', { class: 'btn btn-primary', onclick: exportEverything }, '↓ Download a backup'),
      h('button', { class: 'btn btn-line', onclick: importBackup }, '↑ Restore from a backup'),
    ]),
  ]);
  page.appendChild(sectionCard('Backup and restore', 'One file, everything in it', backupBody));

  /* ---- Storage meter (local mode) ---- */
  const storageCard = sectionCard('Storage', 'How much room is left', h('div', { class: 'text-sm t-mute', text: 'Checking…' }));
  page.appendChild(storageCard);
  data.storageInfo().then(info => {
    const body = storageCard.lastChild;
    body.innerHTML = '';
    if (info.recordsBytes == null) {
      body.appendChild(h('div', { class: 'text-sm t-soft', text: 'Data is stored in Supabase, which has far more room than this app will ever need.' }));
      return;
    }
    const kb = Math.round(info.recordsBytes / 1024);
    const limitKb = Math.round((info.recordsLimit || 0) / 1024);
    const pct = limitKb ? Math.min(100, (kb / limitKb) * 100) : 0;
    body.appendChild(h('div', { class: 'text-sm', text: `${kb} KB of about ${limitKb} KB used by your records.` }));
    const bar = h('div', { class: 'bar-wrap mt-2' }, [h('i')]);
    bar.firstChild.style.width = `${pct}%`;
    if (pct > 80) bar.firstChild.style.background = 'var(--rose)';
    body.appendChild(bar);
    if (pct > 80) body.appendChild(h('div', { class: 'text-sm t-rose mt-2', text: 'Getting full. Download a backup and move to the shared Supabase workspace.' }));
  }).catch(() => {});

  /* ---- Dangerous things, last and quiet ---- */
  if (isLocalMode) {
    const dangerBody = h('div', { class: 'flex flex-col gap-3' }, [
      h('div', { class: 'text-sm t-soft', text: 'Both of these throw away work. Download a backup first — neither can be undone.' }),
      h('div', { class: 'flex flex-wrap gap-2' }, [
        /* Short labels: buttons never wrap, and at 375px the long version of
           the first one ran off the side of the screen. What each one does is
           spelled out in the line underneath, where there is room for it. */
        h('button', { class: 'btn btn-line', onclick: () => confirmWipe('startFresh') }, 'Clear our research'),
        h('button', { class: 'btn btn-line t-rose', onclick: () => confirmWipe('reset') }, 'Reset the workspace'),
      ]),
      h('div', { class: 'text-xs t-mute', text: '"Clear our research" keeps the five questions, the competitor set, the market facts and the pricing ideas, and deletes every prospect, conversation, reaction and finding. "Reset" puts everything back exactly as it arrived.' }),
    ]);
    page.appendChild(sectionCard('Starting over', 'Neither of these can be undone', dangerBody));
  }
}

/* ------------------------------------------------------------ helpers */
function row(label, value, tone) {
  return h('div', { class: 'flex flex-wrap items-center justify-between gap-2 py-2 border-b b-soft' }, [
    h('span', { class: 'text-sm t-soft', text: label }),
    chip(value, tone || 'line'),
  ]);
}

function nameRow(label, value, onSave) {
  const input = h('input', { class: 'input', value: value || '' });
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (v) { onSave(v); renderCurrentRoute(); }
  });
  return h('div', {}, [h('label', { class: 'label', text: label }), input]);
}

async function exportEverything() {
  const tables = {};
  for (const t of KNOWN_TABLES) tables[t] = await data.list(t);
  const dump = {
    app: 'hati-research',
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    tables,
  };
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hati-research-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importBackup() {
  const input = h('input', { type: 'file', accept: 'application/json' });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    let dump;
    try { dump = JSON.parse(await file.text()); }
    catch { alert('That file is not a backup this app can read.'); return; }
    if (dump.app !== 'hati-research') {
      alert('That backup was made by a different app. Restoring it would put the wrong data in here.');
      return;
    }
    if (Number(dump.schema_version) !== SCHEMA_VERSION) {
      alert(`That backup was made by a different version of this app (format ${dump.schema_version}, this app expects ${SCHEMA_VERSION}). Restoring it could scramble your data, so it has been refused.`);
      return;
    }
    const counts = KNOWN_TABLES.map(t => `${(dump.tables?.[t] || []).length} ${t.replace(/_/g, ' ')}`).join(', ');
    const confirmField = formField('Type REPLACE to confirm', 'confirm', 'input', '');
    openModal('Replace everything with this backup?', [
      { key: '_', el: h('div', { class: 'text-sm t-soft mb-3' }, [
        h('div', { text: `The backup holds: ${counts}.` }),
        h('div', { class: 'mt-2', text: 'Everything currently in the workspace will be deleted and replaced. This cannot be undone — download a backup of what is here now if you have not already.' }),
      ]) },
      confirmField,
    ], async (form) => {
      if (form.confirm !== 'REPLACE') { alert('Type REPLACE exactly to confirm.'); return; }
      try {
        await data.importAll(dump);
        closeModal();
        await loadAllData();
        alert('Restored.');
      } catch (e) { alert('Restore failed: ' + e.message); }
    }, 'Replace everything', { danger: true });
  });
  input.click();
}

function confirmWipe(kind) {
  const isReset = kind === 'reset';
  const confirmField = formField('Type ERASE to confirm', 'confirm', 'input', '');
  openModal(isReset ? 'Reset to the starting workspace?' : 'Clear our research?', [
    { key: '_', el: h('div', { class: 'text-sm t-soft mb-3', text: isReset
      ? 'Everything goes back to how it arrived: the five questions, the competitor set, the market facts, the pricing ideas and the starter target list. Every prospect, conversation, reaction and finding you have added is deleted.'
      : 'The five questions, competitors, market facts and pricing ideas stay. Every prospect, contact, conversation, pricing reaction and finding is deleted.' }) },
    confirmField,
  ], async (form) => {
    if (form.confirm !== 'ERASE') { alert('Type ERASE exactly to confirm.'); return; }
    try {
      if (isReset) await data.reset(); else await data.startFresh();
      closeModal();
      await loadAllData();
    } catch (e) { alert('Failed: ' + e.message); }
  }, isReset ? 'Reset' : 'Clear', { danger: true });
}

registerRoute('settings', 'Settings', renderSettings,
  'How is this workspace set up, and how do I back it up?');
