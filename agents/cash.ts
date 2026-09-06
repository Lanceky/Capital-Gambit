import type {
  AgentDataset,
  AgentFinding,
  AgentRun,
  LedgerEntry,
  Lever,
  Money,
  SourceRef,
  VendorContract,
} from '@/lib/types'
import {
  DAYS_PER_YEAR,
  agingSchedule,
  annualizedDiscountRate,
  averageOpenBalance,
  daysToPay,
  formatUsd,
  isOpen,
  ledgerAsOf,
  median,
  mean,
  monthEndsFor,
  round1,
  safeDivide,
  sum,
  toUsd,
  type AgingBucket,
} from './finance'

export interface WorkingCapitalMetrics {
  dso: number
  dpo: number
  dio: number
  ccc: number
  averageArBalanceUsd: Money
  averageApBalanceUsd: Money
  openArUsd: Money
  openApUsd: Money
  arAging: Record<AgingBucket, Money>
  asOf: string
}

export interface CounterpartyBehaviour {
  counterparty: string
  invoiceCount: number
  totalBilledUsd: Money
  averageDaysToPay: number
  contractualTermsDays: number
  excessDays: number
  averageDailyBillingsUsd: Money
  rowIds: string[]
}

export interface CashAgentResult {
  run: AgentRun
  metrics: WorkingCapitalMetrics
  arBehaviour: CounterpartyBehaviour[]
  apBehaviour: CounterpartyBehaviour[]
}

const AGENT_ID = 'cash' as const

// A counterparty needs enough settled invoices before a payment pattern is a
// pattern rather than an anecdote.
const MIN_INVOICES_FOR_PATTERN = 3
// Below this the gap is timing noise, not a collectable lever.
const MATERIAL_EXCESS_DAYS = 10
const MATERIAL_IMPACT_USD = 25_000

function ref(kind: SourceRef['kind'], rowIds: string[], label: string, sourceId: string): SourceRef {
  return { sourceId, kind, rowIds, label }
}

function sourceIdOf(rows: { sourceId: string }[], fallback: string): string {
  return rows.find((r) => r.sourceId)?.sourceId ?? fallback
}

function confidenceFor(sampleSize: number, consistency: number): AgentFinding['confidence'] {
  if (sampleSize >= 8 && consistency >= 0.7) return 'high'
  if (sampleSize >= MIN_INVOICES_FOR_PATTERN && consistency >= 0.5) return 'medium'
  return 'low'
}

/**
 * Share of settled invoices that individually exceed terms. A counterparty that
 * is late on every invoice is a policy; one that is late on a third is noise,
 * and confidence should say so.
 */
function lateShare(entries: LedgerEntry[]): number {
  const settled = entries.filter((e) => daysToPay(e) !== null)
  if (settled.length === 0) return 0
  const late = settled.filter((e) => (daysToPay(e) ?? 0) > e.termsDays)
  return late.length / settled.length
}

function behaviourFor(entries: LedgerEntry[], windowDays: number): CounterpartyBehaviour[] {
  const byCounterparty = new Map<string, LedgerEntry[]>()
  for (const entry of entries) {
    const list = byCounterparty.get(entry.counterparty) ?? []
    list.push(entry)
    byCounterparty.set(entry.counterparty, list)
  }

  const out: CounterpartyBehaviour[] = []
  for (const [counterparty, rows] of byCounterparty) {
    const settled = rows.filter((r) => daysToPay(r) !== null)
    if (settled.length === 0) continue
    const averageDaysToPay = mean(settled.map((r) => daysToPay(r) as number))
    // Terms can vary by invoice; the median is the counterparty's real standard.
    const contractualTermsDays = median(rows.map((r) => r.termsDays))
    const totalBilledUsd = sum(rows.map((r) => r.amountUsd))
    out.push({
      counterparty,
      invoiceCount: rows.length,
      totalBilledUsd: toUsd(totalBilledUsd),
      averageDaysToPay: round1(averageDaysToPay),
      contractualTermsDays,
      excessDays: round1(averageDaysToPay - contractualTermsDays),
      averageDailyBillingsUsd: toUsd(safeDivide(totalBilledUsd, windowDays)),
      rowIds: rows.map((r) => r.id),
    })
  }
  return out.sort((a, b) => b.totalBilledUsd - a.totalBilledUsd)
}

