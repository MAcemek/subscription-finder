import { describe, expect, it } from 'vitest';
import { isoFromDay, dayNumber } from '../src/csv/dates';
import {
  analyzeSeries,
  analyzeTransactions,
  nextChargeDate,
  splitDuplicates,
  CADENCES,
} from '../src/detect/recurrence';
import type { Transaction } from '../src/types';
import { charge, monthlyDates, tx } from './helpers';

const OPTIONS = { billTolerance: 0.25 };

function every(start: string, days: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => isoFromDay(dayNumber(start) + i * days));
}

function analyze(transactions: Transaction[], billTolerance = 0.25) {
  return analyzeTransactions(transactions, { billTolerance });
}

describe('analyzeSeries', () => {
  it('finds a monthly subscription with a stable amount', () => {
    const result = analyzeSeries(
      monthlyDates('2026-01', 4, 5).map((d) => charge(d, 1549)),
      OPTIONS,
    );
    expect(result).toMatchObject({
      kind: 'subscription',
      confidence: 'high',
      typicalAmount: 1549,
      priceIncrease: null,
      intervals: [31, 28, 31],
    });
    expect(result?.rule.cadence).toBe('monthly');
  });

  it('needs three monthly charges', () => {
    expect(
      analyzeSeries(
        monthlyDates('2026-01', 2, 5).map((d) => charge(d, 1549)),
        OPTIONS,
      ),
    ).toBeNull();
    const three = analyzeSeries(
      monthlyDates('2026-01', 3, 5).map((d) => charge(d, 1549)),
      OPTIONS,
    );
    expect(three?.confidence).toBe('medium');
  });

  it('can require more charges', () => {
    const charges = monthlyDates('2026-01', 3, 5).map((d) => charge(d, 1549));
    expect(analyzeSeries(charges, OPTIONS, 4)).toBeNull();
  });

  it('reports a price increase', () => {
    const amounts = [1549, 1549, 1549, 1799, 1799];
    const result = analyzeSeries(
      monthlyDates('2026-01', 5, 3).map((d, i) => charge(d, amounts[i] as number)),
      OPTIONS,
    );
    expect(result).toMatchObject({
      kind: 'subscription',
      typicalAmount: 1799,
      priceIncrease: { from: 1549, to: 1799, date: '2026-04-03' },
    });
  });

  it('reports an increase on the latest charge and ignores decreases', () => {
    const up = analyzeSeries(
      monthlyDates('2026-01', 4, 3).map((d, i) => charge(d, i < 3 ? 999 : 1199)),
      OPTIONS,
    );
    expect(up?.priceIncrease).toEqual({ from: 999, to: 1199, date: '2026-04-03' });
    const down = analyzeSeries(
      monthlyDates('2026-01', 4, 3).map((d, i) => charge(d, i < 2 ? 1199 : 999)),
      OPTIONS,
    );
    expect(down).toMatchObject({ kind: 'subscription', typicalAmount: 999, priceIncrease: null });
  });

  it('treats changes of up to 2% as the same price', () => {
    const amounts = [1000, 1010, 995, 1005];
    const result = analyzeSeries(
      monthlyDates('2026-01', 4, 3).map((d, i) => charge(d, amounts[i] as number)),
      OPTIONS,
    );
    expect(result).toMatchObject({
      kind: 'subscription',
      priceIncrease: null,
      typicalAmount: 1005,
    });
  });

  it('finds a bill whose amount changes within the tolerance', () => {
    const amounts = [8214, 9560, 11025, 9910, 8730];
    const result = analyzeSeries(
      monthlyDates('2026-01', 5, 18).map((d, i) => charge(d, amounts[i] as number)),
      OPTIONS,
    );
    expect(result).toMatchObject({ kind: 'bill', typicalAmount: 9560, priceIncrease: null });
  });

  it('rejects a bill outside the tolerance unless the tolerance is raised', () => {
    const amounts = [5000, 9000, 6500, 7000];
    const charges = monthlyDates('2026-01', 4, 18).map((d, i) => charge(d, amounts[i] as number));
    expect(analyzeSeries(charges, OPTIONS)).toBeNull();
    expect(analyzeSeries(charges, { billTolerance: 0.5 })?.kind).toBe('bill');
  });

  it('does not report weekly or two-weekly charges with changing amounts', () => {
    const amounts = [6000, 7200, 5400, 6600, 6100, 7000];
    const weekly = every('2026-01-03', 7, 6).map((d, i) => charge(d, amounts[i] as number));
    expect(analyzeSeries(weekly, OPTIONS)).toBeNull();
    const biweekly = every('2026-01-03', 14, 6).map((d, i) => charge(d, amounts[i] as number));
    expect(analyzeSeries(biweekly, OPTIONS)).toBeNull();
  });

  it('finds weekly and two-weekly subscriptions', () => {
    expect(
      analyzeSeries(
        every('2026-01-03', 7, 6).map((d) => charge(d, 6499)),
        OPTIONS,
      ),
    ).toMatchObject({
      confidence: 'high',
      rule: { cadence: 'weekly' },
    });
    expect(
      analyzeSeries(
        every('2026-01-03', 7, 3).map((d) => charge(d, 6499)),
        OPTIONS,
      ),
    ).toBeNull();
    expect(
      analyzeSeries(
        every('2026-01-06', 14, 3).map((d) => charge(d, 3000)),
        OPTIONS,
      ),
    ).toMatchObject({
      confidence: 'medium',
      rule: { cadence: 'biweekly' },
    });
  });

  it('accepts two quarterly or yearly charges with the same amount', () => {
    const quarterly = analyzeSeries(
      [charge('2026-01-15', 31240), charge('2026-04-15', 31240)],
      OPTIONS,
    );
    expect(quarterly).toMatchObject({
      confidence: 'medium',
      kind: 'subscription',
      rule: { cadence: 'quarterly' },
    });
    const yearly = analyzeSeries(
      [charge('2025-09-09', 11999), charge('2026-09-09', 11999)],
      OPTIONS,
    );
    expect(yearly).toMatchObject({ confidence: 'medium', rule: { cadence: 'yearly' } });
    const close = analyzeSeries(
      [charge('2025-09-09', 11999), charge('2026-09-09', 12499)],
      OPTIONS,
    );
    expect(close).toMatchObject({ kind: 'bill', typicalAmount: 12249 });
  });

  it('rejects two charges with different amounts or loose gaps', () => {
    expect(
      analyzeSeries([charge('2026-01-15', 30000), charge('2026-04-15', 34000)], OPTIONS),
    ).toBeNull();
    expect(
      analyzeSeries([charge('2026-01-15', 30000), charge('2026-04-24', 30000)], OPTIONS),
    ).toBeNull();
    expect(
      analyzeSeries([charge('2025-01-01', 9900), charge('2025-12-20', 9900)], OPTIONS),
    ).toBeNull();
  });

  it('uses the latest run after a pause', () => {
    const dates = ['2025-01-05', '2025-02-05', '2025-03-05', ...monthlyDates('2025-09', 4, 5)];
    const result = analyzeSeries(
      dates.map((d) => charge(d, 1000)),
      OPTIONS,
    );
    expect(result?.run.map((c) => c.date)).toEqual([
      '2025-09-05',
      '2025-10-05',
      '2025-11-05',
      '2025-12-05',
    ]);
  });

  it('rejects irregular charges', () => {
    const dates = ['2026-01-01', '2026-01-04', '2026-02-20', '2026-02-22', '2026-05-01'];
    expect(
      analyzeSeries(
        dates.map((d) => charge(d, 1000)),
        OPTIONS,
      ),
    ).toBeNull();
  });

  it('rejects a bill-like streak at a merchant with many other charges', () => {
    // Gaps 40, 20, 45, 22, then 30, 31, 30: the median gap is monthly, but only the last
    // four charges form the pattern, which is less than two thirds of the eight charges.
    const dates = [
      '2025-01-01',
      '2025-02-10',
      '2025-03-02',
      '2025-04-16',
      '2025-05-08',
      '2025-06-07',
      '2025-07-08',
      '2025-08-07',
    ];
    const amounts = [4100, 3800, 4500, 3900, 4300, 4000, 4200, 3700];
    const charges = dates.map((d, i) => charge(d, amounts[i] as number));
    expect(analyzeSeries(charges, OPTIONS)).toBeNull();
    expect(analyzeSeries(charges.slice(4), OPTIONS)?.kind).toBe('bill');
  });
});

