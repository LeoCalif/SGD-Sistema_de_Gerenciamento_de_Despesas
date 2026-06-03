// ── SUPABASE ──────────────────────────────────────────
const SUPABASE_URL = 'https://pelvhapajloyhxuztumn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlbHZoYXBhamxveWh4dXp0dW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTE4NzMsImV4cCI6MjA5NDcyNzg3M30.XAI_ughUm4_wiA9MkvUatpCA_UVtZsarDgBpWd4OVYA';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Current authenticated user (set after login)
let currentUser = null;

// ── COLORS ────────────────────────────────────────────
const COLORS = [
  '#7c6ef5', '#4ade80', '#fbbf24', '#f87171',
  '#60a5fa', '#f472b6', '#34d399', '#fb923c',
];

function getColor(list, name) {
  const idx = list.indexOf(name);
  return COLORS[Math.max(0, idx) % COLORS.length];
}

// ── PAGE TITLES ───────────────────────────────────────
const TITLES = {
  lancamento:     ['Lançamentos',    'Adicione gastos por cartão e pessoa'],
  resumo:         ['Por Pessoa',     'Totais e detalhes de cada pessoa'],
  'cartoes-view': ['Por Cartão',     'Totais e gastos por cartão'],
  caixinhas:      ['💰 Caixinhas',   'Poupanças e metas compartilhadas'],
  compartilhados: ['🤝 Em Outros',   'Suas despesas lançadas nos cartões de outras pessoas'],
  config:         ['Configurações',  'Gerencie pessoas e cartões'],
};
