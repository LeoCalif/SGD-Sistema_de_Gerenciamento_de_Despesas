// ── EXPORT CSV ────────────────────────────────────────
function exportCSV() {
  if (!state.gastos.length) { toast('Sem dados para exportar.', 'error'); return; }

  const month = state.months.find(m => m.id === state.currentMonth);
  const rows  = [['Mes', 'Cartao', 'Descricao', 'Pessoa', 'Parcelas', 'Valor']];

  state.gastos.forEach(g => rows.push([
    month?.nome || '',
    g.cartao,
    g.descricao || '',
    g.pessoa,
    g.parcelas,
    Number(g.valor).toFixed(2).replace('.', ','),
  ]));

  const csv  = rows.map(r => r.map(v => `"${v}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `gastos-${month?.nome || 'export'}.csv`,
  });
  a.click();
  toast('CSV exportado!', 'success');
}

// ── IMPORT CSV ────────────────────────────────────────
let _importRows = [];

function openImportModal() {
  _importRows = [];
  document.getElementById('import-file').value = '';
  document.getElementById('import-preview-wrap').innerHTML = '';
  document.getElementById('import-info').textContent = '';
  document.getElementById('btn-confirm-import').disabled = true;
  openModal('modal-import');
}

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { toast('Arquivo sem dados.', 'error'); return; }

  const sep     = lines[0].includes(';') ? ';' : ',';
  const headers = parseCSVLine(lines[0], sep).map(h => h.toLowerCase().trim());

  const colMap = {
    mes:       findCol(headers, ['mes', 'mês', 'month']),
    cartao:    findCol(headers, ['cartao', 'cartão', 'card']),
    descricao: findCol(headers, ['descricao', 'descrição', 'description', 'desc']),
    pessoa:    findCol(headers, ['pessoa', 'person', 'name', 'nome']),
    parcelas:  findCol(headers, ['parcelas', 'installments', 'parc']),
    valor:     findCol(headers, ['valor', 'value', 'amount', 'total']),
  };

  if (colMap.valor === -1 || colMap.cartao === -1 || colMap.pessoa === -1) {
    toast('Colunas obrigatórias não encontradas: Cartao, Pessoa, Valor.', 'error');
    return;
  }

  _importRows = [];
  const errors = [];

  lines.slice(1).forEach((line, i) => {
    const cols  = parseCSVLine(line, sep);
    const valor = parseFloat(
      (cols[colMap.valor] || '0').replace(/[^\d.,-]/g, '').replace(',', '.')
    );
    if (isNaN(valor) || valor === 0) { errors.push(`Linha ${i + 2}`); return; }

    _importRows.push({
      mes:       colMap.mes       !== -1 ? (cols[colMap.mes]       || '').trim() : '',
      cartao:    (cols[colMap.cartao]  || '').trim(),
      descricao: colMap.descricao !== -1 ? (cols[colMap.descricao] || '').trim() : '',
      pessoa:    (cols[colMap.pessoa]  || '').trim(),
      parcelas:  colMap.parcelas  !== -1 ? parseInt(cols[colMap.parcelas]) || 1 : 1,
      valor,
    });
  });

  if (!_importRows.length) { toast('Nenhum dado válido encontrado.', 'error'); return; }

  renderImportPreview();
  document.getElementById('btn-confirm-import').disabled = false;
  document.getElementById('import-info').innerHTML =
    `<span>${_importRows.length}</span> linhas encontradas` +
    (errors.length ? ` (${errors.length} ignoradas)` : '') + '.';
}

function parseCSVLine(line, sep) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === sep && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function findCol(headers, names) {
  for (const name of names) {
    const idx = headers.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function renderImportPreview() {
  const preview = _importRows.slice(0, 8);
  document.getElementById('import-preview-wrap').innerHTML = `
    <div class="import-preview">
      <table>
        <thead><tr>
          <th>Mês</th><th>Cartão</th><th>Descrição</th>
          <th>Pessoa</th><th>Parc.</th><th>Valor</th>
        </tr></thead>
        <tbody>
          ${preview.map(r => `<tr>
            <td>${esc(r.mes || '—')}</td>
            <td>${esc(r.cartao)}</td>
            <td>${esc(r.descricao || '—')}</td>
            <td>${esc(r.pessoa)}</td>
            <td>${r.parcelas}x</td>
            <td style="color:var(--green)">R$ ${fmt(r.valor)}</td>
          </tr>`).join('')}
          ${_importRows.length > 8
            ? `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:8px">
                ... e mais ${_importRows.length - 8} linha(s)
               </td></tr>`
            : ''}
        </tbody>
      </table>
    </div>`;
}

async function confirmImport() {
  if (!_importRows.length) return;

  const btn = document.getElementById('btn-confirm-import');
  btn.disabled    = true;
  btn.textContent = 'Importando...';
  setSyncStatus(false);

  // Group by month name
  const byMonth = {};
  const fallbackName = state.months.find(m => m.id === state.currentMonth)?.nome || 'Importado';
  _importRows.forEach(r => {
    const key = r.mes || fallbackName;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(r);
  });

  let totalInserted = 0;

  for (const [monthName, rows] of Object.entries(byMonth)) {
    const month = await findOrCreateMonth(monthName);
    if (!month) continue;

    // Ensure persons and cards exist
    for (const row of rows) {
      await ensurePerson(row.pessoa);
      await ensureCard(row.cartao);
    }

    // Bulk insert with owner
    const inserts = rows.map(r => ({
      mes_id:    month.id,
      cartao:    r.cartao,
      pessoa:    r.pessoa,
      descricao: r.descricao || '',
      valor:     r.valor,
      parcelas:  r.parcelas || 1,
      user_id:   currentUser.id,
    }));

    const { error } = await db.from('gastos').insert(inserts);
    if (!error) totalInserted += inserts.length;
  }

  if (state.currentMonth) await loadGastos();

  btn.disabled    = false;
  btn.textContent = 'Confirmar importação';
  closeModal('modal-import');
  toast(`${totalInserted} gasto(s) importados!`, 'success');
  renderPage(currentPage);
  setSyncStatus(true);
}

// ── OPEN NEW MONTH MODAL ──────────────────────────────
function openNewMonthModal() {
  const now = new Date();
  const raw = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  document.getElementById('modal-month-name').value = capitalize(raw);
  openModal('modal-new-month');
  setTimeout(() => document.getElementById('modal-month-name').select(), 50);
}

// ── EXPORT PDF POR PESSOA ─────────────────────────────
async function exportPessoaPDF() {
  if (!state.gastos.length) { toast('Sem dados para exportar.', 'error'); return; }

  const month = state.months.find(m => m.id === state.currentMonth);
  const monthName = month?.nome || 'Mês';

  // Build data grouped by person
  const byPerson = {};
  state.persons.forEach(p => { byPerson[p] = {}; });
  state.gastos.forEach(g => {
    if (!byPerson[g.pessoa]) byPerson[g.pessoa] = {};
    if (!byPerson[g.pessoa][g.cartao]) byPerson[g.pessoa][g.cartao] = { total:0, items:[] };
    byPerson[g.pessoa][g.cartao].total += Number(g.valor);
    byPerson[g.pessoa][g.cartao].items.push(g);
  });

  const activePeople = state.persons.filter(p =>
    Object.values(byPerson[p]||{}).some(v => v.total !== 0));

  if (!activePeople.length) { toast('Nenhum gasto encontrado.', 'error'); return; }

  // Build HTML for printing
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; background: #ffffff; color: #0f172a; font-size: 13px; line-height: 1.5; padding: 20px; }
    
    .person-page {
      width: 100%;
      page-break-after: always;
      break-after: always;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .person-page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    
    .report-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #cbd5e1; padding-bottom: 14px; margin-bottom: 12px; }
    .report-title h1 { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; color: #1e293b; }
    .report-title p { font-size: 12px; color: #64748b; margin-top: 2px; }
    .report-meta { text-align: right; font-size: 11px; color: #64748b; line-height: 1.4; }

    .person-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .person-card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #e2e8f0; /* Destaque cinza escuro para cabeçalho da pessoa */
      border-bottom: 1px solid #cbd5e1;
      padding: 14px 16px;
    }
    .person-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-family: 'Syne', sans-serif;
      font-size: 13px;
    }
    .person-name {
      font-weight: 600;
      font-size: 15px;
      font-family: 'Syne', sans-serif;
      color: #1e293b;
    }
    .person-total {
      font-size: 12px;
      color: #475569;
      margin-top: 1px;
    }
    .person-total span {
      color: #2563eb;
      font-weight: 700;
    }
    .card-breakdown {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    .card-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .card-row {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      overflow: hidden;
    }
    .card-row-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 12px;
      color: #1e293b;
      background: #cbd5e1; /* Destaque cinza escuro para cabeçalho do cartão */
      border-bottom: 1px solid #94a3b8;
      padding: 8px 12px;
    }
    .card-row-title {
      display: flex;
      align-items: center;
    }
    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
    }
    .card-items-detail {
      padding: 6px 12px;
    }
    .detail-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px dashed #cbd5e1;
      font-size: 11px;
    }
    .detail-item:last-child {
      border-bottom: none;
    }
    .detail-item-left {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .detail-item-desc {
      color: #334155;
      font-weight: 500;
    }
    .detail-item-desc.empty {
      color: #94a3b8;
      font-style: italic;
    }
    .detail-item-parc {
      font-size: 9px;
      color: #64748b;
    }
    .parc-badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 10px;
      font-size: 8px;
      font-weight: 600;
      margin-left: 4px;
    }
    .detail-item-valor {
      font-weight: 600;
      font-family: 'Syne', sans-serif;
      font-size: 11px;
    }
    .valor-neg { color: #dc2626; }
    .valor-pos { color: #16a34a; }
    
    .person-note-box {
      background: #f8fafc;
      border-left: 3px solid #2563eb;
      padding: 8px 10px;
      border-radius: 4px;
      font-size: 11px;
      color: #334155;
      margin-top: 8px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }
    .person-note-title {
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 2px;
    }
    .person-note-text {
      white-space: pre-wrap;
      line-height: 1.4;
    }
    
    .footer {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .person-page {
        height: 100%;
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
    @media (max-width: 650px) {
      .card-grid { grid-template-columns: 1fr !important; }
    }
  `;

  const COLORS_PDF = ['#7c6ef5','#4ade80','#fbbf24','#f87171','#60a5fa','#f472b6','#34d399','#fb923c'];
  const getC = (list, name) => COLORS_PDF[Math.max(0,list.indexOf(name)) % COLORS_PDF.length];

  const pagesHtml = activePeople.map((person, idx) => {
    const pc    = getC(state.persons, person);
    const cards = state.cards.filter(c => byPerson[person][c]?.total > 0);
    const total = cards.reduce((s,c) => s+(byPerson[person][c]?.total||0), 0);

    const isFirst = idx === 0;
    const reportHeaderHtml = isFirst ? `
      <div class="report-header">
        <div class="report-title">
          <h1>Klif Despesas — Resumo por Pessoa</h1>
          <p>Mês de Referência: ${monthName}</p>
        </div>
        <div class="report-meta">
          Gerado em ${new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>
    ` : '';

    // Get note text
    const noteObj = state.anotacoes ? state.anotacoes.find(n => n.pessoa === person && n.mes_id === state.currentMonth) : null;
    const noteText = noteObj ? noteObj.texto : '';
    const noteHtml = noteText.trim() !== '' 
      ? `<div class="person-note-box">
          <div class="person-note-title">📝 Anotações do Mês</div>
          <div class="person-note-text">${esc(noteText)}</div>
         </div>`
      : '';

    const cardRows = cards.map(c => {
      const cc   = getC(state.cards, c);
      const data = byPerson[person][c];
      
      const itemsHtml = data.items.map(g => {
        const pAt = g.parcela_atual || 1;
        const badge = g.parcelas > 1
          ? `<span class="parc-badge" style="background:${cc}18;color:${cc}">${pAt}/${g.parcelas}x</span>`
          : `<span style="color:#64748b">À vista</span>`;
        const dLabel = g.descricao
          ? `<span class="detail-item-desc">${esc(g.descricao)}</span>`
          : `<span class="detail-item-desc empty">sem descrição</span>`;
        const valClass = Number(g.valor) < 0 ? 'valor-neg' : 'valor-pos';
        return `<div class="detail-item">
          <div class="detail-item-left">
            ${dLabel}
            <div class="detail-item-parc">${badge}</div>
          </div>
          <span class="detail-item-valor ${valClass}">R$ ${fmt(Number(g.valor))}</span>
        </div>`;
      }).join('');

      return `<div class="card-row">
        <div class="card-row-header">
          <span class="card-row-title">
            <span class="color-dot" style="background:${cc}"></span>
            ${esc(c)}
          </span>
          <span style="color:${cc}">R$ ${fmt(data.total)}</span>
        </div>
        <div class="card-items-detail">
          ${itemsHtml}
        </div>
      </div>`;
    }).join('');

    return `<div class="person-page">
      ${reportHeaderHtml}
      <div class="person-card">
        <div class="person-card-header">
          <div class="person-avatar" style="background:${pc}22;color:${pc}">${person.substring(0,2).toUpperCase()}</div>
          <div>
            <div class="person-name">${esc(person)}</div>
            <div class="person-total">Total: <span>R$ ${fmt(total)}</span></div>
          </div>
        </div>
        <div class="card-breakdown">
          <div class="card-grid">
            ${cardRows}
          </div>
          ${noteHtml}
        </div>
      </div>
      <div class="footer">
        Klif Despesas · Controle de Gastos · Gerado em ${new Date().toLocaleDateString('pt-BR')}
      </div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Gastos por Pessoa — ${monthName}</title>
    <style>${css}</style>
  </head><body>${pagesHtml}</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
  toast('PDF aberto para impressão!', 'success');
}

async function copyReportToWhatsapp() {
  if (!state.gastos.length) { toast('Sem dados para exportar.', 'error'); return; }

  const month = state.months.find(m => m.id === state.currentMonth);
  const monthName = month?.nome || 'Mês';
  const rawMonth = monthName.split('/')[0].toUpperCase();

  // Build data grouped by person
  const byPerson = {};
  state.persons.forEach(p => { byPerson[p] = {}; });
  state.gastos.forEach(g => {
    if (!byPerson[g.pessoa]) byPerson[g.pessoa] = {};
    if (!byPerson[g.pessoa][g.cartao]) byPerson[g.pessoa][g.cartao] = { total:0, items:[] };
    byPerson[g.pessoa][g.cartao].total += Number(g.valor);
    byPerson[g.pessoa][g.cartao].items.push(g);
  });

  // Include people with expenses > 0 or with notes in the current month
  const peopleToInclude = state.persons.filter(person => {
    const cards = state.cards.filter(c => byPerson[person][c]?.total > 0);
    const total = cards.reduce((s,c) => s+(byPerson[person][c]?.total||0), 0);
    const noteObj = state.anotacoes ? state.anotacoes.find(n => n.pessoa === person && n.mes_id === state.currentMonth) : null;
    const noteText = noteObj ? noteObj.texto.trim() : '';
    return total > 0 || noteText !== '';
  });

  if (!peopleToInclude.length) { toast('Nenhum gasto ou anotação encontrado para este mês.', 'warning'); return; }

  let textLines = [];
  textLines.push(`--------------------------------------*${rawMonth}*------------------------------------\n`);

  peopleToInclude.forEach(person => {
    const cards = state.cards.filter(c => byPerson[person][c]?.total > 0);
    const total = cards.reduce((s,c) => s+(byPerson[person][c]?.total||0), 0);
    const noteObj = state.anotacoes ? state.anotacoes.find(n => n.pessoa === person && n.mes_id === state.currentMonth) : null;
    const noteText = noteObj ? noteObj.texto.trim() : '';

    let line = '';
    if (total > 0) {
      line = `${person} deve *R$ ${fmt(total)}*`;
      if (noteText) {
        // If note text already has a dash, just add a space, otherwise prepend a separator
        const separator = (noteText.startsWith('-') || noteText.startsWith('—')) ? ' ' : ' - ';
        line += `${separator}${noteText}`;
      }
    } else {
      line = `${person} - ${noteText}`;
    }
    textLines.push(line);
  });

  const textToCopy = textLines.join('\n\n');

  navigator.clipboard.writeText(textToCopy).then(() => {
    toast('Relatório copiado para o WhatsApp!', 'success');
  }).catch(err => {
    console.error('Erro ao copiar:', err);
    toast('Erro ao copiar texto.', 'error');
  });
}

// ── EXPORTAR PNG POR PESSOA ───────────────────────────
function openPngExportModal() {
  if (!state.gastos.length) {
    toast('Sem dados para exportar.', 'error');
    return;
  }

  const month = state.months.find(m => m.id === state.currentMonth);
  const monthName = month?.nome || 'Mês';

  const byPerson = {};
  state.persons.forEach(p => { byPerson[p] = {}; });
  state.gastos.forEach(g => {
    if (!byPerson[g.pessoa]) byPerson[g.pessoa] = {};
    if (!byPerson[g.pessoa][g.cartao]) byPerson[g.pessoa][g.cartao] = { total:0, items:[] };
    byPerson[g.pessoa][g.cartao].total += Number(g.valor);
    byPerson[g.pessoa][g.cartao].items.push(g);
  });

  const activePeople = state.persons.filter(person => {
    const cards = state.cards.filter(c => byPerson[person][c]?.total > 0);
    const total = cards.reduce((s,c) => s+(byPerson[person][c]?.total||0), 0);
    const noteObj = state.anotacoes ? state.anotacoes.find(n => n.pessoa === person && n.mes_id === state.currentMonth) : null;
    const noteText = noteObj ? noteObj.texto.trim() : '';
    return total > 0 || noteText !== '';
  });

  if (!activePeople.length) {
    toast('Nenhum gasto ou anotação encontrado para este mês.', 'warning');
    return;
  }

  const listEl = document.getElementById('export-png-list');
  if (!listEl) return;

  listEl.innerHTML = activePeople.map(person => {
    return `
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none; font-size:13px; color:var(--text2);">
        <input type="checkbox" class="export-png-checkbox" value="${esc(person)}" onchange="onPngCheckboxChange()" checked>
        ${esc(person)}
      </label>
    `;
  }).join('');

  const selectAll = document.getElementById('export-png-select-all');
  if (selectAll) {
    selectAll.checked = true;
  }

  openModal('modal-export-png');
}

function toggleSelectAllPngExport(master) {
  const checkboxes = document.querySelectorAll('.export-png-checkbox');
  checkboxes.forEach(cb => cb.checked = master.checked);
}

function onPngCheckboxChange() {
  const checkboxes = document.querySelectorAll('.export-png-checkbox');
  const checked = document.querySelectorAll('.export-png-checkbox:checked');
  const selectAll = document.getElementById('export-png-select-all');
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
  }
}

async function exportSelectedPngs() {
  const checkedBoxes = document.querySelectorAll('.export-png-checkbox:checked');
  if (!checkedBoxes.length) {
    toast('Selecione pelo menos uma pessoa para exportar.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-confirm-export-png');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gerando...';

  const month = state.months.find(m => m.id === state.currentMonth);
  const monthName = month?.nome || 'Mês';

  const byPerson = {};
  state.persons.forEach(p => { byPerson[p] = {}; });
  state.gastos.forEach(g => {
    if (!byPerson[g.pessoa]) byPerson[g.pessoa] = {};
    if (!byPerson[g.pessoa][g.cartao]) byPerson[g.pessoa][g.cartao] = { total:0, items:[] };
    byPerson[g.pessoa][g.cartao].total += Number(g.valor);
    byPerson[g.pessoa][g.cartao].items.push(g);
  });

  const selectedPeople = Array.from(checkedBoxes).map(cb => cb.value);

  closeModal('modal-export-png');

  try {
    for (const person of selectedPeople) {
      const pc = getColor(state.persons, person);
      const cards = state.cards.filter(c => byPerson[person][c]?.total > 0);
      const total = cards.reduce((s,c) => s+(byPerson[person][c]?.total||0), 0);

      const noteObj = state.anotacoes ? state.anotacoes.find(n => n.pessoa === person && n.mes_id === state.currentMonth) : null;
      const noteText = noteObj ? noteObj.texto.trim() : '';
      const noteHtml = noteText !== '' 
        ? `<div class="export-card-note-box">
            <div class="export-card-note-title">📝 Anotações do Mês</div>
            <div class="export-card-note-text">${esc(noteText)}</div>
           </div>`
        : '';

      const cardRowsHtml = cards.map(c => {
        const cc = getColor(state.cards, c);
        const data = byPerson[person][c];
        
        const itemsHtml = data.items.map(g => {
          const pAt = g.parcela_atual || 1;
          const badge = g.parcelas > 1
            ? `<span class="parc-badge" style="background:${cc}18;color:${cc}">${pAt}/${g.parcelas}x</span>`
            : `<span style="color:var(--text3)">À vista</span>`;
          const dLabel = g.descricao
            ? `<span class="export-card-detail-desc">${esc(g.descricao)}</span>`
            : `<span class="export-card-detail-desc empty">sem descrição</span>`;
          return `<div class="export-card-detail-item">
            <div class="export-card-detail-left">
              ${dLabel}
              <div class="export-card-detail-parc">${badge}</div>
            </div>
            <span class="export-card-detail-valor" style="color:${Number(g.valor) < 0 ? 'var(--red)' : 'var(--green)'}">R$ ${fmt(Number(g.valor))}</span>
          </div>`;
        }).join('');

        return `<div class="export-card-row">
          <div class="export-card-row-header">
            <span style="display:flex; align-items:center;">
              <span class="color-dot" style="background:${cc}"></span>
              ${esc(c)}
            </span>
            <span class="export-card-row-amount" style="color:${cc}">R$ ${fmt(data.total)}</span>
          </div>
          <div class="export-card-items-detail">
            ${itemsHtml}
          </div>
        </div>`;
      }).join('');

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '440px';
      container.style.zIndex = '-9999';

      container.innerHTML = `
        <div class="export-card-template">
          <div class="export-card-logo-container">
            <div class="export-card-logo-left">
              <img src="assets/Klif%20Despesas.png" alt="Logo" style="height:22px; width:auto;">
              <div>
                <h1 class="export-card-logo-title">Klif Despesas</h1>
                <div class="export-card-logo-sub">Controle de Gastos</div>
              </div>
            </div>
            <div class="export-card-period">
              Período: <strong>${monthName}</strong>
            </div>
          </div>
          
          <div class="export-card-person-header" style="justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="export-card-avatar" style="background:${pc}22; color:${pc}">
                ${person.substring(0,2).toUpperCase()}
              </div>
              <div class="export-card-person-name">${esc(person)}</div>
            </div>
            <div class="export-card-total-badge" style="color:${pc}; background:${pc}12; border: 1px solid ${pc}40;">
              R$ ${fmt(total)}
            </div>
          </div>
          
          <div class="export-card-cards-grid">
            ${cardRowsHtml}
          </div>
          
          ${noteHtml}
          
          <div class="export-card-footer">
            Gerado em ${new Date().toLocaleDateString('pt-BR')} por Klif Despesas
          </div>
        </div>
      `;

      document.body.appendChild(container);

      await new Promise(resolve => setTimeout(resolve, 150));

      const canvas = await html2canvas(container, {
        useCORS: true,
        backgroundColor: '#0F172A',
        scale: 2, 
        logging: false
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imgData;
      const sanitizedName = person.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]/g, "_");
      const sanitizedMonth = monthName.replace('/', '-');
      a.download = `klif-despesas-${sanitizedName}-${sanitizedMonth}.png`;
      a.click();
    }
    
    toast('Imagens exportadas com sucesso!', 'success');
  } catch (err) {
    console.error('Erro na exportação de PNG:', err);
    toast('Erro ao gerar imagem.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

