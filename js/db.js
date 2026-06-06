// ── HELPERS ───────────────────────────────────────────
function withOwner(obj) {
  return { ...obj, user_id: currentUser.id };
}

// ── LOAD ALL DATA ─────────────────────────────────────
async function loadAll() {
  const [{ data: pessoas }, { data: cartoes }, { data: meses }] = await Promise.all([
    db.from('pessoas').select('*').eq('user_id', currentUser.id).order('created_at'),
    db.from('cartoes').select('*').eq('user_id', currentUser.id).order('created_at'),
    db.from('meses').select('*').eq('user_id', currentUser.id).order('created_at'),
  ]);

  state.persons = (pessoas || []).map(p => p.nome);
  state.personsData = pessoas || [];
  state.cards   = (cartoes || []).map(c => c.nome);
  state.months  = meses || [];

  // Se o usuário não tiver nenhum mês cadastrado (novo usuário), cria o ano corrente automaticamente
  if (!state.months || state.months.length === 0) {
    const currentYear = new Date().getFullYear();
    await createYearSilent(currentYear);
    const { data: updatedMeses } = await db.from('meses').select('*').eq('user_id', currentUser.id).order('created_at');
    state.months = updatedMeses || [];
  }
  sortMonthsChronologically(state.months);

  // Try to find current month (e.g. "Junho/2026")
  const now      = new Date();
  const mesesPt  = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  const nomeMes  = `${mesesPt[now.getMonth()]}/${now.getFullYear()}`;
  const found    = state.months.find(m => m.nome.toLowerCase() === nomeMes.toLowerCase());
  state.currentMonth = found?.id || state.months[state.months.length - 1]?.id || null;
  state.currentCard  = state.cards[0] || null;

  if (state.currentMonth) await loadGastos();

  goTo('lancamento');
}

async function loadGastos() {
  if (!state.currentMonth) return;
  setSyncStatus(false);

  const gastosPromise = db
    .from('gastos')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('mes_id', state.currentMonth)
    .order('created_at');

  const anotacoesPromise = db
    .from('anotacoes')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('mes_id', state.currentMonth);

  const [gastosRes, anotacoesRes] = await Promise.all([
    gastosPromise,
    anotacoesPromise
  ]);

  state.gastos = gastosRes.data || [];
  state.anotacoes = anotacoesRes.error ? [] : (anotacoesRes.data || []);
  
  if (anotacoesRes.error) {
    console.warn("Tabela public.anotacoes pode não ter sido criada no Supabase ainda.", anotacoesRes.error);
  }

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
  sortMonthsChronologically(state.months);

  return data.length;
}

// Cria os meses do ano de referência para um novo usuário cadastrado
async function createYearForNewUser(newUserId, year) {
  const monthsPt = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  const toCreate = monthsPt.map(m => `${m}/${year}`);
  const inserts = toCreate.map(nome => ({ nome, user_id: newUserId }));
  const { error } = await db.from('meses').insert(inserts);
  if (error) {
    console.error("Erro ao criar ano corrente para novo usuário:", error);
  }
}

function openNewYearModal() {
  const input = document.getElementById('modal-year-input');
  if (input) {
    input.value = new Date().getFullYear();
  }
  openModal('modal-new-year');
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
  sortMonthsChronologically(state.months);

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

  setSyncStatus(false);

  const { data: inserted, error } = await db
    .from('pessoas')
    .insert(withOwner({ nome: name, vinculo_user_id: null }))
    .select()
    .single();

  setSyncStatus(true);

  if (error || !inserted) { toast('Erro ao adicionar.', 'error'); return; }

  state.persons.push(name);
  state.personsData.push(inserted);
  document.getElementById('new-person').value = '';
  toast(`${name} adicionada!`, 'success');
  renderConfig();
}

