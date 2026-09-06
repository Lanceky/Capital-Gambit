'use client'

import { useEffect, useState } from 'react'
import type { LedgerEntry, SourceRef, VendorContract } from '@/lib/types'
import { shortDate, usdPrecise } from '@/lib/format'

interface Props {
  title: string
  evidence: SourceRef[]
  onClose: () => void
}

interface SourceResponse {
  ledger: LedgerEntry[]
  contracts: VendorContract[]
  requested?: number
  returned?: number
}

const EMPTY: SourceResponse = { ledger: [], contracts: [] }

/**
 * Provenance drill-down. Resolves a finding's SourceRef row ids to the actual
 * ledger and contract rows so "where does this number come from?" is answered
 * in one click.
 */
export default function EvidenceDrawer({ title, evidence, onClose }: Props) {
  const [data, setData] = useState<SourceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ids = Array.from(new Set(evidence.flatMap((e) => e.rowIds)))
  const key = ids.join(',')
  const resolved: SourceResponse | null = ids.length === 0 ? EMPTY : data

  useEffect(() => {
    if (key === '') return
    let cancelled = false
    fetch(`/api/sources?ids=${encodeURIComponent(key)}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error ?? 'Failed to load source rows')
        return body as SourceResponse
      })
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close evidence"
        className="absolute inset-0 bg-slate-950/60"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Source rows
            </p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {evidence.map((ref, i) => (
            <p key={i} className="mb-1 text-xs text-slate-600">
              <span className="font-medium text-slate-800">{ref.label}</span>
              <span className="text-slate-400">
                {' '}
                — {ref.kind}, {ref.rowIds.length} row{ref.rowIds.length === 1 ? '' : 's'}, source{' '}
                {ref.sourceId}
              </span>
            </p>
          ))}

          {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
          {!resolved && !error && <p className="mt-4 text-sm text-slate-500">Loading source rows…</p>}

          {resolved && resolved.ledger.length > 0 && (
            <table className="mt-4 w-full border-collapse text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-600">
                  <th className="py-1.5 pr-3 font-medium">Row</th>
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium">Type</th>
                  <th className="py-1.5 pr-3 font-medium">Counterparty</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Amount</th>
                  <th className="py-1.5 pr-3 font-medium">Due</th>
                  <th className="py-1.5 pr-3 font-medium">Paid</th>
                  <th className="py-1.5 text-right font-medium">Terms</th>
                </tr>
              </thead>
              <tbody>
                {resolved.ledger.map((row) => {
                  const late =
                    row.paidDate &&
                    new Date(row.paidDate).getTime() > new Date(row.dueDate).getTime()
                  return (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-500">{row.id}</td>
                      <td className="py-1.5 pr-3">{shortDate(row.date)}</td>
                      <td className="py-1.5 pr-3">{row.kind}</td>
                      <td className="py-1.5 pr-3 text-slate-800">{row.counterparty}</td>
                      <td className="py-1.5 pr-3 text-right">{usdPrecise(row.amountUsd)}</td>
                      <td className="py-1.5 pr-3">{shortDate(row.dueDate)}</td>
                      <td className={`py-1.5 pr-3 ${late ? 'font-medium text-amber-700' : ''}`}>
                        {row.paidDate ? shortDate(row.paidDate) : 'Open'}
                      </td>
                      <td className="py-1.5 text-right">{row.termsDays}d</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {resolved && resolved.contracts.length > 0 && (
            <table className="mt-6 w-full border-collapse text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-600">
                  <th className="py-1.5 pr-3 font-medium">Row</th>
                  <th className="py-1.5 pr-3 font-medium">Vendor</th>
                  <th className="py-1.5 pr-3 font-medium">Category</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Annual value</th>
                  <th className="py-1.5 pr-3 font-medium">Renews</th>
                  <th className="py-1.5 pr-3 font-medium">Cancellable</th>
                  <th className="py-1.5 text-right font-medium">Notice</th>
                </tr>
              </thead>
              <tbody>
                {resolved.contracts.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-500">{row.id}</td>
                    <td className="py-1.5 pr-3 text-slate-800">{row.vendor}</td>
                    <td className="py-1.5 pr-3">{row.category}</td>
                    <td className="py-1.5 pr-3 text-right">{usdPrecise(row.annualValueUsd)}</td>
                    <td className="py-1.5 pr-3">{shortDate(row.renewalDate)}</td>
                    <td className="py-1.5 pr-3">{row.cancellable ? 'Yes' : 'No'}</td>
                    <td className="py-1.5 text-right">{row.noticeDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {resolved && resolved.ledger.length === 0 && resolved.contracts.length === 0 && !error && (
            <p className="mt-4 text-sm text-slate-500">
              No source rows resolved for this item.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
