// ── NAVIGATION ────────────────────────────────────────
function goTo(page) {
  currentPage = page;
  ['lancamento','resumo','cartoes-view','caixinhas','config','compartilhados'].forEach(p =>
    document.getElementById('page-'+p)?.classList.toggle('hidden', p !== page));
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.getAttribute('onclick')?.includes(page)));
  const [t,s] = TITLES[page] || ['',''];
  document.getElementById('page-title').textContent = t;
  document.getElementById('page-sub').textContent   = s;
  const newYearBtn    = document.getElementById('btn-new-year');
  const deleteYearBtn = document.getElementById('btn-delete-year');
  const pdfBtn        = document.getElementById('btn-pdf-pessoa');
  const hideTopbar = page === 'config' || page === 'caixinhas' || page === 'compartilhados';
  if (newYearBtn)    newYearBtn.classList.toggle('hidden', hideTopbar);
  if (deleteYearBtn) deleteYearBtn.classList.toggle('hidden', hideTopbar);
  if (pdfBtn) pdfBtn.style.display = page === 'resumo' ? 'flex' : 'none';
  // Close sidebar on mobile after nav
  closeSidebar();
  renderPage(page);
}

function renderPage(p) {
  if (p === 'lancamento')        renderLancamento();
  else if (p === 'resumo')       renderResumo();
  else if (p === 'cartoes-view') renderCartoesView();
  else if (p === 'caixinhas')    renderCaixinhas();
  else if (p === 'compartilhados') renderCompartilhados();
  else if (p === 'config')       renderConfig();
  updateBadges();
}

// ── SIDEBAR MOBILE ────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('show', !isOpen);
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
}

// ── YEAR TABS + MONTH SELECTOR ────────────────────────
function extractYear(monthName) {
  // Tries to find a 4-digit year in the name, e.g. "Maio/2026" → "2026"
  const m = monthName.match(/\b(20\d{2})\b/);
  return m ? m[1] : 'Outros';
}

function renderYearTabs(containerId, monthSelectorId) {
  const yearTabsEl = document.getElementById(containerId);
  const monthEl   = document.getElementById(monthSelectorId);
  if (!yearTabsEl || !monthEl) return;

  // Build year → months map
  const yearsMap = {};
  state.months.forEach(m => {
    const y = extractYear(m.nome);
    if (!yearsMap[y]) yearsMap[y] = [];
    yearsMap[y].push(m);
  });

  const years = Object.keys(yearsMap).sort().reverse();

  // Determine active year (from currentMonth)
  const currentMonthObj = state.months.find(m => m.id === state.currentMonth);
  let activeYear = currentMonthObj ? extractYear(currentMonthObj.nome) : years[0];
  if (!yearsMap[activeYear]) activeYear = years[0];

  // Render year tabs
  yearTabsEl.innerHTML = '';
  years.forEach(y => {
    const btn = document.createElement('button');
    btn.className = 'year-tab' + (y === activeYear ? ' active' : '');
    btn.textContent = y;
    btn.onclick = () => {
      // Switch to most recent month of that year
      const monthsOfYear = yearsMap[y];
      const target = monthsOfYear[monthsOfYear.length - 1];
      state.currentMonth = target.id;
      state.currentCard  = state.cards[0] || null;
      loadGastos().then(() => renderPage(currentPage));
    };
    yearTabsEl.appendChild(btn);
  });

  // Render months of active year
  monthEl.innerHTML = '';
  (yearsMap[activeYear] || []).forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'month-btn' + (m.id === state.currentMonth ? ' active' : '');
    btn.textContent = m.nome;
    btn.onclick = async () => {
      state.currentMonth = m.id;
      state.currentCard  = state.cards[0] || null;
      await loadGastos();
      await propagateParcelasToMonth(m.id);
      renderPage(currentPage);
    };
    monthEl.appendChild(btn);
  });

  // No individual month creation — managed by year
}

// ── LANÇAMENTOS ───────────────────────────────────────
function renderLancamento() {
  renderYearTabs('year-tabs-lancamento', 'month-selector');
  renderCardChips();
  renderPersonSelect('f-pessoa');

  if (!state.months.length) {
    document.getElementById('card-chips').innerHTML = '';
    document.getElementById('items-tbody').innerHTML = '';
    document.getElementById('items-empty').classList.remove('hidden');
    document.getElementById('items-empty').innerHTML =
      '<div class="icon">📅</div><p>Nenhum ano criado ainda.<br>Clique em <strong>📅 Novo Ano</strong> para começar.</p>';
    document.getElementById('card-total').textContent = 'R$ 0,00';
    document.getElementById('table-title').textContent = 'Gastos';
    document.getElementById('form-card-info').textContent = '';
    return;
  }

  renderItemsTable();
  document.getElementById('form-card-info').textContent =
    state.currentCard ? 'Cartão: ' + state.currentCard : '';
}

