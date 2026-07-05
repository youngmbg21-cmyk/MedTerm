/* Settings — one question: "Who is on the team, and how is the workspace configured?" */
import { registerRoute, renderCurrentRoute, h, chip, loadAllData } from '../app.js';
import { getTeam, setTeam, CURRENT_PHASE, PHASES, DATA_MODE, AI_MODE, SCHEMA_VERSION } from '../config.js';
import { data, isLocalMode, aiAvailable, blobToBase64 } from '../data.js';

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

  /* Data mode */
  const modeCard = h('div', { class: 'card p-6' });
  modeCard.appendChild(h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Data' }));
  modeCard.appendChild(h('div', { class: 'flex items-center gap-2 mb-3' }, [
    h('span', { class: 'text-sm', text: 'Mode:' }),
    chip(DATA_MODE === 'api' ? 'Live backend' : 'Local demo', DATA_MODE === 'api' ? 'sage' : 'info'),
  ]));
  modeCard.appendChild(h('div', { class: 'flex items-center gap-2 mb-3' }, [
    h('span', { class: 'text-sm', text: 'Assistant:' }),
    chip(aiAvailable ? `Connected via worker (AI_MODE '${AI_MODE}')` : 'Off', aiAvailable ? 'sage' : 'line'),
  ]));

  if (isLocalMode) {
    modeCard.appendChild(h('div', { class: 'text-sm mb-4', style: 'color:var(--ink-soft);', text: 'Data lives in this browser and persists across reloads. The assistant works in this mode too — set AI_MODE = \'worker\' in js/config.js once the worker is deployed. For team sync, set DATA_MODE = \'api\' and add the backend secrets — see HANDOFF.md.' }));

    /* Storage meter — the app is the sole repository, so show headroom */
    const meter = h('div', { class: 'mb-4' });
    data.storageInfo().then(info => {
      if (info.recordsBytes != null) {
        const pct = Math.min(100, Math.round((info.recordsBytes / info.recordsLimit) * 100));
        meter.appendChild(h('div', { class: 'flex justify-between text-xs mb-1' }, [
          h('span', { text: 'Records (notes, quotes, contacts)' }),
          h('span', { class: 'num', style: 'color:var(--ink-mute);', text: `${(info.recordsBytes / 1024).toFixed(0)} KB of ~5 MB` }),
        ]));
        const fill = h('i');
        fill.style.width = `${pct}%`;
        if (pct >= 80) fill.style.background = 'var(--honey)';
        meter.appendChild(h('div', { class: 'bar-wrap mb-2' }, [fill]));
      }
      if (info.filesBytes != null) {
        meter.appendChild(h('div', { class: 'text-xs', style: 'color:var(--ink-mute);', text: `Browser storage in use (incl. uploaded files): ${(info.filesBytes / 1024 / 1024).toFixed(1)} MB${info.quota ? ` of ${(info.quota / 1024 / 1024 / 1024).toFixed(1)} GB available` : ''}` }));
      }
    }).catch(() => {});
    modeCard.appendChild(meter);
  } else {
    modeCard.appendChild(h('div', { class: 'text-sm', style: 'color:var(--ink-soft);', text: 'Connected to the live backend. Data is shared across the team and backed up by Supabase.' }));
  }
  wrap.appendChild(modeCard);

  /* Data management — export, import, resets */
  wrap.appendChild(buildDataManagementCard());

  page.appendChild(wrap);
}

