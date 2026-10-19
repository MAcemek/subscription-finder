import { describe, expect, it } from 'vitest';
import { exclusionReason } from '../src/detect/exclude';
import { tx } from './helpers';

describe('exclusionReason', () => {
  it('excludes money coming in and zero amounts', () => {
    expect(exclusionReason(tx('2026-01-05', 'ACME CORP PAYROLL', 145000))).toBe('money-in');
    expect(exclusionReason(tx('2026-01-05', 'REFUND STREAMFLIX', 1549))).toBe('money-in');
    expect(exclusionReason(tx('2026-01-05', 'CARD VERIFICATION', 0))).toBe('money-in');
  });

  it.each([
    'ATM WITHDRAWAL 0042 MAIN ST',
    'CASH WITHDRAWAL 05JAN',
    'Bargeldauszahlung Geldautomat',
    'RETRAIT DAB 05/01',
    'Reintegro cajero',
    'GELDOPNAME 0571',
    'Prelievo Bancomat',
  ])('excludes cash withdrawal %j', (description) => {
    expect(exclusionReason(tx('2026-01-05', description, -6000))).toBe('atm');
  });

  it.each([
    'ONLINE TRANSFER TO SAVINGS XXXXXX4821',
    'Transfer from checking',
    'INTERNAL TRANSFER',
    'XFER TO 4821',
    'To pocket EUR Holiday',
    'Umbuchung Tagesgeld',
    '\u00dcbertrag auf Sparkonto',
    'VIREMENT INTERNE',
    'Traspaso cuenta ahorro',
    'Naar spaarrekening',
    'Giroconto',
  ])('excludes transfer %j', (description) => {
    expect(exclusionReason(tx('2026-01-05', description, -20000))).toBe('transfer');
  });

  it.each([
    'CREDIT CARD PAYMENT NORTHBANK',
    'NORTHBANK CREDIT CRD AUTOPAY',
    'AUTOPAY PAYMENT - THANK YOU',
    'Kreditkartenabrechnung',
  ])('excludes credit card payment %j', (description) => {
    expect(exclusionReason(tx('2026-01-05', description, -30000))).toBe('card-payment');
  });

  it.each([
    'STREAMFLIX.COM',
    'CITY POWER AND LIGHT AUTOPAY',
    'PAYPAL INST XFER TUNELY',
    'CARD PAYMENT TO GREENMART',
    'ATMOSPHERE YOGA',
  ])('keeps %j', (description) => {
    expect(exclusionReason(tx('2026-01-05', description, -1549))).toBeNull();
  });
});