async function addFriendPerson() {
  const username = document.getElementById('friend-username').value.trim().toLowerCase();
  if (!username) { toast('Preencha o username.', 'error'); return; }

  const btn = document.getElementById('btn-add-friend');
  btn.disabled = true; btn.textContent = 'Vinculando...';
  setSyncStatus(false);

  // 1. Search for profile
  const { data: profile, error: pError } = await db
    .from('profiles')
    .select('id, username')
    .ilike('username', username)
    .maybeSingle();

  if (pError) {
    console.error("Erro ao pesquisar perfil do amigo:", pError);
    toast("Erro no banco ao pesquisar usuário.", "error");
    btn.disabled = false; btn.textContent = 'Vincular';
    setSyncStatus(true);
    return;
  }

  if (!profile) {
    toast(`Usuário "${username}" não encontrado.`, 'error');
    btn.disabled = false; btn.textContent = 'Vincular';
    setSyncStatus(true);
    return;
  }

  // Ensure we don't duplicate names in state.persons (comparing case-insensitive)
  const displayName = capitalize(profile.username);
  if (state.persons.map(p => p.toLowerCase()).includes(displayName.toLowerCase())) {
    toast(`Você já possui uma pessoa com o nome "${displayName}".`, 'warning');
    btn.disabled = false; btn.textContent = 'Vincular';
    setSyncStatus(true);
    return;
  }

  // 2. Insert into pessoas table
  const { data: inserted, error } = await db
    .from('pessoas')
    .insert(withOwner({ nome: displayName, vinculo_user_id: profile.id }))
    .select()
    .single();

  btn.disabled = false; btn.textContent = 'Vincular';
  setSyncStatus(true);

  if (error || !inserted) {
    toast('Erro ao vincular amigo.', 'error');
    return;
  }

  state.persons.push(inserted.nome);
  state.personsData.push(inserted);
  document.getElementById('friend-username').value = '';
  closeModal('modal-add-friend');
  toast(`${inserted.nome} vinculado com sucesso!`, 'success');
  renderConfig();
}

async function startLinkPerson(personId, oldName) {
  const username = prompt(`Digite o username do perfil ativo para vincular a "${oldName}":`);
  if (!username) return;
  const cleanUsername = username.trim().toLowerCase();

  setSyncStatus(false);

  // 1. Search for profile
  const { data: profile, error: pError } = await db
    .from('profiles')
    .select('id, username')
    .ilike('username', cleanUsername)
    .maybeSingle();

  if (pError) {
    console.error("Erro ao pesquisar perfil:", pError);
    toast("Erro ao pesquisar usuário.", "error");
    setSyncStatus(true);
    return;
  }

  if (!profile) {
    toast(`Usuário "${cleanUsername}" não encontrado.`, "error");
    setSyncStatus(true);
    return;
  }

  const newName = capitalize(profile.username);

  // Check if newName already exists (other than this personId) to prevent name collisions
  const exists = state.personsData.some(p => p.id !== personId && p.nome.toLowerCase() === newName.toLowerCase());
  if (exists) {
    toast(`Já existe outra pessoa cadastrada com o nome "${newName}".`, "warning");
    setSyncStatus(true);
    return;
  }

  // 2. Update pessoas table
  const { data: updatedPerson, error: updateError } = await db
    .from('pessoas')
    .update({ nome: newName, vinculo_user_id: profile.id })
    .eq('id', personId)
    .select()
    .single();

  if (updateError || !updatedPerson) {
    toast("Erro ao atualizar vínculo.", "error");
    setSyncStatus(true);
    return;
  }

  // 3. Update existing gastos to new name if it changed
  if (oldName !== newName) {
    const { error: errorGastos } = await db
      .from('gastos')
      .update({ pessoa: newName })
      .eq('pessoa', oldName)
      .eq('user_id', currentUser.id);

    if (errorGastos) {
      console.error("Erro ao transferir despesas:", errorGastos);
    }
  }

  // 4. Update local state
  // Update state.persons
  const idxName = state.persons.indexOf(oldName);
  if (idxName !== -1) state.persons[idxName] = newName;

  // Update state.personsData
  const idxData = state.personsData.findIndex(p => p.id === personId);
  if (idxData !== -1) state.personsData[idxData] = updatedPerson;

  // If name changed, update names in state.gastos (so UI updates without reloading)
  if (oldName !== newName) {
    state.gastos.forEach(g => {
      if (g.pessoa === oldName) g.pessoa = newName;
    });
  }

  setSyncStatus(true);
  toast(`"${oldName}" vinculada com sucesso a @${profile.username}!`, "success");
  
  renderConfig();
}

