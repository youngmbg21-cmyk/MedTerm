import { STATE, h, esc, api, openModal, closeModal, formField, renderCurrentRoute, registerRoute } from '../app.js';

const FALLBACK_SCRIPTS = {
  'Patient / caregiver': [
    { title: 'Open (3 min)', body: 'Thank the person. Promise: no quotes with their name without permission. Ask permission to record.' },
    { title: 'Warm-up (5 min)', body: '"Walk me through the last time you or your family considered or went through this." Anchor in a real, recent story.' },
    { title: 'Core: discovery', body: 'How did you first start looking for hospitals abroad? — Probe if they mention WhatsApp or a person.' },
    { title: 'Core: trust', body: 'What made you trust one hospital more than another? — Probe if they say "a friend went there".' },
    { title: 'Core: friction', body: 'What was the most frustrating moment in the whole process? — Wait through silence.' },
    { title: 'Core: money', body: 'If you had to do it again, what would you pay someone to handle for you? — Anchor on the number they give.' },
    { title: 'Core: severity', body: 'Was there a moment you nearly gave up? — That moment is the wedge.' },
    { title: 'Close (3 min)', body: '"Is there anything I should have asked but didn\'t?" · Ask for two specific introductions · Confirm follow-up permission.' },
  ],
  'Hospital IPD': [
    { title: 'Open (2 min)', body: 'Brief professional intro. Not selling, not asking for referrals. Permission to record.' },
    { title: 'Warm-up (3 min)', body: '"Tell me how your IPD is structured — who handles East African inquiries?"' },
    { title: 'Core: qualified leads', body: 'What makes a lead from East Africa qualified vs unqualified? — Which document is missing most often?' },
    { title: 'Core: documents', body: 'What information do you need before the medical team will review a case? — Would they pay for cases pre-formatted to that standard?' },
    { title: 'Core: response time', body: 'From first inquiry, how fast do you usually reply, and what slows you down?' },
    { title: 'Core: commissions', body: 'What do you currently pay agents per converted patient? — Does it vary by specialty?' },
    { title: 'Core: SaaS interest', body: 'Would you pay for software that pre-qualifies and packages African cases for you? — What would have to be true?' },
    { title: 'Close (5 min)', body: '"Anything I should have asked?" · "Who else at the hospital?" · Follow-up permission.' },
  ],
  'Agent / facilitator': [
    { title: 'Open (3 min)', body: 'Friendly but specific. Upfront: building patient-side. Their candour matters.' },
    { title: 'Warm-up (5 min)', body: '"Walk me through your last patient — first call to follow-up at home."' },
    { title: 'Core: workflow', body: 'Where do you add the most value? — Emotional vs transactional answer = different MVPs.' },
    { title: 'Core: pain', body: 'What\'s painfully manual? — Quote-chasing or document re-formatting = leverage.' },
    { title: 'Core: money', body: 'How do you get paid, and by whom? — Both sides? Ask which resists more.' },
    { title: 'Core: adoption', body: 'What would a tool have to do for you to use it daily? — Which feature, removed, kills adoption?' },
    { title: 'Close (3 min)', body: 'Anything missed · Two introductions · Follow-up.' },
  ],
};

function getScriptsData() {
  if (STATE.scripts && STATE.scripts.length > 0) {
    const grouped = {};
    STATE.scripts.forEach(s => {
      const name = s.script_name || s.fields?.script_name;
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(s);
    });
    // For each script, sort by version desc and return the latest
    const result = {};
    Object.entries(grouped).forEach(([name, versions]) => {
      versions.sort((a, b) => (b.version || b.fields?.version || 0) - (a.version || a.fields?.version || 0));
      result[name] = {
        current: versions[0],
        content: versions[0].content || versions[0].fields?.content || [],
        version: versions[0].version || versions[0].fields?.version || 1,
        allVersions: versions,
      };
    });
    return result;
  }
  // Fallback to hardcoded scripts
  const result = {};
  Object.entries(FALLBACK_SCRIPTS).forEach(([name, sections]) => {
    result[name] = {
      current: null,
      content: sections,
      version: 0,
      allVersions: [],
    };
  });
  return result;
}