function computeMetrics(data: AgentDataset): WorkingCapitalMetrics {
  const { ledger, company } = data
  const ar = ledger.filter((e) => e.kind === 'AR')
  const ap = ledger.filter((e) => e.kind === 'AP')
  const asOf = ledgerAsOf(ledger)
  const grid = monthEndsFor(ledger)

  const averageAr = averageOpenBalance(ar, grid)
  const averageAp = averageOpenBalance(ap, grid)
  const inventory = company.inventoryUsd ?? 0

  const dso = safeDivide(averageAr, company.annualRevenueUsd) * DAYS_PER_YEAR
  const dpo = safeDivide(averageAp, company.annualCogsUsd) * DAYS_PER_YEAR
  const dio = safeDivide(inventory, company.annualCogsUsd) * DAYS_PER_YEAR

  return {
    dso: round1(dso),
    dpo: round1(dpo),
    dio: round1(dio),
    ccc: round1(dso + dio - dpo),
    averageArBalanceUsd: toUsd(averageAr),
    averageApBalanceUsd: toUsd(averageAp),
    openArUsd: toUsd(sum(ar.filter(isOpen).map((e) => e.amountUsd))),
    openApUsd: toUsd(sum(ap.filter(isOpen).map((e) => e.amountUsd))),
    arAging: agingSchedule(ar, asOf),
    asOf,
  }
}

/**
 * Lever 1 — AR acceleration. Impact is the excess days a customer takes beyond
 * their own terms multiplied by their average daily billings: the cash that
 * would return to the balance sheet if they simply paid to terms.
 */
function arAccelerationLevers(
  ar: LedgerEntry[],
  behaviour: CounterpartyBehaviour[],
  windowDays: number,
): { findings: AgentFinding[]; levers: Lever[] } {
  const findings: AgentFinding[] = []
  const levers: Lever[] = []

  const candidates = behaviour
    .filter(
      (b) =>
        b.invoiceCount >= MIN_INVOICES_FOR_PATTERN && b.excessDays >= MATERIAL_EXCESS_DAYS,
    )
    .map((b) => ({ b, impact: toUsd(b.excessDays * b.averageDailyBillingsUsd) }))
    .filter((c) => c.impact >= MATERIAL_IMPACT_USD)
    .sort((a, b) => b.impact - a.impact)

  for (const { b, impact } of candidates) {
    const rows = ar.filter((e) => e.counterparty === b.counterparty)
    const evidence = [
      ref(
        'ledger',
        b.rowIds,
        `${b.invoiceCount} invoices to ${b.counterparty} over ${windowDays} days`,
        sourceIdOf(rows, 'ledger'),
      ),
    ]
    const consistency = lateShare(rows)
    const findingId = `cash-ar-${slug(b.counterparty)}`

    findings.push({
      id: findingId,
      agentId: AGENT_ID,
      title: `${b.counterparty} pays ${round1(b.averageDaysToPay)} days against ${b.contractualTermsDays}-day terms`,
      detail:
        `Across ${b.invoiceCount} invoices totalling ${formatUsd(b.totalBilledUsd)}, ` +
        `${b.counterparty} settles on average ${round1(b.averageDaysToPay)} days after invoice date, ` +
        `${round1(b.excessDays)} days beyond contractual terms. At ${formatUsd(b.averageDailyBillingsUsd)} ` +
        `of average daily billings that gap holds ${formatUsd(impact)} of working capital off the balance sheet.`,
      impactUsd: impact,
      impactDays: round1(b.excessDays),
      confidence: confidenceFor(b.invoiceCount, consistency),
      evidence,
    })

    levers.push({
      id: `lever-ar-${slug(b.counterparty)}`,
      agentId: AGENT_ID,
      title: `Collect ${b.counterparty} to ${b.contractualTermsDays}-day terms, freeing ${formatUsd(impact)}`,
      description:
        `Move ${b.counterparty} from ${round1(b.averageDaysToPay)} actual days-to-pay back to their ` +
        `contracted ${b.contractualTermsDays} days through dunning escalation and invoice-on-delivery. ` +
        `Releases ${formatUsd(impact)} of trapped receivables and removes ${round1(b.excessDays)} days from DSO.`,
      impactUsd: impact,
      impactDays: round1(b.excessDays),
      effort: b.excessDays > 30 ? 'medium' : 'low',
      findingIds: [findingId],
    })
  }

  return { findings, levers }
}

