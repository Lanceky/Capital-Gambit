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
import { isXlsx, parseXlsx, sheetNames, XlsxError } from '@/lib/xlsx'
import type { CompanyProfile, LedgerEntry, VendorContract } from '@/lib/types'

/**
 * Read an upload as a grid of cells. Excel workbooks are decoded from their
 * first worksheet; everything else is treated as delimited text.
 */
async function readGrid(
  file: File,
): Promise<{ rows: string[][]; text: string; sheet?: string; format: 'xlsx' | 'csv' }> {
  const buf = Buffer.from(await file.arrayBuffer())
  if (isXlsx(buf)) {
    const rows = parseXlsx(buf)
    // Re-emit as CSV so the existing row parsers stay the single source of
    // truth for column mapping and validation.
    const text = rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n')
    return { rows, text, sheet: sheetNames(buf)[0], format: 'xlsx' }
  }
  const text = buf.toString('utf-8')
  return { rows: parseCsv(text), text, format: 'csv' }
}

export const dynamic = 'force-dynamic'

/** Show which worksheet a workbook's rows came from. */
function label(file: File, grid: { sheet?: string; format: 'xlsx' | 'csv' }): string {
  return grid.format === 'xlsx' && grid.sheet ? `${file.name} — sheet "${grid.sheet}"` : file.name
}

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

  const replaceKind = (kind: UploadedFile['kind']) => {
    for (let i = kept.length - 1; i >= 0; i--) if (kept[i].kind === kind) kept.splice(i, 1)
  }

  for (const file of files) {
    let grid: Awaited<ReturnType<typeof readGrid>>
    try {
      grid = await readGrid(file)
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
    const { text, rows } = grid
    const trimmed = text.trim()

    if (grid.format === 'csv' && trimmed.startsWith('{')) {
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
      accepted.push({ name: file.name, kind: 'company', rows: 1 })
      continue
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: `${file.name} is empty`, file: file.name }, { status: 400 })
    }

    const kind = detectCsvKind(rows[0])
    if (kind === 'unknown') {
      return NextResponse.json(
        {
          error:
            `Could not identify ${file.name}. A ledger export needs kind, counterparty and ` +
            `amountUsd columns; a contract export needs vendor and annualValueUsd.`,
          file: file.name,
          headers: rows[0],
        },
        { status: 400 },
      )
    }

    try {
      if (kind === 'ledger') {
        const parsed = parseLedgerCsv(text, `upload-${file.name}`)
        ledger = parsed
        replaceKind('ledger')
        accepted.push({ name: label(file, grid), kind, rows: parsed.length })
      } else {
        const parsed = parseContractsCsv(text, `upload-${file.name}`)
        contracts = parsed
        replaceKind('contracts')
        accepted.push({ name: label(file, grid), kind, rows: parsed.length })
      }
    } catch (err) {
      if (err instanceof CsvValidationError) {
        return NextResponse.json(
          { error: err.message, file: file.name, rowErrors: err.errors.slice(0, 25) },
          { status: 422 },
        )
      }
      throw err
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
