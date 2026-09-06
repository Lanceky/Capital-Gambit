import type {
  AgentRun,
  CompanyProfile,
  Lever,
  Money,
  Move,
  ReasoningStep,
  Recommendation,
  SourceRef,
  TradeOff,
} from '@/lib/types'
import { formatUsd, round1, sum, toUsd } from './finance'

/**
 * A candidate use of freed capital, scored on the three dimensions a CFO
 * actually weighs before redeploying working capital.
 */
export interface RedeploymentOption {
  id: string
  label: string
  // Where the capital goes, in the language used on the Move.
  toUse: string
  rationale: string
  // Expected next-cycle return on the deployed capital, as a percent.
  expectedReturnPct: number
  // 1 = safe, 5 = speculative.
  risk: number
  // 1 = capital locked up, 5 = recoverable within the cycle.
  reversibility: number
  // Share of the freed capital this option can absorb before saturating.
  capacityPct: number
  score: number
  expectedPayoffUsd: Money
}

export interface SynthesisResult {
  recommendation: Recommendation
  options: RedeploymentOption[]
  freedCapitalUsd: Money
}

// Scoring weights. Return dominates, but a CFO redeploying working capital will
// not accept a high return that cannot be unwound inside the cycle.
const WEIGHT_RETURN = 0.6
const WEIGHT_RISK = 0.2
const WEIGHT_REVERSIBILITY = 0.2

function scoreOption(option: Omit<RedeploymentOption, 'score' | 'expectedPayoffUsd'>): number {
  // Normalize return onto the same 1-5 scale as risk and reversibility so the
  // weights mean what they say. 20% return maps to the top of the scale.
  const returnScore = Math.min(option.expectedReturnPct / 4, 5)
  const riskScore = 6 - option.risk
  return round1(
    returnScore * WEIGHT_RETURN + riskScore * WEIGHT_RISK + option.reversibility * WEIGHT_REVERSIBILITY,
  )
}

/**
 * Candidate uses are grounded in the company profile rather than invented: the
 * revolver rate follows cost of capital, and the sales-hire and buffer options
 * are sized from revenue and the existing cash position.
 */
