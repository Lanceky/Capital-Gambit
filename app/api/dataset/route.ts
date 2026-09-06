import { NextResponse } from 'next/server'
import { clearStoredDataset, loadActiveDataset } from '@/lib/activeDataset'
import { DatasetUnavailableError } from '@/lib/dataset'

export const dynamic = 'force-dynamic'

/** GET /api/dataset — which dataset analysis runs currently read from. */
export async function GET() {
  try {
    const active = await loadActiveDataset()
    return NextResponse.json({
      origin: active.origin,
      label: active.label,
      savedAt: active.savedAt ?? null,
      files: active.files ?? [],
      derivedFields: active.derivedFields,
      company: active.dataset.company,
      summary: {
        ledgerRows: active.dataset.ledger.length,
        contractRows: active.dataset.contracts.length,
        arRows: active.dataset.ledger.filter((e) => e.kind === 'AR').length,
        apRows: active.dataset.ledger.filter((e) => e.kind === 'AP').length,
        counterparties: new Set(active.dataset.ledger.map((e) => e.counterparty)).size,
        vendors: new Set(active.dataset.contracts.map((c) => c.vendor)).size,
      },
    })
  } catch (err) {
    if (err instanceof DatasetUnavailableError) {
      return NextResponse.json({ origin: 'none', error: err.message }, { status: 404 })
    }
    throw err
  }
}

/** DELETE /api/dataset — disconnect the uploaded spreadsheet, reverting to fixtures. */
export async function DELETE() {
  const removed = await clearStoredDataset()
  return NextResponse.json({ disconnected: removed })
}
