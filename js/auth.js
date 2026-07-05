/* ============================================================
   AUTH — Supabase magic-link login. Only loaded in 'api' mode
   (data.js and the boot script import it lazily).
   ============================================================ */
import { h } from './app.js';

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = import('./supabase.js').then(m => m.supabase);
  }
  return clientPromise;
}

export async function getSession() {
  const supabase = await getClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/* Shows a full-screen magic-link login. Resolves when signed in. */
export async function requireLogin() {
  const session = await getSession();
  if (session) return session;

  return new Promise(async (resolve) => {
    const supabase = await getClient();

    const email = h('input', { class: 'input mb-3', type: 'email', placeholder: 'you@example.com', autocomplete: 'email' });
    const msg = h('div', { class: 'text-xs mb-3', style: 'display:none;' });

    const form = h('form', { class: 'card p-8 w-full max-w-sm', onsubmit: async (e) => {
      e.preventDefault();
      const { error } = await supabase.auth.signInWithOtp({ email: email.value.trim() });
      msg.style.display = 'block';
      if (error) {
        msg.style.color = 'var(--rose)';
        msg.textContent = error.message;
      } else {
        msg.style.color = 'var(--sage-deep)';
        msg.textContent = 'Check your email for the sign-in link.';
      }
    } }, [
      h('div', { class: 'serif text-2xl mb-1', text: 'MedTerminal' }),
      h('div', { class: 'text-sm mb-6 t-mute', text: 'Sign in with your team email to continue.' }),
      h('label', { class: 'label', text: 'Email' }),
      email,
      msg,
      h('button', { class: 'btn btn-primary w-full justify-center', type: 'submit' }, 'Send magic link'),
    ]);

    const overlay = h('div', {
      class: 'fixed inset-0 z-[100] flex items-center justify-center p-5',
      style: 'background:var(--bg);',
      id: 'login-overlay',
    }, [form]);
    document.body.appendChild(overlay);

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        overlay.remove();
        resolve(session);
      }
    });
  });
}
