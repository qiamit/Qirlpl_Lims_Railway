export const CALIBRATION_FACILITY_TYPE_OPTIONS = [
  'Permanent',
  'Site',
  'Mobile',
  'Permanent Site facility',
] as const

export type CalibrationFacilityType = (typeof CALIBRATION_FACILITY_TYPE_OPTIONS)[number]

export type CalibrationNablScopeRow = {
  id: string
  s_no: number
  discipline_name: string
  group_name: string
  measurand: string
  calibration_method: string
  measurement_range: string
  cmc: string
  facility_type: string
  created_at?: string
  updated_at?: string
}

export type CalibrationNablScopeForm = {
  sNo: string
  disciplineName: string
  groupName: string
  measurand: string
  calibrationMethod: string
  measurementRange: string
  cmc: string
  facilityType: string
}

export const emptyCalibrationNablScopeForm = (): CalibrationNablScopeForm => ({
  sNo: '',
  disciplineName: '',
  groupName: '',
  measurand: '',
  calibrationMethod: '',
  measurementRange: '',
  cmc: '',
  facilityType: 'Permanent',
})

export const normalizeText = (value: string) => value.trim()

export const isValidIntegerOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isInteger(n) && n > 0
}

export type CmcSign = '±' | '+' | '-'

export function splitCmcParts(raw: string | null | undefined): {
  sign: CmcSign
  value: string
  unit: string
} {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { sign: '±', value: '', unit: '' }

  let sign: CmcSign = '±'
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

export function joinCmcParts(parts: { sign: CmcSign; value: string; unit: string }): string {
  const v = parts.value.trim()
  if (!v) return ''
  const u = parts.unit.trim()
  return u ? `${parts.sign}${v} ${u}` : `${parts.sign}${v}`
}

export function rowToForm(row: CalibrationNablScopeRow): CalibrationNablScopeForm {
  return {
    sNo: String(row.s_no ?? ''),
    disciplineName: row.discipline_name ?? '',
    groupName: row.group_name ?? '',
    measurand: row.measurand ?? '',
    calibrationMethod: row.calibration_method ?? '',
    measurementRange: row.measurement_range ?? '',
    cmc: row.cmc ?? '',
    facilityType: row.facility_type || 'Permanent',
  }
}

export function formToPayload(form: CalibrationNablScopeForm) {
  return {
    s_no: Number(form.sNo.trim()),
    discipline_name: normalizeText(form.disciplineName),
    group_name: normalizeText(form.groupName),
    measurand: normalizeText(form.measurand),
    calibration_method: normalizeText(form.calibrationMethod),
    measurement_range: normalizeText(form.measurementRange),
    cmc: normalizeText(form.cmc),
    facility_type: normalizeText(form.facilityType) || 'Permanent',
  }
}