async function removePerson(name) {
  if (!confirm(`Remover "${name}"?`)) return;
  const { error } = await db.from('pessoas').delete().eq('nome', name);
  if (error) { toast('Erro.', 'error'); return; }
  state.persons = state.persons.filter(p => p !== name);
  state.personsData = state.personsData.filter(p => p.nome !== name);
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
    if (data) {
      state.months.push(data);
      sortMonthsChronologically(state.months);
      month = data;
    }
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

// ── CAIXINHAS ─────────────────────────────────────────
async function loadCaixinhas() {
  const { data: caixinhas } = await db
    .from('caixinhas')
    .select('*')
    .order('created_at');

  if (!caixinhas || !caixinhas.length) {
    state.caixinhas = [];
    return;
  }

  const ids = caixinhas.map(c => c.id);

  const [{ data: membros }, { data: depositos }] = await Promise.all([
    db.from('caixinha_membros').select('*').in('caixinha_id', ids),
    db.from('caixinha_depositos').select('*').in('caixinha_id', ids).order('created_at'),
  ]);

  state.caixinhas = caixinhas.map(c => ({
    ...c,
    membros:   (membros   || []).filter(m => m.caixinha_id === c.id),
    depositos: (depositos || []).filter(d => d.caixinha_id === c.id),
  }));

  // Pre-resolve all usernames for display
  await resolveAllUsernames(state.caixinhas);
}

async function createCaixinha() {
  const nome  = document.getElementById('cx-nome').value.trim();
  const descricao = document.getElementById('cx-descricao').value.trim();
  const meta  = parseFloat(document.getElementById('cx-meta').value) || null;
  const amigoUserId = document.getElementById('cx-amigo').value;

  if (!nome) { toast('Dê um nome à caixinha.', 'error'); return; }

  const btn = document.getElementById('btn-criar-caixinha');
  btn.disabled = true; btn.textContent = 'Criando...';

  // Insert caixinha
  const { data: cx, error } = await db.from('caixinhas').insert({
    nome,
    descricao:  descricao || null,
    meta:       meta || null,
    criado_por: currentUser.id,
    user_id:    currentUser.id,
  }).select().single();

  if (error || !cx) {
    console.error("Erro ao criar caixinha:", error);
    toast('Erro ao criar caixinha: ' + (error?.message || 'registro não retornado'), 'error');
    btn.disabled = false; btn.textContent = 'Criar';
    return;
  }

  // Add self as member
  await db.from('caixinha_membros').insert({ caixinha_id: cx.id, user_id: currentUser.id });

  // Add friend if selected
  if (amigoUserId) {
    const { error: mError } = await db.from('caixinha_membros').insert({ caixinha_id: cx.id, user_id: amigoUserId });
    if (mError) {
      console.error("Erro ao adicionar amigo na caixinha:", mError);
    }
  }

  // Clear inputs
  document.getElementById('cx-nome').value = '';
  document.getElementById('cx-descricao').value = '';
  document.getElementById('cx-meta').value = '';
  document.getElementById('cx-amigo').value = '';

  btn.disabled = false; btn.textContent = 'Criar';
  closeModal('modal-nova-caixinha');
  await loadCaixinhas();
  toast(`Caixinha "${nome}" criada!`, 'success');
  renderCaixinhas();
}

async function updateCaixinha(id) {
  const nome = document.getElementById('edit-cx-nome-' + id).value.trim();
  const meta = parseFloat(document.getElementById('edit-cx-meta-' + id).value) || null;
  const descricao = document.getElementById('edit-cx-desc-' + id).value.trim();

  if (!nome) { toast('O nome não pode ser vazio.', 'error'); return; }

  const btn = document.getElementById('btn-save-cx-' + id);
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const { error } = await db.from('caixinhas').update({
    nome,
    meta,
    descricao: descricao || null
  }).eq('id', id);

  if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }

  if (error) {
    console.error("Erro ao atualizar caixinha:", error);
    toast('Erro ao atualizar caixinha.', 'error');
    return;
  }

  await loadCaixinhas();
  toast('Caixinha atualizada!', 'success');
  renderCaixinhas();
  showCaixinhaDetail(id);
}

async function adicionarMembroCaixinha(caixinhaId) {
  const select = document.getElementById('cx-add-membro-select');
  const userId = select?.value;

  if (!userId) { toast('Selecione um amigo.', 'error'); return; }

  const btn = document.getElementById('cx-add-membro-btn');
  if (btn) { btn.disabled = true; }

  // Insert into caixinha_membros
  const { error } = await db.from('caixinha_membros').insert({
    caixinha_id: caixinhaId,
    user_id:     userId
  });

  if (btn) btn.disabled = false;

  if (error) {
    console.error("Erro ao adicionar membro:", error);
    toast('Erro ao adicionar membro.', 'error');
    return;
  }

  await loadCaixinhas();
  toast('Membro adicionado com sucesso!', 'success');
  renderCaixinhas();
  showCaixinhaDetail(caixinhaId);
}

