import { NextResponse } from 'next/server'
import { getRun, updateRun } from '@/lib/store'
import type { Decision, DecisionStatus, Move } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: DecisionStatus[] = ['approved', 'rejected', 'modified']

function isMove(value: unknown): value is Move {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.leverId === 'string' &&
    typeof m.title === 'string' &&
    typeof m.fromUse === 'string' &&
    typeof m.toUse === 'string' &&
    typeof m.amountUsd === 'number' &&
    Number.isFinite(m.amountUsd) &&
    typeof m.rationale === 'string'
  )
}

/**
 * POST /api/runs/:id/decision — record the human decision on a recommendation.
 *
 * This is the approval gate: nothing in the system acts on a recommendation
 * until a decision lands here, and unknown statuses are rejected outright.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const existing = await getRun(id)
  if (!existing) {
    return NextResponse.json({ error: `Run not found: ${id}` }, { status: 404 })
  }
  if (!existing.recommendation) {
    return NextResponse.json(
      { error: 'Run has no recommendation to decide on yet' },
      { status: 409 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>
  const status = payload.status

  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as DecisionStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }
  if (typeof payload.actor !== 'string' || payload.actor.trim() === '') {
    return NextResponse.json({ error: 'actor is required' }, { status: 400 })
  }
  if (payload.rationale !== undefined && typeof payload.rationale !== 'string') {
    return NextResponse.json({ error: 'rationale must be a string' }, { status: 400 })
  }

  let modifiedMoves: Move[] | undefined
  if (payload.modifiedMoves !== undefined) {
    if (!Array.isArray(payload.modifiedMoves) || !payload.modifiedMoves.every(isMove)) {
      return NextResponse.json(
        { error: 'modifiedMoves must be an array of valid Move objects' },
        { status: 400 },
      )
    }
    modifiedMoves = payload.modifiedMoves
  }
  if (status === 'modified' && (!modifiedMoves || modifiedMoves.length === 0)) {
    return NextResponse.json(
      { error: 'modifiedMoves is required when status is "modified"' },
      { status: 400 },
    )
  }

  const decision: Decision = {
    status: status as DecisionStatus,
    actor: payload.actor.trim(),
    at: new Date().toISOString(),
    rationale: typeof payload.rationale === 'string' ? payload.rationale : undefined,
    modifiedMoves,
  }

  const updated = await updateRun(id, { decision })
  return NextResponse.json(updated)
}
