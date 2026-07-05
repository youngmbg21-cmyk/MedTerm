/* ============================================================
   AI-FIRST DRAFTING — the one shared control row for every
   surface where the assistant drafts and the human edits/saves.
   The flow is always: draft from evidence → edit modal → human
   saves. Drafts never auto-save (the AI argues; it never
   decides). With AI off the draft path is calm-disabled:
   visible, muted, a tap explains — never hidden, never a dead
   click. Used by the decision memo, MVP scope, state of the
   field, and reports.
   ============================================================ */
import { h } from './app.js';
import { aiAvailable } from './data.js';

/* One shared string each — never copied per screen. */
export const AI_DRAFT_HELPER = 'The assistant drafts this from the evidence ledger; you edit and save. Or write it manually.';
export const AI_OFF_NOTE = 'Connect the assistant to draft this from your tagged quotes, hypothesis links, and economics. See HANDOFF.md → go-live.';

/**
 * Build the AI-first action row.
 * AI on  — empty: [Draft from evidence · primary] [Write manually · ghost]
 *          filled: [Redraft from evidence · ghost] [Edit · ghost]
 * AI off — the draft button renders first, muted (aria-disabled stays
 *          tappable); a tap toggles one inline note. Manual always works.
 * onDraft is async; the busy/disabled state while a draft request is in
 * flight is handled here so no caller reimplements it.
 */
export function aiDraftControls({
  filled = false,
  draftLabel = 'Draft from evidence',
  redraftLabel = 'Redraft from evidence',
  manualLabel = 'Write manually',
  editLabel = 'Edit',
  onDraft,
  onManual,
  compact = true,
  manualTone = 'ghost', // 'line' where the manual path is a full peer (e.g. template reports)
}) {
  const size = compact ? ' text-xs' : '';
  const wrap = h('div');
  const row = h('div', { class: 'mt-3 flex flex-wrap items-center gap-2' });
  wrap.appendChild(row);

  if (aiAvailable) {
    const draftBtn = h('button', {
      class: `btn ${filled ? 'btn-ghost' : 'btn-primary'}${size}`,
      onclick: async () => {
        const label = draftBtn.textContent;
        draftBtn.disabled = true;
        draftBtn.textContent = 'Drafting…';
        try { await onDraft(); }
        catch (e) { alert('Draft failed: ' + e.message); }
        finally { draftBtn.disabled = false; draftBtn.textContent = label; }
      },
    }, filled ? redraftLabel : draftLabel);
    row.appendChild(draftBtn);
    row.appendChild(h('button', { class: `btn btn-${manualTone}${size}`, onclick: onManual },
      filled ? editLabel : manualLabel));
  } else {
    const note = h('div', { class: 'text-xs mt-2 t-mute', text: AI_OFF_NOTE });
    note.style.display = 'none';
    row.appendChild(h('button', {
      class: `btn btn-line${size}`, 'aria-disabled': 'true',
      onclick: () => { note.style.display = note.style.display === 'none' ? '' : 'none'; },
    }, filled ? redraftLabel : draftLabel));
    row.appendChild(h('button', { class: `btn ${filled ? 'btn-ghost' : 'btn-line'}${size}`, onclick: onManual },
      filled ? editLabel : manualLabel));
    wrap.appendChild(note);
  }
  return wrap;
}
