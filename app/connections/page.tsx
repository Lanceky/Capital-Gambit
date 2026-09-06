'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

interface UploadSummary {
  ledgerRows: number
  contractRows: number
  arRows: number
  apRows: number
  counterparties: number
  vendors: number
}

interface RowError {
  row: number
  column: string
  message: string
}

const SOURCES = [
  {
    id: 'spreadsheet',
    label: 'Spreadsheet / CSV export',
    detail: 'Ledger and contract exports from the accounting system.',
    status: 'live' as const,
  },
  {
    id: 'fixtures',
    label: 'Meridian Instruments demo ledger',
    detail: '624 invoices and 25 vendor contracts across 12 months.',
    status: 'fixture' as const,
  },
  {
    id: 'plaid',
    label: 'Bank feed (Plaid)',
    detail:
      'Not wired up in this build. Cash position is derived from the ledger rather than from live bank balances, so any figure shown here would be inferred, not observed.',
    status: 'unavailable' as const,
  },
  {
    id: 'documents',
    label: 'Contract documents',
    detail: 'Parse renewal terms and notice periods straight from signed PDFs.',
    status: 'unavailable' as const,
  },
  {
    id: 'expenses',
    label: 'Expense management',
    detail: 'Card and reimbursement spend for cost-structure analysis.',
    status: 'unavailable' as const,
  },
  {
    id: 'crm',
    label: 'CRM pipeline',
    detail: 'Weighted pipeline for the revenue and forecast agent.',
    status: 'unavailable' as const,
  },
]

const BADGE: Record<string, { label: string; className: string }> = {
  live: { label: 'Connected', className: 'bg-emerald-100 text-emerald-800' },
  fixture: { label: 'Fixture data', className: 'bg-amber-100 text-amber-800' },
  unavailable: { label: 'Not connected', className: 'bg-slate-100 text-slate-500' },
}

export default function ConnectionsPage() {
  const [dragging, setDragging] = useState(false)
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [accepted, setAccepted] = useState<{ name: string; kind: string; rows: number }[]>([])
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    setRowErrors([])
    setSummary(null)
    setAccepted([])
    try {
      const form = new FormData()
      Array.from(files).forEach((f) => form.append('file', f))
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Upload failed')
        if (Array.isArray(body.rowErrors)) setRowErrors(body.rowErrors)
        return
      }
      setSummary(body.summary)
      setAccepted(body.accepted ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">Connections</h1>
            <p className="text-[11px] text-slate-500">
              Where Capital Gambit reads financial data from
            </p>
          </div>
          <Link
            href="/"
            className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
            Data sources
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOURCES.map((s) => {
              const badge = BADGE[s.status]
              return (
                <div
                  key={s.id}
                  className="flex flex-col rounded-lg border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xs font-semibold text-slate-900">{s.label}</h3>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-1.5 flex-1 text-[11px] leading-relaxed text-slate-600">
                    {s.detail}
                  </p>
                  {s.status === 'unavailable' && (
                    <button
                      disabled
                      className="mt-2.5 self-start rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-400"
                    >
                      Connect
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
            Upload a ledger or contract export
          </h2>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void upload(e.dataTransfer.files)
            }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
              dragging ? 'border-slate-500 bg-white' : 'border-slate-300 bg-white/60'
            }`}
          >
            <p className="text-xs font-medium text-slate-800">
              {busy ? 'Validating…' : 'Drop a CSV here, or click to choose a file'}
            </p>
            <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-slate-500">
              A ledger export needs kind, counterparty and amountUsd columns. A contract export
              needs vendor and annualValueUsd. The file type is detected from its headers.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              className="hidden"
              onChange={(e) => void upload(e.target.files)}
            />
          </div>

          {error && (
            <div className="mt-3 rounded border border-rose-300 bg-rose-50 px-4 py-3">
              <p className="text-xs font-medium text-rose-800">{error}</p>
              {rowErrors.length > 0 && (
                <table className="mt-2 w-full border-collapse text-[11px] tabular-nums">
                  <thead>
                    <tr className="text-left text-rose-700">
                      <th className="py-1 pr-3 font-medium">Row</th>
                      <th className="py-1 pr-3 font-medium">Column</th>
                      <th className="py-1 font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowErrors.map((e, i) => (
                      <tr key={i} className="border-t border-rose-200">
                        <td className="py-1 pr-3">{e.row}</td>
                        <td className="py-1 pr-3 font-mono">{e.column}</td>
                        <td className="py-1 text-rose-800">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {summary && (
            <div className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-medium text-emerald-900">
                Accepted {accepted.map((a) => `${a.name} (${a.kind}, ${a.rows} rows)`).join(', ')}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Ledger rows" value={summary.ledgerRows} />
                <Stat label="AR / AP" value={`${summary.arRows} / ${summary.apRows}`} />
                <Stat label="Counterparties" value={summary.counterparties} />
                <Stat label="Contracts" value={summary.contractRows} />
              </dl>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums text-emerald-950">{value}</dd>
    </div>
  )
}
