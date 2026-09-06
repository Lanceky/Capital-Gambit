import { runCashAgent } from '@/agents/cash'
import { runCostAgent } from '@/agents/cost'
import { runRevenueAgent } from '@/agents/revenue'
import { synthesize } from '@/agents/synthesis'
import { saveRun } from '@/lib/store'
import type { AgentDataset, AgentId, AgentRun, RunRecord } from '@/lib/types'

type AnalysisAgent = {
  agentId: Exclude<AgentId, 'synthesis'>
  run: (data: AgentDataset) => Promise<AgentRun>
}

// Analysis agents run concurrently; synthesis is gated on all of them.
const ANALYSIS_AGENTS: AnalysisAgent[] = [
  { agentId: 'cash', run: runCashAgent },
  { agentId: 'cost', run: runCostAgent },
  { agentId: 'revenue', run: runRevenueAgent },
]

// The two placeholder agents report themselves as not live so the UI can say so.
const LIVE_AGENTS = new Set<AgentId>(['cash', 'synthesis'])

function pendingRun(agentId: AgentId): AgentRun {
  return {
    agentId,
    status: 'pending',
    findings: [],
    levers: [],
    live: LIVE_AGENTS.has(agentId),
  }
}

function newRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function replaceAgentRun(record: RunRecord, next: AgentRun): RunRecord {
  return {
    ...record,
    agentRuns: record.agentRuns.map((r) => (r.agentId === next.agentId ? next : r)),
  }
}

/** Create and persist a fresh run in the pending state. */
export async function createRun(): Promise<RunRecord> {
  const record: RunRecord = {
    id: newRunId(),
    startedAt: new Date().toISOString(),
    agentRuns: [...ANALYSIS_AGENTS.map((a) => pendingRun(a.agentId)), pendingRun('synthesis')],
  }
  await saveRun(record)
  return record
}

/**
 * Drive a created run to completion, persisting at every state transition so a
 * poll or a page refresh mid-run sees accurate state.
 *
 * A thrown agent is recorded as `error` and the run continues — synthesis
 * handles partial input rather than the whole run failing.
 */
export async function driveRun(seed: RunRecord, dataset: AgentDataset): Promise<RunRecord> {
  let record = seed

  // Mark the analysis phase running before dispatch so a poll landing between
  // these two points still sees the right state.
  const analysisStartedAt = new Date().toISOString()
  for (const agent of ANALYSIS_AGENTS) {
    record = replaceAgentRun(record, {
      ...pendingRun(agent.agentId),
      status: 'running',
      startedAt: analysisStartedAt,
    })
  }
  await saveRun(record)

  // Genuine concurrency: every analysis agent is dispatched before any is
  // awaited, so their start and completion timestamps overlap.
  const settled = await Promise.allSettled(
    ANALYSIS_AGENTS.map(async (agent) => {
      const startedAt = new Date().toISOString()
      try {
        const result = await agent.run(dataset)
        return {
          ...result,
          startedAt: result.startedAt ?? startedAt,
          completedAt: result.completedAt ?? new Date().toISOString(),
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const errored: AgentRun = {
          agentId: agent.agentId,
          status: 'error',
          startedAt,
          completedAt: new Date().toISOString(),
          findings: [],
          levers: [],
          error: message,
          live: false,
        }
        return errored
      }
    }),
  )

  for (const outcome of settled) {
    // The per-agent catch above means a rejection here is not expected, but a
    // rejected settle must still not take down the run.
    if (outcome.status === 'fulfilled') {
      record = replaceAgentRun(record, outcome.value)
    }
  }
  await saveRun(record)

  // Gate: synthesis starts only once every analysis agent has settled.
  const synthesisStartedAt = new Date().toISOString()
  record = replaceAgentRun(record, {
    agentId: 'synthesis',
    status: 'running',
    startedAt: synthesisStartedAt,
    findings: [],
    levers: [],
    live: true,
  })
  await saveRun(record)

  try {
    const analysisRuns = record.agentRuns.filter((r) => r.agentId !== 'synthesis')
    const { recommendation } = synthesize(analysisRuns, dataset.company)
    record = replaceAgentRun(record, {
      agentId: 'synthesis',
      status: 'complete',
      startedAt: synthesisStartedAt,
      completedAt: new Date().toISOString(),
      findings: [],
      levers: [],
      live: true,
    })
    record = { ...record, recommendation }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    record = replaceAgentRun(record, {
      agentId: 'synthesis',
      status: 'error',
      startedAt: synthesisStartedAt,
      completedAt: new Date().toISOString(),
      findings: [],
      levers: [],
      error: message,
      live: false,
    })
  }

  record = { ...record, completedAt: new Date().toISOString() }
  await saveRun(record)
  return record
}

/** Create a run and drive it to completion. */
export async function startRun(dataset: AgentDataset): Promise<RunRecord> {
  const seed = await createRun()
  return driveRun(seed, dataset)
}

/**
 * Create the run, return its id immediately, and drive the agents in the
 * background under that same id. POST /api/runs uses this so the response is
 * not blocked on completion while GET /api/runs/:id still shows live progress.
 */
export async function startRunDetached(dataset: AgentDataset): Promise<string> {
  const seed = await createRun()

  void driveRun(seed, dataset).catch(async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    await saveRun({
      ...seed,
      completedAt: new Date().toISOString(),
      agentRuns: seed.agentRuns.map((r) => ({ ...r, status: 'error' as const, error: message })),
    })
  })

  return seed.id
}
