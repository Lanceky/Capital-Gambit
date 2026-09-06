import { NextResponse } from 'next/server'
import {
  CsvValidationError,
  detectCsvKind,
  parseCompany,
  parseContractsCsv,
  parseCsv,
  parseLedgerCsv,
} from '@/lib/dataset'
import {
  deriveCompany,
  readStoredDataset,
  writeStoredDataset,
  type UploadedFile,
} from '@/lib/activeDataset'
import { isXlsx, parseWorkbook, XlsxError } from '@/lib/xlsx'
import type { CompanyProfile, LedgerEntry, VendorContract } from '@/lib/types'

/**
 * Read an upload as one or more grids of cells.
 *
 * A workbook yields one part per worksheet, because finance teams keep the
 * ledger and the contract register as tabs of a single file rather than as
 * separate exports. Anything else is treated as delimited text.
 */
async function readParts(file: File): Promise<Part[]> {
  const buf = Buffer.from(await file.arrayBuffer())
  if (isXlsx(buf)) {
    return parseWorkbook(buf).map((sheet) => ({
      rows: sheet.rows,
      // Re-emit as CSV so the existing row parsers stay the single source of
      // truth for column mapping and validation.
      text: toCsv(sheet.rows),
      name: `${file.name} — sheet "${sheet.name}"`,
      format: 'xlsx' as const,
    }))
  }
  const text = buf.toString('utf-8')
  return [{ rows: parseCsv(text), text, name: file.name, format: 'csv' as const }]
}

type Part = { rows: string[][]; text: string; name: string; format: 'xlsx' | 'csv' }

function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n')
}

/**
 * Read a company profile laid out as a header row plus one row of values.
 *
 * Returns null when the grid is not a profile, so the caller can fall through
 * to ledger and contract detection.
 */
function companyFromGrid(rows: string[][]): Record<string, unknown> | null {
  if (rows.length < 2) return null
  const header = rows[0].map((h) => h.trim())
  if (!header.some((h) => h.toLowerCase() === 'annualrevenueusd')) return null

  const profile: Record<string, unknown> = {}
  header.forEach((key, i) => {
    if (!key) return
    const value = (rows[1][i] ?? '').trim()
    if (value === '') return
    profile[key] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value
  })
  return profile
}

export const dynamic = 'force-dynamic'

/**
 * POST /api/upload — connect a spreadsheet.
 *
 * Files are detected as a ledger, a contract export or a company profile from
 * their contents, then persisted as the active dataset. Subsequent analysis
 * runs and provenance lookups read this instead of the bundled fixtures, so an
 * upload is a real connection rather than a validation preview.
 *
 * Uploading the same kind again replaces that part of the dataset; a different
 * kind merges, so a ledger and a contract export can arrive separately.
 */
