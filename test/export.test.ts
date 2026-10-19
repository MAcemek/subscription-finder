import { describe, expect, it } from 'vitest';
import { importText } from '../src/csv/import';
import { parseCsv } from '../src/csv/parse';
import { analyzeTransactions } from '../src/detect/recurrence';
import { EXPORT_HEADERS, buildResultsCsv, csvCell } from '../src/export';
import { formatDate, formatMoney, joinList, plainMoney, plural } from '../src/format';
import { SAMPLE_CSV, SAMPLE_NAME } from '../src/sample';
import type { Decision } from '../src/types';

describe('csvCell', () => {
  it('quotes cells only when needed', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(' padded')).toBe('" padded"');
  });

  it('stops spreadsheets from running text as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('buildResultsCsv', () => {
  const file = importText(SAMPLE_NAME, SAMPLE_CSV, 'utf-8');
  const analysis = analyzeTransactions(file.transactions, { billTolerance: 0.25 });

  it('writes one row per finding with the decisions', () => {
    const decisions = new Map<string, Decision>([
      ['STREAMFLIX', 'cancel'],
      ['NORTHWIND MOBILE', 'keep'],
    ]);
    const csv = buildResultsCsv(analysis.findings, decisions);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(csv, ',').map((row) => row.cells);
    expect(rows[0]).toEqual(EXPORT_HEADERS);
    expect(rows).toHaveLength(analysis.findings.length + 1);
    const streamflix = rows.find((row) => row[0] === 'Streamflix');
    expect(streamflix).toEqual([
      'Streamflix',
      'Monthly',
      'Subscription',
      'High confidence',
      '17.99',
      '215.88',
      '17.99',
      '2025-09-03',
      '2026-09-03',
      '2026-10-03',
      'Active',
      '15.49 to 17.99 on 2026-04-03',
      '',
      '',
      'cancel',
    ]);
    expect(rows.find((row) => row[0] === 'Tunely Music')?.[12]).toBe('2026-06-12 and 2026-06-13');
    expect(rows.find((row) => row[0] === 'Freshbox Meals')?.[13]).toBe('Yes, on 2026-06-06');
    expect(rows.find((row) => row[0] === 'Northwind Mobile')?.[14]).toBe('keep');
    const gym = rows.find((row) => row[0] === 'Fitlife Gym');
    expect(gym?.[9]).toBe('');
    expect(gym?.[10]).toBe('Possibly stopped');
  });
});

describe('format', () => {
  it('formats money and dates for a locale', () => {
    expect(formatMoney(123456, 'en-US')).toBe('1,234.56');
    expect(formatMoney(123456, 'de-DE')).toBe('1.234,56');
    expect(formatMoney(5, 'en-US')).toBe('0.05');
    expect(formatDate('2026-04-03', 'en-US')).toBe('Apr 3, 2026');
  });

  it('writes plain amounts for CSV files', () => {
    expect(plainMoney(123456)).toBe('1234.56');
    expect(plainMoney(5)).toBe('0.05');
    expect(plainMoney(-1549)).toBe('-15.49');
  });

  it('writes counts and lists', () => {
    expect(plural(1, 'file', 'files')).toBe('1 file');
    expect(plural(2, 'file', 'files')).toBe('2 files');
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
