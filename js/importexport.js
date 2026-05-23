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
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Syne:wght@700&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'DM Sans',sans-serif; background:#fff; color:#111; font-size:13px; }
    .page { width:100%; padding:32px 36px; page-break-after:always; }
    .page:last-child { page-break-after: avoid; }
    .header { display:flex; align-items:center; gap:16px; margin-bottom:24px; padding-bottom:16px; border-bottom:2px solid #7c6ef5; }
    .avatar { width:48px; height:48px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:'Syne',sans-serif; font-size:16px; font-weight:700; flex-shrink:0; }
    .person-name { font-family:'Syne',sans-serif; font-size:22px; font-weight:700; }
    .month-tag { font-size:12px; color:#6b7280; margin-top:2px; }
    .total-badge { margin-left:auto; text-align:right; }
    .total-badge .label { font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; }
    .total-badge .value { font-family:'Syne',sans-serif; font-size:22px; font-weight:700; color:#7c6ef5; }
    .card-section { margin-bottom:18px; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
    .card-title { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f9fafb; border-bottom:1px solid #e5e7eb; }
    .card-title-left { display:flex; align-items:center; gap:8px; font-weight:600; font-size:13px; }
    .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
    .card-total-val { font-family:'Syne',sans-serif; font-weight:700; font-size:14px; }
    table { width:100%; border-collapse:collapse; }
    th { padding:8px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#9ca3af; background:#f9fafb; border-bottom:1px solid #e5e7eb; font-weight:500; }
    td { padding:9px 12px; font-size:12px; border-bottom:1px solid #f3f4f6; }
    tr:last-child td { border-bottom:none; }
    .valor-pos { color:#16a34a; font-weight:600; }
    .valor-neg { color:#dc2626; font-weight:600; }
    .pill { display:inline-block; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:500; }
    .empty-desc { color:#9ca3af; font-style:italic; }
    .footer { margin-top:24px; text-align:center; font-size:10px; color:#9ca3af; border-top:1px solid #e5e7eb; padding-top:12px; }
    @media print {
      body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .page { padding:24px; }
    }
  `;

  const COLORS_PDF = ['#7c6ef5','#4ade80','#fbbf24','#f87171','#60a5fa','#f472b6','#34d399','#fb923c'];
  const getC = (list, name) => COLORS_PDF[Math.max(0,list.indexOf(name)) % COLORS_PDF.length];

  const pages = activePeople.map(person => {
    const pc    = getC(state.persons, person);
    const cards = state.cards.filter(c => byPerson[person][c]?.total > 0);
    const total = cards.reduce((s,c) => s+(byPerson[person][c]?.total||0), 0);

    const cardSections = cards.map(c => {
      const cc   = getC(state.cards, c);
      const data = byPerson[person][c];
      const rows = data.items.map(g => {
        const parc = g.parcelas > 1 ? `${g.parcelas}x` : 'À vista';
        const desc = g.descricao
          ? g.descricao.replace(/</g,'&lt;').replace(/>/g,'&gt;')
          : '<span class="empty-desc">—</span>';
        const valClass = Number(g.valor) < 0 ? 'valor-neg' : 'valor-pos';
        return `<tr>
          <td>${desc}</td>
          <td>${parc}</td>
          <td style="text-align:right" class="${valClass}">R$ ${Math.abs(Number(g.valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        </tr>`;
      }).join('');

      return `<div class="card-section">
        <div class="card-title">
          <span class="card-title-left">
            <span class="dot" style="background:${cc}"></span>${c}
          </span>
          <span class="card-total-val" style="color:${cc}">
            R$ ${data.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}
          </span>
        </div>
        <table>
          <thead><tr><th>Descrição</th><th>Parcelas</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join('');

    return `<div class="page">
      <div class="header">
        <div class="avatar" style="background:${pc}22;color:${pc}">${person.substring(0,2).toUpperCase()}</div>
        <div>
          <div class="person-name">${person}</div>
          <div class="month-tag">📅 ${monthName}</div>
        </div>
        <div class="total-badge">
          <div class="label">Total geral</div>
          <div class="value">R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        </div>
      </div>
      ${cardSections}
      <div class="footer">Controle de Cartões · ${monthName} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Gastos por Pessoa — ${monthName}</title>
    <style>${css}</style>
  </head><body>${pages}</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
  toast('PDF aberto para impressão!', 'success');
}
