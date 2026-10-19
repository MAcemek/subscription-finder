import type {
  ColumnMapping,
  CsvRow,
  DecimalSeparator,
  Encoding,
  FileSettings,
  ImportedFile,
  Transaction,
} from '../types';
import { detectDecimal, parseAmount } from './amounts';
import { detectColumns, isMappingComplete } from './columns';
import { dayNumber, detectDateOrder, parseDate } from './dates';
import { decodeBytes } from './decode';
import { detectDelimiter, parseCsv } from './parse';

const OUT_WORDS = ['af', 'debit', 'dr', 'd', 'soll', 's', 'out', 'withdrawal'];
const IN_WORDS = ['bij', 'credit', 'cr', 'c', 'haben', 'h', 'in', 'deposit'];

export function dataRows(rows: CsvRow[], headerRow: number): CsvRow[] {
  return rows.slice(headerRow + 1);
}

function columnValues(rows: CsvRow[], col: number): string[] {
  if (col < 0) {
    return [];
  }
  return rows.map((row) => (row.cells[col] ?? '').trim()).filter((value) => value !== '');
}

/** -1 for money out, 1 for money in, 0 when the value is not recognized. */
export function directionSign(raw: string): -1 | 0 | 1 {
  const value = raw.trim().toLowerCase().replace(/\.$/, '');
  if (OUT_WORDS.includes(value)) {
    return -1;
  }
  if (IN_WORDS.includes(value)) {
    return 1;
  }
  return 0;
}

/**
 * Guesses whether positive amounts are money going out, as in many credit card exports:
 * true when there are more positive than negative amounts.
 */
export function guessFlipSigns(values: string[], decimal: DecimalSeparator): boolean {
  let positive = 0;
  let negative = 0;
  for (const value of values) {
    const cents = parseAmount(value, decimal);
    if (cents === null || cents === 0) {
      continue;
    }
    if (cents > 0) {
      positive += 1;
    } else {
      negative += 1;
    }
  }
  return positive > negative;
}

/** Fills in the date order, decimal separator and sign convention for a column mapping. */
export function guessSettings(
  rows: CsvRow[],
  mapping: ColumnMapping,
  headerRow: number,
): FileSettings {
  const data = dataRows(rows, headerRow);
  const dateOrder = detectDateOrder(columnValues(data, mapping.date)).order;
  const money = [mapping.amount, mapping.debit, mapping.credit].flatMap((col) =>
    columnValues(data, col),
  );
  const decimal = detectDecimal(money);
  const flipSigns =
    mapping.amount >= 0 && mapping.direction < 0
      ? guessFlipSigns(columnValues(data, mapping.amount), decimal)
      : false;
  return { mapping, headerRow, dateOrder, decimal, flipSigns };
}

function amountFor(cells: string[], settings: FileSettings): number | null {
  const { mapping, decimal } = settings;
  if (mapping.amount >= 0) {
    const cents = parseAmount(cells[mapping.amount] ?? '', decimal);
    if (cents === null) {
      return null;
    }
    const sign = mapping.direction >= 0 ? directionSign(cells[mapping.direction] ?? '') : 0;
    if (sign !== 0) {
      return sign * Math.abs(cents);
    }
    return settings.flipSigns ? -cents : cents;
  }
  const debit = mapping.debit >= 0 ? parseAmount(cells[mapping.debit] ?? '', decimal) : null;
  const credit = mapping.credit >= 0 ? parseAmount(cells[mapping.credit] ?? '', decimal) : null;
  if (debit === null && credit === null) {
    return null;
  }
  return Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
}

/** Reads the transactions from the data rows. Rows without a valid date or amount are skipped. */
export function extractTransactions(
  rows: CsvRow[],
  settings: FileSettings,
  source: string,
): { transactions: Transaction[]; skipped: number } {
  const transactions: Transaction[] = [];
  let skipped = 0;
  if (!isMappingComplete(settings.mapping)) {
    return { transactions, skipped };
  }
  for (const row of dataRows(rows, settings.headerRow)) {
    const date = parseDate(row.cells[settings.mapping.date] ?? '', settings.dateOrder);
    const amount = amountFor(row.cells, settings);
    if (date === null || amount === null) {
      skipped += 1;
      continue;
    }
    transactions.push({
      date,
      day: dayNumber(date),
      description: (row.cells[settings.mapping.description] ?? '').trim(),
      amount,
      source,
      line: row.line,
    });
  }
  return { transactions, skipped };
}

function build(
  base: Pick<ImportedFile, 'name' | 'encoding' | 'delimiter' | 'rows'>,
  settings: FileSettings,
  needsReview: boolean,
): ImportedFile {
  const dates = columnValues(dataRows(base.rows, settings.headerRow), settings.mapping.date);
  const guess = detectDateOrder(dates);
  const { transactions, skipped } = extractTransactions(base.rows, settings, base.name);
  return {
    ...base,
    settings,
    needsReview: needsReview || !isMappingComplete(settings.mapping),
    dateAmbiguous: guess.ambiguous,
    hasNumericDates: guess.hasNumeric,
    transactions,
    skipped,
  };
}

/** Detects the layout of a CSV file and reads its transactions. */
export function importText(name: string, text: string, encoding: Encoding): ImportedFile {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  const guess = detectColumns(rows);
  const settings = guessSettings(rows, guess.mapping, guess.headerRow);
  return build({ name, encoding, delimiter, rows }, settings, guess.needsReview);
}

export function importBytes(name: string, bytes: Uint8Array): ImportedFile {
  const { text, encoding } = decodeBytes(bytes);
  return importText(name, text, encoding);
}

/** Uses a new column mapping chosen by the user and guesses the other settings again. */
export function applyMapping(
  file: ImportedFile,
  mapping: ColumnMapping,
  headerRow: number,
): ImportedFile {
  return build(file, guessSettings(file.rows, mapping, headerRow), false);
}

/** Uses settings changed by the user (date order, decimal separator or sign convention). */
export function applySettings(file: ImportedFile, settings: FileSettings): ImportedFile {
  return build(file, settings, file.needsReview);
}
