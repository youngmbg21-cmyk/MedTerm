/* ============================================================
   EVIDENCE HELPERS — shared by the Decision Brief, the Decision
   memo, and the capture screens' "Link to hypothesis" affordance.
   Hypotheses, kill criteria, evidence links, and AI assessments
   are first-class records; everything here reads them from STATE
   and writes them through data.js.
   ============================================================ */
import {
  STATE, h, chip, openModal, closeModal, formField, renderCurrentRoute,
} from './app.js';
import { CURRENT_PHASE, SEGMENTS } from './config.js';
import { data, assessmentRequest, aiDataSlices } from './data.js';

/* Semantic tones — sage=GO, honey=PIVOT, rose=NO-GO, line=INSUFFICIENT. */
export const LEANING_TONE = { GO: 'sage', PIVOT: 'honey', 'NO-GO': 'rose', INSUFFICIENT: 'line' };

export const HYP_STATUS_TONE = {
  open: 'line', strengthening: 'sage', weakening: 'honey', dead: 'rose',
  unknown: 'line', holding: 'sage', breached: 'rose',
};

export const DIRECTION_ARROW = { strengthening: '↑', weakening: '↓', unclear: '→' };

/* Sorted views of the hypothesis board. */
export function hypothesesSorted() {
  return [...STATE.hypotheses].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}
export function buyerHypotheses() {
  return hypothesesSorted().filter(x => x.kind === 'buyer_hypothesis');
}
export function killCriteria() {
  return hypothesesSorted().filter(x => x.kind === 'kill_criterion');
}

