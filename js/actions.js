/* ============================================================
   PROPOSED-ACTION CONFIRMATIONS — the one shared Confirm/Skip
   pattern for everything the AI suggests. The AI argues; it
   never decides: every AI-originated write lands here first,
   and only a human tap on Confirm sends it through data.js.
   Used by the chat panel and by screens (link proposals).
   ============================================================ */
import { STATE, h, renderCurrentRoute } from './app.js';
import { data } from './data.js';

/* Which table each proposable action writes to. add_* creates;
   everything else patches by payload.id. */
const TABLE_FOR_ACTION = {
  add_interview: 'interviews',
  add_matrix_entry: 'matrix',
  update_deliverable: 'deliverables',
  flag_quote: 'matrix',
  add_evidence_link: 'evidence_links',
  update_hypothesis_status: 'hypotheses',
};

/* Perform a confirmed action through data.js and refresh STATE.
   rerender:false lets a caller with its own in-flight UI (e.g. a stack of
   link proposals) decide when the screen redraws. */
export async function applyAction(action, { rerender = true } = {}) {
  const table = TABLE_FOR_ACTION[action.action_type];
  if (!table) throw new Error(`Unknown action: ${action.action_type}`);
  if (action.action_type.startsWith('add')) {
    const payload = { ...action.payload };
    // AI-proposed evidence links are always recorded as human-confirmed.
    if (action.action_type === 'add_evidence_link') payload.source = 'ai_confirmed';
    await data.create(table, payload);
  } else {
    const { id, ...patch } = action.payload;
    await data.update(table, id, patch);
  }
  STATE[table] = await data.list(table);
  if (rerender) renderCurrentRoute();
}

/**
 * Build the Confirm/Skip block for a proposed action.
 * Returns a DOM element the caller places wherever fits (chat message
 * list, a quiet card under a form, …). Never blocks; Skip is always
 * one tap. onDone(result) fires with 'confirmed' | 'skipped'.
 */
export function actionConfirmation(action, { onDone, rerender = true } = {}) {
  const buttons = h('div', { class: 'flex gap-2' });

  buttons.appendChild(h('button', { class: 'btn btn-primary text-xs', onclick: async () => {
    try {
      await applyAction(action, { rerender });
      buttons.innerHTML = '';
      buttons.appendChild(h('span', { class: 'chip chip-sage', text: 'Done' }));
      onDone?.('confirmed');
    } catch (e) {
      buttons.innerHTML = '';
      buttons.appendChild(h('span', { class: 'chip chip-rose', text: `Failed: ${e.message}` }));
    }
  } }, 'Confirm'));

  buttons.appendChild(h('button', { class: 'btn btn-line text-xs', onclick: () => {
    buttons.innerHTML = '';
    buttons.appendChild(h('span', { class: 'chip chip-line', text: 'Skipped' }));
    onDone?.('skipped');
  } }, 'Skip'));

  return h('div', { class: 'chat-msg bot', style: 'max-width:100%;' }, [
    h('div', { class: 'micro mb-2 t-clay', text: 'Proposed action' }),
    h('div', { class: 'text-sm mb-3', text: action.description || JSON.stringify(action.payload) }),
    buttons,
  ]);
}

/* Chat-panel wrapper: append the confirmation to the message list. */
export function addActionConfirmation(action) {
  const msgs = document.getElementById('chat-messages');
  msgs.appendChild(actionConfirmation(action));
  msgs.scrollTop = msgs.scrollHeight;
}
