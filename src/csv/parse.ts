import type { CsvRow, Delimiter } from '../types';

export const DELIMITERS: readonly Delimiter[] = [',', ';', '\t'];

/**
 * Parses CSV text (RFC 4180 style): fields may be quoted with double quotes, a doubled quote
 * inside a quoted field is one quote, and quoted fields may contain the delimiter and line
 * breaks. Line breaks may be LF, CRLF or CR. Rows where every cell is blank are dropped.
 * At most `maxRows` rows are returned.
 */
export function parseCsv(text: string, delimiter: Delimiter, maxRows = Infinity): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  let i = 0;

  const endRow = (): void => {
    cells.push(field);
    if (cells.some((cell) => cell.trim() !== '')) {
      rows.push({ cells, line: rowLine });
    }
    cells = [];
    field = '';
  };

  while (i < text.length && rows.length < maxRows) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) {
        line += 1;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      cells.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRow();
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line += 1;
      rowLine = line;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (rows.length < maxRows && (field !== '' || cells.length > 0)) {
    endRow();
  }
  return rows;
}

/**
 * Picks the delimiter that splits the first rows into the most consistent number of columns.
 * The score is how many of the first 50 rows have the most common column count; a column count
 * of 1 scores 0. Ties go to the larger column count, then to the order comma, semicolon, tab.
 */
export function detectDelimiter(text: string): Delimiter {
  let best: Delimiter = ',';
  let bestScore = -1;
  let bestWidth = 0;
  for (const delimiter of DELIMITERS) {
    const rows = parseCsv(text, delimiter, 50);
    const counts = new Map<number, number>();
    for (const row of rows) {
      counts.set(row.cells.length, (counts.get(row.cells.length) ?? 0) + 1);
    }
    let width = 0;
    let score = 0;
    for (const [cols, count] of counts) {
      if (cols > 1 && (count > score || (count === score && cols > width))) {
        width = cols;
        score = count;
      }
    }
    if (score > bestScore || (score === bestScore && width > bestWidth)) {
      best = delimiter;
      bestScore = score;
      bestWidth = width;
    }
  }
  return best;
}
