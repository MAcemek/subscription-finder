import type { ColumnMapping, ColumnRole, CsvRow } from '../types';
import { parseAmount } from './amounts';
import { looksLikeDate } from './dates';

/**
 * Header names for each column role, already normalized (see normalizeHeader), in priority
 * order. A header matches a name when it is equal to it or starts with it followed by a space,
 * so "Amount (EUR)" matches "amount". English, German, French, Spanish, Dutch, Portuguese and
 * Italian are covered.
 */
export const HEADER_NAMES: Record<ColumnRole, readonly string[]> = {
  date: [
    'transaction date',
    'trans date',
    'date',
    'booking date',
    'started date',
    'posting date',
    'post date',
    'posted date',
    'completed date',
    'value date',
    'buchungstag',
    'buchungsdatum',
    'datum',
    'wertstellung',
    'valutadatum',
    'date operation',
    'date de l operation',
    'date d operation',
    'date comptable',
    'date valeur',
    'fecha',
    'fecha operacion',
    'fecha de operacion',
    'fecha valor',
    'transactiedatum',
    'boekingsdatum',
    'data',
    'data movimento',
    'data operacao',
    'data de lancamento',
    'data lancamento',
    'data operazione',
    'data contabile',
    'data valuta',
    'valuta',
  ],
  description: [
    'merchant',
    'merchant name',
    'payee',
    'name',
    'partner name',
    'counterparty',
    'description',
    'transaction description',
    'narrative',
    'beguenstigter zahlungspflichtiger',
    'auftraggeber beguenstigter',
    'beguenstigter',
    'empfanger',
    'empfaenger',
    'zahlungsempfanger',
    'zahlungsempfaenger',
    'auftraggeber',
    'name zahlungsbeteiligter',
    'verwendungszweck',
    'buchungstext',
    'beschreibung',
    'libelle',
    'libelle operation',
    'beneficiaire',
    'concepto',
    'descripcion',
    'beneficiario',
    'naam omschrijving',
    'naam',
    'tegenpartij',
    'omschrijving',
    'mededelingen',
    'descricao',
    'historico',
    'descrizione',
    'causale',
    'memo',
  ],
  amount: [
    'amount',
    'transaction amount',
    'amt',
    'betrag',
    'umsatz',
    'montant',
    'importe',
    'monto',
    'bedrag',
    'valor',
    'importo',
  ],
  debit: [
    'debit',
    'debit amount',
    'debits',
    'withdrawal',
    'withdrawals',
    'withdrawal amount',
    'money out',
    'paid out',
    'outflow',
    'soll',
    'ausgang',
    'debito',
    'cargo',
    'cargos',
    'debe',
    'afschrijving',
    'uscite',
    'addebito',
    'addebiti',
    'saida',
    'saidas',
  ],
  credit: [
    'credit',
    'credit amount',
    'credits',
    'deposit',
    'deposits',
    'deposit amount',
    'money in',
    'paid in',
    'inflow',
    'haben',
    'eingang',
    'credito',
    'abono',
    'abonos',
    'haber',
    'bijschrijving',
    'entrate',
    'accredito',
    'accrediti',
    'entrada',
    'entradas',
  ],
  direction: [
    'af bij',
    'debit credit',
    'credit debit',
    'dr cr',
    'cr dr',
    'soll haben',
    'debit credit indicator',
  ],
};

/** Words that stop a header from being used as a money column, like "Balance" or "Fee". */
const MONEY_EXCLUDED_WORDS = [
  'foreign',
  'local',
  'balance',
  'bal',
  'saldo',
  'solde',
  'kontostand',
  'fee',
  'fees',
  'original',
  'running',
  'exchange',
  'card',
  'account',
  'number',
  'no',
  'type',
  'id',
];

const ROLE_ORDER: readonly ColumnRole[] = [
  'date',
  'direction',
  'amount',
  'debit',
  'credit',
  'description',
];

export const EMPTY_MAPPING: ColumnMapping = {
  date: -1,
  description: -1,
  amount: -1,
  debit: -1,
  credit: -1,
  direction: -1,
};

/** Lowercases, removes accents, turns everything but letters and digits into single spaces. */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00df/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function excludedFor(role: ColumnRole, header: string): boolean {
  const words = header.split(' ');
  if (role === 'amount' || role === 'debit' || role === 'credit') {
    if (words.some((word) => MONEY_EXCLUDED_WORDS.includes(word))) {
      return true;
    }
  }
  if (role === 'debit') {
    return words.includes('credit');
  }
  if (role === 'credit') {
    return words.includes('debit');
  }
  return false;
}

