import { getCachedMeasurementUnits } from '@/features/masters/measurement-units/measurementUnitApi'
import { formatDate } from '@/lib/utils'

export type UncertaintySign = '±' | '+' | '-'

export type CrmUncertaintyItem = {
  id: string
  selected: boolean
  elementName: string
  rangeMin: string
  rangeMinUnit: string
  rangeMax: string
  rangeMaxUnit: string
  uncertaintySign: UncertaintySign
  uncertaintyValue: string
  uncertaintyUnit: string
}

export type CrmRow = {
  id: string
  s_no: number
  id_no: string
  crm_type: string
  make: string
  date_of_purchase: string | null
  traceability_from: string | null
  traceability_as_per: string
  uncertainty: string
  uncertainty_rows?: unknown
  valid_upto: string | null
  created_at?: string
  updated_at?: string
}

export type CrmForm = {
  sNo: string
  idNo: string
  crmType: string
  make: string
  dateOfPurchase: string
  traceabilityFrom: string
  traceabilityAsPer: string
  uncertaintyRows: CrmUncertaintyItem[]
  validUpto: string
}

export function newCrmUncertaintyItem(
  partial?: Partial<CrmUncertaintyItem>,
): CrmUncertaintyItem {
  return {
    id: crypto.randomUUID(),
    selected: false,
    elementName: '',
    rangeMin: '',
    rangeMinUnit: '',
    rangeMax: '',
    rangeMaxUnit: '',
    uncertaintySign: '±',
    uncertaintyValue: '',
    uncertaintyUnit: '',
    ...partial,
  }
}

/** Title Case; keep short connectors lowercase (of, for, on, …) except first/last word. */
const TITLE_SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'of',
  'on',
  'at',
  'to',
  'from',
  'by',
  'in',
  'into',
  'onto',
  'with',
  'as',
  'over',
  'per',
  'via',
  'vs',
  'vs.',
  'end',
])

function capitalizeCore(core: string): string {
  if (!core) return core
  if (/^\d+[a-z]?$/i.test(core)) return core
  return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
}

function formatTitleSegment(segment: string, capitalize: boolean): string {
  const match = segment.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/)
  if (!match) return capitalize ? capitalizeCore(segment) : segment.toLowerCase()
  const [, lead, core, trail] = match
  if (!core) return segment
  if (!capitalize) return `${lead}${core.toLowerCase()}${trail}`
  return `${lead}${capitalizeCore(core)}${trail}`
}

export function toProperTitleCase(raw: string): string {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const words = text.split(' ')
  return words
    .map((word, wordIndex) => {
      const parts = word.split('-')
      return parts
        .map((part, partIndex) => {
          const isFirst = wordIndex === 0 && partIndex === 0
          const isLast = wordIndex === words.length - 1 && partIndex === parts.length - 1
          const core = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toLowerCase()
          const capitalize = isFirst || isLast || !TITLE_SMALL_WORDS.has(core)
          return formatTitleSegment(part, capitalize)
        })
        .join('-')
    })
    .join(' ')
}

/** Preferred CRM uncertainty unit when present in Measurement Units master. */
export const CRM_PREFERRED_UNCERTAINTY_UNIT = '%'

export function resolveDefaultCrmUncertaintyUnit(
  unitNames: Array<string | null | undefined>,
): string {
  const preferred = CRM_PREFERRED_UNCERTAINTY_UNIT
  const hasPreferred = unitNames.some((name) => String(name ?? '').trim() === preferred)
  return hasPreferred ? preferred : ''
}

export const emptyCrmForm = (): CrmForm => ({
  sNo: '',
  idNo: '',
  crmType: '',
  make: '',
  dateOfPurchase: '',
  traceabilityFrom: '',
  traceabilityAsPer: '',
  uncertaintyRows: [
    newCrmUncertaintyItem({
      uncertaintyUnit: resolveDefaultCrmUncertaintyUnit(
        getCachedMeasurementUnits().map((u) => u.name),
      ),
      rangeMinUnit: resolveDefaultCrmUncertaintyUnit(
        getCachedMeasurementUnits().map((u) => u.name),
      ),
      rangeMaxUnit: resolveDefaultCrmUncertaintyUnit(
        getCachedMeasurementUnits().map((u) => u.name),
      ),
    }),
  ],
  validUpto: '',
})