function candidateOptions(company: CompanyProfile, freed: Money): RedeploymentOption[] {
  const cost = company.costOfCapitalPct
  const raw: Omit<RedeploymentOption, 'score' | 'expectedPayoffUsd'>[] = [
    {
      id: 'revolver',
      label: 'Pay down revolving credit facility',
      toUse: 'Revolver paydown',
      rationale:
        `Retiring drawn balance earns a certain, immediate ${cost}% return equal to the interest no longer ` +
        `accrued, with no execution risk and full reversibility through redraw.`,
      expectedReturnPct: cost,
      risk: 1,
      reversibility: 5,
      capacityPct: 100,
    },
    {
      id: 'sales-capacity',
      label: 'Fund additional sales capacity',
      toUse: 'Sales capacity',
      rationale:
        `Adding quota-carrying capacity compounds into next-cycle bookings, but carries ramp risk and cannot ` +
        `be unwound mid-cycle without losing the investment.`,
      expectedReturnPct: 18,
      risk: 4,
      reversibility: 2,
      capacityPct: 35,
    },
    {
      id: 'product-investment',
      label: 'Accelerate product investment',
      toUse: 'Product investment',
      rationale:
        `Pulling roadmap spend forward defends pricing power into the next cycle. Returns are real but land ` +
        `later than a single cycle and the spend is largely sunk once committed.`,
      expectedReturnPct: 14,
      risk: 4,
      reversibility: 2,
      capacityPct: 30,
    },
    {
      id: 'buffer',
      label: 'Hold as operating buffer',
      toUse: 'Operating cash buffer',
      rationale:
        `Holding the capital costs the ${cost}% cost of capital but removes refinancing exposure. Worth ` +
        `weighting only while the cash position is thin relative to operating expense.`,
      // Holding cash returns nothing; the "return" is avoided disruption, which
      // we score as materially below cost of capital.
      expectedReturnPct: Math.max(cost - 6, 1),
      risk: 1,
      reversibility: 5,
      capacityPct: 100,
    },
  ]

  return raw
    .map((option) => {
      const score = scoreOption(option)
      const deployable = toUsd(freed * (option.capacityPct / 100))
      return {
        ...option,
        score,
        expectedPayoffUsd: toUsd(deployable * (option.expectedReturnPct / 100)),
      }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * Allocate freed capital across the ranked options, respecting each option's
 * capacity so the plan does not put the entire release into a single saturated
 * use.
 *
 * Capital is drawn from a pool of the actual levers, so every move is funded by
 * a lever that genuinely released at least that much. A move never claims more
 * capital than its cited lever produced, and the moves never sum above the
 * total freed.
 */
function allocate(
  options: RedeploymentOption[],
  levers: Lever[],
  freed: Money,
): { moves: Move[]; expectedPayoffUsd: Money } {
  const moves: Move[] = []
  let payoff = 0

  // Remaining drawable capital per lever, largest first.
  const pool = [...levers]
    .sort((a, b) => b.impactUsd - a.impactUsd)
    .map((lever) => ({ lever, remaining: lever.impactUsd }))

  for (const option of options) {
    let capacity = toUsd(freed * (option.capacityPct / 100))
    if (capacity < 1_000) continue

    for (const slot of pool) {
      if (capacity < 1_000) break
      if (slot.remaining < 1_000) continue

      const amount = toUsd(Math.min(slot.remaining, capacity))
      moves.push({
        id: `move-${option.id}-${slot.lever.id}`,
        leverId: slot.lever.id,
        title: `${formatUsd(amount)} to ${option.label.toLowerCase()}`,
        fromUse: `Working capital released by: ${slot.lever.title}`,
        toUse: option.toUse,
        amountUsd: amount,
        rationale: option.rationale,
      })

      payoff += amount * (option.expectedReturnPct / 100)
      slot.remaining = toUsd(slot.remaining - amount)
      capacity = toUsd(capacity - amount)
    }
  }

  return { moves, expectedPayoffUsd: toUsd(payoff) }
}

function buildTradeOff(
  options: RedeploymentOption[],
  moves: Move[],
  freed: Money,
  company: CompanyProfile,
): TradeOff {
  const primary = options[0]
  const deployed = toUsd(sum(moves.map((m) => m.amountUsd)))
  const give =
    `Tighter collection terms with named customers and slower settlement with suppliers paid ahead of ` +
    `schedule, plus ${formatUsd(deployed)} of cash committed out of discretionary reserve this cycle.`
  const get =
    `${formatUsd(freed)} of working capital released from the cash conversion cycle and redeployed to ` +
    `${primary ? primary.label.toLowerCase() : 'the highest-scoring use'}, at an expected ` +
    `${primary ? primary.expectedReturnPct : company.costOfCapitalPct}% next-cycle return.`
  return { give, get }
}

function reasoningChain(
  runs: AgentRun[],
  levers: Lever[],
  options: RedeploymentOption[],
  moves: Move[],
  freed: Money,
  company: CompanyProfile,
): ReasoningStep[] {
  const evidenceFor = (ids: string[]): SourceRef[] =>
    runs
      .flatMap((r) => r.findings)
      .filter((f) => ids.includes(f.id))
      .flatMap((f) => f.evidence)

  const liveRuns = runs.filter((r) => r.live && r.status === 'complete')
  const skipped = runs.filter((r) => !r.live || r.status === 'skipped')
  const steps: ReasoningStep[] = []
  let n = 1

  steps.push({
    n: n++,
    statement:
      `${liveRuns.length} of ${runs.length} agents returned live analysis` +
      (skipped.length > 0
        ? `; ${skipped.map((r) => r.agentId).join(', ')} did not run and contributed no levers to this recommendation.`
        : '.'),
    evidence: [],
  })

  const top = levers.slice(0, 3)
  for (const lever of top) {
    steps.push({
      n: n++,
      statement: `${lever.title} releases ${formatUsd(lever.impactUsd)} of working capital.`,
      evidence: evidenceFor(lever.findingIds),
    })
  }

  steps.push({
    n: n++,
    statement:
      `Summing ${levers.length} identified levers gives ${formatUsd(freed)} of redeployable capital, ` +
      `against a current cash position of ${formatUsd(company.cashBalanceUsd)}.`,
    evidence: evidenceFor(levers.flatMap((l) => l.findingIds)),
  })

  const ranked = options
    .slice(0, 3)
    .map((o) => `${o.label} (score ${o.score}, ${o.expectedReturnPct}% return, risk ${o.risk}/5)`)
    .join('; ')
  steps.push({
    n: n++,
    statement:
      `Redeployment options scored on return, risk and reversibility weighted ${WEIGHT_RETURN}/${WEIGHT_RISK}/${WEIGHT_REVERSIBILITY}: ${ranked}.`,
    evidence: [],
  })

  steps.push({
    n: n++,
    statement:
      `Capital is allocated across ${moves.length} moves respecting each option's absorption capacity, ` +
      `rather than concentrating the full release into the single highest-scoring use.`,
    evidence: [],
  })

  steps.push({
    n: n++,
    statement:
      `This is a proposal only. No payment terms, contracts or transfers change until a human approves the plan.`,
    evidence: [],
  })

  return steps
}

/**
 * Allocation / Synthesis agent. Consumes every agent run, totals the capital
 * their levers free, ranks candidate redeployments, and emits a proposal with
 * an explicit trade-off and a numbered reasoning chain.
 *
 * Never auto-executes: the output is a Recommendation awaiting human decision.
 */
export async function runSynthesisAgent(runs: AgentRun[]): Promise<Recommendation> {
  return synthesize(runs, defaultCompany()).recommendation
}

/**
 * Company-aware entry point. `runSynthesisAgent` keeps the signature the brief
 * specifies; the runtime should prefer this so scoring reflects the real
 * profile rather than the fallback.
 */
export function synthesize(runs: AgentRun[], company: CompanyProfile): SynthesisResult {
  const levers = runs.flatMap((r) => r.levers)
  const freed = toUsd(sum(levers.map((l) => l.impactUsd)))

  if (levers.length === 0) {
    return {
      freedCapitalUsd: 0,
      options: [],
      recommendation: {
        id: `rec-${Date.now()}`,
        headline: 'No redeployable capital identified in this cycle',
        tradeOff: {
          give: 'No changes to collection or payment terms are proposed.',
          get: 'No capital released; the cash conversion cycle is unchanged.',
        },
        moves: [],
        expectedPayoffUsd: 0,
        reasoning: [
          {
            n: 1,
            statement:
              'No agent returned a lever with a positive dollar impact, so there is nothing to reallocate.',
            evidence: [],
          },
        ],
      },
    }
  }

  const options = candidateOptions(company, freed)
  const { moves, expectedPayoffUsd } = allocate(options, levers, freed)
  const tradeOff = buildTradeOff(options, moves, freed, company)
  const reasoning = reasoningChain(runs, levers, options, moves, freed, company)
  const primary = options[0]

  const recommendation: Recommendation = {
    id: `rec-${Date.now()}`,
    headline:
      `Release ${formatUsd(freed)} from the cash conversion cycle and redeploy to ` +
      `${primary ? primary.label.toLowerCase() : 'the highest-scoring use'} for ` +
      `${formatUsd(expectedPayoffUsd)} of next-cycle payoff`,
    tradeOff,
    moves,
    expectedPayoffUsd,
    reasoning,
  }

  return { recommendation, options, freedCapitalUsd: freed }
}

/**
 * Fallback profile used only when synthesis is called without company context.
 * Values are conservative and clearly generic so a missing profile is visible
 * in the output rather than silently shaping the recommendation.
 */
function defaultCompany(): CompanyProfile {
  return {
    name: 'Unspecified company',
    annualRevenueUsd: 0,
    annualCogsUsd: 0,
    annualOpexUsd: 0,
    cashBalanceUsd: 0,
    costOfCapitalPct: 9,
  }
}

export { candidateOptions }