/**
 * Lever 2 — AP term extension. The peer benchmark is the median terms of other
 * vendors in the same contract category, derived from the data rather than
 * asserted, so the comparison survives a change of fixtures.
 */
function apExtensionLevers(
  ap: LedgerEntry[],
  contracts: VendorContract[],
  behaviour: CounterpartyBehaviour[],
): { findings: AgentFinding[]; levers: Lever[] } {
  const findings: AgentFinding[] = []
  const levers: Lever[] = []

  const categoryOf = new Map<string, string>()
  for (const c of contracts) categoryOf.set(c.vendor, c.category)

  // Peer benchmark: median actual days-to-pay of every other vendor in the category.
  const byCategory = new Map<string, CounterpartyBehaviour[]>()
  for (const b of behaviour) {
    const category = categoryOf.get(b.counterparty)
    if (!category) continue
    const list = byCategory.get(category) ?? []
    list.push(b)
    byCategory.set(category, list)
  }

  const candidates: { b: CounterpartyBehaviour; impact: Money; peer: number; category: string }[] = []
  for (const [category, peers] of byCategory) {
    if (peers.length < 2) continue
    for (const b of peers) {
      if (b.invoiceCount < MIN_INVOICES_FOR_PATTERN) continue
      const others = peers.filter((p) => p.counterparty !== b.counterparty)
      const peerDays = median(others.map((p) => p.averageDaysToPay))
      const gain = peerDays - b.averageDaysToPay
      if (gain < MATERIAL_EXCESS_DAYS) continue
      const impact = toUsd(gain * b.averageDailyBillingsUsd)
      if (impact < MATERIAL_IMPACT_USD) continue
      candidates.push({ b, impact, peer: round1(peerDays), category })
    }
  }
  candidates.sort((a, b) => b.impact - a.impact)

  for (const { b, impact, peer, category } of candidates) {
    const rows = ap.filter((e) => e.counterparty === b.counterparty)
    const peerRows = behaviour
      .filter((p) => categoryOf.get(p.counterparty) === category && p.counterparty !== b.counterparty)
      .flatMap((p) => p.rowIds)
    const gainDays = round1(peer - b.averageDaysToPay)
    const findingId = `cash-ap-${slug(b.counterparty)}`

    findings.push({
      id: findingId,
      agentId: AGENT_ID,
      title: `${b.counterparty} paid in ${round1(b.averageDaysToPay)} days against a ${peer}-day category benchmark`,
      detail:
        `${b.counterparty} is settled on average ${round1(b.averageDaysToPay)} days after invoice, while the ` +
        `median comparable vendor in ${category} is paid at ${peer} days. Aligning to the category benchmark ` +
        `retains ${formatUsd(impact)} of cash for a further ${gainDays} days at no cost to the supplier relationship.`,
      impactUsd: impact,
      impactDays: gainDays,
      confidence: confidenceFor(b.invoiceCount, 1),
      evidence: [
        ref('ledger', b.rowIds, `${b.invoiceCount} payments to ${b.counterparty}`, sourceIdOf(rows, 'ledger')),
        ref('contract', peerRows, `${category} category peer payment history`, sourceIdOf(contracts, 'contract')),
      ],
    })

    levers.push({
      id: `lever-ap-${slug(b.counterparty)}`,
      agentId: AGENT_ID,
      title: `Extend ${b.counterparty} to ${Math.round(peer)}-day terms, freeing ${formatUsd(impact)}`,
      description:
        `Renegotiate ${b.counterparty} from an effective ${round1(b.averageDaysToPay)} days to the ` +
        `${peer}-day median already paid to comparable ${category} vendors. Adds ${gainDays} days to DPO ` +
        `and retains ${formatUsd(impact)} in working capital.`,
      impactUsd: impact,
      impactDays: gainDays,
      effort: 'medium',
      findingIds: [findingId],
    })
  }

  return { findings, levers }
}

