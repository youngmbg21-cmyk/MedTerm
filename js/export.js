/* CSV exports — read from in-memory STATE (canonical snake_case shape). */
import { STATE } from './app.js';

function toCsvValue(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(toCsvValue).join(',')];
  rows.forEach(r => lines.push(r.map(toCsvValue).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportOutreach() {
  const headers = ['Name', 'Segment', 'Organisation', 'Country', 'Channel', 'Status', 'Owner', 'First contact', 'Notes'];
  const rows = STATE.outreach.map(r => [
    r.name, r.segment, r.organisation, r.country, r.channel, r.status, r.owner, r.first_contact, r.notes,
  ]);
  downloadCsv('outreach.csv', headers, rows);
}

export function exportInterviews() {
  const headers = ['Interview ID', 'Date', 'Segment', 'Initials', 'Interviewer', 'Format', 'Recorded', 'Tagged same-day', 'Brief topic', 'Link to notes'];
  const rows = STATE.interviews.map(r => [
    r.interview_id, r.date, r.segment, r.initials, r.interviewer, r.format, r.recorded, r.tagged_same_day, r.brief_topic, r.link_to_notes,
  ]);
  downloadCsv('interviews.csv', headers, rows);
}

export function exportMatrix() {
  const headers = ['Interview ID', 'Theme tag', 'Segment', 'Quote', 'Severity', 'WTP', 'Notes'];
  const rows = STATE.matrix.map(r => [
    r.interview_id, r.theme_tag, r.segment, r.quote, r.severity, r.wtp, r.notes,
  ]);
  downloadCsv('matrix.csv', headers, rows);
}

export function exportKillList() {
  const headers = ['Hypothesis', 'Evidence', 'Date killed'];
  const rows = STATE.kill_list.map(r => [r.hypothesis, r.evidence, r.killed_date]);
  downloadCsv('kill-list.csv', headers, rows);
}
