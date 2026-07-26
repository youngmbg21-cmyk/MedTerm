/* ============================================================
   CSV EXPORTS — for taking a list into a spreadsheet or a board
   meeting. One generic writer; each screen names its columns.
   ============================================================ */
import { STATE, prospectName, questionShort } from './app.js';

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, headers, rows) {
  const body = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
  // The BOM makes Excel open UTF-8 correctly instead of mangling é and ’.
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportProspects() {
  downloadCsv(`hati-prospects-${stamp()}.csv`,
    ['Company', 'Segment', 'Sector', 'City', 'Size', 'Status', 'Owner', 'Channel', 'Next step', 'Next step by', 'Last touch', 'Why they fit', 'Notes'],
    STATE.prospects.map(p => [p.company, p.segment, p.sector, p.city, p.size, p.status, p.owner,
      p.channel, p.next_step, p.next_step_date, p.last_touch, p.why_fit, p.notes]));
}

export function exportCompetitors() {
  downloadCsv(`hati-competitors-${stamp()}.csv`,
    ['Name', 'Type', 'HQ', 'Positioning', 'Pricing model', 'Price notes', 'Strengths', 'Weaknesses', 'Kenya presence', 'Threat', 'Source', 'Notes'],
    STATE.competitors.map(c => [c.name, c.type, c.hq, c.positioning, c.pricing_model, c.price_notes,
      c.strengths, c.weaknesses, c.kenya_presence, c.threat, c.source_url, c.notes]));
}

export function exportConversations() {
  downloadCsv(`hati-conversations-${stamp()}.csv`,
    ['Date', 'Company', 'Who', 'Role', 'Channel', 'Ran by', 'What they use today', 'Biggest pain', 'Would they pay', 'Best quote', 'Notes'],
    STATE.conversations.map(c => [c.date, prospectName(c.prospect_id), c.person, c.person_role, c.channel,
      c.interviewer, c.current_tools, c.main_pain, c.wtp_signal, c.best_quote, c.notes]));
}

export function exportFacts() {
  downloadCsv(`hati-market-facts-${stamp()}.csv`,
    ['Category', 'Claim', 'Value', 'Detail', 'Strength', 'Source', 'Source link', 'Checked on', 'Bears on', 'Notes'],
    STATE.market_facts.map(f => [f.category, f.claim, f.value, f.detail, f.strength, f.source_name,
      f.source_url, f.checked_on, questionShort(f.affects_question), f.notes]));
}

export function exportInsights() {
  downloadCsv(`hati-insights-${stamp()}.csv`,
    ['Date', 'Question', 'Direction', 'Finding', 'Quote', 'Source kind', 'Source', 'Written by'],
    STATE.insights.map(i => [i.date, questionShort(i.question_id), i.direction, i.finding, i.quote,
      i.source_kind, i.source_label, i.owner]));
}

export function exportPricing() {
  downloadCsv(`hati-pricing-reactions-${stamp()}.csv`,
    ['Date', 'Pricing idea', 'Company', 'Reaction', 'What they said', 'Number they gave', 'Notes'],
    STATE.pricing_reactions.map(r => {
      const idea = STATE.pricing_ideas.find(p => String(p.id) === String(r.pricing_idea_id)) || {};
      return [r.date, idea.name || '—', prospectName(r.prospect_id), r.reaction, r.verbatim, r.their_number, r.notes];
    }));
}
