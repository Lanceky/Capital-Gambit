import type { AgentDataset, AgentRun } from '@/lib/types'

/**
 * Cost Structure agent — interface placeholder.
 *
 * Deliberately not built out for this milestone. It returns a skipped run with
 * `live: false` so the orchestrator and dashboard can render all four agents
 * honestly rather than implying analysis that did not happen.
 */
export async function runCostAgent(_data: AgentDataset): Promise<AgentRun> {
  const now = new Date().toISOString()
  return {
    agentId: 'cost',
    status: 'skipped',
    startedAt: now,
    completedAt: now,
    findings: [],
    levers: [],
    live: false,
  }
}
