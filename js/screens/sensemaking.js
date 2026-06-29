import { STATE, SEGMENTS, THEMES, h, esc, api, openModal, closeModal, formField, renderCurrentRoute, registerRoute } from '../app.js';

// --- Theme Analysis ---
function renderThemeAnalysis(page) {
  const themeData = {};
  STATE.matrix.forEach(r => {
    const f = r.fields || {};
    const tag = f['Theme tag'] || f.theme_tag;
    if (!tag) return;
    if (!themeData[tag]) themeData[tag] = { count: 0, totalSev: 0, wtpY: 0, quotes: [] };
    themeData[tag].count++;
    themeData[tag].totalSev += +(f.Severity || f.severity || 0);
    if ((f.WTP || f.wtp) === 'Y') themeData[tag].wtpY++;
    themeData[tag].quotes.push(f);
  });

  const ranked = Object.entries(themeData)
    .map(([tag, d]) => ({
      tag,
      count: d.count,
      avgSev: d.count ? (d.totalSev / d.count).toFixed(1) : 0,
      wtpRate: d.count ? Math.round((d.wtpY / d.count) * 100) : 0,
      score: d.count * (d.totalSev / (d.count || 1)) * (1 + d.wtpY / (d.count || 1)),
      quotes: d.quotes,
    }))
    .sort((a, b) => b.score - a.score);

  const title = h('div', { class: 'serif text-xl mb-1', text: 'Theme analysis' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: `Themes ranked by frequency × average severity × WTP signal. ${ranked.length} themes from ${STATE.matrix.length} matrix entries.` });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  if (ranked.length === 0) {
    const empty = h('div', { class: 'card p-8 text-center' });
    empty.style.color = 'var(--ink-mute)';
    empty.textContent = 'No matrix entries yet. Themes will appear here once quotes are tagged.';
    page.appendChild(empty);
    return;
  }

  const table = h('table', { class: 'data' });
  const thead = h('thead');
  thead.innerHTML = '<tr><th>#</th><th>Theme</th><th>Count</th><th>Avg severity</th><th>WTP rate</th><th>Score</th></tr>';
  table.appendChild(thead);

  const tbody = h('tbody');
  ranked.forEach((t, i) => {
    const scoreTd = h('td', { class: 'num font-medium', text: t.score.toFixed(1) });
    const sevColor = +t.avgSev >= 4 ? 'var(--rose)' : +t.avgSev >= 3 ? 'var(--honey)' : 'var(--ink)';
    const sevTd = h('td', { class: 'num', text: t.avgSev });
    sevTd.style.color = sevColor;

    const tr = h('tr', { class: 'h-row' }, [
      h('td', { class: 'num', text: `${i + 1}` }),
      h('td', { class: 'font-medium', text: t.tag }),
      h('td', { class: 'num', text: `${t.count}` }),
      sevTd,
      h('td', { class: 'num', text: `${t.wtpRate}%` }),
      scoreTd,
    ]);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const card = h('div', { class: 'card' });
  const tw = h('div', { class: 'table-wrap' });
  tw.appendChild(table);
  card.appendChild(tw);
  page.appendChild(card);
}

registerRoute('theme-analysis', 'Theme analysis', renderThemeAnalysis);

// --- Segment Cards ---
function renderSegmentCards(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'Segment cards' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'Build segment cards with supporting quotes from the matrix.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  const segments = [...new Set(STATE.matrix.map(r => (r.fields || r).Segment || (r.fields || r).segment).filter(Boolean))];

  if (segments.length === 0) {
    const empty = h('div', { class: 'card p-8 text-center' });
    empty.style.color = 'var(--ink-mute)';
    empty.textContent = 'No segments in the matrix yet. Segment cards will be buildable once interviews are tagged.';
    page.appendChild(empty);
    return;
  }

  segments.forEach(seg => {
    const quotes = STATE.matrix.filter(r => {
      const f = r.fields || r;
      return (f.Segment || f.segment) === seg;
    });
    const highSev = quotes.filter(r => {
      const f = r.fields || r;
      return +(f.Severity || f.severity || 0) >= 4;
    });
    const wtpY = quotes.filter(r => {
      const f = r.fields || r;
      return (f.WTP || f.wtp) === 'Y';
    });

    const themes = {};
    quotes.forEach(r => {
      const f = r.fields || r;
      const t = f['Theme tag'] || f.theme_tag;
      if (t) themes[t] = (themes[t] || 0) + 1;
    });
    const topThemes = Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const card = h('div', { class: 'card p-6 mb-4 max-w-3xl' });
    card.appendChild(h('div', { class: 'serif text-lg mb-3', text: seg }));

    const stats = h('div', { class: 'flex flex-wrap gap-3 mb-4' }, [
      h('span', { class: 'chip chip-line', text: `${quotes.length} quotes` }),
      h('span', { class: 'chip chip-rose', text: `${highSev.length} high-severity` }),
      h('span', { class: 'chip chip-sage', text: `${wtpY.length} WTP` }),
    ]);
    card.appendChild(stats);

    if (topThemes.length > 0) {
      const themeLabel = h('div', { class: 'micro mb-2', text: 'Top themes' });
      themeLabel.style.color = 'var(--ink-mute)';
      card.appendChild(themeLabel);
      const themeChips = h('div', { class: 'flex flex-wrap gap-2 mb-4' });
      topThemes.forEach(([t, n]) => {
        themeChips.appendChild(h('span', { class: 'chip chip-sage', text: `${t} (${n})` }));
      });
      card.appendChild(themeChips);
    }

    // Show top 3 quotes
    const topQuotes = quotes
      .sort((a, b) => +((b.fields || b).Severity || (b.fields || b).severity || 0) - +((a.fields || a).Severity || (a.fields || a).severity || 0))
      .slice(0, 3);

    if (topQuotes.length > 0) {
      const quotesLabel = h('div', { class: 'micro mb-2', text: 'Strongest quotes' });
      quotesLabel.style.color = 'var(--ink-mute)';
      card.appendChild(quotesLabel);
      topQuotes.forEach(r => {
        const f = r.fields || r;
        const q = h('div', { class: 'text-sm mb-2 pl-3', style: 'border-left: 2px solid var(--sage-soft);' });
        q.appendChild(h('div', { class: 'serif', text: `"${(f.Quote || f.quote || '').slice(0, 200)}"` }));
        const meta = h('div', { class: 'text-xs mt-1', text: `${f['Interview ID'] || f.interview_id || '?'} · Severity ${f.Severity || f.severity || '?'}` });
        meta.style.color = 'var(--ink-mute)';
        q.appendChild(meta);
        card.appendChild(q);
      });
    }

    page.appendChild(card);
  });
}

registerRoute('segment-cards', 'Segment cards', renderSegmentCards);

// --- Kill List ---
function renderKillList(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'Kill list' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'Hypotheses that evidence has killed. Append-only — entries cannot be edited or removed.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  page.appendChild(h('div', { class: 'mb-4' }, [
    h('button', { class: 'btn btn-primary', onclick: () => openKillForm() }, '+ Kill a hypothesis')
  ]));

  const card = h('div', { class: 'card' });

  if (!STATE.killList || STATE.killList.length === 0) {
    const empty = h('div', { class: 'p-8 text-center' });
    empty.style.color = 'var(--ink-mute)';
    empty.textContent = 'No hypotheses killed yet. When evidence falsifies a hypothesis, record it here.';
    card.appendChild(empty);
  } else {
    STATE.killList.forEach(r => {
      const f = r.fields || r;
      const row = h('div', { class: 'px-6 py-4 border-b', style: 'border-color:var(--line-soft);' }, [
        h('div', { class: 'flex items-center gap-2 mb-2' }, [
          h('span', { class: 'chip chip-rose', text: 'Killed' }),
          h('span', { class: 'text-xs', text: f.killed_date || '' }),
        ]),
        h('div', { class: 'serif text-base mb-1', text: f.hypothesis || '' }),
        h('div', { class: 'text-sm', text: f.evidence || '' }),
      ]);
      card.appendChild(row);
    });
  }
  page.appendChild(card);
}

