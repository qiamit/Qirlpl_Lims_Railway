export type CrmRow = {
  id: string
  s_no: number
  id_no: string
  crm_type: string
  make: string
  year_of_purchase: number | null
  traceability_from: string
  traceability_as_per: string
  uncertainty: string
  valid_upto: string | null
  created_at?: string
  updated_at?: string
}

export type UncertaintySign = '±' | '+' | '-'

export type CrmForm = {
  sNo: string
  idNo: string
  crmType: string
  make: string
  yearOfPurchase: string
  traceabilityFrom: string
  traceabilityAsPer: string
  uncertaintySign: UncertaintySign
  uncertaintyValue: string
  uncertaintyUnit: string
  validUpto: string
}

export const emptyCrmForm = (): CrmForm => ({
  sNo: '',
  idNo: '',
  crmType: '',
  make: '',
  yearOfPurchase: '',
  traceabilityFrom: '',
  traceabilityAsPer: '',
  uncertaintySign: '±',
  uncertaintyValue: '',
  uncertaintyUnit: '',
  validUpto: '',
})

export const normalizeText = (value: string) => value.trim()

export const isValidIntegerOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isInteger(n) && n > 0
}

export const isValidYearOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isInteger(n) && n >= 1900 && n <= 2100
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

export function rowToForm(row: CrmRow): CrmForm {
  const u = parseUncertainty(row.uncertainty)
  return {
    sNo: String(row.s_no ?? ''),
    idNo: row.id_no ?? '',
    crmType: row.crm_type ?? '',
    make: row.make ?? '',
    yearOfPurchase: row.year_of_purchase != null ? String(row.year_of_purchase) : '',
    traceabilityFrom: row.traceability_from ?? '',
    traceabilityAsPer: row.traceability_as_per ?? '',
    uncertaintySign: u.sign,
    uncertaintyValue: u.value,
    uncertaintyUnit: u.unit,
    validUpto: row.valid_upto ? String(row.valid_upto).slice(0, 10) : '',
  }
}

export function formToPayload(form: CrmForm) {
  const year = form.yearOfPurchase.trim()
  const validUpto = form.validUpto.trim()
  return {
    s_no: Number(form.sNo.trim()),
    id_no: normalizeText(form.idNo),
    crm_type: normalizeText(form.crmType),
    make: normalizeText(form.make),
    year_of_purchase: year ? Number(year) : null,
    traceability_from: normalizeText(form.traceabilityFrom),
    traceability_as_per: normalizeText(form.traceabilityAsPer),
    uncertainty: joinUncertainty(form.uncertaintySign, form.uncertaintyValue, form.uncertaintyUnit),
    valid_upto: validUpto || null,
  }
}

export function formatDateDisplay(value: string | null | undefined) {
  if (!value) return '—'
  const d = String(value).slice(0, 10)
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day}-${m}-${y}`
}
