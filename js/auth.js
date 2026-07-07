/* ============================================================
   AUTH — Supabase magic-link login. Only loaded in 'api' mode
   (data.js imports it lazily at request time).

   Self-contained on purpose: it must NOT import the app shell.
   The mobile front end has no `#modal-root` / desktop kit, so
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

/* Full-screen magic-link login styled for the mobile shell (css/mobile.css).
   Resolves when signed in. */
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
        const { error } = await supabase.auth.signInWithOtp({ email: email.value.trim() });
        msg.style.display = 'block';
        if (error) { msg.style.color = '#9A3F3F'; msg.textContent = error.message; }
        else { msg.style.color = '#3F5A4D'; msg.textContent = 'Check your email for the sign-in link.'; }
      },
    }, [
      el('div', { class: 'serif', style: 'font-size:22px;margin-bottom:4px;', text: 'MedTerminal' }),
      el('div', { style: 'font-size:13px;line-height:19px;color:#6E6A5E;margin-bottom:18px;', text: 'Sign in with your team email to continue.' }),
      el('div', { class: 'micro', style: 'color:#4A5651;margin-bottom:6px;', text: 'Email' }),
      email,
      msg,
      el('button', { class: 'btn btn-primary tall', type: 'submit', style: 'width:100%;', text: 'Send magic link' }),
    ]);

    const overlay = el('div', {
      id: 'login-overlay',
      style: 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:#F5F1EA;',
    }, [form]);
    document.body.appendChild(overlay);

    supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' && s) { overlay.remove(); resolve(s); }
    });
  });
}