function renderCardChips() {
  const el = document.getElementById('card-chips');
  el.innerHTML = '';
  state.cards.forEach(card => {
    const total  = state.gastos.filter(g => g.cartao === card).reduce((s,g) => s+Number(g.valor), 0);
    const active = card === state.currentCard;
    const color  = getColor(state.cards, card);
    const btn    = document.createElement('button');
    btn.className = 'card-chip' + (active ? ' active' : '');
    if (active) { btn.style.borderColor=color; btn.style.color=color; btn.style.background=color+'18'; }
    btn.innerHTML = `<span class="color-dot" style="background:${color}"></span>${esc(card)}<span class="chip-total">R$ ${fmt(total)}</span>`;
    btn.onclick = () => { state.currentCard = card; renderLancamento(); };
    el.appendChild(btn);
  });
}

function renderPersonSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = state.persons.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  if (cur && state.persons.includes(cur)) sel.value = cur;
}

function renderItemsTable() {
  const items = state.gastos.filter(g => g.cartao === state.currentCard);
  const tbody = document.getElementById('items-tbody');
  const empty = document.getElementById('items-empty');
  const total = items.reduce((s,g) => s+Number(g.valor), 0);
  document.getElementById('table-title').textContent = 'Gastos — '+(state.currentCard||'');
  document.getElementById('card-total').textContent  = 'R$ '+fmt(total);
  if (!items.length) { tbody.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = items.map(g => {
    const pc = getColor(state.persons, g.pessoa);
    const pAtual = g.parcela_atual || 1;
    const pLabel = g.parcelas > 1
      ? `<span style="font-weight:600">${pAtual}/${g.parcelas}x</span>`
      : 'À vista';
    return `<tr>
      <td>${descLabel(g.descricao)}</td>
      <td><span class="pill" style="background:${pc}22;color:${pc}">${esc(g.pessoa)}</span></td>
      <td style="color:var(--text3)">${pLabel}</td>
      <td class="amount-cell" style="text-align:right;color:${Number(g.valor)<0?'var(--red)':'var(--green)'}">R$ ${fmt(Number(g.valor))}</td>
      <td><div class="row-actions">
        <button class="edit-btn"   onclick="openEditModal('${g.id}')" title="Editar">✏️</button>
        <button class="delete-btn" onclick="deleteItem('${g.id}')"   title="Remover">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ── EDIT MODAL ────────────────────────────────────────
function openEditModal(id) {
  const g = state.gastos.find(g => g.id === id);
  if (!g) return;
  document.getElementById('edit-id').value       = g.id;
  document.getElementById('edit-desc').value     = g.descricao || '';
  document.getElementById('edit-valor').value    = g.valor;
  document.getElementById('edit-parcelas').value = g.parcelas || 1;
  renderPersonSelect('edit-pessoa');
  document.getElementById('edit-pessoa').value = g.pessoa;
  openModal('modal-edit');
}

// ── POR PESSOA ────────────────────────────────────────
function renderResumo() {
  renderYearTabs('year-tabs-resumo', 'month-selector-resumo');
  const grid = document.getElementById('people-grid');

  if (!state.gastos.length) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">👥</div><p>Nenhum gasto neste mês.</p></div>';
    return;
  }

  const byPerson = {};
  state.persons.forEach(p => { byPerson[p] = {}; });
  state.gastos.forEach(g => {
    if (!byPerson[g.pessoa]) byPerson[g.pessoa] = {};
    if (!byPerson[g.pessoa][g.cartao]) byPerson[g.pessoa][g.cartao] = { total:0, items:[] };
    byPerson[g.pessoa][g.cartao].total += Number(g.valor);
    byPerson[g.pessoa][g.cartao].items.push(g);
  });

  const active = state.persons.filter(p =>
    Object.values(byPerson[p]||{}).some(v => v.total !== 0));

  if (!active.length) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">👥</div><p>Nenhum gasto neste mês.</p></div>';
    return;
  }

  grid.innerHTML = active.map(person => {
    const pc    = getColor(state.persons, person);
    const cards = state.cards.filter(c => byPerson[person][c]?.total > 0);
    const total = cards.reduce((s,c) => s+(byPerson[person][c]?.total||0), 0);
    const isOpen = expandedPersons.has(person);

    const cardRows = cards.map(c => {
      const cc       = getColor(state.cards, c);
      const cardData = byPerson[person][c];
      const itemsHtml = cardData.items.map(g => {
        const pAt = g.parcela_atual || 1;
        const badge = g.parcelas > 1
          ? `<span class="parc-badge" style="background:${cc}22;color:${cc}">${pAt}/${g.parcelas}x</span>`
          : `<span style="color:var(--text3)">À vista</span>`;
        const dLabel = g.descricao
          ? `<span class="detail-item-desc">${esc(g.descricao)}</span>`
          : `<span class="detail-item-desc empty">sem descrição</span>`;
        return `<div class="detail-item">
          <div class="detail-item-left">${dLabel}<div class="detail-item-parc">${badge}</div></div>
          <span class="detail-item-valor" style="color:${Number(g.valor)<0?'var(--red)':'var(--green)'}">R$ ${fmt(Number(g.valor))}</span>
        </div>`;
      }).join('');

      return `<div class="card-row" style="flex-direction:column;align-items:stretch;gap:0;cursor:pointer;padding:0"
          onclick="toggleCardDetail(this)">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px">
            <span><span class="color-dot" style="background:${cc}"></span>${esc(c)}</span>
            <span style="display:flex;align-items:center;gap:8px">
              <span class="card-row-amount" style="color:${cc}">R$ ${fmt(cardData.total)}</span>
              <span class="card-expand-icon" style="font-size:10px;color:var(--text3)">▼</span>
            </span>
          </div>
          <div class="card-items-detail hidden" style="border-top:1px solid var(--border);padding:0 10px 6px">
            ${itemsHtml}
          </div>
        </div>`;
    }).join('');

    return `<div class="person-card" id="pcard-${esc(person)}">
      <div class="person-card-header" onclick="togglePerson('${esc(person)}')">
        <div class="person-avatar" style="background:${pc}22;color:${pc}">${person.substring(0,2).toUpperCase()}</div>
        <div>
          <div class="person-name">${esc(person)}</div>
          <div class="person-total">Total: <span>R$ ${fmt(total)}</span></div>
        </div>
        <span class="person-toggle ${isOpen?'open':''}">▼</span>
      </div>
      <div class="card-breakdown person-summary${isOpen?'':' hidden'}">
        ${cardRows}
      </div>
    </div>`;
  }).join('');
}

function togglePerson(person) {
  const card = document.getElementById('pcard-'+person);
  if (!card) return;
  const toggle  = card.querySelector('.person-toggle');
  const summary = card.querySelector('.person-summary');
  const opening = summary.classList.contains('hidden');
  summary.classList.toggle('hidden', !opening);
  toggle?.classList.toggle('open', opening);
  opening ? expandedPersons.add(person) : expandedPersons.delete(person);
}

function toggleCardDetail(rowEl) {
  const detail = rowEl.querySelector('.card-items-detail');
  const icon   = rowEl.querySelector('.card-expand-icon');
  if (!detail) return;
  const wasHidden = detail.classList.contains('hidden');
  detail.classList.toggle('hidden', !wasHidden);
  if (icon) icon.textContent = wasHidden ? '▲' : '▼';
}

// ── POR CARTÃO ────────────────────────────────────────
function renderCartoesView() {
  renderYearTabs('year-tabs-cartoes', 'month-selector-cartoes');
  const summary = document.getElementById('cards-summary');
  const detail  = document.getElementById('cards-detail');

  if (!state.gastos.length) {
    summary.innerHTML = '';
    detail.innerHTML  = '<div class="empty-state"><div class="icon">💳</div><p>Nenhum gasto neste mês.</p></div>';
    return;
  }

  const by = {};
  state.cards.forEach(c => { by[c]={total:0,items:[]}; });
  state.gastos.forEach(g => {
    if (!by[g.cartao]) by[g.cartao]={total:0,items:[]};
    by[g.cartao].total += Number(g.valor);
    by[g.cartao].items.push(g);
  });

  const active = state.cards.filter(c => by[c].total > 0);
  const grand  = active.reduce((s,c) => s+by[c].total, 0);

  summary.innerHTML = `<div class="summary-card accent">
    <div class="s-label">Total geral</div>
    <div class="s-value">R$ ${fmt(grand)}</div>
    <div class="s-sub">${active.length} cartões com gastos</div>
  </div>` + active.map(c => `
    <div class="summary-card">
      <div class="s-label" style="color:${getColor(state.cards,c)}">${esc(c)}</div>
      <div class="s-value">R$ ${fmt(by[c].total)}</div>
      <div class="s-sub">${by[c].items.length} lançamento(s)</div>
    </div>`).join('');

  detail.innerHTML = active.map(c => {
    const color = getColor(state.cards,c);
    const byP   = {};
    by[c].items.forEach(g => { byP[g.pessoa]=(byP[g.pessoa]||0)+Number(g.valor); });
    return `<div class="table-card" style="margin-bottom:16px">
      <div class="table-card-header">
        <h2 style="display:flex;align-items:center;gap:8px">
          <span class="color-dot" style="background:${color};width:12px;height:12px"></span>${esc(c)}
        </h2>
        <div><span class="total-label">Total:</span>
          <span class="total-value" style="color:${color}">R$ ${fmt(by[c].total)}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--border)">
        ${Object.entries(byP).map(([p,v])=>{const pc=getColor(state.persons,p);return `
          <div style="background:${pc}18;color:${pc};padding:5px 12px;border-radius:20px;font-size:12px;font-weight:500">
            ${esc(p)}: R$ ${fmt(v)}</div>`;}).join('')}
      </div>
      <div class="scrollable"><table><thead><tr>
        <th>Descrição</th><th>Pessoa</th><th>Parcelas</th><th style="text-align:right">Valor</th>
      </tr></thead><tbody>
        ${by[c].items.map(g=>{const pc=getColor(state.persons,g.pessoa);return `<tr>
          <td>${descLabel(g.descricao)}</td>
          <td><span class="pill" style="background:${pc}22;color:${pc}">${esc(g.pessoa)}</span></td>
          <td style="color:var(--text3)">${parcLabel(g.parcelas)}</td>
          <td class="amount-cell" style="text-align:right;color:${Number(g.valor)<0?'var(--red)':'var(--green)'}">R$ ${fmt(Number(g.valor))}</td>
        </tr>`;}).join('')}
      </tbody></table></div>
    </div>`;
  }).join('');
}

// ── CONFIG ────────────────────────────────────────────
function renderConfig() {
  document.getElementById('persons-list').innerHTML = state.personsData.map(p => {
    const c = getColor(state.persons, p.nome);
    const linkLabel = p.vinculo_user_id 
      ? ' <span style="color:var(--green);font-size:11px;font-weight:500;">👥 (vinculado)</span>' 
      : ` <button class="btn sm ghost" onclick="startLinkPerson('${p.id}', '${esc(p.nome)}')" style="display:inline-flex;padding:2px 8px;margin-left:8px;font-size:11px;">🔗 Vincular Perfil</button>`;
    return `<div class="settings-item">
      <span><span class="color-dot" style="background:${c}"></span>${esc(p.nome)}${linkLabel}</span>
      <button class="btn danger sm" onclick="removePerson('${esc(p.nome)}')">Remover</button>
    </div>`;
  }).join('');
  document.getElementById('cards-list').innerHTML = state.cards.map(c => {
    const col = getColor(state.cards,c);
    return `<div class="settings-item">
      <span><span class="color-dot" style="background:${col}"></span>${esc(c)}</span>
      <button class="btn danger sm" onclick="removeCard('${esc(c)}')">Remover</button>
    </div>`;
  }).join('');
}

// ── CAIXINHAS ─────────────────────────────────────────
function renderCaixinhas() {
  const container = document.getElementById('page-caixinhas');
  if (!container) return;

  if (!state.caixinhas.length) {
    container.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
        <button class="btn primary" onclick="openModal('modal-nova-caixinha')">+ Nova Caixinha</button>
      </div>
      <div class="empty-state">
        <div class="icon">💰</div>
        <p>Nenhuma caixinha ainda.<br>Crie uma para começar a poupar juntos!</p>
      </div>`;
    return;
  }

  const gridHtml = state.caixinhas.map(cx => {
    const total = cx.depositos.reduce((s, d) => s + Number(d.valor), 0);
    const pct   = cx.meta ? Math.min(100, (total / cx.meta) * 100) : null;

    const progressHtml = cx.meta ? `
      <div class="caixinha-small-card-progress" style="width: ${pct}%"></div>
    ` : '';

    return `
      <div class="caixinha-small-card" onclick="showCaixinhaDetail('${cx.id}')">
        <div class="caixinha-small-card-header">
          <span class="caixinha-small-card-emoji">💰</span>
          ${cx.meta ? `<span style="font-size:11px;color:var(--text3);font-weight:600">${pct.toFixed(0)}%</span>` : ''}
        </div>
        <div class="caixinha-small-card-nome">${esc(cx.nome)}</div>
        ${cx.descricao ? `<div class="caixinha-small-card-desc">${esc(cx.descricao)}</div>` : ''}
        <div class="caixinha-small-card-meta">
          <span>Acumulado:</span>
          <span class="caixinha-small-card-total">R$ ${fmt(total)}</span>
        </div>
        ${progressHtml}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
      <button class="btn primary" onclick="openModal('modal-nova-caixinha')">+ Nova Caixinha</button>
    </div>
    <div class="caixinhas-grid">
      ${gridHtml}
    </div>
  `;
}

function showCaixinhaDetail(id) {
  const cx = state.caixinhas.find(c => c.id === id);
  if (!cx) return;

  const container = document.getElementById('caixinha-detalhes-container');
  if (!container) return;

  const total = cx.depositos.reduce((s, d) => s + Number(d.valor), 0);
  const pct   = cx.meta ? Math.min(100, (total / cx.meta) * 100) : null;

  // Aggregate deposits by user
  const byUser = {};
  cx.depositos.forEach(d => {
    byUser[d.user_id] = (byUser[d.user_id] || 0) + Number(d.valor);
  });

  const userRows = Object.entries(byUser).map(([uid, val]) => {
    const label = usernameCache[uid] || (uid === currentUser.id ? 'Você' : uid.substring(0,8));
    return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text2)">${esc(label)}</span>
      <span style="font-weight:600;color:var(--green)">R$ ${fmt(val)}</span>
    </div>`;
  }).join('');

  // Progress Bar
  const progressHtml = cx.meta ? `
    <div style="margin:12px 0 4px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:5px">
        <span>Progresso</span>
        <span>${pct.toFixed(1)}% de R$ ${fmt(cx.meta)}</span>
      </div>
      <div style="height:8px;background:var(--bg3);border-radius:20px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:20px;transition:width 0.4s"></div>
      </div>
    </div>` : '';

  // Last 5 deposits
  const lastDeposits = [...cx.depositos].reverse().slice(0, 5).map(d => {
    const isMe = d.user_id === currentUser.id;
    const label = usernameCache[d.user_id] || (isMe ? 'Você' : d.user_id.substring(0,8));
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div>
        <span style="color:var(--text2)">${esc(label)}</span>
        ${d.descricao ? `<span style="color:var(--text3);margin-left:6px">${esc(d.descricao)}</span>` : ''}
        <div style="font-size:10px;color:var(--text3)">${new Date(d.created_at).toLocaleDateString('pt-BR')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:600;color:var(--green)">R$ ${fmt(Number(d.valor))}</span>
        ${isMe ? `<button class="delete-btn" onclick="deletarDeposito('${d.id}','${cx.id}')">✕</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const isCriador = cx.criado_por === currentUser.id;

  // Members section
  const membersChips = cx.membros.map(m => {
    const label = usernameCache[m.user_id] || (m.user_id === currentUser.id ? 'Você' : m.user_id.substring(0,8));
    const showRemove = isCriador && m.user_id !== cx.criado_por;
    return `
      <div class="member-chip">
        <span>👤 ${esc(label)}</span>
        ${showRemove ? `<button class="remove-btn" onclick="removerMembroCaixinha('${cx.id}', '${m.user_id}')" title="Remover membro">✕</button>` : ''}
      </div>
    `;
  }).join('');

  const addMemberFormHtml = isCriador ? `
    <div style="margin-top:12px; display:flex; gap:8px;">
      <input type="text" id="cx-add-membro-input" placeholder="Username do amigo..." style="flex:1; padding:6px 10px; font-size:12px; background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); color:var(--text);" onkeydown="if(event.key==='Enter')adicionarMembroCaixinha('${cx.id}')">
      <button class="btn primary sm" id="cx-add-membro-btn" onclick="adicionarMembroCaixinha('${cx.id}')" style="padding: 6px 12px; font-size:12px;">Convidar</button>
    </div>
  ` : '';

  // Render modal content
  container.innerHTML = `
    <!-- Detail View Mode -->
    <div id="cx-detail-view-${cx.id}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div style="flex:1; min-width:0; padding-right:12px;">
          <h2 style="display:flex;align-items:center;gap:8px;font-family:var(--font-display);font-size:20px;word-break:break-word;">
            💰 ${esc(cx.nome)}
          </h2>
          ${cx.descricao ? `<div class="caixinha-desc-container">${esc(cx.descricao)}</div>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          ${isCriador ? `<button class="btn sm" onclick="toggleCxEditMode('${cx.id}', true)">✏️ Editar</button>` : ''}
          <button class="delete-btn" onclick="closeModal('modal-detalhe-caixinha')" style="font-size:18px;">✕</button>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <span class="total-label">Total Guardado:</span>
        <span class="total-value" style="font-size:22px; color:var(--green); font-weight:700; display:block; margin-top:4px;">R$ ${fmt(total)}</span>
      </div>

      ${progressHtml}

      <!-- Members Section -->
      <div style="margin:20px 0 12px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3)">Membros Ativos</div>
        <div class="members-section-container">
          ${membersChips}
        </div>
        ${addMemberFormHtml}
      </div>

      ${Object.keys(byUser).length ? `
        <div style="margin:20px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3)">Total por pessoa</div>
        <div style="margin-bottom:16px;">
          ${userRows}
        </div>
      ` : ''}

      <div style="margin:20px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3)">Últimos depósitos</div>
      <div style="margin-bottom:20px; max-height: 180px; overflow-y: auto; border:1px solid var(--border); border-radius:var(--radius); padding:4px 10px;">
        ${lastDeposits || '<div style="font-size:12px;color:var(--text3);padding:8px 0">Nenhum depósito ainda.</div>'}
      </div>

      <!-- Add Deposit Form -->
      <div style="background:var(--bg3); border: 1px solid var(--border); border-radius:var(--radius); padding:14px; margin-top:20px;">
        <h4 style="margin-bottom:10px; font-size:13px; font-weight:600;">Fazer um depósito</h4>
        <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:8px;align-items:end">
          <div class="field" style="margin-bottom:0;">
            <label style="font-size:10px;">Valor (R$)</label>
            <input type="number" id="dep-valor-${cx.id}" placeholder="0,00" step="0.01" style="padding:6px 8px; font-size:12px; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); width:100%;" onkeydown="if(event.key==='Enter')adicionarDeposito('${cx.id}')">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label style="font-size:10px;">Descrição <span class="hint">(opcional)</span></label>
            <input type="text" id="dep-desc-${cx.id}" placeholder="Ex: Salário, PIX..." style="padding:6px 8px; font-size:12px; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); width:100%;" onkeydown="if(event.key==='Enter')adicionarDeposito('${cx.id}')">
          </div>
          <div>
            <button class="btn primary sm" onclick="adicionarDeposito('${cx.id}')" style="padding:6px 12px; font-size:12px; height:31px;">+ Depositar</button>
          </div>
        </div>
      </div>

      ${isCriador ? `
        <div style="margin-top:24px; border-top:1px solid var(--border); padding-top:16px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:var(--text3);">Criado por você</span>
          <button class="btn danger sm" onclick="deletarCaixinha('${cx.id}','${esc(cx.nome)}')" style="padding:6px 12px; font-size:12px;">🗑 Excluir Caixinha</button>
        </div>
      ` : ''}
    </div>

    <!-- Edit View Mode -->
    <div id="cx-edit-view-${cx.id}" class="hidden">
      <h3 style="margin-bottom:16px;">✏️ Editar Caixinha</h3>
      
      <div class="field" style="margin-bottom:12px;">
        <label>Nome da caixinha</label>
        <input type="text" id="edit-cx-nome-${cx.id}" value="${esc(cx.nome)}" style="width:100%; padding:8px; background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); color:var(--text);">
      </div>

      <div class="field" style="margin-bottom:12px;">
        <label>Descrição</label>
        <textarea id="edit-cx-desc-${cx.id}" rows="3" style="width:100%; padding:8px; background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); font-family:var(--font); font-size:13px; resize:vertical;">${esc(cx.descricao || '')}</textarea>
      </div>

      <div class="field" style="margin-bottom:16px;">
        <label>Meta (R$) <span class="hint">(opcional)</span></label>
        <input type="number" id="edit-cx-meta-${cx.id}" value="${cx.meta || ''}" step="0.01" style="width:100%; padding:8px; background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); color:var(--text);">
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn" onclick="toggleCxEditMode('${cx.id}', false)">Cancelar</button>
        <button class="btn primary" id="btn-save-cx-${cx.id}" onclick="updateCaixinha('${cx.id}')">Salvar</button>
      </div>
    </div>
  `;

  openModal('modal-detalhe-caixinha');
}

function toggleCxEditMode(id, editMode) {
  const detailView = document.getElementById('cx-detail-view-' + id);
  const editView = document.getElementById('cx-edit-view-' + id);
  if (editMode) {
    detailView?.classList.add('hidden');
    editView?.classList.remove('hidden');
  } else {
    detailView?.classList.remove('hidden');
    editView?.classList.add('hidden');
  }
}

// ── COMPARTILHADOS ────────────────────────────────────
function openContasCompartilhadasModal() {
  const listEl = document.getElementById('contas-compartilhadas-list');
  if (!listEl) return;

  // Group state.sharedGastos by owner_id
  const byOwner = {};
  state.sharedGastos.forEach(g => {
    byOwner[g.owner_id] = (byOwner[g.owner_id] || 0) + Number(g.valor);
  });

  listEl.innerHTML = Object.entries(byOwner).map(([ownerId, total]) => {
    const ownerUsername = usernameCache[ownerId] || ownerId.substring(0, 8);
    const pc = getColor(state.persons, ownerUsername);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="person-avatar" style="background:${pc}22;color:${pc};width:28px;height:28px;font-size:11px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;">
            ${ownerUsername.substring(0,2).toUpperCase()}
          </div>
          <span style="font-weight:600;color:var(--text);">${esc(ownerUsername)}</span>
        </div>
        <span style="font-weight:700;color:var(--green)">R$ ${fmt(total)}</span>
      </div>`;
  }).join('') || '<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px;">Nenhuma conta vinculada.</div>';

  openModal('modal-contas-compartilhadas');
}

function selectSharedOwner(uid) {
  state.currentSharedOwner = uid;
  state.currentSharedYear = null;
  state.currentSharedMonth = null;
  state.currentSharedCard = null;
  renderCompartilhados();
}

function selectSharedYear(year) {
  state.currentSharedYear = year;
  state.currentSharedMonth = null;
  state.currentSharedCard = null;
  renderCompartilhados();
}

function selectSharedMonth(monthId) {
  state.currentSharedMonth = monthId;
  state.currentSharedCard = null;
  renderCompartilhados();
}

function selectSharedCard(cardName) {
  state.currentSharedCard = cardName;
  renderCompartilhados();
}

function renderCompartilhados() {
  const container = document.getElementById('page-compartilhados');
  if (!container) return;

  // Reset badge and update last viewed timestamp
  localStorage.setItem('last_viewed_shared_gastos', new Date().toISOString());
  const badge = document.getElementById('badge-compartilhados');
  if (badge) badge.classList.add('hidden');

  if (!state.sharedGastos || !state.sharedGastos.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🤝</div>
        <p>Nenhuma despesa compartilhada em outros usuários ainda.</p>
      </div>`;
    return;
  }

  // Group gastos by owner user_id for summary calculations
  const byOwnerSum = {};
  state.sharedGastos.forEach(g => {
    byOwnerSum[g.owner_id] = (byOwnerSum[g.owner_id] || 0) + Number(g.valor);
  });

  const grandTotal = state.sharedGastos.reduce((s, g) => s + Number(g.valor), 0);
  const activeAccountsCount = Object.keys(byOwnerSum).length;

  // 1. Resolve and default selections
  const owners = [...new Set(state.sharedGastos.map(g => g.owner_id))];
  if (!state.currentSharedOwner || !owners.includes(state.currentSharedOwner)) {
    state.currentSharedOwner = owners[0] || null;
  }

  const ownerGastos = state.sharedGastos.filter(g => g.owner_id === state.currentSharedOwner);

  // Group by year
  const yearsMap = {};
  ownerGastos.forEach(g => {
    const monthName = state.sharedMonthsMap[g.mes_id] || 'Outros';
    const y = extractYear(monthName);
    if (!yearsMap[y]) yearsMap[y] = [];
    yearsMap[y].push(g);
  });
  const years = Object.keys(yearsMap).sort().reverse();

  if (!state.currentSharedYear || !years.includes(state.currentSharedYear)) {
    state.currentSharedYear = years[0] || null;
  }

  // Get months in active year
  const activeYearGastos = yearsMap[state.currentSharedYear] || [];
  const monthsMap = {};
  activeYearGastos.forEach(g => {
    const monthName = state.sharedMonthsMap[g.mes_id] || 'Outros';
    monthsMap[g.mes_id] = monthName;
  });

  const months = Object.entries(monthsMap).map(([id, nome]) => ({ id, nome }));
  const MESES_PT = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  months.sort((a, b) => {
    const [ma, ya] = a.nome.split('/');
    const [mb, yb] = b.nome.split('/');
    if (ya !== yb) return parseInt(ya) - parseInt(yb);
    return MESES_PT.indexOf(ma) - MESES_PT.indexOf(mb);
  });

  if (!state.currentSharedMonth || !months.some(m => m.id === state.currentSharedMonth)) {
    state.currentSharedMonth = months[months.length - 1]?.id || null;
  }

  // Filter active month gastos
  const activeMonthGastos = activeYearGastos.filter(g => g.mes_id === state.currentSharedMonth);

  // Group by cards
  const cardsMap = {};
  activeMonthGastos.forEach(g => {
    cardsMap[g.cartao] = (cardsMap[g.cartao] || 0) + Number(g.valor);
  });
  const cardsList = Object.keys(cardsMap).sort();

  if (!state.currentSharedCard || !cardsList.includes(state.currentSharedCard)) {
    state.currentSharedCard = cardsList[0] || null;
  }

  const activeCardGastos = activeMonthGastos.filter(g => g.cartao === state.currentSharedCard);

  // 2. Generate HTML elements
  // Owner tabs
  const ownerTabsHtml = owners.map(uid => {
    const name = usernameCache[uid] || uid.substring(0,8);
    const isActive = uid === state.currentSharedOwner;
    const pc = getColor(state.persons, name);
    return `
      <button class="year-tab${isActive ? ' active' : ''}" 
        style="${isActive ? `background:${pc};border-color:${pc};color:white;` : `border-color:var(--border);color:var(--text2);`}"
        onclick="selectSharedOwner('${uid}')">
        👥 ${esc(name)}
      </button>`;
  }).join('');

  // Year tabs
  const yearTabsHtml = years.map(y => {
    const isActive = y === state.currentSharedYear;
    return `
      <button class="year-tab${isActive ? ' active' : ''}" onclick="selectSharedYear('${y}')">
        ${y}
      </button>`;
  }).join('');

  // Month buttons
  const monthSelectorHtml = months.map(m => {
    const isActive = m.id === state.currentSharedMonth;
    return `
      <button class="month-btn${isActive ? ' active' : ''}" onclick="selectSharedMonth('${m.id}')">
        ${esc(m.nome)}
      </button>`;
  }).join('');

  // Card chips
  const cardChipsHtml = cardsList.map(card => {
    const total = cardsMap[card];
    const isActive = card === state.currentSharedCard;
    const color = getColor(state.cards, card);
    return `
      <button class="card-chip${isActive ? ' active' : ''}" 
        style="${isActive ? `border-color:${color};color:${color};background:${color}18;` : ''}"
        onclick="selectSharedCard('${esc(card)}')">
        <span class="color-dot" style="background:${color}"></span>
        ${esc(card)}
        <span class="chip-total">R$ ${fmt(total)}</span>
      </button>`;
  }).join('');

  // Table
  const totalCard = activeCardGastos.reduce((s, g) => s + Number(g.valor), 0);
  const tableRowsHtml = activeCardGastos.map(g => {
    const pLabel = g.parcelas > 1 ? `${g.parcela_atual}/${g.parcelas}x` : 'À vista';
    return `
      <tr>
        <td>${descLabel(g.descricao)}</td>
        <td style="color:var(--text3)">${pLabel}</td>
        <td class="amount-cell" style="text-align:right;color:var(--green)">R$ ${fmt(Number(g.valor))}</td>
      </tr>`;
  }).join('');

  const tableHtml = activeCardGastos.length ? `
    <div class="table-card">
      <div class="table-card-header">
        <h2>Gastos — ${esc(state.currentSharedCard)}</h2>
        <div>
          <span class="total-label">Total do cartão:</span>
          <span class="total-value" style="color:var(--green)">R$ ${fmt(totalCard)}</span>
        </div>
      </div>
      <div class="scrollable">
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Parcelas</th>
              <th style="text-align:right">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    </div>` : `
    <div class="table-card empty-state">
      <div class="icon">📋</div>
      <p>Nenhum gasto neste cartão e mês.</p>
    </div>`;

  // Render everything to container
  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card accent" style="border-color: var(--green);">
        <div class="s-label">Total em outros usuários</div>
        <div class="s-value" style="color: var(--green);">R$ ${fmt(grandTotal)}</div>
        <div class="s-sub">Soma de todos os seus gastos em cartões de amigos</div>
      </div>
      <div class="summary-card" onclick="openContasCompartilhadasModal()" style="cursor:pointer;transition:transform 0.15s, border-color 0.15s;border:1px solid var(--border2);" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='var(--accent)'" onmouseout="this.style.transform='none';this.style.borderColor='var(--border2)'">
        <div class="s-label" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Contas compartilhadas</span>
          <span style="font-size:10px;color:var(--accent);">🔍 Ver detalhes</span>
        </div>
        <div class="s-value">${activeAccountsCount}</div>
        <div class="s-sub">Usuários que têm gastos no seu nome</div>
      </div>
    </div>
    
    <div style="margin:20px 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3)">Dono da conta</div>
    <div class="year-tabs" style="margin-bottom:15px">${ownerTabsHtml}</div>

    <div style="margin:15px 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3)">Ano & Mês</div>
    <div class="year-tabs">${yearTabsHtml}</div>
    <div class="month-selector">${monthSelectorHtml}</div>

    <div style="margin:15px 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3)">Cartões de ${esc(usernameCache[state.currentSharedOwner] || '')}</div>
    <div class="card-chips">${cardChipsHtml}</div>

    ${tableHtml}
  `;
}
