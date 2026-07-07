/* Desktop entry — larger screens keep the original workspace exactly as it
   was before the mobile redesign: sidebar shell, Tailwind utilities, theme.css,
   the app router, all screen modules, and the assistant panel. index.html
   picks this on viewports wider than a phone; phones get boot-mobile.js.

   Assets and shell are set up here (not in static HTML) so a phone never
   downloads the desktop stylesheet or Tailwind, and so #modal-root exists in
   the DOM before app.js — whose top-level code observes it — is imported. */

function loadStylesheet(href) {
  return new Promise((resolve) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onload = resolve; l.onerror = resolve;
    document.head.appendChild(l);
  });
}
function loadScript(src) {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = resolve;
    document.head.appendChild(s);
  });
}

const SHELL = `
<div id="mobile-overlay" class="mobile-overlay"></div>
<aside id="sidebar" class="sidebar-nav" aria-label="Main navigation">
  <div class="wordmark">
    <div class="wordmark-badge"><span class="serif">M</span></div>
    <div>
      <div class="wordmark-name serif">MedTerminal</div>
      <div class="wordmark-sub micro">Research Workspace</div>
    </div>
  </div>
  <nav id="nav-root" class="nav-scroll"></nav>
  <div class="sidebar-foot">
    <button class="btn btn-line" id="open-chat-btn"><span>💬</span><span>Assistant</span></button>
    <div class="sidebar-foot-row">
      <a class="nav-foot-link" id="settings-link" href="#settings">Settings</a>
      <span class="micro t-mute" id="version-tag" title="If this doesn't match the latest release, hard-refresh — the browser is serving cached files.">v0.4</span>
    </div>
  </div>
</aside>
<main class="main-area">
  <header class="app-header">
    <div class="app-header-inner">
      <div class="header-left">
        <button class="hamburger" id="hamburger-btn" aria-label="Menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
        </button>
        <div class="header-title-block">
          <h1 id="page-title" class="serif">Overview</h1>
          <div id="page-question" class="page-question"></div>
        </div>
      </div>
      <div class="header-right">
        <div id="page-actions" class="header-actions"></div>
        <span id="sync-status" class="chip chip-line">Loading…</span>
        <button class="btn btn-ghost" id="refresh-btn" title="Reload data">↻</button>
      </div>
    </div>
  </header>
  <div id="page" class="page-content"></div>
</main>
<aside id="chat-panel" class="chat-panel closed">
  <div class="px-5 py-4 border-b flex items-center justify-between" style="border-color:var(--line-soft);">
    <div>
      <div class="serif text-lg leading-none">Research assistant</div>
      <div class="micro mt-1" style="color:var(--ink-mute);">Reads your data · advises next steps</div>
    </div>
    <div class="flex items-center gap-2">
      <button class="btn btn-ghost text-xs" id="clear-chat-btn" title="Clear conversation">Clear</button>
      <button class="btn btn-ghost" id="close-chat-btn" aria-label="Close">✕</button>
    </div>
  </div>
  <div id="chat-messages" class="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3"></div>
  <div id="chat-quick" class="px-5 py-3 border-t flex flex-wrap gap-2" style="border-color:var(--line-soft);"></div>
  <div class="px-5 py-4 border-t" style="border-color:var(--line-soft);">
    <div class="flex gap-2 items-end">
      <textarea id="chat-input" class="textarea" rows="2" placeholder="Ask anything about the project state…"></textarea>
      <button class="btn btn-primary" id="send-chat-btn">Send</button>
    </div>
  </div>
</aside>
<div id="modal-root"></div>`;

async function bootDesktop() {
  // Styling first so the shell paints correctly; then the DOM shell; then the
  // app (whose module top-level touches #modal-root, so it must exist by now).
  await loadStylesheet('./css/theme.css');
  loadScript('https://cdn.tailwindcss.com'); // utilities; fine if it lags
  document.body.innerHTML = SHELL;

  const { loadAllData, renderCurrentRoute, buildNav, go, openSidebar, closeSidebar } = await import('./app.js');
  const { DATA_MODE, AI_MODE } = await import('./config.js');
  const { initChat } = await import('./chat.js');

  await Promise.all([
    import('./screens/overview.js'), import('./screens/decision-brief.js'), import('./screens/outreach.js'),
    import('./screens/interviews.js'), import('./screens/matrix.js'), import('./screens/saturation.js'),
    import('./screens/scripts.js'), import('./screens/templates.js'), import('./screens/manual.js'),
    import('./screens/sensemaking.js'), import('./screens/economics.js'), import('./screens/decision.js'),
    import('./screens/reports.js'), import('./screens/documents.js'), import('./screens/settings.js'),
  ]);

  document.getElementById('hamburger-btn').addEventListener('click', openSidebar);
  document.getElementById('mobile-overlay').addEventListener('click', closeSidebar);

  // Hidden admin door: five quick taps on the wordmark → admin.html.
  let wordmarkTaps = 0, wordmarkTimer = null;
  document.querySelector('.wordmark').addEventListener('click', () => {
    wordmarkTaps++;
    clearTimeout(wordmarkTimer);
    wordmarkTimer = setTimeout(() => { wordmarkTaps = 0; }, 1500);
    if (wordmarkTaps >= 5) { wordmarkTaps = 0; window.location.href = 'admin.html'; }
  });
  document.getElementById('refresh-btn').addEventListener('click', () => loadAllData());
  document.getElementById('settings-link').addEventListener('click', () => { go('settings'); closeSidebar(); });

  buildNav();
  initChat();

  window.addEventListener('hashchange', renderCurrentRoute);
  if (!location.hash) location.hash = 'overview';
  renderCurrentRoute();

  if (DATA_MODE === 'api' || AI_MODE === 'worker') {
    const { requireLogin } = await import('./auth.js');
    await requireLogin();
  }
  await loadAllData();
}

bootDesktop();