/* Assessments are append-only; the newest is the live one. */
export function latestAssessment() {
  return [...STATE.ai_assessments]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
}
export function assessmentsOldestFirst() {
  return [...STATE.ai_assessments]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

/* Run the structured assessment pipeline and persist the result.
   In local data mode the worker returns the record and we persist it here
   through data.js; in api mode the worker inserted it already. Either way
   assessments are append-only — this only ever creates. */
export async function runAssessment(trigger) {
  const res = await assessmentRequest({
    trigger,
    phase: CURRENT_PHASE,
    segments: SEGMENTS,
    localData: aiDataSlices(STATE),
  });
  let record = res.assessment;
  if (!res.persisted) record = await data.create('ai_assessments', record);
  STATE.ai_assessments = await data.list('ai_assessments');
  return record;
}

export function linksFor(hypothesisId) {
  return STATE.evidence_links.filter(l => l.hypothesis_id === hypothesisId);
}
export function linksForEvidence(evidenceType, evidenceId) {
  return STATE.evidence_links.filter(l => l.evidence_type === evidenceType && l.evidence_id === evidenceId);
}

/* Resolve a link to its underlying record: { cite, text, record }. */
export function resolveLink(link) {
  switch (link.evidence_type) {
    case 'interview': {
      const r = STATE.interviews.find(i => i.interview_id === link.evidence_id);
      return { cite: link.evidence_id, text: r ? (r.brief_topic || 'interview') : '(interview not found)', record: r || null };
    }
    case 'matrix': {
      const r = STATE.matrix.find(m => m.id === link.evidence_id);
      return { cite: r?.interview_id || 'matrix', text: r ? r.quote : '(matrix entry not found)', record: r || null };
    }
    case 'field_check': {
      const r = STATE.field_checks.find(f => f.id === link.evidence_id);
      return { cite: 'field check', text: r ? r.assumption : '(field check not found)', record: r || null };
    }
    case 'document': {
      const r = STATE.documents.find(d => d.id === link.evidence_id);
      return { cite: r?.filename || 'document', text: r ? (r.description || r.filename) : '(document not found)', record: r || null };
    }
    case 'economics': {
      const r = STATE.economics.find(e => e.id === link.evidence_id);
      return { cite: r ? `economics · ${r.model_name}` : 'economics', text: r ? `Unit-economics model "${r.model_name}"` : '(economics record not found)', record: r || null };
    }
    default:
      return { cite: link.evidence_type, text: link.evidence_id, record: null };
  }
}

/* ------------------------------------------------------------
   Manual "Link to hypothesis" modal — works fully in local mode
   with AI off. source is always 'human' here.
   ------------------------------------------------------------ */
const STRENGTH_ORDER = { strong: 0, moderate: 1, weak: 2 };

export function openLinkModal({ evidence_type, evidence_id, cite }, onSaved) {
  const hyps = hypothesesSorted();
  if (!hyps.length) { alert('No hypotheses defined yet.'); return; }
  const labels = hyps.map(x => `${x.code} — ${x.title}`);
  openModal(`Link ${cite || evidence_type} to a hypothesis`, [
    formField('Hypothesis or kill criterion', 'hypothesis', 'select', labels[0], labels),
    formField('Direction (for kill criteria, "supports" = pushes toward breach)', 'direction', 'select', 'supports', ['supports', 'contradicts', 'neutral']),
    formField('Strength', 'strength', 'select', 'moderate', ['strong', 'moderate', 'weak']),
    formField('Why this evidence bears on it (one line)', 'note', 'textarea', ''),
  ], async (form) => {
    const hyp = hyps[labels.indexOf(form.hypothesis)];
    if (!hyp) { alert('Pick a hypothesis.'); return; }
    try {
      await data.create('evidence_links', {
        hypothesis_id: hyp.id,
        evidence_type,
        evidence_id,
        direction: form.direction,
        strength: form.strength,
        note: form.note,
        source: 'human',
      });
      STATE.evidence_links = await data.list('evidence_links');
      closeModal();
      renderCurrentRoute();
      onSaved?.();
    } catch (e) { alert('Link failed: ' + e.message); }
  }, 'Link evidence');
}

/* Small chips showing a record's existing hypothesis links. */
export function existingLinkChips(evidenceType, evidenceId) {
  return linksForEvidence(evidenceType, evidenceId).map(l => {
    const hyp = STATE.hypotheses.find(x => x.id === l.hypothesis_id);
    const tone = l.direction === 'supports' ? 'sage' : l.direction === 'contradicts' ? 'rose' : 'line';
    const c = chip(`${hyp?.code || '?'} ${l.direction}`, tone);
    c.title = l.note || '';
    return c;
  });
}

/* Best displayable quotes for a hypothesis: matrix-linked evidence first,
   strongest first, up to n. Returns matrix records. */
export function topQuotesFor(hypothesisId, n = 2) {
  return linksFor(hypothesisId)
    .filter(l => l.evidence_type === 'matrix')
    .sort((a, b) => (STRENGTH_ORDER[a.strength] ?? 3) - (STRENGTH_ORDER[b.strength] ?? 3))
    .map(l => resolveLink(l).record)
    .filter(Boolean)
    .slice(0, n);
}

/* ------------------------------------------------------------
   Minimal markdown for assessment briefs: ### headings, - bullets,
   **bold**, paragraphs. Built with h()/textContent — user- and
   model-supplied text never touches innerHTML.
   ------------------------------------------------------------ */
function inlineBold(text) {
  const parts = [];
  text.split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) parts.push(h('strong', { text: part }));
    else parts.push(document.createTextNode(part));
  });
  return parts;
}

export function renderMarkdown(text) {
  const root = h('div', { class: 'flex flex-col gap-3' });
  const blocks = String(text || '').split(/\n\s*\n/);
  blocks.forEach(block => {
    const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) return;
    if (lines.every(s => s.startsWith('- '))) {
      const ul = h('ul', { class: 'text-sm leading-relaxed', style: 'list-style:disc; padding-left:1.2em;' });
      lines.forEach(s => ul.appendChild(h('li', {}, inlineBold(s.slice(2)))));
      root.appendChild(ul);
      return;
    }
    const m = lines[0].match(/^(#{1,4})\s+(.*)$/);
    if (m) {
      root.appendChild(h('div', { class: 'serif text-base mt-1', text: m[2] }));
      const rest = lines.slice(1).join(' ');
      if (rest) root.appendChild(h('p', { class: 'text-sm leading-relaxed' }, inlineBold(rest)));
      return;
    }
    root.appendChild(h('p', { class: 'text-sm leading-relaxed' }, inlineBold(lines.join(' '))));
  });
  return root;
}
