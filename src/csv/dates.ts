import type { DateOrder } from '../types';

const DAY_MS = 86_400_000;

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const ISO_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ tT].*)?$/;
const COMPACT_RE = /^((?:19|20)\d{2})(\d{2})(\d{2})$/;
const NUMERIC_RE = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})(?:[ tT].*)?$/;
const MONTH_FIRST_RE = /^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/;
const DAY_FIRST_RE = /^(\d{1,2})[ -]([a-z]{3,9})\.?[ -](\d{4}|\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function toIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) {
    return null;
  }
  if (day > daysInMonth(year, month)) {
    return null;
  }
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function fullYear(raw: string): number {
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

function monthNumber(name: string): number | undefined {
  return MONTHS[name] ?? MONTHS[name.slice(0, 3)];
}

/**
 * Reads a date in one of these forms and returns it as YYYY-MM-DD, or null:
 * 2026-01-05, 2026/01/05 (a time after the date is ignored), 20260105, 01/05/2026, 05.01.2026,
 * 05-01-26 (numeric dates use `order`), Jan 5, 2026, January 5 2026, 5 Jan 2026, 05-Jan-26.
 */
export function parseDate(raw: string, order: DateOrder): string | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  let m = ISO_RE.exec(value);
  if (m) {
    return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  m = COMPACT_RE.exec(value);
  if (m) {
    return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  m = NUMERIC_RE.exec(value);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const year = fullYear(m[4] as string);
    return order === 'mdy' ? toIso(year, a, b) : toIso(year, b, a);
  }
  m = MONTH_FIRST_RE.exec(value);
  if (m) {
    const month = monthNumber(m[1] as string);
    return month === undefined ? null : toIso(Number(m[3]), month, Number(m[2]));
  }
  m = DAY_FIRST_RE.exec(value);
  if (m) {
    const month = monthNumber(m[2] as string);
    return month === undefined ? null : toIso(fullYear(m[3] as string), month, Number(m[1]));
  }
  return null;
}

/** True when the value parses as a date in either numeric order. */
export function looksLikeDate(raw: string): boolean {
  return parseDate(raw, 'mdy') !== null || parseDate(raw, 'dmy') !== null;
}

export interface DateOrderGuess {
  order: DateOrder;
  /** Some numeric dates are not year-first, so the order matters. */
  hasNumeric: boolean;
  /** No date settles the order, so the guess is only based on the separator. */
  ambiguous: boolean;
}

/**
 * Decides between month/day/year and day/month/year using every value in a date column.
 * A first number above 12 means day/month; a second number above 12 means month/day. If no
 * value decides it, dates with dots default to day/month and other separators to month/day.
 */
export function detectDateOrder(values: string[]): DateOrderGuess {
  let dayFirst = 0;
  let monthFirst = 0;
  let numeric = 0;
  let dots = 0;
  for (const raw of values) {
    const m = NUMERIC_RE.exec(raw.trim());
    if (!m) {
      continue;
    }
    numeric += 1;
    if (m[2] === '.') {
      dots += 1;
    }
    const a = Number(m[1]);
    const b = Number(m[3]);
    if (a > 12 && b <= 12) {
      dayFirst += 1;
    } else if (b > 12 && a <= 12) {
      monthFirst += 1;
    }
  }
  if (numeric === 0) {
    return { order: 'mdy', hasNumeric: false, ambiguous: false };
  }
  if (dayFirst > monthFirst) {
    return { order: 'dmy', hasNumeric: true, ambiguous: false };
  }
  if (monthFirst > dayFirst) {
    return { order: 'mdy', hasNumeric: true, ambiguous: false };
  }
  return { order: dots * 2 > numeric ? 'dmy' : 'mdy', hasNumeric: true, ambiguous: true };
}

export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function isoFromDay(day: number): string {
  const date = new Date(day * DAY_MS);
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) as string;
}

/** Adds whole months, using `anchorDay` (or the date's own day) clamped to the month's length. */
export function addMonths(iso: string, months: number, anchorDay?: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(year, month));
  return toIso(year, month, day) as string;
}
