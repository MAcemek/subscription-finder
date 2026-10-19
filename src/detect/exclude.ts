import type { ExclusionReason, Transaction } from '../types';

/**
 * Transactions that are never subscriptions. Rules are checked in this order against the
 * description in capital letters without accents. Money coming in (zero or positive amounts)
 * is always excluded first.
 */
export const EXCLUSION_RULES: ReadonlyArray<{ reason: ExclusionReason; pattern: RegExp }> = [
  {
    reason: 'atm',
    pattern:
      /\b(?:ATM|CASH WITHDRAWAL|CASH WDL|GELDAUTOMAT|BARGELDAUSZAHLUNG|BARGELD|RETRAIT DAB|RETRAIT|CAJERO|REINTEGRO|GELDAUTOMAAT|GELDOPNAME|LEVANTAMENTO|PRELIEVO|BANCOMAT)\b/,
  },
  {
    reason: 'card-payment',
    pattern:
      /\b(?:PAYMENT THANK YOU|PAYMENT - THANK YOU|THANK YOU FOR YOUR PAYMENT|AUTOMATIC PAYMENT - THANK|AUTOPAY PAYMENT|CRD AUTOPAY|CARD AUTOPAY|CREDIT CARD PAYMENT|CREDIT CRD|CREDITCARD PAYMENT|KREDITKARTENABRECHNUNG|KREDITKARTE ABRECHNUNG)\b/,
  },
  {
    reason: 'transfer',
    pattern:
      /\b(?:TRANSFER TO|TRANSFER FROM|ONLINE TRANSFER|INTERNAL TRANSFER|ACCOUNT TRANSFER|XFER TO|XFER FROM|TO SAVINGS|FROM SAVINGS|TO CHECKING|FROM CHECKING|OWN ACCOUNT|BETWEEN ACCOUNTS|POT TRANSFER|TO POCKET|FROM POCKET|UMBUCHUNG|UBERTRAG|UEBERTRAG|VIREMENT INTERNE|VIREMENT DE COMPTE A COMPTE|TRASPASO|TRANSFERENCIA INTERNA|SPAARREKENING|GIROCONTO)\b/,
  },
];

function plain(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/** Returns why a transaction can never be a recurring charge, or null if it can be. */
export function exclusionReason(transaction: Transaction): ExclusionReason | null {
  if (transaction.amount >= 0) {
    return 'money-in';
  }
  const text = plain(transaction.description);
  for (const rule of EXCLUSION_RULES) {
    if (rule.pattern.test(text)) {
      return rule.reason;
    }
  }
  return null;
}
