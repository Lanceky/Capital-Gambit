// ISO is a string alias for an ISO-8601 timestamp.
type ISO = string
// Money is a number in US dollars to 2dp.
type Money = number

type AgentId = 'cash' | 'cost' | 'revenue' | 'synthesis'
type AgentRunStatus = 'pending' | 'running' | 'complete' | 'skipped' | 'error'
type DecisionStatus = 'approved' | 'rejected' | 'modified'

interface LedgerEntry {
  id: string
  date: ISO
  kind: 'AR' | 'AP'
  counterparty: string
  amountUsd: Money
  dueDate: ISO
  paidDate?: ISO
  termsDays: number
  invoiceId: string
  sourceId: string
}

interface VendorContract {
  id: string
  vendor: string
  annualValueUsd: Money
  renewalDate: ISO
  category: string
  cancellable: boolean
  noticeDays: number
  sourceId: string
}

interface SourceRef {
  sourceId: string
  kind: 'ledger' | 'contract' | 'bank' | 'crm'
  rowIds: string[]
  label: string
}

interface AgentFinding {
  id: string
  agentId: AgentId
  title: string
  detail: string
  impactUsd?: Money
  impactDays?: number
  confidence: 'high' | 'medium' | 'low'
  evidence: SourceRef[]
}

interface Lever {
  id: string
  agentId: AgentId
  title: string
  description: string
  impactUsd: Money
  impactDays?: number
  effort: 'low' | 'medium' | 'high'
  findingIds: string[]
}

interface ReasoningStep {
  n: number
  statement: string
  evidence: SourceRef[]
}

interface Move {
  id: string
  leverId: string
  title: string
  fromUse: string
  toUse: string
  amountUsd: Money
  rationale: string
}

interface TradeOff {
  give: string
  get: string
}

interface Recommendation {
  id: string
  headline: string
  tradeOff: TradeOff
  moves: Move[]
  expectedPayoffUsd: Money
  reasoning: ReasoningStep[]
}

interface AgentRun {
  agentId: AgentId
  status: AgentRunStatus
  startedAt?: ISO
  completedAt?: ISO
  findings: AgentFinding[]
  levers: Lever[]
  error?: string
  live: boolean
}

interface Decision {
  status: DecisionStatus
  actor: string
  at: ISO
  rationale?: string
  modifiedMoves?: Move[]
}

interface RunRecord {
  id: string
  startedAt: ISO
  completedAt?: ISO
  agentRuns: AgentRun[]
  recommendation?: Recommendation
  decision?: Decision
}

interface CompanyProfile {
  name: string
  annualRevenueUsd: Money
  annualCogsUsd: Money
  annualOpexUsd: Money
  cashBalanceUsd: Money
  // Whole percent, e.g. 9 means a 9% annual cost of capital.
  costOfCapitalPct: number
  inventoryUsd?: Money
  fiscalYearEnd?: ISO
}

interface AgentDataset {
  ledger: LedgerEntry[]
  contracts: VendorContract[]
  company: CompanyProfile
}

export type {
  ISO,
  Money,
  AgentId,
  AgentRunStatus,
  DecisionStatus,
  LedgerEntry,
  VendorContract,
  SourceRef,
  AgentFinding,
  Lever,
  ReasoningStep,
  Move,
  TradeOff,
  Recommendation,
  AgentRun,
  Decision,
  RunRecord,
  CompanyProfile,
  AgentDataset,
}
