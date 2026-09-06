import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { AgentDataset, CompanyProfile, LedgerEntry, VendorContract } from '@/lib/types'

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures')

export class DatasetUnavailableError extends Error {}

/** Row-level parse failure, reported back to the uploader verbatim. */
export interface RowError {
  row: number
  column: string
  message: string
}

export class CsvValidationError extends Error {
  readonly errors: RowError[]
  constructor(errors: RowError[]) {
    super(`${errors.length} row(s) failed validation`)
    this.errors = errors
  }
}

/**
 * Minimal RFC4180-ish CSV reader: handles quoted fields, escaped quotes and
 * embedded commas or newlines. Deliberately dependency-free.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function headerIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>()
  header.forEach((name, i) => map.set(name.trim().toLowerCase(), i))
  return map
}

function pick(cols: Map<string, number>, row: string[], names: string[]): string {
  for (const name of names) {
    const i = cols.get(name)
    if (i !== undefined && row[i] !== undefined) return row[i].trim()
  }
  return ''
}

function toNumber(raw: string): number {
  // Tolerate currency formatting in hand-authored fixtures.
  const cleaned = raw.replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

/** Detect which of the two shapes a CSV is from its headers alone. */
export function detectCsvKind(header: string[]): 'ledger' | 'contracts' | 'unknown' {
  const cols = headerIndex(header)
  if (cols.has('kind') && cols.has('counterparty') && cols.has('amountusd')) return 'ledger'
  if (cols.has('vendor') && cols.has('annualvalueusd')) return 'contracts'
  return 'unknown'
}

export function parseLedgerCsv(text: string, sourceId = 'upload-ledger'): LedgerEntry[] {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new CsvValidationError([{ row: 0, column: '-', message: 'File is empty' }])
  const cols = headerIndex(rows[0])
  const errors: RowError[] = []
  const out: LedgerEntry[] = []

  rows.slice(1).forEach((row, i) => {
    const lineNo = i + 2
    const kind = pick(cols, row, ['kind']).toUpperCase()
    const amount = toNumber(pick(cols, row, ['amountusd', 'amount']))
    const date = pick(cols, row, ['date', 'invoicedate'])
    const dueDate = pick(cols, row, ['duedate', 'due'])
    const counterparty = pick(cols, row, ['counterparty', 'customer', 'vendor', 'name'])
    const terms = toNumber(pick(cols, row, ['termsdays', 'terms']) || '0')

    if (kind !== 'AR' && kind !== 'AP') {
      errors.push({ row: lineNo, column: 'kind', message: `Expected AR or AP, got "${kind}"` })
      return
    }
    if (!Number.isFinite(amount)) {
      errors.push({ row: lineNo, column: 'amountUsd', message: 'Not a number' })
      return
    }
    if (!date) {
      errors.push({ row: lineNo, column: 'date', message: 'Missing invoice date' })
      return
    }
    if (!counterparty) {
      errors.push({ row: lineNo, column: 'counterparty', message: 'Missing counterparty' })
      return
    }

    const paidDate = pick(cols, row, ['paiddate', 'paid'])
    out.push({
      id: pick(cols, row, ['id']) || `${sourceId}-${lineNo}`,
      date,
      kind,
      counterparty,
      amountUsd: amount,
      dueDate: dueDate || date,
      paidDate: paidDate || undefined,
      termsDays: Number.isFinite(terms) ? terms : 0,
      invoiceId: pick(cols, row, ['invoiceid', 'invoice']) || `${sourceId}-${lineNo}`,
      sourceId: pick(cols, row, ['sourceid']) || sourceId,
    })
  })

  if (errors.length > 0) throw new CsvValidationError(errors)
  return out
}

