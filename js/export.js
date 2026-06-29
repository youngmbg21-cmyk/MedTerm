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
  rows.forEach(r => lines.push(headers.map((_, i) => toCsvValue(r[i])).join(',')));
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
  const rows = STATE.outreach.map(r => {
    const f = r.fields || r;
    return headers.map(h => f[h] || f[h.toLowerCase()] || '');
  });
  downloadCsv('outreach.csv', headers, rows);
}

export function exportInterviews() {
  const headers = ['Interview ID', 'Date', 'Segment', 'Who', 'Location', 'Duration', 'Tagged same-day', 'Key quotes', 'Notes'];
  const rows = STATE.interviews.map(r => {
    const f = r.fields || r;
    return [
      f['Interview ID'] || f.interview_id || '',
      f.Date || f.date || '',
      f.Segment || f.segment || '',
      f.Who || f.who || '',
      f.Location || f.location || '',
      f.Duration || f.duration || '',
      f['Tagged same-day'] || f.tagged_same_day || '',
      f['Key quotes'] || f.key_quotes || '',
      f.Notes || f.notes || '',
    ];
  });
  downloadCsv('interviews.csv', headers, rows);
}

export function exportMatrix() {
  const headers = ['Theme tag', 'Segment', 'Quote', 'Severity', 'WTP', 'Interview ID', 'Source'];
  const rows = STATE.matrix.map(r => {
    const f = r.fields || r;
    return [
      f['Theme tag'] || f.theme_tag || '',
      f.Segment || f.segment || '',
      f.Quote || f.quote || '',
      f.Severity || f.severity || '',
      f.WTP || f.wtp || '',
      f['Interview ID'] || f.interview_id || '',
      f.Source || f.source || '',
    ];
  });
  downloadCsv('matrix.csv', headers, rows);
}

export function exportKillList() {
  const headers = ['Hypothesis', 'Reason', 'Evidence', 'Date killed'];
  const rows = (STATE.killList || []).map(r => {
    const f = r.fields || r;
    return [
      f.hypothesis || '',
      f.reason || '',
      f.evidence || '',
      f.killed_at || f.created_at || '',
    ];
  });
  downloadCsv('kill-list.csv', headers, rows);
}
