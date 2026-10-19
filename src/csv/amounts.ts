import type { DecimalSeparator } from '../types';

/**
 * Reads an amount and returns whole cents, or null when the value is not a number.
 * Handles currency symbols and codes (anything that is not a digit, separator or sign is
 * ignored), thousands separators, a decimal comma or point, a leading or trailing minus,
 * a plus sign, parentheses for negative numbers, and "CR" / "DR" suffixes.
 */
export function parseAmount(raw: string, decimal: DecimalSeparator): number | null {
  let value = raw.trim().toUpperCase();
  if (value === '') {
    return null;
  }
  let negative = false;
  if (/DR\.?$/.test(value)) {
    negative = true;
    value = value.replace(/DR\.?$/, '');
  } else if (/CR\.?$/.test(value)) {
    value = value.replace(/CR\.?$/, '');
  }
  value = value.replace(/[^0-9.,()+-]/g, '');
  if (value.startsWith('(') && value.endsWith(')')) {
    negative = !negative;
    value = value.slice(1, -1);
  }
  if (value.endsWith('-')) {
    negative = !negative;
    value = value.slice(0, -1);
  }
  if (value.startsWith('-')) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }
  const thousands = decimal === ',' ? '.' : ',';
  value = value.split(thousands).join('');
  if (decimal === ',') {
    value = value.replace(',', '.');
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(value)) {
    return null;
  }
  const cents = Math.round(Number(value) * 100);
  return negative ? -cents : cents;
}

/**
 * Decides whether a column uses a decimal point or a decimal comma. Each value votes by its
 * last separator: when both "." and "," appear, the last one is the decimal separator; a
 * single separator followed by one or two digits at the end is a decimal separator. Values
 * like "1,234" or "1.234" do not vote. Ties go to the decimal point.
 */
export function detectDecimal(values: string[]): DecimalSeparator {
  let comma = 0;
  let point = 0;
  for (const raw of values) {
    const value = raw.replace(/[^0-9.,]/g, '');
    const lastComma = value.lastIndexOf(',');
    const lastPoint = value.lastIndexOf('.');
    if (lastComma >= 0 && lastPoint >= 0) {
      if (lastComma > lastPoint) {
        comma += 1;
      } else {
        point += 1;
      }
    } else if (/,\d{1,2}$/.test(value)) {
      comma += 1;
    } else if (/\.\d{1,2}$/.test(value)) {
      point += 1;
    }
  }
  return comma > point ? ',' : '.';
}
