import { CADENCE_LABELS, CONFIDENCE_LABELS, KIND_LABELS, plainMoney } from './format';
import type { Decision, Finding } from './types';

export const EXPORT_HEADERS = [
  'Merchant',
  'How often',
  'Type',
  'Confidence',
  'Typical amount',
  'Yearly cost',
  'Monthly cost',
  'First charge',
  'Last charge',
  'Next expected charge',
  'Status',
  'Price increase',
  'Duplicate charges',
  'Started recently',
  'Decision',
];

/**
 * Quotes a CSV cell when needed. Text that a spreadsheet would run as a formula (starting
 * with =, +, -, @, tab or carriage return) gets a leading apostrophe.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The results as CSV text with CRLF line endings. Amounts use a decimal point. */
export function buildResultsCsv(
  findings: readonly Finding[],
  decisions: ReadonlyMap<string, Decision>,
): string {
  const lines = [EXPORT_HEADERS.map(csvCell).join(',')];
  for (const f of findings) {
    const cells = [
      f.merchant,
      CADENCE_LABELS[f.cadence],
      KIND_LABELS[f.kind],
      CONFIDENCE_LABELS[f.confidence],
      plainMoney(f.typicalAmount),
      plainMoney(f.yearlyCost),
      plainMoney(f.monthlyCost),
      f.firstDate,
      f.lastDate,
      f.status === 'active' ? f.nextDate : '',
      f.status === 'active' ? 'Active' : 'Possibly stopped',
      f.priceIncrease
        ? `${plainMoney(f.priceIncrease.from)} to ${plainMoney(f.priceIncrease.to)} on ${f.priceIncrease.date}`
        : '',
      f.duplicates.map((d) => `${d.first.date} and ${d.second.date}`).join('; '),
      f.isNew ? `Yes, on ${f.firstDate}` : '',
      decisions.get(f.id) ?? '',
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
