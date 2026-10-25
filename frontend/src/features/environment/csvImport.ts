/**
 * CSV import of data logger / hygrometer exports (ISO/IEC 17025 6.3.3).
 * Pure functions only (no React, no Supabase) so they can be unit-tested.
 *
 * Typical inputs:
 *   "No.,Date Time,Temperature(°C),Humidity(%RH)"          (comma)
 *   "Date;Time;Temp °C;RH %" with decimal commas            (semicolon, EU)
 *   a few preamble lines ("Logger SN: 12345", "Unit: °C") before the header
 */

export type CsvDelimiter = ',' | ';' | '\t'
export type DateOrder = 'auto' | 'DMY' | 'MDY' | 'YMD'

export type CsvMapping = {
  /** Index of the row holding the column names. */
  headerRow: number
  /** Column with date and time together (or the date only when timeCol is set). */
  dateCol: number
  /** Optional separate time column; -1 when the time is in dateCol. */
  timeCol: number
  /** -1 when the file has no temperature. */
  tempCol: number
  /** -1 when the file has no humidity. */
  rhCol: number
  dateOrder: DateOrder
}

export type MappedReading = {
  /** 1-based line number in the file. */
  line: number
  recordedAt: Date
  temperature: number | null
  humidity: number | null
}

export type MapResult = {
  readings: MappedReading[]
  errors: Array<{ line: number; message: string }>
  /** Rows skipped because they were empty. */
  skipped: number
}

export function detectDelimiter(text: string): CsvDelimiter {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 20)
  const score = (d: string) => {
    const counts = lines.map((l) => l.split(d).length - 1)
    // Most lines with the most frequent non-zero count.
    const freq = new Map<number, number>()
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1)
    let best = 0
    for (const [c, n] of freq) best = Math.max(best, n * 100 + c)
    return best
  }
  const candidates: CsvDelimiter[] = [',', ';', '\t']
  let pick: CsvDelimiter = ','
  let bestScore = -1
  for (const d of candidates) {
    const s = score(d)
    if (s > bestScore) {
      bestScore = s
      pick = d
    }
  }
  return pick
}

/** RFC 4180-style parser: quotes, doubled quotes, newlines inside quotes, BOM, CRLF. */
export function parseCsv(text: string, delimiter?: CsvDelimiter): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const d = delimiter ?? detectDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell.trim() === '') {
      cell = ''
      inQuotes = true
    } else if (ch === d) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

/**
 * Number from a logger cell: "23.5", "23,5" (decimal comma), "23.5 °C",
 * "45%", "-1.2". Thousands separators are not expected in these values.
 */
export function parseNumber(value: string | null | undefined): number | null {
  if (value == null) return null
  const m = String(value).trim().match(/^[+-]?\d+(?:[.,]\d+)?/)
  if (!m) return null
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function buildDate(y: number, mo: number, d: number, h: number, mi: number, s: number): Date | null {
  if (y < 100) y += 2000
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
  const dt = new Date(y, mo - 1, d, h, mi, s)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

/**
 * Local date-time from logger text. Accepts ISO ("2026-10-22T09:30:00Z",
 * "2026-10-22 09:30"), D/M/Y or M/D/Y with / - . separators, 2- or 4-digit
 * years, "22-Oct-2026 9:30 AM", optional seconds and AM/PM, and Excel serial
 * numbers (45953.375). `auto` reads D/M/Y (India) and falls back to M/D/Y
 * only when D/M/Y is impossible (e.g. 10/22/2026).
 */
export function parseDateTime(value: string | null | undefined, order: DateOrder = 'auto'): Date | null {
  if (value == null) return null
  const v = String(value).trim()
  if (!v) return null

  // ISO with a zone: let the engine handle it.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
    const dt = new Date(v)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  // Excel serial date (days since 1899-12-30), e.g. 45953.375
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const serial = Number(v)
    if (serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000)
      const utc = new Date(ms)
      return buildDate(
        utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(),
        utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(),
      )
    }
  }

  const m = v.match(
    /^(\d{1,4}|[A-Za-z]{3,4})[/.\-\s](\d{1,2}|[A-Za-z]{3,4})[/.\-\s,]+(\d{2,4})(?:[T\s,]+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?)?$/,
  )
  if (!m) return null
  const [, p1, p2, p3, hh, mm, ss, ampm] = m
  let h = hh ? Number(hh) : 0
  const mi = mm ? Number(mm) : 0
  const s = ss ? Number(ss) : 0
  if (ampm) {
    if (h < 1 || h > 12) return null
    const pm = ampm.toLowerCase() === 'pm'
    if (h === 12) h = pm ? 12 : 0
    else if (pm) h += 12
  }

  const monthOf = (t: string) => (/^\d+$/.test(t) ? Number(t) : MONTHS[t.toLowerCase()] ?? 0)

  // Year first: 2026-10-22
  if (p1.length === 4 && /^\d+$/.test(p1)) {
    return buildDate(Number(p1), monthOf(p2), Number(p3), h, mi, s)
  }
  // Month name in second place: 22-Oct-2026
  if (/^[A-Za-z]/.test(p2)) {
    return buildDate(Number(p3), monthOf(p2), Number(p1), h, mi, s)
  }
  // Month name in first place: Oct-22-2026
  if (/^[A-Za-z]/.test(p1)) {
    return buildDate(Number(p3), monthOf(p1), Number(p2), h, mi, s)
  }
  const a = Number(p1)
  const b = Number(p2)
  const y = Number(p3)
  if (order === 'YMD') return null
  if (order === 'MDY') return buildDate(y, a, b, h, mi, s)
  if (order === 'DMY') return buildDate(y, b, a, h, mi, s)
  // auto: D/M/Y (India), unless that is impossible and M/D/Y works.
  return buildDate(y, b, a, h, mi, s) ?? buildDate(y, a, b, h, mi, s)
}

