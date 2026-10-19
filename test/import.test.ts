import { describe, expect, it } from 'vitest';
import { EMPTY_MAPPING } from '../src/csv/columns';
import {
  applyMapping,
  applySettings,
  directionSign,
  guessFlipSigns,
  importBytes,
  importText,
} from '../src/csv/import';
import { analyzeTransactions } from '../src/detect/recurrence';
import type { ColumnMapping, DateOrder, DecimalSeparator, Delimiter } from '../src/types';
import { readFixture } from './helpers';

interface Expected {
  delimiter: Delimiter;
  headerRow: number;
  mapping: Partial<ColumnMapping>;
  dateOrder: DateOrder;
  decimal: DecimalSeparator;
  flipSigns: boolean;
  needsReview: boolean;
  transactions: number;
  skipped: number;
  merchant: string;
}

const FIXTURES: Record<string, Expected> = {
  'us-card-negative-purchases.csv': {
    delimiter: ',',
    headerRow: 0,
    mapping: { date: 0, description: 2, amount: 5 },
    dateOrder: 'mdy',
    decimal: '.',
    flipSigns: false,
    needsReview: false,
    transactions: 7,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'us-card-positive-purchases.csv': {
    delimiter: ',',
    headerRow: 0,
    mapping: { date: 0, description: 1, amount: 2 },
    dateOrder: 'mdy',
    decimal: '.',
    flipSigns: true,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'us-card-debit-credit-columns.csv': {
    delimiter: ',',
    headerRow: 0,
    mapping: { date: 0, description: 3, debit: 5, credit: 6 },
    dateOrder: 'mdy',
    decimal: '.',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'us-bank-preamble.csv': {
    delimiter: ',',
    headerRow: 5,
    mapping: { date: 0, description: 1, amount: 2 },
    dateOrder: 'mdy',
    decimal: '.',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 1,
    merchant: 'Streamflix',
  },
  'us-bank-no-header.csv': {
    delimiter: ',',
    headerRow: -1,
    mapping: { date: 0, amount: 1, description: 4 },
    dateOrder: 'mdy',
    decimal: '.',
    flipSigns: false,
    needsReview: true,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'uk-bank-money-out-in.csv': {
    delimiter: ',',
    headerRow: 0,
    mapping: { date: 1, description: 4, amount: 7, debit: 16, credit: 17 },
    dateOrder: 'dmy',
    decimal: '.',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'eu-app-bank-iso-datetime.csv': {
    delimiter: ',',
    headerRow: 0,
    mapping: { date: 2, description: 4, amount: 5 },
    dateOrder: 'mdy',
    decimal: '.',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'eu-app-bank-quoted.csv': {
    delimiter: ',',
    headerRow: 0,
    mapping: { date: 0, description: 2, amount: 7 },
    dateOrder: 'mdy',
    decimal: '.',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'de-bank-semicolon-decimal-comma.csv': {
    delimiter: ';',
    headerRow: 0,
    mapping: { date: 1, description: 11, amount: 14 },
    dateOrder: 'dmy',
    decimal: ',',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix International',
  },
  'nl-bank-direction-column.csv': {
    delimiter: ',',
    headerRow: 0,
    mapping: { date: 0, description: 1, amount: 6, direction: 5 },
    dateOrder: 'mdy',
    decimal: ',',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'fr-bank-semicolon.csv': {
    delimiter: ';',
    headerRow: 0,
    mapping: { date: 0, description: 2, debit: 3, credit: 4 },
    dateOrder: 'dmy',
    decimal: ',',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'es-bank-tab-separated.csv': {
    delimiter: '\t',
    headerRow: 0,
    mapping: { date: 0, description: 1, amount: 2 },
    dateOrder: 'dmy',
    decimal: ',',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'generic-month-names.csv': {
    delimiter: ',',
    headerRow: 0,
    mapping: { date: 0, description: 1, amount: 2 },
    dateOrder: 'mdy',
    decimal: '.',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'it-bank-semicolon.csv': {
    delimiter: ';',
    headerRow: 0,
    mapping: { date: 0, description: 4, debit: 2, credit: 3 },
    dateOrder: 'dmy',
    decimal: ',',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
  'pt-bank-semicolon.csv': {
    delimiter: ';',
    headerRow: 0,
    mapping: { date: 0, description: 2, amount: 3 },
    dateOrder: 'dmy',
    decimal: ',',
    flipSigns: false,
    needsReview: false,
    transactions: 6,
    skipped: 0,
    merchant: 'Streamflix',
  },
};

describe.each(Object.entries(FIXTURES))('%s', (name, expected) => {
  const file = readFixture(name);

  it('detects the layout', () => {
    expect(file.delimiter).toBe(expected.delimiter);
    expect(file.settings.headerRow).toBe(expected.headerRow);
    expect(file.settings.mapping).toEqual({ ...EMPTY_MAPPING, ...expected.mapping });
    expect(file.settings.dateOrder).toBe(expected.dateOrder);
    expect(file.settings.decimal).toBe(expected.decimal);
    expect(file.settings.flipSigns).toBe(expected.flipSigns);
    expect(file.needsReview).toBe(expected.needsReview);
    expect(file.dateAmbiguous).toBe(false);
  });

  it('reads the transactions', () => {
    expect(file.transactions).toHaveLength(expected.transactions);
    expect(file.skipped).toBe(expected.skipped);
    const streamflix = file.transactions.filter((t) => /streamflix/i.test(t.description));
    expect(streamflix.map((t) => [t.date, t.amount])).toEqual(
      expect.arrayContaining([
        ['2026-01-05', -1549],
        ['2026-02-05', -1549],
        ['2026-03-05', -1549],
        ['2026-04-05', -1549],
      ]),
    );
    expect(file.transactions.filter((t) => t.amount > 0)).toHaveLength(1);
  });

  it('finds the monthly subscription', () => {
    const analysis = analyzeTransactions(file.transactions, { billTolerance: 0.25 });
    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0]).toMatchObject({
      merchant: expected.merchant,
      cadence: 'monthly',
      kind: 'subscription',
      confidence: 'high',
      typicalAmount: 1549,
      yearlyCost: 18588,
      lastDate: '2026-04-05',
      nextDate: '2026-05-05',
    });
  });
});

describe('importText', () => {
  it('flags dates that could be either order and lets the user switch', () => {
    const file = importText(
      'a.csv',
      'Date,Description,Amount\n01/02/2026,A,-1.00\n02/02/2026,B,-2.00\n',
      'utf-8',
    );
    expect(file.dateAmbiguous).toBe(true);
    expect(file.settings.dateOrder).toBe('mdy');
    expect(file.transactions[0]?.date).toBe('2026-01-02');
    const switched = applySettings(file, { ...file.settings, dateOrder: 'dmy' });
    expect(switched.transactions[0]?.date).toBe('2026-02-01');
    expect(switched.dateAmbiguous).toBe(true);
  });

  it('lets the user flip the sign convention', () => {
    const file = importText(
      'a.csv',
      'Date,Description,Amount\n2026-01-05,A,-1.00\n2026-01-06,B,-2.00\n2026-01-07,C,3.00\n',
      'utf-8',
    );
    expect(file.settings.flipSigns).toBe(false);
    const flipped = applySettings(file, { ...file.settings, flipSigns: true });
    expect(flipped.transactions.map((t) => t.amount)).toEqual([100, 200, -300]);
  });

  it('lets the user change the decimal separator', () => {
    const file = importText('a.csv', 'Date,Description,Amount\n2026-01-05,A,"-1,234"\n', 'utf-8');
    expect(file.transactions[0]?.amount).toBe(-123400);
    const comma = applySettings(file, { ...file.settings, decimal: ',' });
    expect(comma.transactions[0]?.amount).toBe(-123);
  });

  it('applies a mapping chosen by the user and guesses the other settings again', () => {
    const file = readFixture('us-bank-no-header.csv');
    const mapped = applyMapping(file, { ...EMPTY_MAPPING, date: 0, amount: 1, description: 4 }, -1);
    expect(mapped.needsReview).toBe(false);
    expect(mapped.transactions).toHaveLength(6);
    const incomplete = applyMapping(file, { ...EMPTY_MAPPING, date: 0 }, -1);
    expect(incomplete.needsReview).toBe(true);
    expect(incomplete.transactions).toHaveLength(0);
  });

  it('reads a UTF-8 file with a byte order mark and accented headers', () => {
    const text = 'Buchungstag;Empf\u00e4nger;Betrag\n05.01.2026;M\u00fcller Stra\u00dfe;-15,49\n';
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
    const file = importBytes('de.csv', bytes);
    expect(file.encoding).toBe('utf-8');
    expect(file.settings.mapping).toMatchObject({ date: 0, description: 1, amount: 2 });
    expect(file.transactions[0]).toMatchObject({
      date: '2026-01-05',
      description: 'M\u00fcller Stra\u00dfe',
      amount: -1549,
    });
  });

  it('reads a Windows-1252 file', () => {
    const header = [...'Date op'].map((c) => c.charCodeAt(0));
    const rest = [...'ration;Libell'].map((c) => c.charCodeAt(0));
    const row = [...';Montant\n15/01/2026;Caf'].map((c) => c.charCodeAt(0));
    const tail = [...';-3,50\n'].map((c) => c.charCodeAt(0));
    const bytes = new Uint8Array([...header, 0xe9, ...rest, 0xe9, ...row, 0xe9, ...tail]);
    const file = importBytes('fr.csv', bytes);
    expect(file.encoding).toBe('windows-1252');
    expect(file.transactions[0]).toMatchObject({
      date: '2026-01-15',
      description: 'Caf\u00e9',
      amount: -350,
    });
  });

  it('reads CRLF line endings', () => {
    const file = importText('a.csv', 'Date,Description,Amount\r\n2026-01-05,A,-1.00\r\n', 'utf-8');
    expect(file.transactions).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('reads direction words', () => {
    expect(directionSign('Af')).toBe(-1);
    expect(directionSign('DEBIT')).toBe(-1);
    expect(directionSign('Bij')).toBe(1);
    expect(directionSign('Credit')).toBe(1);
    expect(directionSign('Check')).toBe(0);
  });

  it('guesses the sign convention from the majority', () => {
    expect(guessFlipSigns(['12.00', '3.00', '-50.00'], '.')).toBe(true);
    expect(guessFlipSigns(['-12.00', '-3.00', '50.00'], '.')).toBe(false);
    expect(guessFlipSigns(['0.00', 'x'], '.')).toBe(false);
  });
});
