import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { RunRecord } from './types'

// Runs are stored as plain JSON files under .data/runs/<id>.json.
const RUNS_DIR = path.join(process.cwd(), '.data', 'runs')

async function ensureRunsDir(): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true })
}

function runFilePath(id: string): string {
  return path.join(RUNS_DIR, `${id}.json`)
}

async function readRun(id: string): Promise<RunRecord | null> {
  try {
    const raw = await fs.readFile(runFilePath(id), 'utf-8')
    return JSON.parse(raw) as RunRecord
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw err
  }
}

export async function saveRun(run: RunRecord): Promise<void> {
  await ensureRunsDir()
  await fs.writeFile(runFilePath(run.id), JSON.stringify(run, null, 2), 'utf-8')
}

export async function getRun(id: string): Promise<RunRecord | null> {
  return readRun(id)
}

export async function listRuns(): Promise<RunRecord[]> {
  await ensureRunsDir()
  const names = await fs.readdir(RUNS_DIR)
  const runs: RunRecord[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue
    }
    const id = name.slice(0, -'.json'.length)
    const run = await readRun(id)
    if (run) {
      runs.push(run)
    }
  }
  runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
  return runs
}

export async function updateRun(id: string, patch: Partial<RunRecord>): Promise<RunRecord> {
  const existing = await readRun(id)
  if (!existing) {
    throw new Error(`Run not found: ${id}`)
  }
  const updated: RunRecord = { ...existing, ...patch }
  await saveRun(updated)
  return updated
}
