import { describe, expect, it } from 'vitest';
import { importText } from '../src/csv/import';
import { combineTransactions } from '../src/detect/combine';
import { analyzeTransactions } from '../src/detect/recurrence';

const HEADER = 'Date,Description,Amount\n';

describe('combineTransactions', () => {
  it('counts rows that appear in overlapping exports once', () => {
    const january = importText(
      'jan-feb.csv',
      `${HEADER}2026-01-05,STREAMFLIX.COM,-15.49\n2026-01-20,GREENMART,-40.00\n2026-02-05,STREAMFLIX.COM,-15.49\n`,
      'utf-8',
    );
    const february = importText(
      'feb-apr.csv',
      `${HEADER}2026-02-05,STREAMFLIX.COM,-15.49\n2026-03-05,STREAMFLIX.COM,-15.49\n2026-04-05,STREAMFLIX.COM,-15.49\n`,
      'utf-8',
    );
    const combined = combineTransactions([january, february]);
    expect(combined.duplicatesRemoved).toBe(1);
    expect(combined.transactions.map((t) => t.date)).toEqual([
      '2026-01-05',
      '2026-01-20',
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
    ]);
    const analysis = analyzeTransactions(combined.transactions, { billTolerance: 0.25 });
    expect(analysis.findings.map((f) => [f.merchant, f.charges.length])).toEqual([
      ['Streamflix', 4],
    ]);
  });

  it('keeps identical rows within one file', () => {
    const file = importText(
      'a.csv',
      `${HEADER}2026-01-05,BEAN THERE CAFE,-4.50\n2026-01-05,BEAN THERE CAFE,-4.50\n`,
      'utf-8',
    );
    const other = importText('b.csv', `${HEADER}2026-01-05,BEAN THERE CAFE,-4.50\n`, 'utf-8');
    expect(combineTransactions([file, other]).transactions).toHaveLength(2);
    expect(combineTransactions([other, file]).transactions).toHaveLength(2);
  });

  it('matches descriptions regardless of case and spacing', () => {
    const a = importText('a.csv', `${HEADER}2026-01-05,Streamflix  Com,-15.49\n`, 'utf-8');
    const b = importText('b.csv', `${HEADER}2026-01-05,STREAMFLIX COM,-15.49\n`, 'utf-8');
    expect(combineTransactions([a, b]).transactions).toHaveLength(1);
  });

  it('skips files that still need their columns chosen', () => {
    const headerless = importText(
      'x.csv',
      '2026-01-05,-15.49,STREAMFLIX\n2026-02-05,-15.49,STREAMFLIX\n',
      'utf-8',
    );
    expect(headerless.needsReview).toBe(true);
    expect(combineTransactions([headerless]).transactions).toHaveLength(0);
  });
});
