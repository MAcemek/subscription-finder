import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayNumber } from '../src/csv/dates';
import { importBytes } from '../src/csv/import';
import type { Charge, ImportedFile, Transaction } from '../src/types';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

/** The repository root. */
export const ROOT = dirname(TEST_DIR);

export function fixtureBytes(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(join(TEST_DIR, 'fixtures', 'csv', name)));
}

export function readFixture(name: string): ImportedFile {
  return importBytes(name, fixtureBytes(name));
}

let line = 0;

/** A transaction; `amount` is in cents and negative for money going out. */
export function tx(
  date: string,
  description: string,
  amount: number,
  source = 'test.csv',
): Transaction {
  line += 1;
  return { date, day: dayNumber(date), description, amount, source, line };
}

/** A charge (positive cents) for the recurrence functions. */
export function charge(date: string, amount: number, description = 'TEST MERCHANT'): Charge {
  line += 1;
  return { date, day: dayNumber(date), amount, description, source: 'test.csv', line };
}

/** Monthly dates on the same day of the month, starting at YYYY-MM. */
export function monthlyDates(start: string, count: number, day: number): string[] {
  const [y, m] = start.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const index = y * 12 + (m - 1) + i;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });
}