/**
 * Lever 3 — early-payment discount evaluation. Paying ahead of terms without a
 * discount is an interest-free loan to the supplier; the opportunity cost is
 * the capital multiplied by the company's cost of capital over the days gained.
 */
function earlyPaymentFindings(
  ap: LedgerEntry[],
  costOfCapitalPct: number,
  windowDays: number,
  excludeVendors: Set<string>,
): { findings: AgentFinding[]; levers: Lever[] } {
  const findings: AgentFinding[] = []
  const levers: Lever[] = []

  const byVendor = new Map<string, LedgerEntry[]>()
  for (const entry of ap) {
    if (daysToPay(entry) === null) continue
    // Vendors already carried by the AP term-extension lever are excluded here:
    // the same capital must not be released twice by two different levers.
    if (excludeVendors.has(entry.counterparty)) continue
    const list = byVendor.get(entry.counterparty) ?? []
    list.push(entry)
    byVendor.set(entry.counterparty, list)
  }

  const assessed: {
    vendor: string
    daysEarly: number
    capital: Money
    opportunityCost: Money
    impliedRate: number
    termsDays: number
    rowIds: string[]
  }[] = []

  for (const [vendor, rows] of byVendor) {
    if (rows.length < MIN_INVOICES_FOR_PATTERN) continue
    const termsDays = median(rows.map((r) => r.termsDays))
    const actual = mean(rows.map((r) => daysToPay(r) as number))
    const daysEarly = termsDays - actual
    if (daysEarly < 5) continue
    const spend = sum(rows.map((r) => r.amountUsd))
    // Capital tied up by settling early rather than at terms.
    const capital = toUsd(safeDivide(spend, windowDays) * daysEarly)
    const opportunityCost = toUsd(capital * (costOfCapitalPct / 100))
    if (opportunityCost < 500) continue
    // The discount rate that would have to be on offer to justify paying early.
    const impliedRate = round1(
      annualizedDiscountRate(
        // Break-even discount at the company's cost of capital.
        (costOfCapitalPct / 100) * (daysEarly / DAYS_PER_YEAR) * 100,
        0,
        daysEarly,
      ),
    )
    assessed.push({
      vendor,
      daysEarly: round1(daysEarly),
      capital,
      opportunityCost,
      impliedRate,
      termsDays,
      rowIds: rows.map((r) => r.id),
    })
  }

  assessed.sort((a, b) => b.opportunityCost - a.opportunityCost)
  if (assessed.length === 0) return { findings, levers }

  const totalCapital = toUsd(sum(assessed.map((a) => a.capital)))
  const totalCost = toUsd(sum(assessed.map((a) => a.opportunityCost)))
  const findingId = 'cash-early-payment'
  const named = assessed
    .slice(0, 3)
    .map((a) => `${a.vendor} (${a.daysEarly}d early, ${formatUsd(a.capital)})`)
    .join(', ')

  findings.push({
    id: findingId,
    agentId: AGENT_ID,
    title: `${assessed.length} vendors settled ahead of terms with no discount captured`,
    detail:
      `${named}. Settling ahead of contractual terms without a corresponding discount lends the supplier ` +
      `${formatUsd(totalCapital)} at zero interest. At a ${costOfCapitalPct}% cost of capital that carries an ` +
      `annual opportunity cost of ${formatUsd(totalCost)}. Any early-payment discount below the break-even ` +
      `annualized rate should be declined and the invoice paid at terms.`,
    impactUsd: totalCapital,
    confidence: assessed.length >= 3 ? 'high' : 'medium',
    evidence: assessed.map((a) =>
      ref(
        'ledger',
        a.rowIds,
        `${a.vendor} paid ${a.daysEarly} days inside ${a.termsDays}-day terms`,
        sourceIdOf(ap, 'ledger'),
      ),
    ),
  })

  levers.push({
    id: 'lever-early-payment',
    agentId: AGENT_ID,
    title: `Pay ${assessed.length} vendors at terms rather than early, freeing ${formatUsd(totalCapital)}`,
    description:
      `Hold payment on vendors currently settled ahead of schedule until contractual terms unless a discount ` +
      `beats the ${costOfCapitalPct}% cost of capital on an annualized basis. Releases ${formatUsd(totalCapital)} ` +
      `of working capital and avoids ${formatUsd(totalCost)} of annual carrying cost.`,
    impactUsd: totalCapital,
    impactDays: round1(mean(assessed.map((a) => a.daysEarly))),
    effort: 'low',
    findingIds: [findingId],
  })

  return { findings, levers }
}

