import { inflateRawSync } from 'node:zlib'

/**
 * Minimal, dependency-free XLSX reader.
 *
 * An .xlsx file is a ZIP archive of XML parts. We only need enough of both
 * formats to recover a rectangular grid of cell text from the first worksheet,
 * which is then handed to the existing CSV row parsing.
 *
 * This exists instead of a spreadsheet library because the npm build of `xlsx`
 * carries unpatched prototype-pollution and ReDoS advisories, and pulling a
 * heavyweight alternative in to read one sheet is not a trade worth making.
 * Anything this reader cannot handle raises `XlsxError`, which the upload route
 * turns into "re-export as CSV" rather than a silent misparse.
 */
export class XlsxError extends Error {}

interface ZipEntry {
  name: string
  data: Buffer
}

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50

/** Read a ZIP central directory and inflate the entries we care about. */
function readZip(buf: Buffer, wanted: (name: string) => boolean): ZipEntry[] {
  // The end-of-central-directory record sits at the tail, after a comment of
  // unknown length, so scan backwards for its signature.
  let eocd = -1
  const lowest = Math.max(0, buf.length - 66_000)
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new XlsxError('Not a valid .xlsx file (no ZIP directory found)')

  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== SIG_CENTRAL) break

    const method = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    const localOffset = buf.readUInt32LE(offset + 42)
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf-8')

    if (wanted(name)) {
      // The local header repeats the name and extra fields with its own
      // lengths; the payload starts after them.
      const localNameLen = buf.readUInt16LE(localOffset + 26)
      const localExtraLen = buf.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + localNameLen + localExtraLen
      const raw = buf.subarray(start, start + compressedSize)
      try {
        entries.push({ name, data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw) })
      } catch {
        throw new XlsxError(`Could not decompress ${name} inside the workbook`)
      }
    }
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Concatenate the <t> runs inside a shared-string item. */
function textOf(xml: string): string {
  const parts = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g)
  if (!parts) return ''
  return parts.map((p) => decodeXmlText(p.replace(/<t[^>]*>|<\/t>/g, ''))).join('')
}

function parseSharedStrings(xml: string): string[] {
  const items = xml.match(/<si>[\s\S]*?<\/si>/g)
  return items ? items.map(textOf) : []
}

/** "BC12" -> 54 (zero-based column index). */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Za-z]/g, '').toUpperCase()
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Excel serial date -> ISO yyyy-mm-dd.
 *
 * Serial 1 is 1900-01-01, but Excel wrongly treats 1900 as a leap year, so
 * everything from serial 60 onward is shifted by one day. Using 1899-12-30 as
 * the epoch absorbs that for all realistic ledger dates.
 */
function serialToIsoDate(serial: number): string {
  const ms = Math.round(serial * 86_400_000)
  const d = new Date(Date.UTC(1899, 11, 30) + ms)
  return d.toISOString().slice(0, 10)
}

/**
 * Number formats that mean "this is a date". Excel's built-in date formats
 * occupy known id ranges; custom ones are detected from the format string.
 */
function dateStyleIds(stylesXml: string | null): Set<number> {
  const ids = new Set<number>()
  if (!stylesXml) return ids

  const builtinDate = (id: number) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47)
  const customDate = new Set<number>()
  for (const m of stylesXml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = decodeXmlText(m[2])
    // A date format contains y/m/d tokens outside of any literal quoted text.
    if (/[ymd]/i.test(code.replace(/"[^"]*"/g, '')) && !/[hs]/i.test(code.replace(/"[^"]*"/g, ''))) {
      customDate.add(Number(m[1]))
    }
  }

  const cellXfs = stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0]
  if (!cellXfs) return ids
  const xfs = cellXfs.match(/<xf[^>]*\/?>/g) ?? []
  xfs.forEach((xf, index) => {
    const id = Number(xf.match(/numFmtId="(\d+)"/)?.[1] ?? -1)
    if (builtinDate(id) || customDate.has(id)) ids.add(index)
  })
  return ids
}

function parseSheet(xml: string, shared: string[], dateStyles: Set<number>): string[][] {
  const rows: string[][] = []
  const rowMatches = xml.match(/<row[\s\S]*?(?:\/>|<\/row>)/g) ?? []

  for (const rowXml of rowMatches) {
    const cells: string[] = []
    for (const cell of rowXml.match(/<c[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = cell.match(/\sr="([A-Z]+\d+)"/)?.[1]
      const type = cell.match(/\st="(\w+)"/)?.[1]
      const style = Number(cell.match(/\ss="(\d+)"/)?.[1] ?? -1)

      let value = ''
      if (type === 'inlineStr') {
        value = textOf(cell)
      } else {
        const v = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1]
        if (v !== undefined) {
          const decoded = decodeXmlText(v)
          if (type === 's') {
            value = shared[Number(decoded)] ?? ''
          } else if (type === 'b') {
            value = decoded === '1' ? 'TRUE' : 'FALSE'
          } else {
            const num = Number(decoded)
            value =
              dateStyles.has(style) && Number.isFinite(num) && num > 0
                ? serialToIsoDate(num)
                : decoded
          }
        }
      }

      const index = ref ? columnIndex(ref) : cells.length
      while (cells.length < index) cells.push('')
      cells[index] = value
    }
    rows.push(cells)
  }

  // Drop trailing blank rows Excel commonly leaves behind.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop()
  return rows
}

export function isXlsx(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

/**
 * Extract the first worksheet of an .xlsx workbook as a grid of cell text,
 * matching the shape the CSV parser produces.
 */
export function parseXlsx(buf: Buffer): string[][] {
  if (!isXlsx(buf)) throw new XlsxError('File is not an .xlsx workbook')

  const entries = readZip(
    buf,
    (n) =>
      n === 'xl/sharedStrings.xml' ||
      n === 'xl/styles.xml' ||
      n === 'xl/workbook.xml' ||
      n === 'xl/_rels/workbook.xml.rels' ||
      n.startsWith('xl/worksheets/sheet'),
  )
  const get = (name: string) => entries.find((e) => e.name === name)?.data.toString('utf-8') ?? null

  const sheets = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  if (sheets.length === 0) {
    throw new XlsxError('Workbook contains no worksheets')
  }

  const shared = parseSharedStrings(get('xl/sharedStrings.xml') ?? '')
  const dateStyles = dateStyleIds(get('xl/styles.xml'))
  const rows = parseSheet(sheets[0].data.toString('utf-8'), shared, dateStyles)

  if (rows.length === 0) throw new XlsxError('The first worksheet is empty')
  return rows
}

/** Names of every worksheet, for telling the user which one we read. */
export function sheetNames(buf: Buffer): string[] {
  try {
    const [wb] = readZip(buf, (n) => n === 'xl/workbook.xml')
    if (!wb) return []
    const xml = wb.data.toString('utf-8')
    return [...xml.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) => decodeXmlText(m[1]))
  } catch {
    return []
  }
}
