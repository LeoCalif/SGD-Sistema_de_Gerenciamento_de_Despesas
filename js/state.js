// ── APP STATE ─────────────────────────────────────────
const state = {
  persons:      [],
  cards:        [],
  months:       [],
  gastos:       [],
  currentMonth: null,
  currentCard:  null,
};

// Tracks which person cards are expanded in the "Por Pessoa" view
const expandedPersons = new Set();

// Tracks current page
let currentPage = 'lancamento';
