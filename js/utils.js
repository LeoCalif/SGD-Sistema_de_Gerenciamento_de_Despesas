// ── FORMATTING ────────────────────────────────────────
function fmt(n) {
  return Math.abs(Number(n)).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── TOAST ─────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 2800);
}

// ── SYNC STATUS ───────────────────────────────────────
function setSyncStatus(ok) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = ok ? '● Sincronizado' : '● Salvando...';
  el.style.color  = ok ? 'var(--green)' : 'var(--amber)';
}

// ── MODAL ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)')
      .forEach(m => m.classList.add('hidden'));
  }
});

// ── BADGES ────────────────────────────────────────────
function updateBadges() {
  const el = document.getElementById('badge-pessoas');
  if (el) el.textContent = new Set(state.gastos.map(g => g.pessoa)).size;
}

// ── DESC LABEL ────────────────────────────────────────
function descLabel(desc) {
  return desc
    ? esc(desc)
    : '<span style="color:var(--text3);font-style:italic">—</span>';
}

// ── PARCELAS LABEL ────────────────────────────────────
function parcLabel(parcelas) {
  return parcelas > 1 ? `${parcelas}x` : 'À vista';
}
