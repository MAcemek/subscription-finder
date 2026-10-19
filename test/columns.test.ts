import { describe, expect, it } from 'vitest';
import {
  EMPTY_MAPPING,
  detectColumns,
  guessColumnsFromContent,
  isMappingComplete,
  mapHeaderRow,
  normalizeHeader,
} from '../src/csv/columns';
import { parseCsv } from '../src/csv/parse';

describe('normalizeHeader', () => {
  it('lowercases, removes accents and punctuation', () => {
    expect(normalizeHeader(' Amount (EUR) ')).toBe('amount eur');
    expect(normalizeHeader('Date de l\u2019op\u00e9ration')).toBe('date de l operation');
    expect(normalizeHeader('Empf\u00e4nger')).toBe('empfanger');
    expect(normalizeHeader('Stra\u00dfe')).toBe('strasse');
    expect(normalizeHeader('Naam / Omschrijving')).toBe('naam omschrijving');
  });
});

describe('mapHeaderRow', () => {
  const map = (header: string, delimiter: ',' | ';' = ',') =>
    mapHeaderRow((parseCsv(header, delimiter)[0] as { cells: string[] }).cells);

  it('maps a simple English header', () => {
    expect(map('Date,Description,Amount')).toEqual({
      ...EMPTY_MAPPING,
      date: 0,
      description: 1,
      amount: 2,
    });
  });

  it('prefers the transaction date over the posting date', () => {
    expect(map('Post Date,Transaction Date,Description,Amount').date).toBe(1);
  });

  it('skips balance, fee and foreign currency columns for money', () => {
    expect(map('Date,Description,Balance,Fee,Amount (Foreign Currency),Amount (EUR)').amount).toBe(
      5,
    );
    expect(map('Date,Description,Running Bal.,Amount').amount).toBe(3);
  });

  it('maps separate debit and credit columns', () => {
    expect(map('Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit')).toEqual({
      ...EMPTY_MAPPING,
      date: 0,
      description: 3,
      debit: 5,
      credit: 6,
    });
    expect(map('Date,Paid out,Paid in,Details,Name')).toMatchObject({
      debit: 1,
      credit: 2,
      description: 4,
    });
  });

  it('prefers a merchant name over a longer description', () => {
    expect(map('Date,Name,Amount,Description').description).toBe(1);
  });

  it('maps a direction column', () => {
    expect(map('Datum,Naam / Omschrijving,Af Bij,Bedrag (EUR)')).toEqual({
      ...EMPTY_MAPPING,
      date: 0,
      description: 1,
      amount: 3,
      direction: 2,
    });
  });

  it.each([
    [
      'German',
      'Buchungstag;Valuta;Auftraggeber/Empf\u00e4nger;Verwendungszweck;Betrag;W\u00e4hrung',
    ],
    ['French', 'Date op\u00e9ration;Date valeur;Libell\u00e9;Montant'],
    ['Spanish', 'Fecha;Concepto;Importe;Saldo'],
    ['Dutch', 'Boekingsdatum;Omschrijving;Bedrag'],
    ['Portuguese', 'Data;Descri\u00e7\u00e3o;Valor;Saldo'],
    ['Italian', 'Data operazione;Descrizione;Importo'],
  ])('maps a %s header', (_language, header) => {
    expect(isMappingComplete(map(header, ';'))).toBe(true);
  });

  it('maps German and Italian debit and credit columns', () => {
    expect(map('Buchungstag;Text;Soll;Haben', ';')).toMatchObject({ date: 0, debit: 2, credit: 3 });
    expect(map('Data;Descrizione;Uscite;Entrate', ';')).toMatchObject({
      description: 1,
      debit: 2,
      credit: 3,
    });
  });
});

describe('detectColumns', () => {
  it('finds a header row below summary lines', () => {
    const rows = parseCsv(
      'Account,12345\nDescription,,Summary Amt.\n\nDate,Description,Amount,Running Bal.\n01/02/2026,A,-1.00,5.00\n',
      ',',
    );
    expect(detectColumns(rows)).toEqual({
      headerRow: 2,
      mapping: { ...EMPTY_MAPPING, date: 0, description: 1, amount: 2 },
      needsReview: false,
    });
  });

  it('asks for review when the header has no money column', () => {
    const rows = parseCsv('Date,Description,Total\n01/02/2026,A,-1.00\n', ',');
    expect(detectColumns(rows)).toMatchObject({ headerRow: 0, needsReview: true });
  });

  it('guesses columns from the content when there is no header', () => {
    const rows = parseCsv(
      '"01/05/2026","-15.49","*","","STREAMFLIX.COM"\n"01/22/2026","-38.75","*","1042","CHECK 1042"\n"02/05/2026","-15.49","*","","STREAMFLIX.COM"\n',
      ',',
    );
    expect(detectColumns(rows)).toEqual({
      headerRow: -1,
      mapping: { ...EMPTY_MAPPING, date: 0, amount: 1, description: 4 },
      needsReview: true,
    });
  });

  it('leaves roles empty when the content does not show them', () => {
    const rows = parseCsv('a,b\nc,d\n', ',');
    expect(guessColumnsFromContent(rows)).toEqual(EMPTY_MAPPING);
  });
});

describe('isMappingComplete', () => {
  it('needs a date, a description and a money column', () => {
    expect(isMappingComplete({ ...EMPTY_MAPPING, date: 0, description: 1, amount: 2 })).toBe(true);
    expect(isMappingComplete({ ...EMPTY_MAPPING, date: 0, description: 1, debit: 2 })).toBe(true);
    expect(isMappingComplete({ ...EMPTY_MAPPING, date: 0, description: 1 })).toBe(false);
    expect(isMappingComplete({ ...EMPTY_MAPPING, date: 0, amount: 1 })).toBe(false);
  });
});
