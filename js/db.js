// ── HELPERS ───────────────────────────────────────────
// All inserts include the current user's id for RLS
function withOwner(obj) {
  return { ...obj, user_id: currentUser.id };
}

// ── LOAD ALL DATA ─────────────────────────────────────
async function loadAll() {
  const [{ data: pessoas }, { data: cartoes }, { data: meses }] = await Promise.all([
    db.from('pessoas').select('*').order('created_at'),
    db.from('cartoes').select('*').order('created_at'),
    db.from('meses').select('*').order('created_at'),
  ]);

  state.persons = (pessoas || []).map(p => p.nome);
  state.cards   = (cartoes || []).map(c => c.nome);
  state.months  = meses || [];

  if (!state.months.length) await createDefaultMonth();

  state.currentMonth = state.months[state.months.length - 1]?.id || null;
  state.currentCard  = state.cards[0] || null;

  if (state.currentMonth) await loadGastos();

  goTo('lancamento');
}

async function loadGastos() {
  if (!state.currentMonth) return;
  setSyncStatus(false);
  const { data } = await db
    .from('gastos')
    .select('*')
    .eq('mes_id', state.currentMonth)
    .order('created_at');
  state.gastos = data || [];
  setSyncStatus(true);
}

// ── MESES ─────────────────────────────────────────────
async function createDefaultMonth() {
  const now  = new Date();
  const raw  = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const name = capitalize(raw);
  const { data } = await db.from('meses').insert(withOwner({ nome: name })).select().single();
  if (data) state.months = [data];
}

async function createMonth() {
  const name = document.getElementById('modal-month-name').value.trim();
  if (!name) return;

  const { data, error } = await db
    .from('meses').insert(withOwner({ nome: name })).select().single();
  if (error) { toast('Erro ao criar mês.', 'error'); return; }

  state.months.push(data);
  state.currentMonth = data.id;
  state.gastos       = [];

  closeModal('modal-new-month');
  toast(`${name} criado!`, 'success');
  renderPage(currentPage);
}

async function deleteMonth(id, name) {
  if (!confirm(`Apagar o mês "${name}" e todos os gastos? Esta ação não pode ser desfeita.`)) return;

  setSyncStatus(false);
  // gastos deleted via cascade; meses filtered by RLS automatically
  await db.from('gastos').delete().eq('mes_id', id);
  await db.from('meses').delete().eq('id', id);

  state.months = state.months.filter(m => m.id !== id);

  if (state.currentMonth === id) {
    state.currentMonth = state.months[state.months.length - 1]?.id || null;
    state.currentCard  = state.cards[0] || null;
    if (state.currentMonth) await loadGastos();
    else state.gastos = [];
  }

  toast(`"${name}" apagado.`);
  setSyncStatus(true);
  renderPage(currentPage);
}

// ── GASTOS ────────────────────────────────────────────
async function addItem() {
  const desc     = document.getElementById('f-desc').value.trim();
  const valor    = parseFloat(document.getElementById('f-valor').value);
  const pessoa   = document.getElementById('f-pessoa').value;
  const parcelas = parseInt(document.getElementById('f-parcelas').value);

  if (isNaN(valor) || valor === 0) { toast('Preencha o valor.', 'error'); return; }
  if (!state.currentMonth || !state.currentCard) { toast('Selecione mês e cartão.', 'error'); return; }

  const btn = document.getElementById('btn-add');
  btn.disabled = true;
  setSyncStatus(false);

  const { data, error } = await db.from('gastos').insert(withOwner({
    mes_id:    state.currentMonth,
    cartao:    state.currentCard,
    pessoa,
    descricao: desc || '',
    valor,
    parcelas:  parcelas || 1,
  })).select().single();

  btn.disabled = false;

  if (error) { toast('Erro ao salvar.', 'error'); setSyncStatus(true); return; }

  state.gastos.push(data);
  document.getElementById('f-desc').value  = '';
  document.getElementById('f-valor').value = '';
  document.getElementById('f-desc').focus();

  toast('Gasto adicionado!', 'success');
  renderItemsTable();
  renderCardChips();
  updateBadges();
  setSyncStatus(true);
}

