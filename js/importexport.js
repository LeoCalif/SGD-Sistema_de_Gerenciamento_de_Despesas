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