describe('nextChargeDate', () => {
  const monthly = CADENCES.find((c) => c.cadence === 'monthly')!;
  const weekly = CADENCES.find((c) => c.cadence === 'weekly')!;

  it('keeps end-of-month charges at the end of the month', () => {
    const run = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'].map((d) =>
      charge(d, 4500),
    );
    expect(nextChargeDate(monthly, run)).toBe('2026-05-31');
  });

  it('adds seven days for weekly charges', () => {
    expect(nextChargeDate(weekly, [charge('2026-09-26', 6499)])).toBe('2026-10-03');
  });
});

describe('splitDuplicates', () => {
  it('finds the same amount charged again within three days', () => {
    const charges = [
      charge('2026-06-12', 1099),
      charge('2026-06-13', 1099),
      charge('2026-06-15', 500),
      charge('2026-06-19', 500),
    ];
    const { kept, duplicates } = splitDuplicates(charges);
    expect(kept.map((c) => c.date)).toEqual(['2026-06-12', '2026-06-15', '2026-06-19']);
    expect(duplicates.map((d) => [d.first.date, d.second.date])).toEqual([
      ['2026-06-12', '2026-06-13'],
    ]);
  });
});

describe('analyzeTransactions', () => {
  it('reports duplicates without breaking the pattern', () => {
    const transactions = [
      ...monthlyDates('2026-01', 5, 12).map((d) => tx(d, 'PAYPAL *TUNELY MUSIC', -1099)),
      tx('2026-03-14', 'PAYPAL *TUNELY MUSIC', -1099),
    ];
    const [finding] = analyze(transactions).findings;
    expect(finding).toMatchObject({ merchant: 'Tunely Music', confidence: 'high' });
    expect(finding?.charges).toHaveLength(5);
    expect(finding?.duplicates.map((d) => [d.first.date, d.second.date])).toEqual([
      ['2026-03-12', '2026-03-14'],
    ]);
  });

  it('splits two subscriptions with the same merchant name', () => {
    const transactions = [
      ...monthlyDates('2026-01', 4, 5).map((d) => tx(d, 'APPSTORE BILLING', -99)),
      ...monthlyDates('2026-01', 4, 20).map((d) => tx(d, 'APPSTORE BILLING', -1099)),
    ];
    const findings = analyze(transactions).findings;
    expect(findings.map((f) => [f.id, f.merchant, f.typicalAmount])).toEqual([
      ['APPSTORE BILLING|1099', 'Appstore Billing', 1099],
      ['APPSTORE BILLING|99', 'Appstore Billing', 99],
    ]);
  });

  it('marks patterns without recent charges as stopped and leaves them out of the totals', () => {
    const transactions = [
      ...monthlyDates('2026-01', 4, 1).map((d) => tx(d, 'FITLIFE GYM', -3900)),
      ...monthlyDates('2026-01', 9, 3).map((d) => tx(d, 'STREAMFLIX', -1549)),
    ];
    const analysis = analyze(transactions);
    expect(analysis.findings.map((f) => [f.merchant, f.status])).toEqual([
      ['Streamflix', 'active'],
      ['Fitlife Gym', 'stopped'],
    ]);
    expect(analysis.yearlyTotal).toBe(18588);
    expect(analysis.monthlyTotal).toBe(1549);
  });

  it('flags patterns that started after the files begin', () => {
    const transactions = [
      tx('2026-01-02', 'GREENMART', -5000),
      ...every('2026-06-06', 7, 6).map((d) => tx(d, 'TST* FRESHBOX MEALS', -6499)),
      ...monthlyDates('2026-01', 7, 3).map((d) => tx(d, 'STREAMFLIX', -1549)),
    ];
    const findings = analyze(transactions).findings;
    expect(findings.map((f) => [f.merchant, f.isNew, f.firstDate])).toEqual([
      ['Freshbox Meals', true, '2026-06-06'],
      ['Streamflix', false, '2026-01-03'],
    ]);
  });

  it('counts excluded transactions and the date range', () => {
    const analysis = analyze([
      tx('2026-01-05', 'ACME PAYROLL', 145000),
      tx('2026-01-06', 'ONLINE TRANSFER TO SAVINGS', -20000),
      tx('2026-01-07', 'CREDIT CARD PAYMENT', -30000),
      tx('2026-01-08', 'ATM WITHDRAWAL', -6000),
      tx('2026-02-09', 'GREENMART', -4000),
    ]);
    expect(analysis).toMatchObject({
      findings: [],
      excluded: { 'money-in': 1, transfer: 1, 'card-payment': 1, atm: 1 },
      transactionCount: 5,
      dataStart: '2026-01-05',
      dataEnd: '2026-02-09',
      yearlyTotal: 0,
      monthlyTotal: 0,
    });
  });

  it('handles no transactions', () => {
    expect(analyze([])).toMatchObject({
      findings: [],
      dataStart: '',
      dataEnd: '',
      transactionCount: 0,
    });
  });

  it('sorts by yearly cost', () => {
    const transactions = [
      ...monthlyDates('2026-01', 4, 3).map((d) => tx(d, 'CHEAP', -100)),
      ...monthlyDates('2026-01', 4, 4).map((d) => tx(d, 'PRICEY', -5000)),
      ...every('2026-01-03', 7, 16).map((d) => tx(d, 'WEEKLY BOX', -2000)),
    ];
    expect(analyze(transactions).findings.map((f) => [f.merchant, f.yearlyCost])).toEqual([
      ['Weekly Box', 104000],
      ['Pricey', 60000],
      ['Cheap', 1200],
    ]);
  });
});
