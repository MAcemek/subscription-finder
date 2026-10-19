/** Shared types. Amounts are always whole cents (integers). Dates are ISO strings (YYYY-MM-DD). */

export type Delimiter = ',' | ';' | '\t';
export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
export type DateOrder = 'mdy' | 'dmy';
export type DecimalSeparator = '.' | ',';

/** One parsed CSV record and the 1-based line number it starts on. */
export interface CsvRow {
  cells: string[];
  line: number;
}

/** Column indexes for each role. -1 means "no column". */
export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  /** A column that says whether each amount is money in or out, like "Af/Bij" or "Debit/Credit". */
  direction: number;
}

export type ColumnRole = keyof ColumnMapping;

export interface FileSettings {
  mapping: ColumnMapping;
  /** Index into the parsed rows of the header row, or -1 when the file has no header row. */
  headerRow: number;
  dateOrder: DateOrder;
  decimal: DecimalSeparator;
  /** Single amount column only: true when positive numbers are money going out. */
  flipSigns: boolean;
}

export interface Transaction {
  date: string;
  /** Days since 1970-01-01. */
  day: number;
  description: string;
  /** Cents. Negative means money going out. */
  amount: number;
  source: string;
  line: number;
}

export interface ImportedFile {
  name: string;
  encoding: Encoding;
  delimiter: Delimiter;
  rows: CsvRow[];
  settings: FileSettings;
  /** True when no header row was found or a required column is missing. */
  needsReview: boolean;
  /** True when the file has numeric dates that read the same as month/day and day/month. */
  dateAmbiguous: boolean;
  /** True when the file has numeric dates that are not year-first, so the date order matters. */
  hasNumericDates: boolean;
  transactions: Transaction[];
  /** Data rows that could not be read (no valid date or amount). */
  skipped: number;
}

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type Kind = 'subscription' | 'bill';
export type Confidence = 'high' | 'medium';
export type ExclusionReason = 'money-in' | 'transfer' | 'card-payment' | 'atm';
export type Decision = 'cancel' | 'keep';

/** A charge in a recurring pattern. The amount is positive cents. */
export interface Charge {
  date: string;
  day: number;
  amount: number;
  description: string;
  source: string;
  line: number;
}

export interface PriceIncrease {
  from: number;
  to: number;
  date: string;
}

export interface DuplicateCharge {
  first: Charge;
  second: Charge;
}

export interface Finding {
  id: string;
  merchant: string;
  cadence: Cadence;
  kind: Kind;
  confidence: Confidence;
  typicalAmount: number;
  yearlyCost: number;
  monthlyCost: number;
  firstDate: string;
  lastDate: string;
  nextDate: string;
  status: 'active' | 'stopped';
  charges: Charge[];
  intervals: number[];
  duplicates: DuplicateCharge[];
  priceIncrease: PriceIncrease | null;
  /** The pattern started during the period covered by the files (it may be a converted free trial). */
  isNew: boolean;
  /** Earlier charges from the same merchant that are not part of the current pattern. */
  earlierCharges: number;
}

export interface Analysis {
  findings: Finding[];
  monthlyTotal: number;
  yearlyTotal: number;
  excluded: Record<ExclusionReason, number>;
  transactionCount: number;
  dataStart: string;
  dataEnd: string;
}

export interface AnalysisOptions {
  /** How much a bill may vary from its median amount, as a fraction (0.25 = 25%). */
  billTolerance: number;
}
