import { NextResponse } from 'next/server'
import {
  CsvValidationError,
  detectCsvKind,
  parseContractsCsv,
  parseCsv,
  parseLedgerCsv,
} from '@/lib/dataset'
import type { LedgerEntry, VendorContract } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/upload — accept one or more CSV files, detect whether each is a
 * ledger or a contract export from its headers, and return a normalized
 * summary.
 *
 * Validation failures come back with the offending row and column so an
 * accountant is told exactly what to fix rather than "parse error".
 */
export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Expected a multipart/form-data upload' },
      { status: 400 },
    )
  }

  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No file provided under field "file"' }, { status: 400 })
  }

  const ledger: LedgerEntry[] = []
  const contracts: VendorContract[] = []
  const accepted: { name: string; kind: string; rows: number }[] = []

  for (const file of files) {
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length === 0) {
      return NextResponse.json(
        { error: `${file.name} is empty`, file: file.name },
        { status: 400 },
      )
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
        ledger.push(...parsed)
        accepted.push({ name: file.name, kind, rows: parsed.length })
      } else {
        const parsed = parseContractsCsv(text, `upload-${file.name}`)
        contracts.push(...parsed)
        accepted.push({ name: file.name, kind, rows: parsed.length })
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

  return NextResponse.json({
    accepted,
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