/**
 * Contract renewals landing inside their notice window. A cancellable, low-value
 * contract about to auto-renew is a decision with a deadline, which is exactly
 * the kind of thing that slips past a finance team.
 */
function renewalLevers(contracts: VendorContract[], asOf: string): {
  findings: AgentFinding[]
  levers: Lever[]
} {
  const findings: AgentFinding[] = []
  const levers: Lever[] = []
  const asOfDate = new Date(asOf)

  const imminent = contracts
    .filter((c) => c.cancellable)
    .map((c) => {
      const renewal = new Date(c.renewalDate)
      const daysToRenewal = Math.round(
        (renewal.getTime() - asOfDate.getTime()) / 86_400_000,
      )
      return { c, daysToRenewal }
    })
    .filter(({ c, daysToRenewal }) => daysToRenewal >= 0 && daysToRenewal <= Math.max(c.noticeDays, 45))
    .sort((a, b) => b.c.annualValueUsd - a.c.annualValueUsd)

  for (const { c, daysToRenewal } of imminent) {
    if (c.annualValueUsd < MATERIAL_IMPACT_USD) continue
    const findingId = `cash-renewal-${slug(c.vendor)}`
    const noticeExpired = daysToRenewal < c.noticeDays

    findings.push({
      id: findingId,
      agentId: AGENT_ID,
      title: `${c.vendor} renews in ${daysToRenewal} days at ${formatUsd(c.annualValueUsd)}`,
      detail:
        `The ${c.category} contract with ${c.vendor} auto-renews on ${c.renewalDate} at ` +
        `${formatUsd(c.annualValueUsd)} per year and requires ${c.noticeDays} days notice to cancel. ` +
        (noticeExpired
          ? `The notice window has already closed, so this renewal cycle is committed; flag now for the next term.`
          : `${daysToRenewal - c.noticeDays} days remain to serve notice before the commitment renews.`),
      impactUsd: toUsd(c.annualValueUsd),
      impactDays: daysToRenewal,
      confidence: 'high',
      evidence: [ref('contract', [c.id], `${c.vendor} contract, renews ${c.renewalDate}`, c.sourceId)],
    })

    if (!noticeExpired) {
      levers.push({
        id: `lever-renewal-${slug(c.vendor)}`,
        agentId: AGENT_ID,
        title: `Serve notice on ${c.vendor} before renewal, freeing ${formatUsd(c.annualValueUsd)}`,
        description:
          `Cancel or renegotiate the ${c.category} contract with ${c.vendor} within the next ` +
          `${daysToRenewal - c.noticeDays} days to avoid committing ${formatUsd(c.annualValueUsd)} ` +
          `for another year. Requires ${c.noticeDays} days written notice.`,
        impactUsd: toUsd(c.annualValueUsd),
        impactDays: daysToRenewal,
        effort: 'low',
        findingIds: [findingId],
      })
    }
  }

  return { findings, levers }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Cash & Working Capital agent. Pure deterministic computation over the
 * supplied dataset — no network, no model calls, every number traceable to the
 * ledger and contract rows carried in `evidence`.
 */
export async function runCashAgent(data: AgentDataset): Promise<AgentRun> {
  return analyzeCash(data).run
}

export function analyzeCash(data: AgentDataset): CashAgentResult {
  const startedAt = new Date().toISOString()
  const { ledger, contracts, company } = data

  const ar = ledger.filter((e) => e.kind === 'AR')
  const ap = ledger.filter((e) => e.kind === 'AP')
  const metrics = computeMetrics(data)
  const grid = monthEndsFor(ledger)
  const windowDays = Math.max(grid.length, 1) * 30

  const arBehaviour = behaviourFor(ar, windowDays)
  const apBehaviour = behaviourFor(ap, windowDays)

  const arPart = arAccelerationLevers(ar, arBehaviour, windowDays)
  const apPart = apExtensionLevers(ap, contracts, apBehaviour)
  // Vendors already levered for term extension are off-limits to the
  // early-payment lever so freed capital is never double-counted.
  const leveredVendors = new Set(
    apPart.findings.map((f) => f.id.replace(/^cash-ap-/, '')).map((s) => s),
  )
  const excluded = new Set(
    apBehaviour
      .filter((b) => leveredVendors.has(slug(b.counterparty)))
      .map((b) => b.counterparty),
  )
  const earlyPart = earlyPaymentFindings(
    ap,
    company.costOfCapitalPct,
    windowDays,
    excluded,
  )
  const renewalPart = renewalLevers(contracts, metrics.asOf)

  const headline: AgentFinding = {
    id: 'cash-working-capital-position',
    agentId: AGENT_ID,
    title: `Cash conversion cycle of ${metrics.ccc} days`,
    detail:
      `DSO ${metrics.dso} days, DIO ${metrics.dio} days, DPO ${metrics.dpo} days gives a cash conversion ` +
      `cycle of ${metrics.ccc} days against ${formatUsd(company.annualRevenueUsd)} of annual revenue. ` +
      `${formatUsd(metrics.openArUsd)} of receivables and ${formatUsd(metrics.openApUsd)} of payables are ` +
      `currently open, with ${formatUsd(metrics.arAging['61-90'] + metrics.arAging['90+'])} of AR beyond 60 days past due.`,
    impactDays: metrics.ccc,
    confidence: 'high',
    evidence: [
      ref('ledger', ar.map((e) => e.id), `${ar.length} AR invoices`, sourceIdOf(ar, 'ledger')),
      ref('ledger', ap.map((e) => e.id), `${ap.length} AP invoices`, sourceIdOf(ap, 'ledger')),
    ],
  }

  const findings = [
    headline,
    ...arPart.findings,
    ...apPart.findings,
    ...earlyPart.findings,
    ...renewalPart.findings,
  ]
  const levers = [...arPart.levers, ...apPart.levers, ...earlyPart.levers, ...renewalPart.levers].sort(
    (a, b) => b.impactUsd - a.impactUsd,
  )

  const run: AgentRun = {
    agentId: AGENT_ID,
    status: 'complete',
    startedAt,
    completedAt: new Date().toISOString(),
    findings,
    levers,
    live: true,
  }

  return { run, metrics, arBehaviour, apBehaviour }
}