async function deleteItem(id) {
  if (!confirm('Remover este gasto?')) return;
  setSyncStatus(false);

  const { error } = await db.from('gastos').delete().eq('id', id);
  if (error) { toast('Erro ao remover.', 'error'); setSyncStatus(true); return; }

  state.gastos = state.gastos.filter(g => g.id !== id);
  toast('Removido.');
  renderItemsTable();
  renderCardChips();
  updateBadges();
  setSyncStatus(true);
}

async function saveEdit() {
  const id       = document.getElementById('edit-id').value;
  const desc     = document.getElementById('edit-desc').value.trim();
  const valor    = parseFloat(document.getElementById('edit-valor').value);
  const pessoa   = document.getElementById('edit-pessoa').value;
  const parcelas = parseInt(document.getElementById('edit-parcelas').value);

  if (isNaN(valor) || valor === 0) { toast('Preencha o valor.', 'error'); return; }

  setSyncStatus(false);

  const { data, error } = await db.from('gastos').update({
    descricao: desc || '',
    valor,
    pessoa,
    parcelas: parcelas || 1,
  }).eq('id', id).select().single();

  if (error) { toast('Erro ao salvar edição.', 'error'); setSyncStatus(true); return; }

  const idx = state.gastos.findIndex(g => g.id === id);
  if (idx !== -1) state.gastos[idx] = data;

  closeModal('modal-edit');
  toast('Gasto atualizado!', 'success');
  renderItemsTable();
  renderCardChips();
  setSyncStatus(true);
}

// ── PESSOAS / CARTÕES ─────────────────────────────────
async function addPerson() {
  const name = document.getElementById('new-person').value.trim();
  if (!name || state.persons.includes(name)) return;
  const { error } = await db.from('pessoas').insert(withOwner({ nome: name }));
  if (error) { toast('Erro ao adicionar.', 'error'); return; }
  state.persons.push(name);
  document.getElementById('new-person').value = '';
  toast(`${name} adicionada!`, 'success');
  renderConfig();
}

async function removePerson(name) {
  if (!confirm(`Remover "${name}"?`)) return;
  const { error } = await db.from('pessoas').delete().eq('nome', name);
  if (error) { toast('Erro.', 'error'); return; }
  state.persons = state.persons.filter(p => p !== name);
  toast('Removida.');
  renderConfig();
}

async function addCard() {
  const name = document.getElementById('new-card').value.trim();
  if (!name || state.cards.includes(name)) return;
  const { error } = await db.from('cartoes').insert(withOwner({ nome: name }));
  if (error) { toast('Erro ao adicionar.', 'error'); return; }
  state.cards.push(name);
  if (!state.currentCard) state.currentCard = name;
  document.getElementById('new-card').value = '';
  toast(`${name} adicionado!`, 'success');
  renderConfig();
}

async function removeCard(name) {
  if (!confirm(`Remover cartão "${name}"?`)) return;
  const { error } = await db.from('cartoes').delete().eq('nome', name);
  if (error) { toast('Erro.', 'error'); return; }
  state.cards = state.cards.filter(c => c !== name);
  if (state.currentCard === name) state.currentCard = state.cards[0] || null;
  toast('Removido.');
  renderConfig();
}

async function clearAllData() {
  if (!confirm('Apagar TODOS os dados permanentemente? Esta ação não pode ser desfeita.')) return;
  await db.from('gastos').delete().eq('user_id', currentUser.id);
  await db.from('meses').delete().eq('user_id', currentUser.id);
  state.months       = [];
  state.gastos       = [];
  state.currentMonth = null;
  await createDefaultMonth();
  state.currentMonth = state.months[0]?.id;
  toast('Dados apagados.');
  renderPage(currentPage);
}

// ── IMPORT HELPERS ────────────────────────────────────
// Used by importexport.js when creating months/persons/cards during import
async function findOrCreateMonth(name) {
  let month = state.months.find(m => m.nome.toLowerCase() === name.toLowerCase());
  if (!month) {
    const { data } = await db.from('meses').insert(withOwner({ nome: name })).select().single();
    if (data) { state.months.push(data); month = data; }
  }
  return month;
}

async function ensurePerson(name) {
  if (!name || state.persons.includes(name)) return;
  await db.from('pessoas').insert(withOwner({ nome: name }));
  state.persons.push(name);
}

async function ensureCard(name) {
  if (!name || state.cards.includes(name)) return;
  await db.from('cartoes').insert(withOwner({ nome: name }));
  state.cards.push(name);
}
