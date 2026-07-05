/* Scripts — one question: "What exactly do we ask each segment?" (versioned) */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, closeModal, fmtDate,
} from '../app.js';
import { data } from '../data.js';

function groupScripts() {
  const grouped = {};
  STATE.scripts.forEach(s => {
    if (!grouped[s.script_name]) grouped[s.script_name] = [];
    grouped[s.script_name].push(s);
  });
  Object.values(grouped).forEach(versions => versions.sort((a, b) => (b.version || 0) - (a.version || 0)));
  return grouped;
}

let activeScript = null;

function renderScripts(page) {
  const grouped = groupScripts();
  const names = Object.keys(grouped);

  if (!names.length) {
    page.appendChild(h('div', { class: 'card' }, [
      emptyState('No interview scripts yet.', 'Scripts are seeded with demo data — use Reset demo data in Settings if they are missing.'),
    ]));
    return;
  }

  if (!activeScript || !grouped[activeScript]) activeScript = names[0];
  let showHistory = false;

  const tabs = h('div', { class: 'flex flex-wrap gap-2 mb-5 border-b pb-3 b-soft' });
  const content = h('div', { class: 'card max-w-3xl' });

  function renderTab() {
    tabs.innerHTML = '';
    names.forEach(name => {
      tabs.appendChild(h('button', {
        class: `btn ${name === activeScript ? 'btn-primary' : 'btn-line'}`,
        onclick: () => { activeScript = name; showHistory = false; renderTab(); },
      }, name));
    });

    content.innerHTML = '';
    const versions = grouped[activeScript];
    const latest = versions[0];
    const sections = Array.isArray(latest.content) ? latest.content : [];

    content.appendChild(h('div', { class: 'px-6 pt-5 pb-4 flex flex-wrap items-center justify-between gap-2 border-b b-soft' }, [
      h('div', {}, [
        h('div', { class: 'serif text-xl', text: activeScript }),
        h('div', { class: 'text-xs mt-1 t-mute', text: `Version ${latest.version}` }),
      ]),
      h('div', { class: 'flex gap-2' }, [
        h('button', { class: 'btn btn-line text-xs', onclick: () => { showHistory = !showHistory; renderTab(); } },
          showHistory ? 'Hide history' : 'Version history'),
        h('button', { class: 'btn btn-primary text-xs', onclick: () => openScriptEditor(activeScript, latest) }, 'Edit script'),
      ]),
    ]));

    if (showHistory) {
      const hist = h('div', { class: 'px-6 py-4' });
      versions.forEach(v => {
        const isLatest = v === latest;
        hist.appendChild(h('div', { class: 'flex items-center justify-between py-3 border-b text-sm b-soft' }, [
          h('div', {}, [
            h('span', { class: 'font-medium', text: `Version ${v.version}` }),
            isLatest ? h('span', { class: 'chip chip-sage ml-2', text: 'Current' }) : null,
            v.revert_note ? h('div', { class: 'text-xs t-mute', text: v.revert_note }) : null,
            h('div', { class: 'text-xs t-mute', text: v.created_at ? `Saved ${fmtDate(v.created_at)}` : '' }),
          ].filter(Boolean)),
          !isLatest ? h('button', { class: 'btn btn-ghost text-xs', onclick: () => revertToVersion(activeScript, v, latest) }, 'Revert to this') : null,
        ].filter(Boolean)));
      });
      content.appendChild(hist);
    } else {
      const body = h('div', { class: 'px-6 py-5' });
      sections.forEach(s => {
        body.appendChild(h('div', { class: 'mb-4' }, [
          h('div', { class: 'micro mb-1 t-clay', text: s.title || '' }),
          h('div', { class: 'text-sm leading-relaxed', text: s.body || '' }),
        ]));
      });
      content.appendChild(body);
    }
  }

  page.appendChild(tabs);
  page.appendChild(content);
  renderTab();
}

function openScriptEditor(scriptName, latest) {
  const sections = Array.isArray(latest.content) ? [...latest.content] : [];
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const sectionsWrap = h('div');
  function addSectionRow(section) {
    const row = h('div', { class: 'mb-4 p-3 rounded-lg', style: 'background:var(--bg-soft); border:1px solid var(--line-soft);' });
    const titleInput = h('input', { class: 'input mb-2 script-title', type: 'text', value: section.title || '', placeholder: 'Section title (e.g. "Core: discovery")' });
    const bodyInput = h('textarea', { class: 'textarea script-body', rows: '3', placeholder: 'Question text and probes' });
    bodyInput.value = section.body || '';
    row.appendChild(titleInput);
    row.appendChild(bodyInput);
    sectionsWrap.appendChild(row);
  }
  sections.forEach(addSectionRow);

  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const titles = [...form.querySelectorAll('.script-title')];
    const bodies = [...form.querySelectorAll('.script-body')];
    const newContent = titles.map((t, i) => ({ title: t.value, body: bodies[i].value }))
      .filter(s => s.title || s.body);
    try {
      await data.create('scripts', { script_name: scriptName, version: (latest.version || 0) + 1, content: newContent });
      STATE.scripts = await data.list('scripts');
      closeModal();
      renderCurrentRoute();
    } catch (err) { alert('Save failed: ' + err.message); }
  } }, [
    h('div', { class: 'serif text-xl mb-2', text: `Edit: ${scriptName}` }),
    h('div', { class: 'text-xs mb-4 t-mute', text: 'Saving creates a new version. The previous version is preserved.' }),
    sectionsWrap,
    h('div', { class: 'mt-1 mb-4' }, [
      h('button', { type: 'button', class: 'btn btn-line text-xs', onclick: () => addSectionRow({ title: '', body: '' }) }, '+ Add section'),
    ]),
    h('div', { class: 'flex gap-3 mt-5 justify-end pt-4 border-t b-soft' }, [
      h('button', { type: 'button', class: 'btn btn-line', onclick: closeModal }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save new version'),
    ]),
  ]);

  root.appendChild(h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); } }, [
    h('div', { class: 'modal p-6', style: 'max-width:640px;' }, [form]),
  ]));
}

async function revertToVersion(scriptName, versionRecord, latest) {
  if (!confirm(`Revert "${scriptName}" to version ${versionRecord.version}? This creates a new version with the old content.`)) return;
  try {
    await data.create('scripts', {
      script_name: scriptName,
      version: (latest.version || 0) + 1,
      content: versionRecord.content,
      revert_note: `Reverted to version ${versionRecord.version}`,
    });
    STATE.scripts = await data.list('scripts');
    renderCurrentRoute();
  } catch (e) { alert('Revert failed: ' + e.message); }
}

registerRoute('scripts', 'Interview scripts', renderScripts,
  'What exactly do we ask each segment?');