function openKillForm() {
  openModal('Kill a hypothesis', [
    formField('Hypothesis', 'hypothesis', 'textarea', ''),
    formField('Evidence that killed it', 'evidence', 'textarea', ''),
    formField('Date', 'killed_date', 'input', new Date().toISOString().slice(0, 10), null, 'date'),
  ], async (data) => {
    try {
      const created = await api('/api/kill_list', { method: 'POST', body: JSON.stringify(data) });
      if (!STATE.killList) STATE.killList = [];
      STATE.killList.unshift(created);
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('kill-list', 'Kill list', renderKillList);

// --- Top-3 Pains ---
function renderTopPains(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'Top-3 pains' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'The three strongest pains surfaced by the research, each with three supporting quotes.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  // Derive top pains from matrix
  const painThemes = STATE.matrix.filter(r => {
    const f = r.fields || r;
    const tag = f['Theme tag'] || f.theme_tag || '';
    return tag.startsWith('Pain') || tag.startsWith('Friction');
  });

  const grouped = {};
  painThemes.forEach(r => {
    const f = r.fields || r;
    const tag = f['Theme tag'] || f.theme_tag;
    if (!grouped[tag]) grouped[tag] = { quotes: [], totalSev: 0, wtpY: 0 };
    grouped[tag].quotes.push(f);
    grouped[tag].totalSev += +(f.Severity || f.severity || 0);
    if ((f.WTP || f.wtp) === 'Y') grouped[tag].wtpY++;
  });

  const ranked = Object.entries(grouped)
    .map(([tag, d]) => ({ tag, ...d, score: d.quotes.length * (d.totalSev / d.quotes.length) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    const empty = h('div', { class: 'card p-8 text-center' });
    empty.style.color = 'var(--ink-mute)';
    empty.textContent = 'No pain or friction themes tagged yet. Top pains will be derived from the matrix.';
    page.appendChild(empty);
    return;
  }

  ranked.forEach((pain, i) => {
    const avgSev = (pain.totalSev / pain.quotes.length).toFixed(1);
    const card = h('div', { class: 'card p-6 mb-4 max-w-3xl' });

    const header = h('div', { class: 'flex items-baseline justify-between mb-3' }, [
      h('div', { class: 'serif text-lg', text: `${i + 1}. ${pain.tag}` }),
      h('div', { class: 'flex gap-2' }, [
        h('span', { class: 'chip chip-line', text: `${pain.quotes.length} mentions` }),
        h('span', { class: `chip ${+avgSev >= 4 ? 'chip-rose' : 'chip-honey'}`, text: `Avg severity ${avgSev}` }),
        h('span', { class: 'chip chip-sage', text: `${pain.wtpY} WTP` }),
      ]),
    ]);
    card.appendChild(header);

    pain.quotes.sort((a, b) => +(b.Severity || b.severity || 0) - +(a.Severity || a.severity || 0)).slice(0, 3).forEach(q => {
      const quote = h('div', { class: 'text-sm mb-3 pl-3', style: 'border-left: 2px solid var(--sage-soft);' });
      quote.appendChild(h('div', { class: 'serif', text: `"${(q.Quote || q.quote || '').slice(0, 250)}"` }));
      const meta = h('div', { class: 'text-xs mt-1', text: `${q['Interview ID'] || q.interview_id || '?'} · ${q.Segment || q.segment || '?'} · Severity ${q.Severity || q.severity || '?'}` });
      meta.style.color = 'var(--ink-mute)';
      quote.appendChild(meta);
      card.appendChild(quote);
    });

    page.appendChild(card);
  });
}

registerRoute('top-pains', 'Top-3 pains', renderTopPains);

// --- State of the Field ---
function renderStateOfField(page) {
  const title = h('div', { class: 'serif text-xl mb-1', text: 'State of the field' });
  const subtitle = h('div', { class: 'text-sm mb-5', text: 'A single paragraph capturing where the research stands. Dated and authored.' });
  subtitle.style.color = 'var(--ink-soft)';
  page.appendChild(title);
  page.appendChild(subtitle);

  const card = h('div', { class: 'card p-6 max-w-3xl' });

  const saved = STATE.stateOfField;
  if (saved) {
    const meta = h('div', { class: 'text-xs mb-3', text: `Last updated ${saved.updated_at || saved.created_at || '—'} by ${saved.author || '—'}` });
    meta.style.color = 'var(--ink-mute)';
    card.appendChild(meta);
    card.appendChild(h('div', { class: 'text-sm leading-relaxed whitespace-pre-line', text: saved.content || '' }));
    card.appendChild(h('div', { class: 'mt-4' }, [
      h('button', { class: 'btn btn-line', onclick: () => openFieldEditor(saved) }, 'Edit')
    ]));
  } else {
    const empty = h('div', { class: 'text-sm mb-4', text: 'No state-of-the-field written yet.' });
    empty.style.color = 'var(--ink-mute)';
    card.appendChild(empty);
    card.appendChild(h('button', { class: 'btn btn-primary', onclick: () => openFieldEditor() }, 'Write the first one'));
  }

  page.appendChild(card);
}

function openFieldEditor(existing) {
  openModal('State of the field', [
    formField('Content', 'content', 'textarea', existing?.content || ''),
  ], async (data) => {
    try {
      data.author = 'You';
      data.updated_at = new Date().toISOString().slice(0, 10);
      if (existing?.id) {
        const updated = await api(`/api/deliverables/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { evidence: data.content } }) });
        STATE.stateOfField = { ...existing, content: data.content, updated_at: data.updated_at };
      } else {
        const created = await api('/api/deliverables', { method: 'POST', body: JSON.stringify({ phase: 3, deliverable: 'State of the field', status: 'In progress', evidence: data.content }) });
        STATE.stateOfField = { id: created.id, content: data.content, updated_at: data.updated_at, author: data.author };
      }
      closeModal();
      renderCurrentRoute();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

registerRoute('state-of-field', 'State of the field', renderStateOfField);
