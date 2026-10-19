import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dayNumber,
  daysInMonth,
  detectDateOrder,
  isoFromDay,
  looksLikeDate,
  parseDate,
} from '../src/csv/dates';

describe('parseDate', () => {
  it.each([
    ['2026-01-05', 'mdy', '2026-01-05'],
    ['2026/1/5', 'mdy', '2026-01-05'],
    ['2026-01-05 10:22:01', 'dmy', '2026-01-05'],
    ['2026-01-05T10:22:01Z', 'mdy', '2026-01-05'],
    ['20260105', 'mdy', '2026-01-05'],
    ['01/05/2026', 'mdy', '2026-01-05'],
    ['01/05/2026', 'dmy', '2026-05-01'],
    ['05.01.2026', 'dmy', '2026-01-05'],
    ['05.01.26', 'dmy', '2026-01-05'],
    ['5-1-2026', 'dmy', '2026-01-05'],
    ['Jan 5, 2026', 'dmy', '2026-01-05'],
    ['January 5 2026', 'mdy', '2026-01-05'],
    ['Sept. 30, 2026', 'mdy', '2026-09-30'],
    ['5 Jan 2026', 'mdy', '2026-01-05'],
    ['05-Jan-26', 'mdy', '2026-01-05'],
    ['  12/31/2026  ', 'mdy', '2026-12-31'],
  ] as const)('reads %s (%s) as %s', (raw, order, expected) => {
    expect(parseDate(raw, order)).toBe(expected);
  });

  it.each([
    '',
    'yesterday',
    '13/13/2026',
    '02/30/2026',
    '2026-02-29',
    '31.04.2026',
    'Foo 5, 2026',
    '1234',
  ])('rejects %j', (raw) => {
    expect(parseDate(raw, 'mdy')).toBeNull();
    expect(parseDate(raw, 'dmy')).toBeNull();
  });

  it('accepts 29 February in a leap year', () => {
    expect(parseDate('02/29/2028', 'mdy')).toBe('2028-02-29');
  });

  it('looksLikeDate accepts either order', () => {
    expect(looksLikeDate('31/01/2026')).toBe(true);
    expect(looksLikeDate('01/31/2026')).toBe(true);
    expect(looksLikeDate('-15.49')).toBe(false);
  });
});

describe('detectDateOrder', () => {
  it('uses a first number above 12 to pick day/month', () => {
    expect(detectDateOrder(['05/01/2026', '17/01/2026'])).toEqual({
      order: 'dmy',
      hasNumeric: true,
      ambiguous: false,
    });
  });

  it('uses a second number above 12 to pick month/day', () => {
    expect(detectDateOrder(['01/05/2026', '01/17/2026'])).toEqual({
      order: 'mdy',
      hasNumeric: true,
      ambiguous: false,
    });
  });

  it('reports ambiguous dates and guesses from the separator', () => {
    expect(detectDateOrder(['01/05/2026', '02/05/2026'])).toEqual({
      order: 'mdy',
      hasNumeric: true,
      ambiguous: true,
    });
    expect(detectDateOrder(['01.05.2026', '02.05.2026'])).toEqual({
      order: 'dmy',
      hasNumeric: true,
      ambiguous: true,
    });
  });

  it('does not need an order for year-first or named-month dates', () => {
    expect(detectDateOrder(['2026-01-05', 'Jan 5, 2026', '20260105'])).toEqual({
      order: 'mdy',
      hasNumeric: false,
      ambiguous: false,
    });
  });
});

describe('day arithmetic', () => {
  it('converts between ISO dates and day numbers', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-01-05')).toBe(20458);
    expect(isoFromDay(20458)).toBe('2026-01-05');
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-01')).toBe(28);
  });

  it('knows the length of each month', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('adds months and clamps to the end of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-09-09', 12)).toBe('2027-09-09');
  });
});
