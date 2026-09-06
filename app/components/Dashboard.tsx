'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRun, RunRecord, SourceRef } from '@/lib/types'
import { usd } from '@/lib/format'
import AgentPanel from './AgentPanel'
import EvidenceDrawer from './EvidenceDrawer'
import SynthesisPanel from './SynthesisPanel'

interface Metrics {
  dso: number | null
  dpo: number | null
  ccc: number | null
  freed: number
}

/** DSO/DPO/CCC are parsed from the cash agent's headline finding. */
function readMetrics(record: RunRecord | null): Metrics {
  const empty: Metrics = { dso: null, dpo: null, ccc: null, freed: 0 }
  if (!record) return empty
  const cash = record.agentRuns.find((a) => a.agentId === 'cash')
  if (!cash) return empty

  const freed = cash.levers.reduce((s, l) => s + l.impactUsd, 0)
  const headline = cash.findings.find((f) => f.id === 'cash-working-capital-position')
  if (!headline) return { ...empty, freed }

  const num = (label: string): number | null => {
    const m = headline.detail.match(new RegExp(`${label}\\s+(-?[\\d.]+)\\s+days`))
    return m ? Number(m[1]) : null
  }
  return {
    dso: num('DSO'),
    dpo: num('DPO'),
    ccc: headline.impactDays ?? null,
    freed,
  }
}

export default function Dashboard() {
  const [record, setRecord] = useState<RunRecord | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<{ title: string; evidence: SourceRef[] } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Load the most recent run so a refresh does not lose the demo state.
  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((body) => {
        if (Array.isArray(body.runs) && body.runs.length > 0) setRecord(body.runs[0])
      })
      .catch(() => undefined)
    return stopPolling
  }, [stopPolling])

  const poll = useCallback(
    (id: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/runs/${id}`)
          if (!res.ok) return
          const next = (await res.json()) as RunRecord
          setRecord(next)
          if (next.completedAt) stopPolling()
        } catch {
          // Transient poll failures are ignored; the next tick retries.
        }
      }, 400)
    },
    [stopPolling],
  )

  async function startRun() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/runs', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not start run')
      setRecord(null)
      poll(body.id)
      const first = await fetch(`/api/runs/${body.id}`)
      if (first.ok) setRecord((await first.json()) as RunRecord)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  const metrics = readMetrics(record)
  const synthesisRun = record?.agentRuns.find((a) => a.agentId === 'synthesis')
  const analysisRuns: AgentRun[] = record
    ? record.agentRuns.filter((a) => a.agentId !== 'synthesis')
    : []

  const inspect = (title: string, evidence: SourceRef[]) => setDrawer({ title, evidence })

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-4">
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">Capital Gambit</h1>
            <p className="text-[11px] text-slate-500">
              Autonomous Office of the CFO — working capital reallocation
            </p>
          </div>
          <nav className="ml-auto flex items-center gap-3">
            <Link
              href="/connections"
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Connections
            </Link>
            <button
              onClick={startRun}
              disabled={starting}
              className="rounded bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {starting ? 'Starting…' : 'Run analysis'}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <div className="mb-5 rounded border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            {error}
          </div>
        )}

        {!record && !error && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-800">No analysis run yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
              Start a run to analyze the cash conversion cycle, identify where working capital is
              trapped, and receive a reallocation proposal for your approval.
            </p>
          </div>
        )}

        {record && (
          <>
            <section className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
              <Metric label="Days sales outstanding" value={fmtDays(metrics.dso)} />
              <Metric label="Days payable outstanding" value={fmtDays(metrics.dpo)} />
              <Metric label="Cash conversion cycle" value={fmtDays(metrics.ccc)} />
              <Metric
                label="Redeployable capital"
                value={usd(metrics.freed)}
                emphasis
              />
            </section>

            <section className="mb-6">
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Analysis agents
                </h2>
                <p className="text-[11px] text-slate-500">
                  Dispatched concurrently; synthesis is gated on all of them completing.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {analysisRuns.map((agentRun) => (
                  <AgentPanel key={agentRun.agentId} run={agentRun} onInspect={inspect} />
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                Allocation & synthesis
              </h2>
              {record.recommendation ? (
                <SynthesisPanel
                  run={record}
                  recommendation={record.recommendation}
                  onInspect={inspect}
                  onDecided={setRecord}
                />
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white px-5 py-6 text-xs text-slate-500">
                  {synthesisRun?.status === 'running'
                    ? 'Synthesizing a reallocation proposal…'
                    : 'Waiting for the analysis agents to complete.'}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {drawer && (
        <EvidenceDrawer
          title={drawer.title}
          evidence={drawer.evidence}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}

function fmtDays(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}`
}

function Metric({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          emphasis ? 'text-emerald-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