export function parseContractsCsv(text: string, sourceId = 'upload-contracts'): VendorContract[] {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new CsvValidationError([{ row: 0, column: '-', message: 'File is empty' }])
  const cols = headerIndex(rows[0])
  const errors: RowError[] = []
  const out: VendorContract[] = []

  rows.slice(1).forEach((row, i) => {
    const lineNo = i + 2
    const vendor = pick(cols, row, ['vendor', 'counterparty', 'name'])
    const value = toNumber(pick(cols, row, ['annualvalueusd', 'annualvalue', 'value']))
    if (!vendor) {
      errors.push({ row: lineNo, column: 'vendor', message: 'Missing vendor' })
      return
    }
    if (!Number.isFinite(value)) {
      errors.push({ row: lineNo, column: 'annualValueUsd', message: 'Not a number' })
      return
    }
    const cancellableRaw = pick(cols, row, ['cancellable']).toLowerCase()
    const notice = toNumber(pick(cols, row, ['noticedays', 'notice']) || '0')
    out.push({
      id: pick(cols, row, ['id']) || `${sourceId}-${lineNo}`,
      vendor,
      annualValueUsd: value,
      renewalDate: pick(cols, row, ['renewaldate', 'renewal']),
      category: pick(cols, row, ['category']) || 'Uncategorized',
      cancellable: cancellableRaw === 'true' || cancellableRaw === 'yes' || cancellableRaw === '1',
      noticeDays: Number.isFinite(notice) ? notice : 0,
      sourceId: pick(cols, row, ['sourceid']) || sourceId,
    })
  })

  if (errors.length > 0) throw new CsvValidationError(errors)
  return out
}

/**
 * Company profile reader. Accepts several plausible key spellings because the
 * fixture file is authored by a separate track; a missing figure becomes 0
 * rather than NaN so downstream ratios stay finite.
 */
export function parseCompany(raw: unknown): CompanyProfile {
  const o = (raw ?? {}) as Record<string, unknown>
  const num = (...keys: string[]): number => {
    for (const k of keys) {
      const v = o[k]
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string') {
        const n = toNumber(v)
        if (Number.isFinite(n)) return n
      }
    }
    return 0
  }
  const costOfCapital = num('costOfCapitalPct', 'costOfCapital', 'wacc', 'cost_of_capital')
  return {
    name: typeof o.name === 'string' ? o.name : 'Unnamed company',
    annualRevenueUsd: num('annualRevenueUsd', 'annualRevenue', 'revenue'),
    annualCogsUsd: num('annualCogsUsd', 'annualCogs', 'cogs'),
    annualOpexUsd: num('annualOpexUsd', 'annualOpex', 'opex', 'operatingExpenses'),
    cashBalanceUsd: num('cashBalanceUsd', 'cashBalance', 'cash'),
    // A fixture may express 9% as either 9 or 0.09.
    costOfCapitalPct: costOfCapital > 0 && costOfCapital < 1 ? costOfCapital * 100 : costOfCapital || 9,
    inventoryUsd: num('inventoryUsd', 'inventory') || undefined,
  }
}

async function readIfPresent(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/**
 * Load the demo dataset from `fixtures/`.
 *
 * Throws `DatasetUnavailableError` with an explicit message when the fixture
 * files are not present, so the API can say what is missing instead of
 * presenting an empty analysis as a real one.
 */
export async function loadFixtureDataset(): Promise<AgentDataset> {
  const [ledgerCsv, contractsCsv, companyJson] = await Promise.all([
    readIfPresent(path.join(FIXTURES_DIR, 'ledger.csv')),
    readIfPresent(path.join(FIXTURES_DIR, 'contracts.csv')),
    readIfPresent(path.join(FIXTURES_DIR, 'company.json')),
  ])

  const missing: string[] = []
  if (!ledgerCsv) missing.push('fixtures/ledger.csv')
  if (!contractsCsv) missing.push('fixtures/contracts.csv')
  if (!companyJson) missing.push('fixtures/company.json')
  if (missing.length > 0) {
    throw new DatasetUnavailableError(
      `Fixture dataset not available. Missing: ${missing.join(', ')}. Upload a CSV to run against your own data.`,
    )
  }

  return {
    ledger: parseLedgerCsv(ledgerCsv as string, 'fixture-ledger'),
    contracts: parseContractsCsv(contractsCsv as string, 'fixture-contracts'),
    company: parseCompany(JSON.parse(companyJson as string)),
  }
}

export async function fixturesAvailable(): Promise<boolean> {
  try {
    await loadFixtureDataset()
    return true
  } catch {
    return false
  }
}