export const normalizeText = (value: string) => value.trim()

export const isValidIntegerOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isInteger(n) && n > 0
}

/** Parse stored "±0.01 %" / "+0.02 mm" / "0.01%" into sign + value + unit. */
export function parseUncertainty(raw: string | null | undefined): {
  sign: UncertaintySign
  value: string
  unit: string
} {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { sign: '±', value: '', unit: '' }

  let sign: UncertaintySign = '±'
  let rest = trimmed
  if (rest.startsWith('±')) {
    sign = '±'
    rest = rest.slice(1).trim()
  } else if (rest.startsWith('+/-')) {
    sign = '±'
    rest = rest.slice(3).trim()
  } else if (rest.startsWith('+')) {
    sign = '+'
    rest = rest.slice(1).trim()
  } else if (rest.startsWith('-') || rest.startsWith('−')) {
    sign = '-'
    rest = rest.slice(1).trim()
  }

  const lastSpace = rest.lastIndexOf(' ')
  if (lastSpace > 0) {
    const maybeUnit = rest.slice(lastSpace + 1).trim()
    const maybeValue = rest.slice(0, lastSpace).trim()
    if (maybeUnit && !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(maybeUnit)) {
      return { sign, value: maybeValue.replace(/[^0-9.]/g, ''), unit: maybeUnit }
    }
  }

  const glued = rest.match(/^([0-9.]+)\s*([A-Za-zµμΩλ°%‰]+(?:\/[A-Za-z]+)?|[°℃℉])$/u)
  if (glued) {
    return { sign, value: glued[1], unit: glued[2] }
  }

  return { sign, value: rest.replace(/[^0-9.]/g, ''), unit: '' }
}

export function joinUncertainty(
  sign: UncertaintySign,
  value: string,
  unit: string,
): string {
  const v = value.trim()
  if (!v) return ''
  const u = unit.trim()
  return u ? `${sign}${v} ${u}` : `${sign}${v}`
}

export function formatCrmRange(
  min: string,
  max: string,
  minUnit = '',
  maxUnit = '',
) {
  const a = min.trim()
  const b = max.trim()
  const au = minUnit.trim()
  const bu = maxUnit.trim()
  const left = a ? (au ? `${a} ${au}` : a) : ''
  const right = b ? (bu ? `${b} ${bu}` : b) : ''
  if (left && right) return `${left} – ${right}`
  if (left) return left
  if (right) return right
  return ''
}

export function formatUncertaintyRowSummary(row: CrmUncertaintyItem) {
  const unc = joinUncertainty(row.uncertaintySign, row.uncertaintyValue, row.uncertaintyUnit)
  const range = formatCrmRange(row.rangeMin, row.rangeMax, row.rangeMinUnit, row.rangeMaxUnit)
  const parts = [row.elementName.trim(), range ? `[${range}]` : '', unc].filter(Boolean)
  return parts.join(' ')
}

export function summarizeUncertaintyRows(rows: CrmUncertaintyItem[]) {
  const lines = rows
    .map(formatUncertaintyRowSummary)
    .map((s) => s.trim())
    .filter(Boolean)
  return lines.join('; ')
}

