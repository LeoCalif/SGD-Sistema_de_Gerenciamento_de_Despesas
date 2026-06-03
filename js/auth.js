// ── AUTH ──────────────────────────────────────────────
async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    const username = await getUsernameById(session.user.id);
    showApp(username || session.user.email);
    await loadAll();
    await loadCaixinhas();
    await loadSharedGastos();
  } else {
    showLogin();
  }
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');

  errEl.style.display = 'none';
  if (!username || !password) { showLoginError('Preencha usuário e senha.'); return; }

  btn.disabled    = true;
  btn.textContent = 'Entrando...';

  // 1. Resolve username → email via profiles table
  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();

  if (profileErr) {
    console.error("Erro ao resolver username:", profileErr);
    btn.disabled    = false;
    btn.textContent = 'Entrar';
    showLoginError('Erro ao consultar banco de dados.');
    return;
  }

  if (!profile) {
    btn.disabled    = false;
    btn.textContent = 'Entrar';
    showLoginError('Usuário não encontrado.');
    return;
  }

  // 2. Get email from auth.users via RPC
  const { data: emailData, error: emailErr } = await db
    .rpc('get_user_email', { user_id: profile.id });

  if (emailErr || !emailData) {
    btn.disabled    = false;
    btn.textContent = 'Entrar';
    showLoginError('Erro ao autenticar.');
    return;
  }

  // 3. Sign in with email + password
  const { data, error } = await db.auth.signInWithPassword({
    email:    emailData,
    password,
  });

  btn.disabled    = false;
  btn.textContent = 'Entrar';

  if (error) { showLoginError('Usuário ou senha incorretos.'); return; }

  currentUser = data.user;
  showApp(username);
  await loadAll();
  await loadCaixinhas();
  await loadSharedGastos();
}

async function doLogout() {
  await db.auth.signOut();
  currentUser        = null;
  state.persons      = [];
  state.cards        = [];
  state.months       = [];
  state.gastos       = [];
  state.currentMonth = null;
  state.currentCard  = null;

  document.getElementById('app').classList.add('hidden');
  showLogin();
  toast('Sessão encerrada.');
}

async function getUsernameById(userId) {
  const { data } = await db
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();
  return data?.username || null;
}

function showLogin() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  setTimeout(() => document.getElementById('login-username').focus(), 100);
}

function showApp(displayName) {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const el = document.getElementById('user-display');
  if (el) el.textContent = displayName;
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent   = msg;
  el.style.display = 'block';
}

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
  ['login-username', 'login-password'].forEach(id => {
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
});
