'use client'

import { useMemo, useState } from 'react'
import type { Decision, Move, Recommendation, RunRecord, SourceRef } from '@/lib/types'
import { usd } from '@/lib/format'

interface Props {
  run: RunRecord
  recommendation: Recommendation
  onInspect: (title: string, evidence: SourceRef[]) => void
  onDecided: (updated: RunRecord) => void
}

const USE_OPTIONS = [
  'Revolver paydown',
  'Sales capacity',
  'Product investment',
  'Operating cash buffer',
]

export default function SynthesisPanel({ run, recommendation, onInspect, onDecided }: Props) {
  const [moves, setMoves] = useState<Move[]>(recommendation.moves)
  const [rationale, setRationale] = useState('')
  const [actor, setActor] = useState('A. Rhodes, CFO')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Moves the CFO has struck from the plan entirely.
  const [dropped, setDropped] = useState<Set<string>>(new Set())

  const decision = run.decision

  const original = useMemo(
    () => new Map(recommendation.moves.map((m) => [m.id, m])),
    [recommendation.moves],
  )

  const activeMoves = moves.filter((m) => !dropped.has(m.id))
  const proposedTotal = recommendation.moves.reduce((s, m) => s + m.amountUsd, 0)
  const committedTotal = activeMoves.reduce((s, m) => s + m.amountUsd, 0)
  const isModified =
    dropped.size > 0 ||
    moves.some((m) => {
      const o = original.get(m.id)
      return !o || o.amountUsd !== m.amountUsd || o.toUse !== m.toUse
    })

  function updateMove(id: string, patch: Partial<Move>) {
    setMoves((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function toggleDropped(id: string) {
    setDropped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(status: Decision['status']) {
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        status,
        actor,
        rationale: rationale.trim() || undefined,
      }
      if (status === 'modified') body.modifiedMoves = activeMoves

      const res = await fetch(`/api/runs/${run.id}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Decision failed')
      onDecided(payload as RunRecord)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-300 bg-white">
      <header className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Allocation proposal — awaiting human approval
        </p>
        <h2 className="mt-1.5 text-base font-semibold leading-snug text-slate-900">
          {recommendation.headline}
        </h2>
      </header>

      {/* The trade-off is the concept in one line, so it carries visual weight. */}
      <div className="grid gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-2">
        <div className="bg-amber-50/60 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            What we give up now
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            {recommendation.tradeOff.give}
          </p>
        </div>
        <div className="bg-emerald-50/60 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
            What we gain next cycle
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            {recommendation.tradeOff.get}
          </p>
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Reasoning chain
          </p>
          <ol className="space-y-2">
            {recommendation.reasoning.map((step) => (
              <li key={step.n} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                  {step.n}
                </span>
                <div className="min-w-0">
                  <p className="text-xs leading-relaxed text-slate-700">{step.statement}</p>
                  {step.evidence.length > 0 && (
                    <button
                      onClick={() => onInspect(`Step ${step.n}`, step.evidence)}
                      className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-700 hover:text-sky-900"
                    >
                      {step.evidence.reduce((n, e) => n + e.rowIds.length, 0)} source rows
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Proposed moves
            </p>
            {!decision && isModified && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Modified
              </span>
            )}
          </div>

          <ul className="space-y-2">
            {moves.map((move) => {
              const o = original.get(move.id)
              const isDropped = dropped.has(move.id)
              const changed =
                o && (o.amountUsd !== move.amountUsd || o.toUse !== move.toUse)
              return (
                <li
                  key={move.id}
                  className={`rounded border px-3 py-2 ${
                    isDropped
                      ? 'border-slate-200 bg-slate-50 opacity-60'
                      : changed
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] leading-snug text-slate-600">
                      <span className="text-slate-500">{move.fromUse}</span>
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400">to</span>
                    {decision ? (
                      <span className="text-xs font-medium text-slate-900">{move.toUse}</span>
                    ) : (
                      <select
                        value={move.toUse}
                        disabled={isDropped}
                        onChange={(e) => updateMove(move.id, { toUse: e.target.value })}
                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-900 disabled:opacity-50"
                      >
                        {USE_OPTIONS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    )}
                    {decision ? (
                      <span className="ml-auto text-xs font-semibold tabular-nums text-slate-900">
                        {usd(move.amountUsd)}
                      </span>
                    ) : (
                      <>
                        <input
                          type="number"
                          value={Math.round(move.amountUsd)}
                          disabled={isDropped}
                          min={0}
                          step={1000}
                          onChange={(e) =>
                            updateMove(move.id, { amountUsd: Number(e.target.value) || 0 })
                          }
                          className="ml-auto w-28 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs tabular-nums text-slate-900 disabled:opacity-50"
                        />
                        <button
                          onClick={() => toggleDropped(move.id)}
                          className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                        >
                          {isDropped ? 'Restore' : 'Drop'}
                        </button>
                      </>
                    )}
                  </div>
                  {changed && o && !isDropped && (
                    <p className="mt-1 text-[10px] text-amber-700">
                      Originally {usd(o.amountUsd)} to {o.toUse}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-2 text-xs">
            <span className="text-slate-500">Capital committed</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {usd(committedTotal)}
              <span className="ml-1.5 font-normal text-slate-400">of {usd(proposedTotal)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Approval gate */}
      {!decision ? (
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Approver
              </span>
              <input
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                className="w-56 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Rationale (optional)
              </span>
              <input
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Why this decision?"
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={busy || activeMoves.length === 0}
              onClick={() => submit(isModified ? 'modified' : 'approved')}
              className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {isModified ? 'Approve with modifications' : 'Approve plan'}
            </button>
            <button
              disabled={busy}
              onClick={() => submit('rejected')}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Reject
            </button>
            <p className="ml-auto self-center text-[11px] text-slate-500">
              Nothing executes until approved. This system proposes; a human decides.
            </p>
          </div>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </div>
      ) : (
        <PostDecision
          decision={decision}
          proposedTotal={proposedTotal}
          originalMoves={recommendation.moves}
        />
      )}
    </section>
  )
}

function PostDecision({
  decision,
  proposedTotal,
  originalMoves,
}: {
  decision: Decision
  proposedTotal: number
  originalMoves: Move[]
}) {
  const finalMoves = decision.modifiedMoves ?? originalMoves
  const committed = decision.status === 'rejected' ? 0 : finalMoves.reduce((s, m) => s + m.amountUsd, 0)
  const uncommitted = proposedTotal - committed
  const originalById = new Map(originalMoves.map((m) => [m.id, m]))

  const changes = (decision.modifiedMoves ?? [])
    .map((m) => {
      const o = originalById.get(m.id)
      if (!o) return `${m.title} added`
      if (o.amountUsd !== m.amountUsd || o.toUse !== m.toUse) {
        return `${usd(o.amountUsd)} to ${o.toUse} changed to ${usd(m.amountUsd)} to ${m.toUse}`
      }
      return null
    })
    .filter((c): c is string => c !== null)

  const droppedMoves = originalMoves.filter(
    (o) => decision.modifiedMoves && !decision.modifiedMoves.some((m) => m.id === o.id),
  )

  const tone =
    decision.status === 'approved'
      ? 'border-emerald-300 bg-emerald-50'
      : decision.status === 'modified'
        ? 'border-amber-300 bg-amber-50'
        : 'border-rose-300 bg-rose-50'

  return (
    <div className={`border-t px-5 py-4 ${tone}`}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-800">
          {decision.status}
        </p>
        <p className="text-xs text-slate-700">
          {decision.actor} · {new Date(decision.at).toISOString().replace('T', ' ').slice(0, 19)} UTC
        </p>
      </div>
      {decision.rationale && (
        <p className="mt-1.5 text-xs italic text-slate-700">“{decision.rationale}”</p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Capital committed
          </dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900">{usd(committed)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Still uncommitted
          </dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900">{usd(uncommitted)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Versus proposal
          </dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900">
            {committed === proposedTotal ? 'Unchanged' : usd(committed - proposedTotal)}
          </dd>
        </div>
      </dl>

      {(changes.length > 0 || droppedMoves.length > 0) && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Human corrections recorded
          </p>
          <ul className="mt-1 space-y-0.5">
            {changes.map((c, i) => (
              <li key={i} className="text-[11px] text-slate-700">
                {c}
              </li>
            ))}
            {droppedMoves.map((m) => (
              <li key={m.id} className="text-[11px] text-slate-700">
                {usd(m.amountUsd)} to {m.toUse} removed from the plan
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