export function parseUncertaintyRowsFromDb(
  raw: unknown,
  legacyUncertainty?: string | null,
): CrmUncertaintyItem[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => {
      const r = (item ?? {}) as Record<string, unknown>
      const fromJoined =
        typeof r.uncertainty === 'string' ? parseUncertainty(r.uncertainty) : null
      const signRaw = String(r.uncertaintySign ?? fromJoined?.sign ?? '±')
      const sign: UncertaintySign =
        signRaw === '+' || signRaw === '-' || signRaw === '±' ? signRaw : '±'
      return newCrmUncertaintyItem({
        id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
        selected: Boolean(r.selected),
        elementName: String(r.elementName ?? ''),
        rangeMin: String(r.rangeMin ?? ''),
        rangeMinUnit: String(r.rangeMinUnit ?? ''),
        rangeMax: String(r.rangeMax ?? ''),
        rangeMaxUnit: String(r.rangeMaxUnit ?? ''),
        uncertaintySign: sign,
        uncertaintyValue: String(r.uncertaintyValue ?? fromJoined?.value ?? ''),
        uncertaintyUnit: String(r.uncertaintyUnit ?? fromJoined?.unit ?? ''),
      })
    })
  }

  const legacy = String(legacyUncertainty ?? '').trim()
  if (legacy) {
    const u = parseUncertainty(legacy)
    return [
      newCrmUncertaintyItem({
        uncertaintySign: u.sign,
        uncertaintyValue: u.value,
        uncertaintyUnit: u.unit,
      }),
    ]
  }

  return [newCrmUncertaintyItem()]
}

export function uncertaintyRowsToDb(rows: CrmUncertaintyItem[]) {
  return rows.map((r) => ({
    id: r.id,
    selected: r.selected,
    elementName: toProperTitleCase(r.elementName.trim()),
    rangeMin: r.rangeMin.trim(),
    rangeMinUnit: r.rangeMinUnit.trim(),
    rangeMax: r.rangeMax.trim(),
    rangeMaxUnit: r.rangeMaxUnit.trim(),
    uncertaintySign: r.uncertaintySign,
    uncertaintyValue: r.uncertaintyValue.trim(),
    uncertaintyUnit: r.uncertaintyUnit.trim(),
    uncertainty: joinUncertainty(r.uncertaintySign, r.uncertaintyValue, r.uncertaintyUnit),
  }))
}

export function rowToForm(row: CrmRow): CrmForm {
  return {
    sNo: String(row.s_no ?? ''),
    idNo: row.id_no ?? '',
    crmType: row.crm_type ?? '',
    make: row.make ?? '',
    dateOfPurchase: row.date_of_purchase ? String(row.date_of_purchase).slice(0, 10) : '',
    traceabilityFrom: row.traceability_from ? String(row.traceability_from).slice(0, 10) : '',
    traceabilityAsPer: row.traceability_as_per ?? '',
    uncertaintyRows: parseUncertaintyRowsFromDb(row.uncertainty_rows, row.uncertainty),
    validUpto: row.valid_upto ? String(row.valid_upto).slice(0, 10) : '',
  }
}

export function formToPayload(form: CrmForm) {
  const dateOfPurchase = form.dateOfPurchase.trim()
  const traceabilityFrom = form.traceabilityFrom.trim()
  const validUpto = form.validUpto.trim()
  const rows = form.uncertaintyRows.length > 0 ? form.uncertaintyRows : [newCrmUncertaintyItem()]
  return {
    s_no: Number(form.sNo.trim()),
    id_no: normalizeText(form.idNo),
    crm_type: normalizeText(form.crmType),
    make: normalizeText(form.make),
    date_of_purchase: dateOfPurchase || null,
    traceability_from: traceabilityFrom || null,
    traceability_as_per: normalizeText(form.traceabilityAsPer),
    uncertainty_rows: uncertaintyRowsToDb(rows),
    uncertainty: summarizeUncertaintyRows(rows),
    valid_upto: validUpto || null,
  }
}

export function formatDateDisplay(value: string | null | undefined) {
  return formatDate(value)
}

/** Merged Traceability From + Valid Up To display for list/print. */
export function formatTraceabilityValidity(
  from: string | null | undefined,
  validUpto: string | null | undefined,
) {
  return `${formatDateDisplay(from)} – ${formatDateDisplay(validUpto)}`
}
