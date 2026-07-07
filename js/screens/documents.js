/* Documents — one question: "Where is every file the field produced?"
   The app is the sole repository: files live here (IndexedDB locally,
   Supabase Storage when live) and the assistant can search and read them. */
import {
  STATE, registerRoute, renderCurrentRoute, h, chip, emptyState,
  openModal, closeModal, formField, fmtDate, setPageActions,
} from '../app.js';
import { SEGMENT_NAMES, getTeam } from '../config.js';
import { data } from '../data.js';

const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
const ACCEPT = '.pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_TEXT_STORE = 400 * 1024;  // cap extracted text per file

function isTextLike(file) {
  return TEXT_TYPES.includes(file.type) || /\.(txt|md|csv|json)$/i.test(file.name);
}

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderDocuments(page) {
  const filterState = { segment: 'all', q: '' };

  page.appendChild(h('div', { class: 'banner banner-info mb-4' }, [
    h('span', { text: 'Upload field notes, price lists, photos and scans — PDF, text, CSV or images. De-identify first (initials, not names). Never upload consent forms or identity documents.' }),
  ]));

  /* One primary action, in the app header; the tools row stays quiet */
  setPageActions(h('button', { class: 'btn btn-primary', onclick: openUploadForm }, '+ Upload document'));

  page.appendChild(h('div', { class: 'flex flex-wrap items-center gap-3 mb-4' }, [
    h('input', { class: 'input flex-1 min-w-[180px]', placeholder: 'Search filename, description, contents…',
      oninput: e => { filterState.q = e.target.value; renderList(); } }),
    h('select', { class: 'select max-w-[170px]', onchange: e => { filterState.segment = e.target.value; renderList(); } }, [
      h('option', { value: 'all' }, 'All segments'),
      ...SEGMENT_NAMES.map(s => h('option', { value: s }, s)),
    ]),
  ]));

  const card = h('div', { class: 'card' });
  page.appendChild(card);

  function renderList() {
    card.innerHTML = '';
    const rows = STATE.documents
      .filter(d => {
        if (filterState.segment !== 'all' && d.segment !== filterState.segment) return false;
        if (filterState.q) {
          const q = filterState.q.toLowerCase();
          const hay = [d.filename, d.description, d.text_content, d.interview_id].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    if (!rows.length) {
      card.appendChild(emptyState(
        STATE.documents.length === 0 ? 'No documents yet.' : 'No matches.',
        STATE.documents.length === 0 ? 'Upload the first field document — a debrief, a price list, a photo of notes.' : null));
      return;
    }

    rows.forEach(d => {
      const meta = [d.segment, d.interview_id, fmtBytes(d.size_bytes), fmtDate(d.created_at), d.uploaded_by]
        .filter(Boolean).join(' · ');
      card.appendChild(h('div', { class: 'px-6 py-4 border-b b-soft' }, [
        h('div', { class: 'flex flex-wrap items-start justify-between gap-2' }, [
          h('div', { class: 'min-w-0' }, [
            h('div', { class: 'font-medium text-sm', text: d.filename }),
            h('div', { class: 'text-xs mt-0.5 t-mute', text: meta }),
            d.description ? h('div', { class: 'text-sm mt-1.5 t-soft', text: d.description }) : null,
          ].filter(Boolean)),
          h('div', { class: 'flex gap-2 shrink-0' }, [
            h('button', { class: 'btn btn-line text-xs', onclick: () => viewDocument(d) }, 'View'),
            h('button', { class: 'btn btn-ghost text-xs', onclick: () => downloadDocument(d) }, 'Download'),
            h('button', { class: 'btn btn-ghost text-xs', onclick: () => deleteDocument(d) }, 'Delete'),
          ]),
        ]),
      ]));
    });
  }
  renderList();
}

function openUploadForm() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const fileInput = h('input', { class: 'input', type: 'file', accept: ACCEPT });
  const interviewIds = STATE.interviews.map(i => i.interview_id).filter(Boolean);
  const segField = formField('Segment', 'segment', 'select', '', ['', ...SEGMENT_NAMES]);
  const intField = formField('Linked interview (optional)', 'interview_id', 'select', '', ['', ...interviewIds]);
  const descField = formField('Short description (searchable — say what this is)', 'description', 'textarea', '');
  const msg = h('div', { class: 'text-xs mb-3', style: 'color:var(--rose); display:none;' });

  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    const show = (t) => { msg.style.display = 'block'; msg.textContent = t; };
    if (!file) { show('Choose a file.'); return; }
    if (file.size > MAX_BYTES) { show('File is over 10 MB. Compress it or split it.'); return; }
    if (/\.docx?$/i.test(file.name)) { show('Word files are not readable by the assistant — save as PDF and upload that.'); return; }

    try {
      let text_content = null;
      if (isTextLike(file)) {
        text_content = (await file.text()).slice(0, MAX_TEXT_STORE);
      }
      const record = await data.create('documents', {
        filename: file.name,
        mime_type: file.type || (file.name.endsWith('.md') ? 'text/markdown' : 'application/octet-stream'),
        size_bytes: file.size,
        segment: form.querySelector('[name="segment"]').value || null,
        interview_id: form.querySelector('[name="interview_id"]').value || null,
        description: form.querySelector('[name="description"]').value || '',
        uploaded_by: getTeam().lead, // overwritten server-side in api mode
        text_content,
      });
      await data.putFile(record.id, file);
      STATE.documents = await data.list('documents');
      closeModal();
      renderCurrentRoute();
    } catch (err) { show('Upload failed: ' + err.message); }
  } }, [
    h('div', { class: 'serif text-xl mb-2', text: 'Upload document' }),
    h('div', { class: 'text-xs mb-4 t-mute', text: 'PDF, text, markdown, CSV or image, up to 10 MB. Text files become fully searchable; PDFs are read by the assistant when the backend is live.' }),
    h('div', { class: 'mb-3' }, [h('label', { class: 'label', text: 'File' }), fileInput]),
    segField.el, intField.el, descField.el, msg,
    h('div', { class: 'flex gap-3 mt-5 justify-end pt-4 border-t b-soft' }, [
      h('button', { type: 'button', class: 'btn btn-line', onclick: closeModal }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Upload'),
    ]),
  ]);

  root.appendChild(h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); } }, [
    h('div', { class: 'modal' }, [form]),
  ]));
}

