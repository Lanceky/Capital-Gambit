import { NextResponse } from 'next/server'
import { getRun } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** GET /api/runs/:id — current run record. Safe to poll. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const run = await getRun(id)
  if (!run) {
    return NextResponse.json({ error: `Run not found: ${id}` }, { status: 404 })
  }
  return NextResponse.json(run)
}