async function removerMembroCaixinha(caixinhaId, userId) {
  const memberName = usernameCache[userId] || 'Este usuário';
  if (!confirm(`Remover ${memberName} da caixinha?`)) return;

  const { error } = await db
    .from('caixinha_membros')
    .delete()
    .eq('caixinha_id', caixinhaId)
    .eq('user_id', userId);

  if (error) {
    console.error("Erro ao remover membro:", error);
    toast('Erro ao remover membro.', 'error');
    return;
  }

  await loadCaixinhas();
  toast('Membro removido.');
  renderCaixinhas();
  showCaixinhaDetail(caixinhaId);
}


async function adicionarDeposito(caixinhaId) {
  const valorEl = document.getElementById('dep-valor-' + caixinhaId);
  const descEl  = document.getElementById('dep-desc-'  + caixinhaId);
  const valor   = parseFloat(valorEl?.value);
  const descricao = descEl?.value.trim() || '';

  if (isNaN(valor) || valor <= 0) { toast('Valor inválido.', 'error'); return; }

  const { error } = await db.from('caixinha_depositos').insert({
    caixinha_id: caixinhaId,
    user_id:     currentUser.id,
    valor,
    descricao,
  });

  if (error) { toast('Erro ao depositar.', 'error'); return; }

  if (valorEl) valorEl.value = '';
  if (descEl)  descEl.value  = '';

  await loadCaixinhas();
  toast('Depósito registrado!', 'success');
  renderCaixinhas();
  showCaixinhaDetail(caixinhaId);
}

async function deletarDeposito(depositoId, caixinhaId) {
  if (!confirm('Remover este depósito?')) return;
  const { error } = await db.from('caixinha_depositos').delete().eq('id', depositoId);
  if (error) { toast('Erro ao remover.', 'error'); return; }
  await loadCaixinhas();
  toast('Depósito removido.');
  renderCaixinhas();
  showCaixinhaDetail(caixinhaId);
}

async function deletarCaixinha(id, nome) {
  if (!confirm(`Apagar a caixinha "${nome}" e todos os depósitos? Esta ação não pode ser desfeita.`)) return;
  await db.from('caixinha_depositos').delete().eq('caixinha_id', id);
  await db.from('caixinha_membros').delete().eq('caixinha_id', id);
  await db.from('caixinhas').delete().eq('id', id);
  state.caixinhas = state.caixinhas.filter(c => c.id !== id);
  toast(`"${nome}" apagada.`);
  closeModal('modal-detalhe-caixinha');
  renderCaixinhas();
}

// ── USERNAME CACHE ────────────────────────────────────
// Maps user_id → username for display in caixinhas
const usernameCache = {};

async function resolveUsername(userId) {
  if (usernameCache[userId]) return usernameCache[userId];
  if (userId === currentUser.id) {
    const me = document.getElementById('user-display')?.textContent || 'Você';
    usernameCache[userId] = me;
    return me;
  }
  const { data } = await db
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();
  const name = data?.username || userId.substring(0, 8);
  usernameCache[userId] = name;
  return name;
}

async function resolveAllUsernames(caixinhas) {
  const ids = new Set();
  caixinhas.forEach(cx => {
    cx.membros.forEach(m => ids.add(m.user_id));
    cx.depositos.forEach(d => ids.add(d.user_id));
  });
  await Promise.all([...ids].map(id => resolveUsername(id)));
}

