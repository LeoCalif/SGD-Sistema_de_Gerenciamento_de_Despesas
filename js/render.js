// ── NAVIGATION ────────────────────────────────────────
function goTo(page) {
  currentPage = page;
  ['lancamento','resumo','cartoes-view','config'].forEach(p =>
    document.getElementById('page-'+p)?.classList.toggle('hidden', p !== page));
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.getAttribute('onclick')?.includes(page)));
  const [t,s] = TITLES[page] || ['',''];
  document.getElementById('page-title').textContent = t;
  document.getElementById('page-sub').textContent   = s;
  const newYearBtn    = document.getElementById('btn-new-year');
  const deleteYearBtn = document.getElementById('btn-delete-year');
  const pdfBtn        = document.getElementById('btn-pdf-pessoa');
  if (newYearBtn)    newYearBtn.classList.toggle('hidden', page === 'config');
  if (deleteYearBtn) deleteYearBtn.classList.toggle('hidden', page === 'config');
  if (pdfBtn) pdfBtn.style.display = page === 'resumo' ? 'flex' : 'none';
  // Close sidebar on mobile after nav
  closeSidebar();
  renderPage(page);
}

function renderPage(p) {
  if (p === 'lancamento')     renderLancamento();
  else if (p === 'resumo')    renderResumo();
  else if (p === 'cartoes-view') renderCartoesView();
  else if (p === 'config')    renderConfig();
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
  document.getElementById('persons-list').innerHTML = state.persons.map(p => {
    const c = getColor(state.persons,p);
    return `<div class="settings-item">
      <span><span class="color-dot" style="background:${c}"></span>${esc(p)}</span>
      <button class="btn danger sm" onclick="removePerson('${esc(p)}')">Remover</button>
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