function buildDataManagementCard() {
  const card = h('div', { class: 'card p-6' });
  card.appendChild(h('div', { class: 'micro mb-1', style: 'color:var(--ink-mute);', text: 'Data management' }));
  card.appendChild(h('div', { class: 'text-sm mb-4', style: 'color:var(--ink-soft);', text: 'Back up, restore, or reset the workspace. Every export is a single JSON file — every record, full field notes, document text, and uploaded files.' }));

  card.appendChild(h('div', { class: 'flex flex-wrap gap-2 mb-2' }, [
    h('button', { class: 'btn btn-line', onclick: () => exportEverything() }, 'Export everything (backup)'),
  ]));
  card.appendChild(h('div', { class: 'text-xs mb-5', style: 'color:var(--ink-mute);', text: 'Includes binary files (PDFs, images) embedded as base64, so the download is fully self-contained. Do this weekly until the backend is live.' }));

  if (isLocalMode) {
    /* Import */
    card.appendChild(h('div', { class: 'pt-4 border-t', style: 'border-color:var(--line-soft);' }, [
      h('div', { class: 'label mb-1', text: 'Import a backup' }),
      h('div', { class: 'text-xs mb-3', style: 'color:var(--ink-mute);', text: 'Replaces ALL current data with the contents of a previously exported file. Nothing is merged. A safety export of your current data downloads automatically first.' }),
    ]));
    const importInput = h('input', { class: 'input', type: 'file', accept: '.json,application/json' });
    const importMsg = h('div', { class: 'text-xs mt-2', style: 'display:none;' });
    importInput.addEventListener('change', () => handleImportFile(importInput, importMsg));
    card.appendChild(h('div', { class: 'mb-1' }, [importInput]));
    card.appendChild(importMsg);

    /* Resets */
    card.appendChild(h('div', { class: 'pt-4 mt-4 border-t flex flex-wrap gap-2', style: 'border-color:var(--line-soft);' }, [
      h('button', { class: 'btn btn-line', onclick: () => confirmStartFresh() }, 'Start fresh for real fieldwork'),
      h('button', { class: 'btn btn-line', onclick: () => confirmDemoReset() }, 'Reset to demo data'),
    ]));
    card.appendChild(h('div', { class: 'text-xs mt-2', style: 'color:var(--ink-mute);', text: '"Start fresh" wipes every outreach contact, interview, quote, document, and report — but keeps the three stock interview scripts and resets the six phases\' checklist to Not started, ready for real data. "Reset to demo data" restores the original sample research for exploring the app.' }));
  } else {
    card.appendChild(h('div', { class: 'pt-4 border-t text-sm', style: 'border-color:var(--line-soft); color:var(--ink-soft);' }, [
      h('div', { class: 'mb-1' }, [h('strong', { text: 'Import and resets are disabled in live mode.' })]),
      'Data is shared across the whole team on the live backend. Replacing or wiping it from this screen would affect everyone at once, so those operations are deliberately not one click here — they are performed directly against Supabase by whoever administers the backend.',
    ]));
  }

  return card;
}

/* ------------------------------------------------------------
   Export — one JSON file, every table, binary files embedded.
   ------------------------------------------------------------ */
async function exportEverything() {
  const tables = ['outreach', 'interviews', 'matrix', 'deliverables', 'scripts',
    'kill_list', 'field_checks', 'economics', 'segment_cards', 'decision_memos',
    'reports', 'documents', 'hypotheses', 'evidence_links', 'ai_assessments'];
  const dump = { schema_version: SCHEMA_VERSION, app: 'MedTerminal', exported_at: new Date().toISOString(), tables: {} };

  for (const t of tables) {
    dump.tables[t] = await data.list(t).catch(() => []);
  }

  // Embed binary (non-text) documents as base64 so the file is a complete backup.
  // Text-based documents already carry their full content in text_content — no
  // need to duplicate them as base64 too.
  for (const doc of dump.tables.documents || []) {
    if (doc.text_content != null) continue;
    try {
      const blob = await data.getFile(doc.id, doc);
      if (blob && blob.size > 0) {
        doc.file_base64 = await blobToBase64(blob);
        doc.file_mime = blob.type || doc.mime_type;
      }
    } catch { /* best-effort — a missing blob shouldn't fail the whole export */ }
  }

  downloadJson(dump, `medterminal-backup-${new Date().toISOString().slice(0, 10)}.json`);
  return dump;
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------
   Import — validate, preview, typed confirmation, safety export first.
   ------------------------------------------------------------ */
async function handleImportFile(inputEl, msgEl) {
  const file = inputEl.files[0];
  if (!file) return;
  const showError = (t) => { msgEl.style.display = 'block'; msgEl.style.color = 'var(--rose)'; msgEl.textContent = t; };
  msgEl.style.display = 'none';

  let dump;
  try {
    dump = JSON.parse(await file.text());
  } catch {
    showError('That file is not valid JSON.');
    inputEl.value = '';
    return;
  }

  if (dump.app !== 'MedTerminal') {
    showError('This file was not exported from MedTerminal (missing or wrong "app" field). Refusing to import.');
    inputEl.value = '';
    return;
  }
  if (typeof dump.tables !== 'object' || dump.tables == null) {
    showError('This file has no "tables" section — it is not a valid MedTerminal backup.');
    inputEl.value = '';
    return;
  }
  if (dump.schema_version !== SCHEMA_VERSION) {
    showError(`Schema version mismatch: this file is v${dump.schema_version ?? 'unknown'}, this app expects v${SCHEMA_VERSION}. Importing a backup from a different app version could corrupt data, so this has been blocked. Open the file with a matching app version, or ask for help upgrading it.`);
    inputEl.value = '';
    return;
  }

  openImportPreview(dump, file.name, () => { inputEl.value = ''; });
}

function openImportPreview(dump, filename, onDone) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const counts = Object.entries(dump.tables)
    .map(([t, rows]) => [t, Array.isArray(rows) ? rows.length : 0])
    .filter(([, n]) => n > 0);
  const totalRecords = counts.reduce((s, [, n]) => s + n, 0);

  const summary = h('div', { class: 'mb-4 p-3 rounded-lg', style: 'background:var(--bg-soft); border:1px solid var(--line-soft);' }, [
    h('div', { class: 'text-sm font-medium mb-2', text: `${filename} — ${totalRecords} records` }),
    ...counts.map(([t, n]) => h('div', { class: 'flex justify-between text-xs py-0.5' }, [
      h('span', { style: 'color:var(--ink-soft);', text: t }),
      h('span', { class: 'num', style: 'color:var(--ink-mute);', text: String(n) }),
    ])),
  ]);

  const warning = h('div', { class: 'banner banner-honey mb-4' }, [
    h('span', { text: 'This will REPLACE all current data — nothing is merged. A safety export of what you have now downloads automatically before anything is touched.' }),
  ]);

  const confirmInput = h('input', { class: 'input', placeholder: 'Type IMPORT to confirm' });
  const errMsg = h('div', { class: 'text-xs mt-2', style: 'color:var(--rose); display:none;' });

  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    if (confirmInput.value.trim() !== 'IMPORT') {
      errMsg.style.display = 'block';
      errMsg.textContent = 'Type IMPORT exactly (all capitals) to confirm.';
      return;
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Backing up current data…';
    try {
      await exportEverything(); // safety export of what's about to be replaced
      submitBtn.textContent = 'Importing…';
      await data.importAll(dump);
      root.innerHTML = '';
      onDone();
      await loadAllData();
      renderCurrentRoute();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Replace all data';
      errMsg.style.display = 'block';
      errMsg.textContent = 'Import failed: ' + err.message;
    }
  } }, [
    h('div', { class: 'serif text-xl mb-4', text: 'Import backup' }),
    summary,
    warning,
    h('label', { class: 'label', text: 'Confirm' }), confirmInput, errMsg,
    h('div', { class: 'flex gap-3 mt-5 justify-end pt-4 border-t', style: 'border-color:var(--line-soft);' }, [
      h('button', { type: 'button', class: 'btn btn-line', onclick: () => { root.innerHTML = ''; onDone(); } }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Replace all data'),
    ]),
  ]);

  root.appendChild(h('div', { class: 'modal-bg fade-in' }, [h('div', { class: 'modal p-6' }, [form])]));
}

