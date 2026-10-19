import { addMonths, isoFromDay } from '../csv/dates';
import type {
  Analysis,
  AnalysisOptions,
  Cadence,
  Charge,
  Confidence,
  DuplicateCharge,
  ExclusionReason,
  Finding,
  Kind,
  PriceIncrease,
  Transaction,
} from '../types';
import { exclusionReason } from './exclude';
import { normalizeMerchant } from './normalize';

export interface CadenceRule {
  cadence: Cadence;
  /** Days between charges that count for this cadence. */
  min: number;
  max: number;
  /** The narrower range every gap must fall in for high confidence. */
  tightMin: number;
  tightMax: number;
  /** Charges needed in a row to report the pattern at all, and for high confidence. */
  minCount: number;
  highCount: number;
  perYear: number;
  /** Months to add for the next charge, or 0 to add `days`. */
  months: number;
  days: number;
}

export const CADENCES: readonly CadenceRule[] = [
  {
    cadence: 'weekly',
    min: 5,
    max: 9,
    tightMin: 6,
    tightMax: 8,
    minCount: 4,
    highCount: 6,
    perYear: 52,
    months: 0,
    days: 7,
  },
  {
    cadence: 'biweekly',
    min: 12,
    max: 16,
    tightMin: 13,
    tightMax: 15,
    minCount: 3,
    highCount: 5,
    perYear: 26,
    months: 0,
    days: 14,
  },
  {
    cadence: 'monthly',
    min: 26,
    max: 35,
    tightMin: 27,
    tightMax: 34,
    minCount: 3,
    highCount: 4,
    perYear: 12,
    months: 1,
    days: 0,
  },
  {
    cadence: 'quarterly',
    min: 84,
    max: 98,
    tightMin: 87,
    tightMax: 95,
    minCount: 2,
    highCount: 3,
    perYear: 4,
    months: 3,
    days: 0,
  },
  {
    cadence: 'yearly',
    min: 350,
    max: 380,
    tightMin: 358,
    tightMax: 372,
    minCount: 2,
    highCount: 3,
    perYear: 1,
    months: 12,
    days: 0,
  },
];

/** Charges with the same amount this many days apart or less are duplicates. */
export const DUPLICATE_WINDOW_DAYS = 3;
/** Amount changes up to this fraction count as the same price. */
export const SAME_PRICE_TOLERANCE = 0.02;
/** A pattern of only two charges needs amounts this close. */
export const TWO_CHARGE_TOLERANCE = 0.05;
/** A pattern is "stopped" when no charge came this many days after the cadence's longest gap. */
export const STOPPED_GRACE_DAYS = 7;

