// ── APP STATE ─────────────────────────────────────────
const state = {
  persons:      [],
  personsData:  [],
  cards:        [],
  months:       [],
  gastos:       [],
  caixinhas:    [],
  anotacoes:    [],
  sharedGastos: [],
  sharedPessoas:[],
  sharedMonths: [],
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

// Tracks which card notes are expanded in the "Por Cartão" view
const expandedCardNotes = new Set();

// Tracks which card details are expanded in the "Por Cartão" view
const expandedCards = new Set();

// Tracks current page
let currentPage = 'lancamento';
