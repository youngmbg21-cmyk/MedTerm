/* Scripts — one question: "What exactly do we ask each segment?" (versioned)
   One tab per config segment: comprehensive starter questions ship with the
   app (one tap to add if a segment has none yet), every save creates a new
   version, and the assistant can redraft a script from the evidence so the
   questions chase what the field is actually surfacing. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState, closeModal, fmtDate,
} from '../app.js';
import { SEGMENT_NAMES, CURRENT_PHASE, SEGMENTS } from '../config.js';
import { data, draftSectionRequest, aiDataSlices } from '../data.js';
import { buildScripts } from '../seed.js';
import { aiDraftControls } from '../ai-draft.js';

function groupScripts() {
  const grouped = {};
  STATE.scripts.forEach(s => {
    if (!grouped[s.script_name]) grouped[s.script_name] = [];
    grouped[s.script_name].push(s);
  });
  Object.values(grouped).forEach(versions => versions.sort((a, b) => (b.version || 0) - (a.version || 0)));
  return grouped;
}

/* Tab order: config segments first (always shown, even before their script
   exists), then any legacy/custom script names found in the data. */
function tabNames(grouped) {
  const extras = Object.keys(grouped).filter(n => !SEGMENT_NAMES.includes(n));
  return [...SEGMENT_NAMES, ...extras];
}

let activeScript = null;

function renderScripts(page) {
  const grouped = groupScripts();
  const names = tabNames(grouped);

  if (!activeScript || !names.includes(activeScript)) activeScript = names[0];
  let showHistory = false;

  const tabs = h('div', { class: 'flex flex-wrap gap-2 mb-5 border-b pb-3 b-soft' });
  const content = h('div', { class: 'card max-w-3xl' });

  function renderTab() {
    tabs.innerHTML = '';
    names.forEach(name => {
      const missing = !grouped[name];
      const btn = h('button', {
        class: `btn ${name === activeScript ? 'btn-primary' : 'btn-line'}`,
        onclick: () => { activeScript = name; showHistory = false; renderTab(); },
      }, name);
      if (missing) btn.classList.add('text-xs');
      tabs.appendChild(btn);
    });

    content.innerHTML = '';
    const versions = grouped[activeScript];

    /* A config segment with no script yet: one tap adds the comprehensive
       starter questions the app ships with (works in demo AND live mode,
       where seeds never run). */
    if (!versions) {
      content.appendChild(emptyState(
        `No script for ${activeScript} yet.`,
        'Add the starter questions — they cover discovery, trust, friction, pain, money and the hypothesis checks for this segment — then edit them to fit.',
        { label: '+ Add starter questions', onclick: () => addStarterScript(activeScript) }));
      return;
    }

    const latest = versions[0];
    const sections = Array.isArray(latest.content) ? latest.content : [];

    const isConfigSegment = SEGMENT_NAMES.includes(activeScript);
    const headRight = h('div', { class: 'flex flex-wrap items-center gap-2' }, [
      h('button', { class: 'btn btn-line text-xs', onclick: () => { showHistory = !showHistory; renderTab(); } },
        showHistory ? 'Hide history' : 'Version history'),
      /* Legacy/custom scripts (not a current config segment) can be removed —
         the migration never auto-deletes anything with edit history, so the
         human gets the explicit control instead. Segment scripts stay. */
      !isConfigSegment
        ? h('button', { class: 'btn btn-ghost text-xs t-rose', onclick: () => removeScript(activeScript, versions) }, 'Remove script')
        : null,
    ].filter(Boolean));
    /* AI-first: the assistant revises the questions from what the field is
       surfacing; the redraft lands in the editor for review — saving it
       creates a new version, the old one is preserved. */
    headRight.appendChild(aiDraftControls({
      filled: true,
      redraftLabel: 'Redraft with assistant',
      editLabel: 'Edit script',
      onDraft: async () => {
        const fields = sections.map((s, i) => ({
          key: `sec_${i}`,
          label: s.title || `Section ${i + 1}`,
          placeholder: (s.body || '').slice(0, 140),
        }));
        const res = await draftSectionRequest({
          section_label: `${activeScript} interview script`,
          placeholder: 'Revise each section\'s questions and probes to chase the themes and hypothesis gaps the evidence is showing for this segment. Keep the interviewer\'s voice: short questions, concrete probes.',
          doc_kind: `a revised interview script for the "${activeScript}" segment`,
          fields,
          phase: CURRENT_PHASE,
          segments: SEGMENTS,
          localData: aiDataSlices(STATE),
        });
        const drafted = sections.map((s, i) => ({ title: s.title, body: (res.fields || {})[`sec_${i}`] || s.body }));
        openScriptEditor(activeScript, latest, drafted);
      },
      onManual: () => openScriptEditor(activeScript, latest),
    }));

    content.appendChild(h('div', { class: 'px-6 pt-5 pb-4 flex flex-wrap items-center justify-between gap-2 border-b b-soft' }, [
      h('div', {}, [
        h('div', { class: 'serif text-xl', text: activeScript }),
        h('div', { class: 'text-xs mt-1 t-mute', text: `Version ${latest.version}${isConfigSegment ? '' : ' · not a current segment — kept from an earlier setup'}` }),
      ]),
      headRight,
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

/* Create version 1 of a segment's script from the canonical starter set.
   Falls back to a bare skeleton if config gained a segment the starter set
   doesn't know — never a dead click. */
async function addStarterScript(name) {
  const template = buildScripts().find(s => s.script_name === name);
  const record = template || {
    script_name: name, version: 1, content: [
      { title: 'Open (3 min)', body: 'Introduce the project, promise de-identification, ask permission to record.' },
      { title: 'Story anchor (5 min)', body: `"Walk me through your most recent experience relevant to ${name}." Anchor in a real, recent story.` },
      { title: 'Core questions', body: 'Cover discovery, trust, friction, pain (with severity), and willingness to pay for this segment.' },
      { title: 'Close (3 min)', body: 'Anything missed · two introductions · follow-up permission · same-day tag.' },
    ],
  };
  try {
    await data.create('scripts', record);
    STATE.scripts = await data.list('scripts');
    renderCurrentRoute();
  } catch (e) { alert('Could not add the starter script: ' + e.message); }
}

/* Section-by-section editor. An assistant redraft arrives as `draftContent`
   and pre-fills the rows — the human edits and saves; never auto-saved.
   Saving always creates a new version; the old one is preserved. */
function openScriptEditor(scriptName, latest, draftContent) {
  const isDraft = draftContent != null;
  const sections = isDraft ? [...draftContent] : (Array.isArray(latest.content) ? [...latest.content] : []);
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
    h('div', { class: 'serif text-xl mb-2', text: isDraft ? `AI redraft: ${scriptName} — edit before saving` : `Edit: ${scriptName}` }),
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
    h('div', { class: 'modal', style: 'max-width:640px;' }, [form]),
  ]));
}

/* Remove a legacy/custom script lineage — every version. Only offered for
   scripts whose name is not a current config segment; a destructive act,
   so it is explicit and confirmed, never automatic. */
async function removeScript(name, versions) {
  const edited = versions.length > 1;
  if (!confirm(`Remove "${name}" and all ${versions.length} version${versions.length === 1 ? '' : 's'}?${edited ? ' This script has edit history — removing it deletes those edits too.' : ''} This cannot be undone.`)) return;
  try {
    for (const v of versions) await data.remove('scripts', v.id);
    STATE.scripts = await data.list('scripts');
    activeScript = null; // fall back to the first segment tab
    renderCurrentRoute();
  } catch (e) { alert('Remove failed: ' + e.message); }
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