/** Finds a column for each role in a header row. Each column is used for at most one role. */
export function mapHeaderRow(cells: string[]): ColumnMapping {
  const headers = cells.map(normalizeHeader);
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const used = new Set<number>();
  for (const role of ROLE_ORDER) {
    for (const name of HEADER_NAMES[role]) {
      const index = headers.findIndex(
        (header, i) =>
          !used.has(i) &&
          (header === name || header.startsWith(`${name} `)) &&
          !excludedFor(role, header),
      );
      if (index >= 0) {
        mapping[role] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

export function hasMoneyColumn(mapping: ColumnMapping): boolean {
  return mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0;
}

/** A mapping is complete when it has a date, a description and at least one money column. */
export function isMappingComplete(mapping: ColumnMapping): boolean {
  return mapping.date >= 0 && mapping.description >= 0 && hasMoneyColumn(mapping);
}

function headerScore(mapping: ColumnMapping): number {
  return (
    (mapping.date >= 0 ? 1 : 0) +
    (mapping.description >= 0 ? 1 : 0) +
    (hasMoneyColumn(mapping) ? 1 : 0)
  );
}

export interface ColumnGuess {
  headerRow: number;
  mapping: ColumnMapping;
  needsReview: boolean;
}

/**
 * Finds the header row among the first 30 rows (some banks put account details above it):
 * the first row with a date, a description and a money column, or else the first row with a
 * date and one of the other two. Without a header row, columns are guessed from their contents
 * and the file needs review.
 */
export function detectColumns(rows: CsvRow[]): ColumnGuess {
  let fallback: ColumnGuess | null = null;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i += 1) {
    const mapping = mapHeaderRow((rows[i] as CsvRow).cells);
    const score = headerScore(mapping);
    if (score === 3) {
      return { headerRow: i, mapping, needsReview: false };
    }
    if (score === 2 && mapping.date >= 0 && fallback === null) {
      fallback = { headerRow: i, mapping, needsReview: true };
    }
  }
  if (fallback) {
    return fallback;
  }
  return { headerRow: -1, mapping: guessColumnsFromContent(rows), needsReview: true };
}

/**
 * Guesses columns for a file without a header row: the date column is the one where most
 * values are dates, the amount column is the first other column where most values are numbers,
 * and the description column is the remaining column with the most letters.
 */
export function guessColumnsFromContent(rows: CsvRow[]): ColumnMapping {
  const sample = rows.slice(0, 200);
  const width = Math.max(0, ...sample.map((row) => row.cells.length));
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const stats = [];
  for (let col = 0; col < width; col += 1) {
    const values = sample.map((row) => (row.cells[col] ?? '').trim());
    const filled = values.filter((value) => value !== '');
    const fill = sample.length === 0 ? 0 : filled.length / sample.length;
    const dates = filled.filter(looksLikeDate).length;
    const numbers = filled.filter(
      (value) =>
        !looksLikeDate(value) &&
        /\d/.test(value) &&
        (parseAmount(value, '.') !== null || parseAmount(value, ',') !== null),
    ).length;
    const letters =
      filled.length === 0
        ? 0
        : filled.reduce((sum, value) => sum + (value.match(/\p{L}/gu)?.length ?? 0), 0) /
          filled.length;
    const n = Math.max(filled.length, 1);
    stats.push({ col, fill, dateRatio: dates / n, numberRatio: numbers / n, letters });
  }
  let bestDate = 0;
  for (const s of stats) {
    if (s.fill >= 0.8 && s.dateRatio >= 0.8 && s.dateRatio > bestDate) {
      mapping.date = s.col;
      bestDate = s.dateRatio;
    }
  }
  const amount = stats.find((s) => s.col !== mapping.date && s.fill >= 0.8 && s.numberRatio >= 0.8);
  if (amount) {
    mapping.amount = amount.col;
  }
  let bestLetters = 3;
  for (const s of stats) {
    if (s.col !== mapping.date && s.col !== mapping.amount && s.letters > bestLetters) {
      mapping.description = s.col;
      bestLetters = s.letters;
    }
  }
  return mapping;
}
