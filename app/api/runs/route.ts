import { NextResponse } from 'next/server'
import { DatasetUnavailableError } from '@/lib/dataset'
import { loadActiveDataset } from '@/lib/activeDataset'
import { startRunDetached } from '@/lib/orchestrator'
import { listRuns } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** GET /api/runs — every run, newest first. */
export async function GET() {
  const runs = await listRuns()
  return NextResponse.json({ runs })
}

/**
 * POST /api/runs — start a run against the active dataset and return the id
 * immediately. The agents continue in the background; poll GET /api/runs/:id.
 */
export async function POST() {
  try {
    const { dataset } = await loadActiveDataset()
    const id = await startRunDetached(dataset)
    return NextResponse.json({ id }, { status: 202 })
  } catch (err) {
    if (err instanceof DatasetUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