/** Guess the header row: the last row before the first row that starts data. */
export function guessHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const row = rows[i]
    const hasDate = row.some((c) => parseDateTime(c) !== null)
    const hasNum = row.filter((c) => parseNumber(c) !== null).length >= 1
    if (hasDate && hasNum) return Math.max(0, i - 1)
  }
  return 0
}

/** Guess which columns hold date/time, temperature and humidity from the header names. */
export function guessMapping(rows: string[][], headerRow = guessHeaderRow(rows)): CsvMapping {
  const header = (rows[headerRow] ?? []).map((h) => h.toLowerCase())
  const find = (re: RegExp, exclude: number[] = []) => header.findIndex((h, i) => re.test(h) && !exclude.includes(i))
  let dateCol = find(/date\s*[/&-]?\s*time|timestamp|date_time|datetime/)
  let timeCol = -1
  if (dateCol < 0) {
    dateCol = find(/date/)
    timeCol = find(/time/, [dateCol])
    if (dateCol < 0 && timeCol >= 0) {
      dateCol = timeCol
      timeCol = -1
    }
  }
  const rhCol = find(/(^|[^a-z])rh([^a-z]|$)|humid|r\.h/)
  let tempCol = find(/temp|celsius/, [rhCol])
  if (tempCol < 0) tempCol = find(/°c|℃|deg\s*c|\(c\)/, [rhCol])

  // Fall back to the first data row's shape when the header did not help.
  const sample = rows[headerRow + 1] ?? []
  if (dateCol < 0) dateCol = sample.findIndex((c) => parseDateTime(c) !== null)
  const free = sample
    .map((c, i) => (i !== dateCol && i !== timeCol && parseNumber(c) !== null && parseDateTime(c) === null ? i : -1))
    .filter((i) => i >= 0 && i !== tempCol && i !== rhCol)
  // Logger exports often start with a running number ("No."): skip a column
  // whose header says so.
  const unused = free.filter((i) => !/^(no\.?|s\.?\s*no\.?|#|index|id|sr\.?\s*no\.?)$/.test(header[i] ?? ''))
  if (tempCol < 0) tempCol = unused.shift() ?? -1
  return {
    headerRow,
    dateCol,
    timeCol,
    tempCol,
    rhCol: rhCol >= 0 ? rhCol : unused.shift() ?? -1,
    dateOrder: 'auto',
  }
}

/** Turn the data rows (after the header row) into readings using the mapping. */
export function mapRows(rows: string[][], mapping: CsvMapping): MapResult {
  const readings: MappedReading[] = []
  const errors: MapResult['errors'] = []
  let skipped = 0
  if (mapping.dateCol < 0) {
    return { readings, errors: [{ line: 0, message: 'Choose the date / time column.' }], skipped }
  }
  if (mapping.tempCol < 0 && mapping.rhCol < 0) {
    return { readings, errors: [{ line: 0, message: 'Choose a temperature or humidity column.' }], skipped }
  }
  for (let i = mapping.headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i]
    const line = i + 1
    if (!row || row.every((c) => !c)) {
      skipped += 1
      continue
    }
    const dateText = row[mapping.dateCol] ?? ''
    const text = mapping.timeCol >= 0 ? `${dateText} ${row[mapping.timeCol] ?? ''}`.trim() : dateText
    const recordedAt = parseDateTime(text, mapping.dateOrder)
    if (!recordedAt) {
      errors.push({ line, message: `Date / time not understood: "${text}"` })
      continue
    }
    const temperature = mapping.tempCol >= 0 ? parseNumber(row[mapping.tempCol]) : null
    const humidity = mapping.rhCol >= 0 ? parseNumber(row[mapping.rhCol]) : null
    if (temperature === null && humidity === null) {
      errors.push({ line, message: 'No temperature or humidity value' })
      continue
    }
    if (humidity !== null && (humidity < 0 || humidity > 100)) {
      errors.push({ line, message: `Humidity ${humidity} is outside 0-100 %` })
      continue
    }
    if (temperature !== null && (temperature < -100 || temperature > 400)) {
      errors.push({ line, message: `Temperature ${temperature} is not plausible` })
      continue
    }
    readings.push({ line, recordedAt, temperature, humidity })
  }
  return { readings, errors, skipped }
}

/** Minute key used to skip readings already stored for the same area. */
export function minuteKey(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

/** Drop readings whose minute is already stored (or repeated within the file). */
export function dropDuplicates(readings: MappedReading[], existing: Iterable<string>): {
  fresh: MappedReading[]
  duplicates: number
} {
  const seen = new Set<string>()
  for (const e of existing) seen.add(minuteKey(e))
  const fresh: MappedReading[] = []
  let duplicates = 0
  for (const r of readings) {
    const k = minuteKey(r.recordedAt)
    if (seen.has(k)) {
      duplicates += 1
      continue
    }
    seen.add(k)
    fresh.push(r)
  }
  return { fresh, duplicates }
}
