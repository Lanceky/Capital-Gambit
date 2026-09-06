import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { AgentDataset, CompanyProfile, LedgerEntry, VendorContract } from './types'
import { loadFixtureDataset, parseCompany } from './dataset'

const ACTIVE_FILE = path.join(process.cwd(), '.data', 'dataset.json')

export interface UploadedFile {
  name: string
  kind: 'ledger' | 'contracts' | 'company'
  rows: number
}

export interface StoredDataset {
  savedAt: string
  files: UploadedFile[]
  ledger: LedgerEntry[]
  contracts: VendorContract[]
  company: CompanyProfile
  /**
   * Company fields we inferred from the ledger because no company profile was
   * uploaded. Surfaced in the UI so a derived revenue figure is never mistaken
   * for a reported one.
   */
  derivedFields: string[]
}

export interface ActiveDataset {
  dataset: AgentDataset
  origin: 'upload' | 'fixture'
  label: string
  savedAt?: string
  files?: UploadedFile[]
  derivedFields: string[]
}

/**
 * Infer a company profile from ledger activity when the user uploads
 * transactions but no company profile.
 *
 * Every field produced here is a proxy, not a reported figure: revenue is
 * annualized AR, cost of sales is annualized AP. The names of the fields we
 * guessed at are returned alongside so the UI can label them.
 */
export function deriveCompany(
  ledger: LedgerEntry[],
  existing?: CompanyProfile,
): { company: CompanyProfile; derivedFields: string[] } {
  const derived: string[] = []
  const ar = ledger.filter((e) => e.kind === 'AR')
  const ap = ledger.filter((e) => e.kind === 'AP')

  const dates = ledger
    .map((e) => Date.parse(e.date))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  const spanDays =
    dates.length > 1 ? Math.max(1, (dates[dates.length - 1] - dates[0]) / 86_400_000) : 365
  const annualize = (total: number) => Math.round((total / spanDays) * 365)

  const sum = (rows: LedgerEntry[]) => rows.reduce((s, e) => s + e.amountUsd, 0)

  const base: CompanyProfile = existing ?? parseCompany({})
  const company: CompanyProfile = { ...base }

  if (!existing || !base.annualRevenueUsd) {
    company.annualRevenueUsd = annualize(sum(ar))
    if (company.annualRevenueUsd > 0) derived.push('annualRevenueUsd')
  }
  if (!existing || !base.annualCogsUsd) {
    company.annualCogsUsd = annualize(sum(ap))
    if (company.annualCogsUsd > 0) derived.push('annualCogsUsd')
  }
  if (!existing || !base.cashBalanceUsd) {
    // No bank feed, so there is no defensible cash balance. Leave it at zero
    // rather than inventing one; the agent reports it as unknown.
    company.cashBalanceUsd = base.cashBalanceUsd ?? 0
  }
  if (!existing) {
    company.name = 'Uploaded dataset'
    company.costOfCapitalPct = 9
    derived.push('costOfCapitalPct')
  }
  return { company, derivedFields: derived }
}

export async function readStoredDataset(): Promise<StoredDataset | null> {
  try {
    const raw = await fs.readFile(ACTIVE_FILE, 'utf-8')
    return JSON.parse(raw) as StoredDataset
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function writeStoredDataset(stored: StoredDataset): Promise<void> {
  await fs.mkdir(path.dirname(ACTIVE_FILE), { recursive: true })
  await fs.writeFile(ACTIVE_FILE, JSON.stringify(stored, null, 2), 'utf-8')
}

export async function clearStoredDataset(): Promise<boolean> {
  try {
    await fs.unlink(ACTIVE_FILE)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

/**
 * The dataset every run and every provenance lookup reads from: an uploaded
 * spreadsheet if one has been connected, otherwise the bundled demo fixtures.
 */
export async function loadActiveDataset(): Promise<ActiveDataset> {
  const stored = await readStoredDataset()
  if (stored && stored.ledger.length > 0) {
    return {
      dataset: {
        ledger: stored.ledger,
        contracts: stored.contracts,
        company: stored.company,
      },
      origin: 'upload',
      label: stored.files.map((f) => f.name).join(', ') || 'Uploaded spreadsheet',
      savedAt: stored.savedAt,
      files: stored.files,
      derivedFields: stored.derivedFields,
    }
  }
  const dataset = await loadFixtureDataset()
  return {
    dataset,
    origin: 'fixture',
    label: `${dataset.company.name} (bundled demo data)`,
    derivedFields: [],
  }
}
