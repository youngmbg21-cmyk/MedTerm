/* ============================================================
   AUTH — Supabase magic-link login. Loaded lazily — in 'api'
   data mode at boot, otherwise the first time the assistant runs.

   Self-contained on purpose: it must NOT import the app shell —
   pulling app.js in here would run incompatible top-level code
   and crash the save path (circular import via data.js).
   ============================================================ */

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = import('./supabase.js').then(m => m.supabase);
  }
  return clientPromise;
}

/* Minimal element helper — local so auth has zero app dependencies.
   Text goes through textContent; no innerHTML with user input. */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

export async function getSession() {
  const supabase = await getClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/* Full-screen magic-link login. Resolves when signed in. */
export async function requireLogin() {
  const session = await getSession();
  if (session) return session;

  return new Promise(async (resolve) => {
    const supabase = await getClient();

    const email = el('input', { class: 'field', type: 'email', placeholder: 'you@example.com', autocomplete: 'email', style: 'margin-bottom:12px;' });
    const msg = el('div', { style: 'display:none;font-size:12px;line-height:16px;margin-bottom:12px;' });

    const form = el('form', {
      class: 'card',
      style: 'width:100%;max-width:340px;padding:24px;',
      onsubmit: async (e) => {
        e.preventDefault();
        msg.style.display = 'block';
        try {
          const { error } = await supabase.auth.signInWithOtp({ email: email.value.trim() });
          if (error) { msg.style.color = '#94382F'; msg.textContent = error.message; }
          else { msg.style.color = '#0E4E34'; msg.textContent = 'Check your email for the sign-in link.'; }
        } catch (err) {
          // Network failure (offline) rejects the call — surface it instead of
          // leaving the button looking inert with an unhandled rejection.
          msg.style.color = '#94382F';
          msg.textContent = 'Couldn’t reach sign-in. Check your connection and try again.';
        }
      },
    }, [
      el('div', { class: 'serif', style: 'font-size:22px;margin-bottom:4px;', text: 'HaTi Research' }),
      el('div', { style: 'font-size:13px;line-height:19px;color:#64736A;margin-bottom:18px;', text: 'Sign in with your team email to continue.' }),
      el('div', { class: 'micro', style: 'color:#42544A;margin-bottom:6px;', text: 'Email' }),
      email,
      msg,
      el('button', { class: 'btn btn-primary tall', type: 'submit', style: 'width:100%;', text: 'Send magic link' }),
    ]);

    const overlay = el('div', {
      id: 'login-overlay',
      style: 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:#F3F5F2;',
    }, [form]);
    document.body.appendChild(overlay);

    supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' && s) { overlay.remove(); resolve(s); }
    });
  });
}
