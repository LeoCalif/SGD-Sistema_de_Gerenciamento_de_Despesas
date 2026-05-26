// ── HELPERS ───────────────────────────────────────────
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

  // No auto-creation — user creates years manually via the button

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

// ── ANOS ──────────────────────────────────────────────
const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

// Cria um ano completo silenciosamente (sem fechar modal)
async function createYearSilent(year) {
  const existing = new Set(state.months.map(m => m.nome.toLowerCase()));
  const toCreate = MESES_PT
    .map(m => `${m}/${year}`)
    .filter(name => !existing.has(name.toLowerCase()));

  if (!toCreate.length) return 0;

  // Insert all 12 months at once
  const inserts = toCreate.map(nome => withOwner({ nome }));
  const { data, error } = await db.from('meses').insert(inserts).select();
  if (error || !data) return 0;

  // Add to state in order
  data.forEach(m => state.months.push(m));
  // Re-sort by created_at to keep order
  state.months.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  return data.length;
}

// Called from modal button
async function createYear() {
  const year = parseInt(document.getElementById('modal-year-input').value);
  if (!year || year < 2000 || year > 2100) { toast('Ano inválido.', 'error'); return; }

  const btn = document.getElementById('btn-create-year');
  btn.disabled = true; btn.textContent = 'Criando...';
  setSyncStatus(false);

  const existing = new Set(state.months.map(m => m.nome.toLowerCase()));
  const toCreate = MESES_PT
    .map(m => `${m}/${year}`)
    .filter(name => !existing.has(name.toLowerCase()));

  if (!toCreate.length) {
    toast(`Todos os meses de ${year} já existem.`, 'warning');
    btn.disabled = false; btn.textContent = 'Criar ano';
    closeModal('modal-new-year');
    setSyncStatus(true);
    return;
  }

  const inserts = toCreate.map(nome => withOwner({ nome }));
  const { data, error } = await db.from('meses').insert(inserts).select();

  btn.disabled = false; btn.textContent = 'Criar ano';

  if (error || !data) { toast('Erro ao criar meses.', 'error'); setSyncStatus(true); return; }

  data.forEach(m => state.months.push(m));
  state.months.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  // Navigate to Janeiro of the created year
  const janeiro = state.months.find(m => m.nome === `Janeiro/${year}`);
  if (janeiro) {
    state.currentMonth = janeiro.id;
    await loadGastos();
  }

  closeModal('modal-new-year');
  setSyncStatus(true);
  toast(`${toCreate.length} meses de ${year} criados!`, 'success');
  renderPage(currentPage);
}

// Delete entire year
async function deleteYear() {
  const year = parseInt(document.getElementById('modal-delete-year-input').value);
  if (!year || year < 2000 || year > 2100) { toast('Ano inválido.', 'error'); return; }

  const monthsOfYear = state.months.filter(m => m.nome.includes(`/${year}`));
  if (!monthsOfYear.length) { toast(`Nenhum mês encontrado para ${year}.`, 'error'); return; }

  if (!confirm(`Apagar TODOS os ${monthsOfYear.length} meses de ${year} e seus gastos? Esta ação não pode ser desfeita.`)) return;

  const btn = document.getElementById('btn-delete-year');
  btn.disabled = true; btn.textContent = 'Apagando...';
  setSyncStatus(false);

  const ids = monthsOfYear.map(m => m.id);

  // Delete gastos first (cascade might handle it, but explicit is safer)
  for (const id of ids) {
    await db.from('gastos').delete().eq('mes_id', id);
  }
  await db.from('meses').delete().in('id', ids);

  state.months = state.months.filter(m => !ids.includes(m.id));

  // If current month was deleted, go to last available
  if (ids.includes(state.currentMonth)) {
    state.currentMonth = state.months[state.months.length - 1]?.id || null;
    state.currentCard  = state.cards[0] || null;
    if (state.currentMonth) await loadGastos();
    else state.gastos = [];
  }

  btn.disabled = false; btn.textContent = 'Apagar ano';
  closeModal('modal-delete-year');
  setSyncStatus(true);
  toast(`Ano ${year} apagado.`);
  renderPage(currentPage);
}