interface SeriesResult {
  rule: CadenceRule;
  run: Charge[];
  intervals: number[];
  kind: Kind;
  confidence: Confidence;
  typicalAmount: number;
  priceIncrease: PriceIncrease | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function samePrice(a: number, b: number, tolerance = SAME_PRICE_TOLERANCE): boolean {
  return Math.abs(a - b) <= Math.max(1, b * tolerance);
}

/** Splits amounts into runs of the same price. */
function priceSegments(run: Charge[]): Charge[][] {
  const segments: Charge[][] = [];
  for (const charge of run) {
    const current = segments[segments.length - 1];
    const previous = current?.[current.length - 1];
    if (current && previous && samePrice(charge.amount, previous.amount)) {
      current.push(charge);
    } else {
      segments.push([charge]);
    }
  }
  return segments;
}

/**
 * Looks for a recurring pattern in charges sorted by date. The cadence comes from the median
 * gap; the pattern is the longest run of charges, ending with the latest one, whose gaps all
 * fit that cadence. `minCount` can raise the cadence's minimum number of charges.
 */
export function analyzeSeries(
  charges: Charge[],
  options: AnalysisOptions,
  minCount = 0,
): SeriesResult | null {
  if (charges.length < 2) {
    return null;
  }
  const gaps = charges.slice(1).map((c, i) => c.day - (charges[i] as Charge).day);
  const typicalGap = median(gaps);
  const rule = CADENCES.find((r) => typicalGap >= r.min && typicalGap <= r.max);
  if (!rule) {
    return null;
  }
  let start = charges.length - 1;
  while (start > 0) {
    const gap = gaps[start - 1] as number;
    if (gap < rule.min || gap > rule.max) {
      break;
    }
    start -= 1;
  }
  const run = charges.slice(start);
  const intervals = gaps.slice(start);
  if (run.length < Math.max(rule.minCount, minCount)) {
    return null;
  }
  const amounts = run.map((c) => c.amount);
  const last = run[run.length - 1] as Charge;

  if (run.length === 2) {
    const first = run[0] as Charge;
    const gap = intervals[0] as number;
    if (gap < rule.tightMin || gap > rule.tightMax) {
      return null;
    }
    if (!samePrice(last.amount, first.amount, TWO_CHARGE_TOLERANCE)) {
      return null;
    }
    const kind: Kind = samePrice(last.amount, first.amount) ? 'subscription' : 'bill';
    return {
      rule,
      run,
      intervals,
      kind,
      confidence: 'medium',
      typicalAmount: kind === 'subscription' ? last.amount : Math.round(median(amounts)),
      priceIncrease: null,
    };
  }

  const segments = priceSegments(run);
  const stable = segments.slice(1, -1).every((segment) => segment.length >= 2);
  const kind: Kind = stable ? 'subscription' : 'bill';
  let typicalAmount = last.amount;
  let priceIncrease: PriceIncrease | null = null;
  if (kind === 'bill') {
    // Bills (changing amounts) must be monthly or rarer and include two thirds of the
    // merchant's charges; this keeps out everyday spending such as fuel or groceries.
    if (rule.months === 0 || run.length * 3 < charges.length * 2) {
      return null;
    }
    const mid = median(amounts);
    if (amounts.some((a) => Math.abs(a - mid) > options.billTolerance * mid)) {
      return null;
    }
    typicalAmount = Math.round(mid);
  } else if (segments.length >= 2) {
    const before = segments[segments.length - 2] as Charge[];
    const after = segments[segments.length - 1] as Charge[];
    const from = (before[before.length - 1] as Charge).amount;
    const to = (after[0] as Charge).amount;
    if (to > from) {
      priceIncrease = { from, to, date: (after[0] as Charge).date };
    }
  }
  const tight = intervals.every((gap) => gap >= rule.tightMin && gap <= rule.tightMax);
  const confidence: Confidence = run.length >= rule.highCount && tight ? 'high' : 'medium';
  return { rule, run, intervals, kind, confidence, typicalAmount, priceIncrease };
}

/** The most common day of the month in the charges; ties go to the later day. */
function anchorDay(run: Charge[]): number {
  const counts = new Map<number, number>();
  for (const charge of run) {
    const day = Number(charge.date.slice(8, 10));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best = 1;
  let bestCount = 0;
  for (const [day, count] of counts) {
    if (count > bestCount || (count === bestCount && day > best)) {
      best = day;
      bestCount = count;
    }
  }
  return best;
}

export function nextChargeDate(rule: CadenceRule, run: Charge[]): string {
  const last = run[run.length - 1] as Charge;
  if (rule.months > 0) {
    return addMonths(last.date, rule.months, anchorDay(run));
  }
  return isoFromDay(last.day + rule.days);
}

/** Removes charges that repeat an earlier charge's amount within a few days. */
export function splitDuplicates(charges: Charge[]): {
  kept: Charge[];
  duplicates: DuplicateCharge[];
} {
  const kept: Charge[] = [];
  const duplicates: DuplicateCharge[] = [];
  for (const charge of charges) {
    let match: Charge | undefined;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      const previous = kept[i] as Charge;
      if (charge.day - previous.day > DUPLICATE_WINDOW_DAYS) {
        break;
      }
      if (previous.amount === charge.amount) {
        match = previous;
        break;
      }
    }
    if (match) {
      duplicates.push({ first: match, second: charge });
    } else {
      kept.push(charge);
    }
  }
  return { kept, duplicates };
}

/** Groups charges with exactly the same amount, keeping each group in date order. */
function amountClusters(charges: Charge[]): Charge[][] {
  const clusters = new Map<number, Charge[]>();
  for (const charge of charges) {
    const cluster = clusters.get(charge.amount) ?? [];
    cluster.push(charge);
    clusters.set(charge.amount, cluster);
  }
  return [...clusters.values()];
}

interface GroupContext {
  id: string;
  merchant: string;
  dataStart: number;
  dataEnd: number;
  duplicates: DuplicateCharge[];
  options: AnalysisOptions;
}

function toFinding(series: Charge[], result: SeriesResult, ctx: GroupContext): Finding {
  const { rule, run } = result;
  const first = run[0] as Charge;
  const last = run[run.length - 1] as Charge;
  const yearlyCost = result.typicalAmount * rule.perYear;
  const earlierCharges = series.length - run.length;
  return {
    id: ctx.id,
    merchant: ctx.merchant,
    cadence: rule.cadence,
    kind: result.kind,
    confidence: result.confidence,
    typicalAmount: result.typicalAmount,
    yearlyCost,
    monthlyCost: Math.round(yearlyCost / 12),
    firstDate: first.date,
    lastDate: last.date,
    nextDate: nextChargeDate(rule, run),
    status: ctx.dataEnd - last.day > rule.max + STOPPED_GRACE_DAYS ? 'stopped' : 'active',
    charges: run,
    intervals: result.intervals,
    duplicates: ctx.duplicates.filter((d) => run.includes(d.first)),
    priceIncrease: result.priceIncrease,
    isNew: earlierCharges === 0 && first.day - ctx.dataStart > rule.max + 3,
    earlierCharges,
  };
}

/** Finds the recurring patterns for one merchant. */
export function detectMerchant(
  charges: Charge[],
  ctx: Omit<GroupContext, 'duplicates'>,
): Finding[] {
  const sorted = [...charges].sort((a, b) => a.day - b.day || a.line - b.line);
  const { kept, duplicates } = splitDuplicates(sorted);
  const whole = analyzeSeries(kept, ctx.options);
  if (whole) {
    return [toFinding(kept, whole, { ...ctx, duplicates })];
  }
  const clusters = amountClusters(kept);
  if (clusters.length < 2) {
    return [];
  }
  const findings: Finding[] = [];
  for (const cluster of clusters) {
    const result = analyzeSeries(cluster, ctx.options, 3);
    if (result && result.kind === 'subscription') {
      const id = `${ctx.id}|${(cluster[0] as Charge).amount}`;
      findings.push(toFinding(cluster, result, { ...ctx, id, duplicates }));
    }
  }
  return findings;
}

function compareFindings(a: Finding, b: Finding): number {
  if (a.status !== b.status) {
    return a.status === 'active' ? -1 : 1;
  }
  return (
    b.yearlyCost - a.yearlyCost ||
    a.merchant.localeCompare(b.merchant, 'en') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Finds recurring charges in combined transactions. */
export function analyzeTransactions(
  transactions: readonly Transaction[],
  options: AnalysisOptions,
): Analysis {
  const excluded: Record<ExclusionReason, number> = {
    'money-in': 0,
    transfer: 0,
    'card-payment': 0,
    atm: 0,
  };
  const groups = new Map<string, { name: string; charges: Charge[] }>();
  let dataStart = Infinity;
  let dataEnd = -Infinity;
  for (const t of transactions) {
    dataStart = Math.min(dataStart, t.day);
    dataEnd = Math.max(dataEnd, t.day);
    const reason = exclusionReason(t);
    if (reason) {
      excluded[reason] += 1;
      continue;
    }
    const merchant = normalizeMerchant(t.description);
    if (merchant.key === '') {
      continue;
    }
    const group = groups.get(merchant.key) ?? { name: merchant.name, charges: [] };
    group.charges.push({
      date: t.date,
      day: t.day,
      amount: -t.amount,
      description: t.description,
      source: t.source,
      line: t.line,
    });
    groups.set(merchant.key, group);
  }
  const findings: Finding[] = [];
  for (const [key, group] of groups) {
    findings.push(
      ...detectMerchant(group.charges, {
        id: key,
        merchant: group.name,
        dataStart,
        dataEnd,
        options,
      }),
    );
  }
  findings.sort(compareFindings);
  const yearlyTotal = findings
    .filter((f) => f.status === 'active')
    .reduce((sum, f) => sum + f.yearlyCost, 0);
  return {
    findings,
    yearlyTotal,
    monthlyTotal: Math.round(yearlyTotal / 12),
    excluded,
    transactionCount: transactions.length,
    dataStart: transactions.length > 0 ? isoFromDay(dataStart) : '',
    dataEnd: transactions.length > 0 ? isoFromDay(dataEnd) : '',
  };
}