function renderScripts(page) {
  const scriptsData = getScriptsData();
  const scriptNames = Object.keys(scriptsData);
  let active = scriptNames[0];
  let showHistory = false;

  const tabs = h('div', { class: 'flex gap-2 mb-5 border-b pb-3', style: 'border-color:var(--line-soft);' });
  const content = h('div', { class: 'card max-w-3xl' });

  function renderTab() {
    tabs.innerHTML = '';
    scriptNames.forEach(name => {
      tabs.appendChild(h('button', {
        class: `btn ${name === active ? 'btn-primary' : 'btn-line'}`,
        onclick: () => { active = name; showHistory = false; renderTab(); }
      }, name));
    });

    content.innerHTML = '';
    const data = scriptsData[active];

    // Header with version info and controls
    const header = h('div', { class: 'px-6 pt-5 pb-4 flex items-center justify-between border-b', style: 'border-color:var(--line-soft);' });
    const titleArea = h('div', {}, [
      h('div', { class: 'serif text-xl', text: active }),
      h('div', { class: 'text-xs mt-1', text: data.version > 0 ? `Version ${data.version}` : 'Hardcoded · not yet saved to database' }),
    ]);
    titleArea.querySelector('.text-xs').style.color = 'var(--ink-mute)';

    const controls = h('div', { class: 'flex gap-2' }, [
      h('button', { class: 'btn btn-line text-xs', onclick: () => { showHistory = !showHistory; renderTab(); } },
        showHistory ? 'Hide history' : 'Version history'),
      h('button', { class: 'btn btn-primary text-xs', onclick: () => openScriptEditor(active, data) }, 'Edit script'),
    ]);
    header.appendChild(titleArea);
    header.appendChild(controls);
    content.appendChild(header);

    if (showHistory && data.allVersions.length > 0) {
      // Version history view
      const historyWrap = h('div', { class: 'px-6 py-4' });
      const histLabel = h('div', { class: 'micro mb-3', text: 'Version history' });
      histLabel.style.color = 'var(--ink-mute)';
      historyWrap.appendChild(histLabel);

      data.allVersions.forEach(v => {
        const ver = v.version || v.fields?.version || '?';
        const date = v.created_at || v.fields?.created_at || '';
        const revertNote = v.revert_note || v.fields?.revert_note || '';
        const isLatest = v === data.allVersions[0];

        const row = h('div', { class: 'flex items-center justify-between py-3 border-b text-sm', style: 'border-color:var(--line-soft);' }, [
          h('div', {}, [
            h('span', { class: 'font-medium', text: `Version ${ver}` }),
            isLatest ? h('span', { class: 'chip chip-sage ml-2', text: 'Current' }) : null,
            revertNote ? h('div', { class: 'text-xs', text: revertNote }) : null,
            h('div', { class: 'text-xs', text: date ? `Saved ${date.slice(0, 10)}` : '' }),
          ].filter(Boolean)),
          !isLatest ? h('button', { class: 'btn btn-ghost text-xs', onclick: () => revertToVersion(active, v) }, 'Revert to this') : null,
        ].filter(Boolean));
        historyWrap.appendChild(row);
      });

      content.appendChild(historyWrap);
    } else {
      // Current script view
      const scriptBody = h('div', { class: 'px-6 py-5' });
      const sections = Array.isArray(data.content) ? data.content : [];
      sections.forEach(s => {
        const titleEl = h('div', { class: 'micro mb-1', text: s.title || '' });
        titleEl.style.color = 'var(--clay)';
        scriptBody.appendChild(h('div', { class: 'mb-4' }, [
          titleEl,
          h('div', { class: 'text-sm leading-relaxed', text: s.body || '' }),
        ]));
      });
      content.appendChild(scriptBody);
    }
  }

  page.appendChild(tabs);
  page.appendChild(content);
  renderTab();
}

