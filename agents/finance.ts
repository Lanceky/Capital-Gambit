import type { LedgerEntry, Money } from '@/lib/types'

export const DAYS_PER_YEAR = 365
export const MS_PER_DAY = 86_400_000

export function toUsd(value: number): Money {
  return Math.round(value * 100) / 100
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function parseDate(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function daysBetween(from: string, to: string): number | null {
  const a = parseDate(from)
  const b = parseDate(to)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

/**
 * Safe ratio helper. A services company can carry zero inventory and a fixture
 * set can be missing COGS, so every DSO/DPO/DIO call routes through this rather
 * than dividing by zero and emitting Infinity into the UI.
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0
  const result = numerator / denominator
  return Number.isFinite(result) ? result : 0
}

/**
 * Average balance approximated as the mean of month-end open balances across
 * the ledger window. Using a true average rather than a period-end snapshot
 * keeps DSO/DPO stable against a single large invoice landing on the last day.
 */
export function averageOpenBalance(entries: LedgerEntry[], asOfDates: string[]): number {
  if (entries.length === 0 || asOfDates.length === 0) return 0
  const balances = asOfDates.map((asOf) => {
    const cutoff = parseDate(asOf)
    if (!cutoff) return 0
    return sum(
      entries
        .filter((e) => {
          const issued = parseDate(e.date)
          if (!issued || issued.getTime() > cutoff.getTime()) return false
          const paid = e.paidDate ? parseDate(e.paidDate) : null
          return !paid || paid.getTime() > cutoff.getTime()
        })
        .map((e) => e.amountUsd),
    )
  })
  return mean(balances)
}

/** Month-end dates spanning the ledger, used as the sampling grid for balances. */
export function monthEndsFor(entries: LedgerEntry[]): string[] {
  const times = entries
    .map((e) => parseDate(e.date))
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime())
  if (times.length === 0) return []
  const start = new Date(Math.min(...times))
  const end = new Date(Math.max(...times))
  const ends: string[] = []
  let year = start.getUTCFullYear()
  let month = start.getUTCMonth()
  while (true) {
    // Day 0 of the next month is the last day of this one.
    const monthEnd = new Date(Date.UTC(year, month + 1, 0))
    if (monthEnd.getTime() > end.getTime()) break
    ends.push(monthEnd.toISOString().slice(0, 10))
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }
  if (ends.length === 0) ends.push(end.toISOString().slice(0, 10))
  return ends
}

/** Latest invoice date in the ledger, used as "today" so fixtures never go stale. */
export function ledgerAsOf(entries: LedgerEntry[]): string {
  const times = entries
    .flatMap((e) => [parseDate(e.date), e.paidDate ? parseDate(e.paidDate) : null])
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime())
  if (times.length === 0) return new Date().toISOString().slice(0, 10)
  return new Date(Math.max(...times)).toISOString().slice(0, 10)
}

export function isOpen(entry: LedgerEntry): boolean {
  return !entry.paidDate
}

/** Actual days-to-pay for a settled invoice, or null while it is still open. */
export function daysToPay(entry: LedgerEntry): number | null {
  if (!entry.paidDate) return null
  return daysBetween(entry.date, entry.paidDate)
}

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'

export const AGING_BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+']

export function agingBucketFor(entry: LedgerEntry, asOf: string): AgingBucket {
  const overdue = daysBetween(entry.dueDate, asOf) ?? 0
  if (overdue <= 0) return 'current'
  if (overdue <= 30) return '1-30'
  if (overdue <= 60) return '31-60'
  if (overdue <= 90) return '61-90'
  return '90+'
}

export function agingSchedule(entries: LedgerEntry[], asOf: string): Record<AgingBucket, Money> {
  const buckets: Record<AgingBucket, Money> = {
    current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  }
  for (const entry of entries.filter(isOpen)) {
    buckets[agingBucketFor(entry, asOf)] += entry.amountUsd
  }
  for (const key of AGING_BUCKETS) buckets[key] = toUsd(buckets[key])
  return buckets
}

/**
 * Annualized cost of an early-payment discount, the standard
 * (d / (1 - d)) x (365 / (net - discount days)) formula. Compared against cost
 * of capital this is what tells a CFO to take or decline the discount.
 */
export function annualizedDiscountRate(
  discountPct: number,
  discountDays: number,
  netDays: number,
): number {
  const window = netDays - discountDays
  if (window <= 0 || discountPct <= 0 || discountPct >= 100) return 0
  const d = discountPct / 100
  return (d / (1 - d)) * (DAYS_PER_YEAR / window) * 100
}

export function formatUsd(value: Money): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${value.toFixed(0)}`
}
