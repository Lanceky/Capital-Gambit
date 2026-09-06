'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

interface UploadSummary {
  ledgerRows: number
  contractRows: number
  arRows: number
  apRows: number
  counterparties: number
  vendors: number
}

interface ActiveDataset {
  origin: 'upload' | 'fixture' | 'none'
  label: string
  savedAt: string | null
  files: { name: string; kind: string; rows: number }[]
  derivedFields: string[]
  company: { name: string; annualRevenueUsd: number; costOfCapitalPct: number }
  summary: UploadSummary
}

interface RowError {
  row: number
  column: string
  message: string
}

type Status = 'live' | 'fixture' | 'unavailable'

interface SourceCard {
  id: string
  label: string
  detail: string
  status: Status
  /** Spreadsheet is the one source a user can actually act on from here. */
  action?: 'choose' | 'disconnect' | 'use-demo'
}

/** The first two cards reflect which dataset runs are actually reading from. */
function sourceCards(active: ActiveDataset | null): SourceCard[] {
  const uploaded = active?.origin === 'upload'
  return [
    {
      id: 'spreadsheet',
      label: 'Spreadsheet (Excel or CSV)',
      detail: uploaded
        ? `Active. Analysis runs read ${active.summary.ledgerRows} ledger rows and ` +
          `${active.summary.contractRows} contracts from your upload.`
        : 'Upload an .xlsx workbook or CSV export below to analyze your own data instead of the demo ledger.',
      status: uploaded ? 'live' : 'unavailable',
      action: uploaded ? 'disconnect' : 'choose',
    },
    {
      id: 'fixtures',
      label: 'Meridian Instruments demo ledger',
      detail: uploaded
        ? 'Superseded by your uploaded spreadsheet. Disconnect the upload to return to it.'
        : '624 invoices and 25 vendor contracts across 12 months. Currently driving analysis.',
      status: uploaded ? 'unavailable' : 'fixture',
      action: uploaded ? 'use-demo' : undefined,
    },
    {
      id: 'plaid',
      label: 'Bank feed (Plaid)',
      detail:
        'Not wired up in this build. Cash position is derived from the ledger rather than from live bank balances, so any figure shown here would be inferred, not observed.',
      status: 'unavailable',
    },
    {
      id: 'documents',
      label: 'Contract documents',
      detail: 'Parse renewal terms and notice periods straight from signed PDFs.',
      status: 'unavailable',
    },
    {
      id: 'expenses',
      label: 'Expense management',
      detail: 'Card and reimbursement spend for cost-structure analysis.',
      status: 'unavailable',
    },
    {
      id: 'crm',
      label: 'CRM pipeline',
      detail: 'Weighted pipeline for the revenue and forecast agent.',
      status: 'unavailable',
    },
  ]
}

const BADGE: Record<string, { label: string; className: string }> = {
  live: { label: 'Connected', className: 'bg-emerald-100 text-emerald-800' },
  fixture: { label: 'Fixture data', className: 'bg-amber-100 text-amber-800' },
  unavailable: { label: 'Not connected', className: 'bg-slate-100 text-slate-500' },
}

export default function ConnectionsPage() {
  const [dragging, setDragging] = useState(false)
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [accepted, setAccepted] = useState<{ name: string; kind: string; rows: number }[]>([])
  const [ignored, setIgnored] = useState<{ name: string; reason: string }[]>([])
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<ActiveDataset | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refreshActive = useCallback(async () => {
    try {
      const res = await fetch('/api/dataset')
      setActive(res.ok ? ((await res.json()) as ActiveDataset) : null)
    } catch {
      setActive(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/dataset')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setActive(body as ActiveDataset | null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  async function disconnect() {
    setBusy(true)
    try {
      await fetch('/api/dataset', { method: 'DELETE' })
      setSummary(null)
      setAccepted([])
      await refreshActive()
    } finally {
      setBusy(false)
    }
  }

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
      setIgnored(body.ignored ?? [])
      await refreshActive()
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
        {active && (
          <section
            className={`mb-6 rounded-lg border px-5 py-4 ${
              active.origin === 'upload'
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-amber-300 bg-amber-50'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                  Analysis is running against
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{active.label}</p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {active.summary.ledgerRows} ledger rows ({active.summary.arRows} AR /{' '}
                  {active.summary.apRows} AP), {active.summary.counterparties} counterparties,{' '}
                  {active.summary.contractRows} contracts
                  {active.savedAt
                    ? ` · connected ${new Date(active.savedAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
              {active.origin === 'upload' && (
                <button
                  onClick={disconnect}
                  disabled={busy}
                  className="rounded border border-slate-400 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>

            {active.summary.contractRows === 0 && active.origin === 'upload' && (
              <p className="mt-3 border-t border-emerald-200 pt-2 text-[11px] text-slate-700">
                No contract export connected, so renewal levers cannot be identified. Upload a
                contracts CSV to include them.
              </p>
            )}

            {active.derivedFields.length > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-700">
                <span className="font-semibold">Inferred, not reported:</span>{' '}
                {active.derivedFields.join(', ')} were estimated from ledger activity because no
                company profile was uploaded. Upload a company JSON to replace these with your own
                figures.
              </p>
            )}
          </section>
        )}

        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
            Data sources
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sourceCards(active).map((s) => {
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
                  {s.action === 'choose' && (
                    <button
                      onClick={() => inputRef.current?.click()}
                      disabled={busy}
                      className="mt-2.5 self-start rounded bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Choose file
                    </button>
                  )}
                  {s.action === 'disconnect' && (
                    <button
                      onClick={disconnect}
                      disabled={busy}
                      className="mt-2.5 self-start rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                  {s.action === 'use-demo' && (
                    <button
                      onClick={disconnect}
                      disabled={busy}
                      className="mt-2.5 self-start rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Use demo data
                    </button>
                  )}
                  {!s.action && s.status === 'unavailable' && (
                    <button
                      disabled
                      title="Not implemented in this build"
                      className="mt-2.5 self-start cursor-not-allowed rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-400"
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
              {busy ? 'Validating…' : 'Drop a spreadsheet here, or click to choose a file'}
            </p>
            <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-slate-500">
              Excel (.xlsx) or CSV. A ledger export needs kind, counterparty and amountUsd
              columns; a contract export needs vendor and annualValueUsd; a company profile can be
              supplied as JSON. The type is detected from the contents, and an accepted file
              immediately becomes the dataset every subsequent analysis run reads from. A workbook
              may hold each of these on its own tab.
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              No data to hand?{' '}
              <a
                href="/sample-workbook.xlsx"
                download
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-slate-800 underline underline-offset-2 hover:text-slate-950"
              >
                Download a sample workbook
              </a>{' '}
              — a three-tab Excel file for a fictional company.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.json,application/json"
              multiple
              className="hidden"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                void upload(e.target.files)
                // Allow re-selecting the same file after a disconnect.
                e.target.value = ''
              }}
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
                Connected {accepted.map((a) => `${a.name} (${a.kind}, ${a.rows} rows)`).join(', ')}.
              Analysis runs now use this data.
              </p>
              {ignored.length > 0 && (
                <p className="mt-1 text-[11px] text-emerald-800">
                  Skipped {ignored.map((i) => `${i.name} — ${i.reason}`).join('; ')}.
                </p>
              )}
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