// ── CARRY OVER PARCELAS ───────────────────────────────
// Called when navigating TO a month — checks if parcelas need to be propagated
async function propagateParcelasToMonth(mesId) {
  // Find index of this month in the ordered list
  const idx = state.months.findIndex(m => m.id === mesId);
  if (idx <= 0) return; // First month, nothing to inherit

  const prevMesId = state.months[idx - 1].id;

  // Check if this month already has any carried-over gastos
  const { data: existing } = await db
    .from('gastos')
    .select('id')
    .eq('mes_id', mesId)
    .gt('parcela_atual', 1)
    .limit(1);

  if (existing && existing.length > 0) return; // Already propagated

  // Get parcelados from previous month
  const { data: gastosOrigem } = await db
    .from('gastos')
    .select('*')
    .eq('mes_id', prevMesId)
    .gt('parcelas', 1);

  if (!gastosOrigem || !gastosOrigem.length) return;

  // Only carry those with remaining parcelas
  const pendentes = gastosOrigem.filter(g => (g.parcela_atual || 1) < g.parcelas);
  if (!pendentes.length) return;

  const inserts = pendentes.map(g => withOwner({
    mes_id:         mesId,
    cartao:         g.cartao,
    pessoa:         g.pessoa,
    descricao:      g.descricao || '',
    valor:          g.valor,
    parcelas:       g.parcelas,
    parcela_atual:  (g.parcela_atual || 1) + 1,
    parcela_origem: g.parcela_origem || g.id,
  }));

  const { error } = await db.from('gastos').insert(inserts);
  if (!error) {
    // Reload gastos for this month to include new ones
    await loadGastos();
    toast(`${inserts.length} parcela(s) propagadas automaticamente.`, 'success');
    renderPage(currentPage);
  }
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
    mes_id:        state.currentMonth,
    cartao:        state.currentCard,
    pessoa,
    descricao:     desc || '',
    valor,
    parcelas:      parcelas || 1,
    parcela_atual: 1,
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
  const gasto = state.gastos.find(g => g.id === id);
  if (!gasto) return;

  const isParcelado = gasto.parcelas > 1;
  const origemId    = gasto.parcela_origem || gasto.id;

  let msg = 'Remover este gasto?';
  if (isParcelado) {
    const label = gasto.descricao || 'sem descricao';
    msg = gasto.parcela_atual > 1
      ? 'Remover esta e todas as parcelas seguintes de "' + label + '"?'
      : 'Remover todas as ' + gasto.parcelas + ' parcelas de "' + label + '"?';
  }
  if (!confirm(msg)) return;

  setSyncStatus(false);

  if (isParcelado) {
    // Find all records in this chain (origin + all copies)
    const { data: allParcelas } = await db
      .from('gastos')
      .select('id, mes_id')
      .or('parcela_origem.eq.' + origemId + ',id.eq.' + origemId);

    const ids = allParcelas ? allParcelas.map(g => g.id) : [id];

    await db.from('gastos').delete().in('id', ids);
    state.gastos = state.gastos.filter(g => !ids.includes(g.id));

    const outros = allParcelas
      ? allParcelas.filter(g => g.mes_id !== state.currentMonth).length
      : 0;

    toast(outros > 0
      ? 'Removido! ' + outros + ' parcela(s) em outros meses tambem apagadas.'
      : 'Removido!', 'success');

  } else {
    const { error } = await db.from('gastos').delete().eq('id', id);
    if (error) { toast('Erro ao remover.', 'error'); setSyncStatus(true); return; }
    state.gastos = state.gastos.filter(g => g.id !== id);
    toast('Removido.');
  }

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
  state.currentCard  = null;
  toast('Dados apagados. Crie um novo ano para começar.', 'success');
  renderPage(currentPage);
}

// ── IMPORT HELPERS ────────────────────────────────────
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