// ── SHARED EXPENSES (COMPARTILHADOS) ──────────────────
async function loadSharedGastos() {
  if (!currentUser) return;

  // 1. Load the linked persons
  const { data: linkedPessoas, error: errP } = await db
    .from('pessoas')
    .select('id, nome, user_id')
    .eq('vinculo_user_id', currentUser.id);

  if (errP || !linkedPessoas) {
    state.sharedGastos = [];
    state.sharedPessoas = [];
    return;
  }

  state.sharedPessoas = linkedPessoas;

  if (linkedPessoas.length === 0) {
    state.sharedGastos = [];
    return;
  }

  // 2. Fetch all shared expenses (gastos)
  const queries = linkedPessoas.map(p =>
    db.from('gastos')
      .select('*')
      .eq('user_id', p.user_id)
      .eq('pessoa', p.nome)
  );

  const results = await Promise.all(queries);

  let allGastos = [];
  results.forEach((res, index) => {
    if (res.data) {
      const p = linkedPessoas[index];
      res.data.forEach(g => {
        g.owner_id = p.user_id;
        g.owner_person_name = p.nome;
      });
      allGastos = allGastos.concat(res.data);
    }
  });

  // Sort shared gastos by created_at descending
  allGastos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  state.sharedGastos = allGastos;

  // 3. Resolve all owners months
  const ownerIds = [...new Set(linkedPessoas.map(p => p.user_id))];
  const { data: sharedMonths } = await db.from('meses').select('*').in('user_id', ownerIds);
  state.sharedMonthsMap = {};
  if (sharedMonths) {
    sharedMonths.forEach(m => {
      state.sharedMonthsMap[m.id] = m.nome;
    });
  }

  // 4. Check for notifications
  checkNewSharedExpenses(allGastos);

  // 5. Resolve usernames of the owners
  await Promise.all(ownerIds.map(id => resolveUsername(id)));
}

function checkNewSharedExpenses(allGastos) {
  const lastViewed = localStorage.getItem('last_viewed_shared_gastos');
  if (!lastViewed) {
    // If they have never viewed, set it to now and don't spam them on first load
    localStorage.setItem('last_viewed_shared_gastos', new Date().toISOString());
    return;
  }

  const lastViewedDate = new Date(lastViewed);
  const newGastos = allGastos.filter(g => new Date(g.created_at) > lastViewedDate);

  const badge = document.getElementById('badge-compartilhados');
  if (badge) {
    if (newGastos.length > 0) {
      badge.textContent = newGastos.length;
      badge.classList.remove('hidden');

      // Also show a toast if not on the page itself
      if (currentPage !== 'compartilhados') {
        toast(`🔔 Você tem ${newGastos.length} novas despesas lançadas no seu nome!`, 'success');
      }
    } else {
      badge.classList.add('hidden');
    }
  }
}

// ── USER ROLE MANAGEMENT (ADMIN ONLY) ──────────────────
async function changeUserRole(userId, newRole) {
  if (userId === currentUser.id) {
    toast('Você não pode alterar seu próprio papel por segurança.', 'error');
    return;
  }

  const { error } = await db
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    console.error("Erro ao alterar papel do usuário:", error);
    toast('Erro ao alterar papel do usuário.', 'error');
    return;
  }

  toast('Papel do usuário atualizado!', 'success');
  if (typeof renderAdminPanel === 'function') {
    renderAdminPanel();
  }
}

