import type { ImportedFile, Transaction } from '../types';

function rowKey(t: Transaction): string {
  return `${t.date}|${t.amount}|${t.description.toUpperCase().replace(/\s+/g, ' ').trim()}`;
}

/**
 * Combines the transactions of several files and removes rows that appear in more than one
 * file, as happens with overlapping exports. Identical rows inside one file are kept (two equal
 * charges on the same day can be real), so a row is kept as many times as the file with the
 * most copies of it has. The result is sorted by date; files that need review are skipped.
 */
export function combineTransactions(files: readonly ImportedFile[]): {
  transactions: Transaction[];
  duplicatesRemoved: number;
} {
  const seen = new Map<string, number>();
  const transactions: Transaction[] = [];
  let duplicatesRemoved = 0;
  for (const file of files) {
    if (file.needsReview) {
      continue;
    }
    const counts = new Map<string, number>();
    for (const t of file.transactions) {
      const key = rowKey(t);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      if (count > (seen.get(key) ?? 0)) {
        transactions.push(t);
      } else {
        duplicatesRemoved += 1;
      }
    }
    for (const [key, count] of counts) {
      seen.set(key, Math.max(seen.get(key) ?? 0, count));
    }
  }
  transactions.sort((a, b) => a.day - b.day);
  return { transactions, duplicatesRemoved };
}
