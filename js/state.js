// ── APP STATE ─────────────────────────────────────────
const state = {
  persons:      [],
  personsData:  [],
  cards:        [],
  months:       [],
  gastos:       [],
  caixinhas:    [],
  sharedGastos: [],
  sharedPessoas:[],
  sharedMonthsMap: {},
  currentMonth: null,
  currentCard:  null,
  currentSharedOwner: null,
  currentSharedYear: null,
  currentSharedMonth: null,
  currentSharedCard: null,
};

// Tracks which person cards are expanded in the "Por Pessoa" view
const expandedPersons = new Set();

// Tracks current page
let currentPage = 'lancamento';