async function adicionarNovoUsuario() {
  const username = document.getElementById('adm-new-username').value.trim();
  const email = document.getElementById('adm-new-email').value.trim();
  const password = document.getElementById('adm-new-password').value;

  if (!username || !email || !password) {
    toast('Preencha todos os campos do novo usuário.', 'error');
    return;
  }

  if (password.length < 6) {
    toast('A senha deve ter no mínimo 6 caracteres.', 'error');
    return;
  }

  const btn = document.getElementById('adm-new-user-btn');
  btn.disabled = true; btn.textContent = 'Criando...';

  try {
    // 1. Create a temporary client with no persistence
    const tempDb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    // 2. Sign up the user via standard auth API
    const { data: authData, error: authErr } = await tempDb.auth.signUp({
      email,
      password
    });

    if (authErr || !authData?.user) {
      throw new Error(authErr?.message || 'Erro ao registrar credenciais.');
    }

    const newUserId = authData.user.id;

    // 3. Call SQL function to confirm email
    const { error: confirmErr } = await db.rpc('confirm_user_email', { user_email: email });
    if (confirmErr) {
      console.warn("Aviso ao confirmar e-mail:", confirmErr);
    }

    // 4. Insert profile row
    const { error: profileErr } = await db.from('profiles').insert({
      id: newUserId,
      username: username,
      role: 'user',
      ativo: true
    });

    if (profileErr) {
      throw new Error(profileErr.message);
    }

    // 5. Configurar o ano corrente automaticamente na criação do perfil
    const currentYear = new Date().getFullYear();
    await createYearForNewUser(newUserId, currentYear);

    // Clear fields
    document.getElementById('adm-new-username').value = '';
    document.getElementById('adm-new-email').value = '';
    document.getElementById('adm-new-password').value = '';

    toast(`Usuário "${username}" cadastrado!`, 'success');
    if (typeof renderAdminPanel === 'function') {
      renderAdminPanel();
    }
  } catch (err) {
    console.error("Erro ao cadastrar usuário:", err);
    toast('Erro ao cadastrar: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Criar';
  }
}

async function toggleUserActiveStatus(userId, currentStatus) {
  if (userId === currentUser.id) {
    toast('Você não pode desativar seu próprio usuário.', 'error');
    return;
  }

  const newStatus = !currentStatus;
  const { error } = await db
    .from('profiles')
    .update({ ativo: newStatus })
    .eq('id', userId);

  if (error) {
    console.error("Erro ao alterar status do usuário:", error);
    toast('Erro ao alterar status.', 'error');
    return;
  }

  toast(newStatus ? 'Usuário ativado!' : 'Usuário inativado!', 'success');
  if (typeof renderAdminPanel === 'function') {
    renderAdminPanel();
  }
}

async function deletarUsuarioPeloAdmin(userId, username) {
  if (userId === currentUser.id) {
    toast('Você não pode excluir seu próprio usuário.', 'error');
    return;
  }

  if (!confirm(`Tem certeza absoluta de que deseja excluir o usuário "${username}" e TODOS os seus gastos, cartões e dados permanentemente? Esta ação não pode ser desfeita.`)) {
    return;
  }

  const { error } = await db.rpc('delete_user_by_admin', { target_user_id: userId });

  if (error) {
    console.error("Erro ao deletar usuário:", error);
    toast('Erro ao excluir usuário.', 'error');
    return;
  }

  toast(`Usuário "${username}" excluído.`, 'success');
  if (typeof renderAdminPanel === 'function') {
    renderAdminPanel();
  }
}

async function changeUserPassword() {
  const newPwd = document.getElementById('change-pwd-new').value;
  const confirmPwd = document.getElementById('change-pwd-confirm').value;

  if (!newPwd) { toast('Digite a nova senha.', 'error'); return; }
  if (confirmPwd !== newPwd) { toast('As senhas não coincidem.', 'error'); return; }
  if (newPwd.length < 6) { toast('A senha deve ter no mínimo 6 caracteres.', 'error'); return; }

  const { error } = await db.auth.updateUser({ password: newPwd });

  if (error) {
    console.error("Erro ao alterar senha:", error);
    toast('Erro ao alterar senha: ' + error.message, 'error');
    return;
  }

  document.getElementById('change-pwd-new').value = '';
  document.getElementById('change-pwd-confirm').value = '';
  toast('Senha alterada com sucesso!', 'success');
}

// ── ANOTAÇÕES ─────────────────────────────────────────
async function saveAnotacao(pessoa, texto) {
  if (!state.currentMonth) return;
  setSyncStatus(false);

  const cleanTexto = texto.trim();

  if (!cleanTexto) {
    // Se a anotação for vazia, removemos o registro do banco
    const { error } = await db
      .from('anotacoes')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('mes_id', state.currentMonth)
      .eq('pessoa', pessoa);

    if (!error) {
      state.anotacoes = state.anotacoes.filter(
        n => !(n.pessoa === pessoa && n.mes_id === state.currentMonth)
      );
      toast('Anotação removida.', 'success');
    } else {
      toast('Erro ao remover anotação.', 'error');
      console.error(error);
    }
  } else {
    // Se tiver texto, fazemos upsert
    const { data, error } = await db
      .from('anotacoes')
      .upsert(
        {
          user_id: currentUser.id,
          mes_id: state.currentMonth,
          pessoa,
          texto: cleanTexto,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,mes_id,pessoa' }
      )
      .select()
      .single();

    if (!error && data) {
      const idx = state.anotacoes.findIndex(
        n => n.pessoa === pessoa && n.mes_id === state.currentMonth
      );
      if (idx !== -1) {
        state.anotacoes[idx] = data;
      } else {
        state.anotacoes.push(data);
      }
      toast('Anotação salva!', 'success');
    } else {
      toast('Erro ao salvar anotação.', 'error');
      console.error(error);
    }
  }

  setSyncStatus(true);
}
