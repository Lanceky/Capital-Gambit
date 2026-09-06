import { NextResponse } from 'next/server'
import { DatasetUnavailableError, loadFixtureDataset } from '@/lib/dataset'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sources?ids=a,b,c — the actual ledger and contract rows behind a
 * finding's `evidence`. This is what makes provenance drill-down real: the UI
 * resolves SourceRef.rowIds to the rows an accountant can read.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const idsParam = url.searchParams.get('ids') ?? ''
  const ids = new Set(
    idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )

  if (ids.size === 0) {
    return NextResponse.json({ ledger: [], contracts: [] })
  }

  try {
    const dataset = await loadFixtureDataset()
    // Cap the response so a lever citing hundreds of rows cannot stall the UI.
    const ledger = dataset.ledger.filter((e) => ids.has(e.id)).slice(0, 500)
    const contracts = dataset.contracts.filter((c) => ids.has(c.id)).slice(0, 500)
    return NextResponse.json({
      ledger,
      contracts,
      requested: ids.size,
      returned: ledger.length + contracts.length,
    })
  } catch (err) {
    if (err instanceof DatasetUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