export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a multipart/form-data upload' }, { status: 400 })
  }

  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No file provided under field "file"' }, { status: 400 })
  }

  const replace = form.get('replace') === 'true'
  const existing = replace ? null : await readStoredDataset()

  let ledger: LedgerEntry[] = existing?.ledger ?? []
  let contracts: VendorContract[] = existing?.contracts ?? []
  let company: CompanyProfile | undefined = existing?.company
  let companyUploaded = existing?.files.some((f) => f.kind === 'company') ?? false

  const kept = (existing?.files ?? []).slice()
  const accepted: UploadedFile[] = []
  const ignored: Array<{ name: string; reason: string }> = []

  const replaceKind = (kind: UploadedFile['kind']) => {
    for (let i = kept.length - 1; i >= 0; i--) if (kept[i].kind === kind) kept.splice(i, 1)
  }

  for (const file of files) {
    let parts: Part[]
    try {
      parts = await readParts(file)
    } catch (err) {
      if (err instanceof XlsxError) {
        return NextResponse.json(
          {
            error: `${file.name} could not be read as a spreadsheet: ${err.message}. Re-export the sheet as CSV and try again.`,
            file: file.name,
          },
          { status: 422 },
        )
      }
      throw err
    }

    let usedFromFile = 0

    for (const part of parts) {
      const trimmed = part.text.trim()

      if (part.format === 'csv' && trimmed.startsWith('{')) {
        let raw: unknown
        try {
          raw = JSON.parse(trimmed)
        } catch {
          return NextResponse.json(
            { error: `${file.name} looks like JSON but could not be parsed` },
            { status: 400 },
          )
        }
        company = parseCompany(raw)
        companyUploaded = true
        replaceKind('company')
        accepted.push({ name: part.name, kind: 'company', rows: 1 })
        usedFromFile++
        continue
      }

      if (part.rows.length === 0) {
        if (parts.length > 1) continue
        return NextResponse.json(
          { error: `${file.name} is empty`, file: file.name },
          { status: 400 },
        )
      }

      const profile = companyFromGrid(part.rows)
      if (profile) {
        try {
          company = parseCompany(profile)
        } catch (err) {
          if (err instanceof CsvValidationError) {
            return NextResponse.json(
              { error: err.message, file: part.name, rowErrors: err.errors.slice(0, 25) },
              { status: 422 },
            )
          }
          throw err
        }
        companyUploaded = true
        replaceKind('company')
        accepted.push({ name: part.name, kind: 'company', rows: 1 })
        usedFromFile++
        continue
      }

      const kind = detectCsvKind(part.rows[0])
      if (kind === 'unknown') {
        // A workbook legitimately carries cover sheets and working notes, so an
        // unrecognised tab is reported rather than failing the whole upload. A
        // lone CSV has nothing else in it, so there it is a genuine error.
        if (parts.length > 1) {
          ignored.push({ name: part.name, reason: 'no ledger, contract or profile columns' })
          continue
        }
        return NextResponse.json(
          {
            error:
              `Could not identify ${file.name}. A ledger export needs kind, counterparty and ` +
              `amountUsd columns; a contract export needs vendor and annualValueUsd.`,
            file: file.name,
            headers: part.rows[0],
          },
          { status: 400 },
        )
      }

      try {
        if (kind === 'ledger') {
          const parsed = parseLedgerCsv(part.text, `upload-${file.name}`)
          ledger = parsed
          replaceKind('ledger')
          accepted.push({ name: part.name, kind, rows: parsed.length })
        } else {
          const parsed = parseContractsCsv(part.text, `upload-${file.name}`)
          contracts = parsed
          replaceKind('contracts')
          accepted.push({ name: part.name, kind, rows: parsed.length })
        }
        usedFromFile++
      } catch (err) {
        if (err instanceof CsvValidationError) {
          return NextResponse.json(
            { error: err.message, file: part.name, rowErrors: err.errors.slice(0, 25) },
            { status: 422 },
          )
        }
        throw err
      }
    }

    if (usedFromFile === 0) {
      return NextResponse.json(
        {
          error:
            `No usable data found in ${file.name}. Checked ${parts.length} worksheet(s); a ledger ` +
            `needs kind, counterparty and amountUsd columns.`,
          file: file.name,
          ignored,
        },
        { status: 400 },
      )
    }
  }

  if (ledger.length === 0) {
    return NextResponse.json(
      {
        error:
          'A ledger export is required before analysis can run. Upload a file with kind, ' +
          'counterparty and amountUsd columns.',
      },
      { status: 400 },
    )
  }

  const { company: resolved, derivedFields } = deriveCompany(
    ledger,
    companyUploaded ? company : undefined,
  )

  const allFiles = [...kept, ...accepted]
  await writeStoredDataset({
    savedAt: new Date().toISOString(),
    files: allFiles,
    ledger,
    contracts,
    company: resolved,
    derivedFields,
  })

  return NextResponse.json({
    accepted,
    ignored,
    active: true,
    files: allFiles,
    company: resolved,
    derivedFields,
    summary: {
      ledgerRows: ledger.length,
      contractRows: contracts.length,
      arRows: ledger.filter((e) => e.kind === 'AR').length,
      apRows: ledger.filter((e) => e.kind === 'AP').length,
      counterparties: new Set(ledger.map((e) => e.counterparty)).size,
      vendors: new Set(contracts.map((c) => c.vendor)).size,
    },
  })
}
