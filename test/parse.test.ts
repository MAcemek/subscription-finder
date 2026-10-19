import { describe, expect, it } from 'vitest';
import { decodeBytes } from '../src/csv/decode';
import { detectDelimiter, parseCsv } from '../src/csv/parse';

const cells = (text: string, delimiter: ',' | ';' | '\t' = ','): string[][] =>
  parseCsv(text, delimiter).map((row) => row.cells);

describe('parseCsv', () => {
  it('splits simple rows', () => {
    expect(cells('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with delimiters, doubled quotes and line breaks', () => {
    expect(cells('"x, y","say ""hi""","two\nlines"\nz,1,2')).toEqual([
      ['x, y', 'say "hi"', 'two\nlines'],
      ['z', '1', '2'],
    ]);
  });

  it('accepts CRLF, CR and LF line endings and a missing final newline', () => {
    expect(cells('a,b\r\nc,d\re,f\ng,h')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ]);
  });

  it('drops blank rows and keeps empty cells', () => {
    expect(cells('a,,c\n\n , \n1,2,\n')).toEqual([
      ['a', '', 'c'],
      ['1', '2', ''],
    ]);
  });

  it('records the line each row starts on', () => {
    const rows = parseCsv('h1,h2\n"multi\nline",x\n\nlast,y\n', ',');
    expect(rows.map((row) => row.line)).toEqual([1, 2, 5]);
  });

  it('uses other delimiters', () => {
    expect(cells('a;"b;c"\n1;2', ';')).toEqual([
      ['a', 'b;c'],
      ['1', '2'],
    ]);
    expect(cells('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('stops after maxRows', () => {
    expect(parseCsv('1\n2\n3\n4', ',', 2)).toHaveLength(2);
  });
});

describe('detectDelimiter', () => {
  it('finds commas, semicolons and tabs', () => {
    expect(detectDelimiter('Date,Description,Amount\n01/05/2026,Shop,-1.00\n')).toBe(',');
    expect(detectDelimiter('Datum;Name;Betrag\n05.01.2026;Laden;-1,00\n')).toBe(';');
    expect(detectDelimiter('Fecha\tConcepto\tImporte\n05/01/2026\tTienda\t-1,00\n')).toBe('\t');
  });

  it('prefers semicolons when amounts use a decimal comma', () => {
    const text = 'Buchungstag;Empfaenger;Betrag\n05.01.2026;A;-15,49\n06.01.2026;B;-2,00\n';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('ignores delimiters inside quotes', () => {
    const text = '"Datum","Naam","Bedrag"\n"20260105","A","15,49"\n"20260106","B","2,00"\n';
    expect(detectDelimiter(text)).toBe(',');
  });

  it('copes with summary lines above the header', () => {
    const text =
      'Description,,Summary Amt.\nTotal,,"1,000.00"\n\nDate,Description,Amount,Bal\n01/02/2026,A,-1.00,2.00\n01/03/2026,B,-1.00,1.00\n';
    expect(detectDelimiter(text)).toBe(',');
  });
});

describe('decodeBytes', () => {
  const encoder = new TextEncoder();

  it('reads UTF-8 and strips a byte order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode('Empf\u00e4nger;Betrag')]);
    expect(decodeBytes(bytes)).toEqual({ text: 'Empf\u00e4nger;Betrag', encoding: 'utf-8' });
    expect(decodeBytes(encoder.encode('a,b'))).toEqual({ text: 'a,b', encoding: 'utf-8' });
  });

  it('falls back to Windows-1252 for bytes that are not UTF-8', () => {
    const bytes = new Uint8Array([0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9, 0x3b, 0x80]);
    expect(decodeBytes(bytes)).toEqual({ text: 'Libell\u00e9;\u20ac', encoding: 'windows-1252' });
  });

  it('reads UTF-16 with a byte order mark', () => {
    const le = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x3b, 0x00, 0x62, 0x00]);
    expect(decodeBytes(le)).toEqual({ text: 'a;b', encoding: 'utf-16le' });
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x61, 0x00, 0x2c, 0x00, 0x62]);
    expect(decodeBytes(be)).toEqual({ text: 'a,b', encoding: 'utf-16be' });
  });
});
