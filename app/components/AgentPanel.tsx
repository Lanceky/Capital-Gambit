'use client'

import type { AgentRun, SourceRef } from '@/lib/types'
import { elapsedMs, usd } from '@/lib/format'

const AGENT_LABELS: Record<string, string> = {
  cash: 'Cash & Working Capital',
  cost: 'Cost Structure',
  revenue: 'Revenue & Forecast',
  synthesis: 'Allocation & Synthesis',
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-sky-100 text-sky-800',
  complete: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-slate-100 text-slate-500',
  error: 'bg-rose-100 text-rose-800',
}

interface Props {
  run: AgentRun
  onInspect: (title: string, evidence: SourceRef[]) => void
}

export default function AgentPanel({ run, onInspect }: Props) {
  const ms = elapsedMs(run.startedAt, run.completedAt)
  const label = AGENT_LABELS[run.agentId] ?? run.agentId

  return (
    <section className="flex flex-col rounded-lg border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{label}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {run.live ? 'Live analysis' : 'Not live — interface placeholder'}
            {ms !== null && ` · ${ms}ms`}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            STATUS_STYLES[run.status] ?? STATUS_STYLES.pending
          }`}
        >
          {run.status === 'running' && (
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-600 align-middle" />
          )}
          {run.status}
        </span>
      </header>

      <div className="flex-1 px-4 py-3">
        {run.error && <p className="text-xs text-rose-700">{run.error}</p>}

        {!run.live && run.status === 'skipped' && (
          <p className="text-xs text-slate-500">
            Scoped out of this build. The interface is implemented so this agent can be added
            without changing the orchestrator or the dashboard.
          </p>
        )}

        {run.levers.length > 0 && (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Levers, ranked by impact
            </p>
            <ul className="space-y-2">
              {run.levers.map((lever) => {
                const finding = run.findings.find((f) => lever.findingIds.includes(f.id))
                return (
                  <li key={lever.id}>
                    <button
                      onClick={() =>
                        onInspect(lever.title, finding ? finding.evidence : [])
                      }
                      className="group w-full rounded border border-slate-200 px-3 py-2 text-left hover:border-slate-400 hover:bg-slate-50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-medium text-slate-900">{lever.title}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-700">
                          {usd(lever.impactUsd)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                        {lever.description}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400 group-hover:text-slate-600">
                        {lever.effort} effort
                        {lever.impactDays !== undefined && ` · ${lever.impactDays} days`} · view
                        source rows
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {run.findings.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Findings
            </p>
            <ul className="space-y-1.5">
              {run.findings.map((finding) => (
                <li key={finding.id}>
                  <button
                    onClick={() => onInspect(finding.title, finding.evidence)}
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs text-slate-800">{finding.title}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
                        {finding.confidence}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                      {finding.detail}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
