import type { Cadence, Confidence, ExclusionReason, Kind } from './types';

export function formatMoney(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Plain amount for CSV files: "1234.50", no thousands separator. */
export function plainMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
  quarterly: 'Every three months',
  yearly: 'Yearly',
};

export const KIND_LABELS: Record<Kind, string> = {
  subscription: 'Subscription',
  bill: 'Bill',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
};

export const EXCLUSION_LABELS: Record<ExclusionReason, [string, string]> = {
  'money-in': ['incoming payment', 'incoming payments'],
  transfer: ['transfer between accounts', 'transfers between accounts'],
  'card-payment': ['credit card payment', 'credit card payments'],
  atm: ['cash withdrawal', 'cash withdrawals'],
};

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Joins words as "a", "a and b" or "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`;
}