function openScriptEditor(scriptName, data) {
  const sections = Array.isArray(data.content) ? [...data.content] : [];

  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const inputs = form.querySelectorAll('[data-section-idx]');
    const newContent = [];
    for (let i = 0; i < inputs.length; i += 2) {
      newContent.push({
        title: inputs[i].value,
        body: inputs[i + 1].value,
      });
    }
    try {
      const newVersion = (data.version || 0) + 1;
      const payload = {
        script_name: scriptName,
        version: newVersion,
        content: newContent,
      };
      const created = await api('/api/scripts', { method: 'POST', body: JSON.stringify(payload) });
      if (!STATE.scripts) STATE.scripts = [];
      STATE.scripts.unshift(created);
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  }});

  form.appendChild(h('div', { class: 'serif text-xl mb-4', text: `Edit: ${scriptName}` }));
  const hint = h('div', { class: 'text-xs mb-4', text: 'Saving creates a new version. The previous version is preserved.' });
  hint.style.color = 'var(--ink-mute)';
  form.appendChild(hint);

  const sectionsWrap = h('div', { id: 'editor-sections' });
  sections.forEach((s, i) => {
    sectionsWrap.appendChild(buildSectionEditor(s, i));
  });
  form.appendChild(sectionsWrap);

  form.appendChild(h('div', { class: 'mt-3 mb-4' }, [
    h('button', { type: 'button', class: 'btn btn-line text-xs', onclick: () => {
      const wrap = document.getElementById('editor-sections');
      const idx = wrap.children.length;
      wrap.appendChild(buildSectionEditor({ title: '', body: '' }, idx));
    } }, '+ Add section'),
  ]));

  form.appendChild(h('div', { class: 'flex gap-3 mt-5 justify-end pt-4 border-t', style: 'border-color:var(--line-soft);' }, [
    h('button', { type: 'button', class: 'btn btn-line', onclick: closeModal }, 'Cancel'),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save new version'),
  ]));

  const modal = h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); } }, [
    h('div', { class: 'modal p-6', style: 'max-width:640px;' }, [form]),
  ]);
  root.appendChild(modal);
}

function buildSectionEditor(section, idx) {
  const wrap = h('div', { class: 'mb-4 p-3 rounded-lg', style: 'background:var(--bg-soft); border: 1px solid var(--line-soft);' });
  const titleInput = h('input', {
    class: 'input mb-2', type: 'text', value: section.title || '',
    placeholder: 'Section title (e.g. "Core: discovery")',
    'data-section-idx': `${idx * 2}`,
  });
  const bodyInput = h('textarea', {
    class: 'textarea', rows: '3',
    placeholder: 'Question text and probes',
    'data-section-idx': `${idx * 2 + 1}`,
  });
  bodyInput.textContent = section.body || '';
  wrap.appendChild(titleInput);
  wrap.appendChild(bodyInput);
  return wrap;
}

async function revertToVersion(scriptName, versionRecord) {
  const ver = versionRecord.version || versionRecord.fields?.version || '?';
  if (!confirm(`Revert "${scriptName}" to version ${ver}? This creates a new version with the old content.`)) return;

  const content = versionRecord.content || versionRecord.fields?.content || [];
  const currentData = getScriptsData()[scriptName];
  const newVersion = (currentData?.version || 0) + 1;

  try {
    const payload = {
      script_name: scriptName,
      version: newVersion,
      content,
      revert_note: `Reverted to version ${ver}`,
    };
    const created = await api('/api/scripts', { method: 'POST', body: JSON.stringify(payload) });
    if (!STATE.scripts) STATE.scripts = [];
    STATE.scripts.unshift(created);
    renderCurrentRoute();
  } catch (e) { alert('Revert failed: ' + e.message); }
}

registerRoute('scripts', 'Interview scripts', renderScripts);
