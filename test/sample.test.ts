import { describe, expect, it } from 'vitest';
import { importText } from '../src/csv/import';
import { analyzeTransactions } from '../src/detect/recurrence';
import { SAMPLE_CSV, SAMPLE_NAME } from '../src/sample';

/**
 * The expected results for the bundled sample data (src/sample/sample.csv). Every merchant in
 * the sample is made up. If the sample changes, update these expectations and test/app.test.ts.
 */
describe('sample data', () => {
  const file = importText(SAMPLE_NAME, SAMPLE_CSV, 'utf-8');
  const analysis = analyzeTransactions(file.transactions, { billTolerance: 0.25 });

  it('is read without problems', () => {
    expect(file.needsReview).toBe(false);
    expect(file.transactions).toHaveLength(384);
    expect(file.skipped).toBe(0);
    expect(file.settings.dateOrder).toBe('mdy');
  });

  it('finds exactly the designed recurring payments', () => {
    expect(
      analysis.findings.map((f) => [
        f.merchant,
        f.cadence,
        f.kind,
        f.confidence,
        f.typicalAmount,
        f.yearlyCost,
        f.lastDate,
        f.nextDate,
        f.status,
      ]),
    ).toEqual([
      [
        'Freshbox Meals',
        'weekly',
        'subscription',
        'high',
        6499,
        337948,
        '2026-09-26',
        '2026-10-03',
        'active',
      ],
      [
        'Acme Auto Insurance',
        'quarterly',
        'subscription',
        'high',
        31240,
        124960,
        '2026-07-15',
        '2026-10-15',
        'active',
      ],
      [
        'City Power and Light',
        'monthly',
        'bill',
        'high',
        9910,
        118920,
        '2026-09-18',
        '2026-10-18',
        'active',
      ],
      [
        'Brightwave Swim School',
        'biweekly',
        'subscription',
        'high',
        3000,
        78000,
        '2026-09-22',
        '2026-10-06',
        'active',
      ],
      [
        'Northwind Mobile',
        'monthly',
        'subscription',
        'high',
        4500,
        54000,
        '2026-09-30',
        '2026-10-31',
        'active',
      ],
      [
        'Streamflix',
        'monthly',
        'subscription',
        'high',
        1799,
        21588,
        '2026-09-03',
        '2026-10-03',
        'active',
      ],
      [
        'Tunely Music',
        'monthly',
        'subscription',
        'high',
        1099,
        13188,
        '2026-09-12',
        '2026-10-12',
        'active',
      ],
      [
        'Photopro Editor',
        'yearly',
        'subscription',
        'medium',
        11999,
        11999,
        '2026-09-09',
        '2027-09-09',
        'active',
      ],
      [
        'Cloudbox Storage',
        'monthly',
        'subscription',
        'high',
        299,
        3588,
        '2026-09-20',
        '2026-10-20',
        'active',
      ],
      [
        'Fitlife Gym',
        'monthly',
        'subscription',
        'high',
        3900,
        46800,
        '2026-06-01',
        '2026-07-01',
        'stopped',
      ],
    ]);
  });

  it('flags the price increase, the duplicate charge and the new subscription', () => {
    const byName = new Map(analysis.findings.map((f) => [f.merchant, f]));
    expect(byName.get('Streamflix')?.priceIncrease).toEqual({
      from: 1549,
      to: 1799,
      date: '2026-04-03',
    });
    expect(
      byName
        .get('Tunely Music')
        ?.duplicates.map((d) => [d.first.date, d.second.date, d.second.amount]),
    ).toEqual([['2026-06-12', '2026-06-13', 1099]]);
    expect(analysis.findings.filter((f) => f.isNew).map((f) => [f.merchant, f.firstDate])).toEqual([
      ['Freshbox Meals', '2026-06-06'],
    ]);
    expect(analysis.findings.filter((f) => f.priceIncrease).map((f) => f.merchant)).toEqual([
      'Streamflix',
    ]);
    expect(analysis.findings.filter((f) => f.duplicates.length > 0).map((f) => f.merchant)).toEqual(
      ['Tunely Music'],
    );
  });

  it('adds up the totals and the excluded transactions', () => {
    expect(analysis.monthlyTotal).toBe(63683);
    expect(analysis.yearlyTotal).toBe(764191);
    expect(analysis.excluded).toEqual({ 'money-in': 29, transfer: 13, 'card-payment': 13, atm: 6 });
    expect([analysis.dataStart, analysis.dataEnd]).toEqual(['2025-09-01', '2026-09-30']);
  });
});