async function viewDocument(d) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const body = h('div');

  if (d.text_content) {
    body.appendChild(h('pre', {
      class: 'text-sm leading-relaxed p-4 rounded-lg',
      style: 'background:var(--bg-soft); border:1px solid var(--line-soft); white-space:pre-wrap; font-family:Inter,sans-serif; max-height:60vh; overflow-y:auto;',
      text: d.text_content,
    }));
  } else if ((d.mime_type || '').startsWith('image/')) {
    try {
      const blob = await data.getFile(d.id, d);
      if (blob) {
        const img = h('img', { style: 'max-width:100%; border-radius:12px;' });
        const objectUrl = URL.createObjectURL(blob);
        // Free the blob URL once the image has decoded — otherwise each preview
        // leaks one until the page unloads.
        img.onload = () => URL.revokeObjectURL(objectUrl);
        img.src = objectUrl;
        body.appendChild(img);
      }
    } catch { body.appendChild(h('div', { class: 'text-sm t-mute', text: 'Preview unavailable — use Download.' })); }
  } else {
    body.appendChild(h('div', { class: 'text-sm t-mute', text: 'No inline preview for this file type — use Download to open it.' }));
  }

  root.appendChild(h('div', { class: 'modal-bg fade-in', onclick: (e) => { if (e.target.classList.contains('modal-bg')) root.innerHTML = ''; } }, [
    h('div', { class: 'modal', style: 'max-width:720px;' }, [
      h('div', { class: 'flex items-start justify-between gap-3 mb-1' }, [
        h('div', { class: 'serif text-xl', text: d.filename }),
        h('button', { class: 'btn btn-ghost text-xs', onclick: () => { root.innerHTML = ''; } }, 'Close'),
      ]),
      h('div', { class: 'text-xs mb-4 t-mute', text: [d.segment, d.interview_id, fmtDate(d.created_at)].filter(Boolean).join(' · ') }),
      body,
    ]),
  ]));
}

async function downloadDocument(d) {
  try {
    const blob = await data.getFile(d.id, d);
    if (!blob) { alert('File data not found.'); return; }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: d.filename });
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { alert('Download failed: ' + e.message); }
}

async function deleteDocument(d) {
  if (!confirm(`Delete "${d.filename}"? This cannot be undone.`)) return;
  try {
    await data.remove('documents', d.id);
    STATE.documents = await data.list('documents');
    renderCurrentRoute();
  } catch (e) { alert('Delete failed: ' + e.message); }
}

registerRoute('documents', 'Documents', renderDocuments,
  'Where is every file the field produced?');