/* ------------------------------------------------------------
   Resets — typed confirmation, safety export first.
   ------------------------------------------------------------ */
function openTypedConfirm({ title, body, word, onConfirm, dangerText }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const confirmInput = h('input', { class: 'input', placeholder: `Type ${word} to confirm` });
  const errMsg = h('div', { class: 'text-xs mt-2', style: 'color:var(--rose); display:none;' });

  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    if (confirmInput.value.trim() !== word) {
      errMsg.style.display = 'block';
      errMsg.textContent = `Type ${word} exactly (all capitals) to confirm.`;
      return;
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Backing up current data…';
    try {
      await exportEverything(); // safety export before any destructive action
      submitBtn.textContent = 'Working…';
      await onConfirm();
      root.innerHTML = '';
      await loadAllData();
      renderCurrentRoute();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = dangerText;
      errMsg.style.display = 'block';
      errMsg.textContent = 'Failed: ' + err.message;
    }
  } }, [
    h('div', { class: 'serif text-xl mb-3', text: title }),
    h('div', { class: 'text-sm mb-4', style: 'color:var(--ink-soft);', text: body }),
    h('label', { class: 'label', text: 'Confirm' }), confirmInput, errMsg,
    h('div', { class: 'flex gap-3 mt-5 justify-end pt-4 border-t', style: 'border-color:var(--line-soft);' }, [
      h('button', { type: 'button', class: 'btn btn-line', onclick: () => { root.innerHTML = ''; } }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, dangerText),
    ]),
  ]);

  root.appendChild(h('div', { class: 'modal-bg fade-in' }, [h('div', { class: 'modal p-6' }, [form])]));
}

function confirmStartFresh() {
  openTypedConfirm({
    title: 'Start fresh for real fieldwork',
    body: 'Wipes every outreach contact, interview, matrix quote, document, report, kill-list entry, field check, economics model, and decision memo. Keeps the three stock interview scripts and resets the six phases\' deliverables checklist to "Not started". A safety export of your current data downloads first. This cannot be undone from within the app.',
    word: 'RESET',
    dangerText: 'Wipe and start fresh',
    onConfirm: () => data.startFresh(),
  });
}

function confirmDemoReset() {
  openTypedConfirm({
    title: 'Reset to demo data',
    body: 'Replaces all current data with the original sample research used to explore the app. A safety export of your current data downloads first.',
    word: 'RESET',
    dangerText: 'Reset to demo data',
    onConfirm: () => data.reset(),
  });
}

registerRoute('settings', 'Settings', renderSettings,
  'Who is on the team, and how is the workspace configured?');
