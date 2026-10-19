import { describe, expect, it } from 'vitest';
import { detectDecimal, parseAmount } from '../src/csv/amounts';

describe('parseAmount', () => {
  it.each([
    ['-15.49', '.', -1549],
    ['15.49', '.', 1549],
    ['+15.49', '.', 1549],
    ['15.49-', '.', -1549],
    ['(15.49)', '.', -1549],
    ['($1,234.56)', '.', -123456],
    ['$-15.49', '.', -1549],
    ['-$15.49', '.', -1549],
    ['1,450.00', '.', 145000],
    ['15.49 USD', '.', 1549],
    ['15.49 DR', '.', -1549],
    ['15.49CR', '.', 1549],
    ['12', '.', 1200],
    ['.5', '.', 50],
    ['-15,49', ',', -1549],
    ['1.234,56', ',', 123456],
    ['2 450,00', ',', 245000],
    ['EUR -12,99', ',', -1299],
    ['\u20ac 9,99', ',', 999],
    ['\u00a312.00', '.', 1200],
    ['1\u00a0234,50', ',', 123450],
    ["1'234.50", '.', 123450],
    ['0.1', '.', 10],
    ['19.999', '.', 2000],
  ] as const)('reads %j with decimal %j as %d cents', (raw, decimal, cents) => {
    expect(parseAmount(raw, decimal)).toBe(cents);
  });

  it.each(['', '   ', '-', 'abc', '*', '1.2.3', '(12'])('rejects %j', (raw) => {
    expect(parseAmount(raw, '.')).toBeNull();
  });
});

describe('detectDecimal', () => {
  it('detects a decimal comma', () => {
    expect(detectDecimal(['-15,49', '2.450,00', '-3,10'])).toBe(',');
  });

  it('detects a decimal point', () => {
    expect(detectDecimal(['-15.49', '2,450.00', '-3.10'])).toBe('.');
  });

  it('ignores values that do not decide and defaults to a point', () => {
    expect(detectDecimal(['1,234', '1.234', '12'])).toBe('.');
    expect(detectDecimal([])).toBe('.');
  });

  it('counts currency symbols and spaces as noise', () => {
    expect(detectDecimal(['\u20ac 9,99', '\u20ac 1 234,50'])).toBe(',');
  });
});
