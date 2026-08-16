import {
  calculateNextDueDate,
  type Frequency,
} from '@/features/masters/equipment-master/types'

export type CalibrationSource =
  | 'testing_master'
  | 'calibration_master'
  | 'testing_iqc'
  | 'calibration_iqc'

export const CALIBRATION_SOURCE_LABELS: Record<CalibrationSource, string> = {
  testing_master: 'Testing Master',
  calibration_master: 'Calibration Master',
  testing_iqc: 'Testing IQC',
  calibration_iqc: 'Calibration IQC',
}

export type DueBucket = 'overdue' | 'due_soon' | 'ok' | 'unknown'

export type CalibrationScheduleRow = {
  key: string
  source: CalibrationSource
  equipmentId: string
  assetCode: string
  equipmentName: string
  location: string
  status: string
  frequency: string
  lastCalibrationDate: string
  nextCalibrationDate: string
  dueBucket: DueBucket
  daysUntilDue: number | null
}

function asFrequency(value: string | null | undefined): Frequency {
  const v = String(value ?? '').trim()
  if (
    v === 'Daily' ||
    v === 'Weekly' ||
    v === 'Monthly' ||
    v === 'Quarterly' ||
    v === 'Half Yearly' ||
    v === 'Yearly'
  ) {
    return v
  }
  return ''
}

function toDateOnly(value: string | null | undefined): string {
  return String(value ?? '').trim().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = new Date(`${fromIso}T00:00:00`)
  const b = new Date(`${toIso}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}

export function resolveNextCalibrationDate(
  last: string,
  frequency: string,
  storedNext: string,
): string {
  const next = toDateOnly(storedNext)
  if (next) return next
  return calculateNextDueDate(toDateOnly(last), asFrequency(frequency))
}

export function classifyDue(nextDate: string, todayIso = new Date().toISOString().slice(0, 10)): {
  dueBucket: DueBucket
  daysUntilDue: number | null
} {
  const next = toDateOnly(nextDate)
  if (!next) return { dueBucket: 'unknown', daysUntilDue: null }
  const days = daysBetween(todayIso, next)
  if (days == null) return { dueBucket: 'unknown', daysUntilDue: null }
  if (days < 0) return { dueBucket: 'overdue', daysUntilDue: days }
  if (days <= 14) return { dueBucket: 'due_soon', daysUntilDue: days }
  return { dueBucket: 'ok', daysUntilDue: days }
}

export function mapEquipmentToCalibrationScheduleRow(input: {
  source: CalibrationSource
  id: string
  asset_code?: string | null
  equipment_name?: string | null
  current_location?: string | null
  equipment_status?: string | null
  calibration_frequency?: string | null
  last_calibration_date?: string | null
  next_calibration_due?: string | null
}): CalibrationScheduleRow {
  const frequency = String(input.calibration_frequency ?? '').trim()
  const last = toDateOnly(input.last_calibration_date)
  const next = resolveNextCalibrationDate(last, frequency, toDateOnly(input.next_calibration_due))
  const due = classifyDue(next)
  return {
    key: `${input.source}:${input.id}`,
    source: input.source,
    equipmentId: input.id,
    assetCode: String(input.asset_code ?? '').trim(),
    equipmentName: String(input.equipment_name ?? '').trim(),
    location: String(input.current_location ?? '').trim(),
    status: String(input.equipment_status ?? '').trim(),
    frequency,
    lastCalibrationDate: last,
    nextCalibrationDate: next,
    dueBucket: due.dueBucket,
    daysUntilDue: due.daysUntilDue,
  }
}

export function formatDateDisplay(value: string): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  if (y && m && d) return `${d}-${m}-${y}`
  return value
}

export function dueTone(bucket: DueBucket): string {
  switch (bucket) {
    case 'overdue':
      return 'border-rose-600/40 bg-rose-50 text-rose-900'
    case 'due_soon':
      return 'border-amber-600/40 bg-amber-50 text-amber-900'
    case 'ok':
      return 'border-emerald-600/40 bg-emerald-50 text-emerald-800'
    default:
      return 'border-stone-500/40 bg-stone-100 text-stone-700'
  }
}

export function dueLabel(row: CalibrationScheduleRow): string {
  if (row.dueBucket === 'overdue') {
    const days = row.daysUntilDue == null ? '' : ` (${Math.abs(row.daysUntilDue)}d)`
    return `Overdue${days}`
  }
  if (row.dueBucket === 'due_soon') {
    const days = row.daysUntilDue == null ? '' : ` (${row.daysUntilDue}d)`
    return `Due Soon${days}`
  }
  if (row.dueBucket === 'ok') return 'On Schedule'
  return 'No Due Date'
}

/** Deep-link to the equipment master dialog (read-only details via `?view=`). */
export function calibrationScheduleEquipmentHref(row: CalibrationScheduleRow): string {
  const id = encodeURIComponent(row.equipmentId)
  switch (row.source) {
    case 'testing_master':
      return `/masters/equipment?view=${id}`
    case 'testing_iqc':
      return `/equipment-management/iqc?view=${id}&kind=testing`
    case 'calibration_master':
      return `/calibration/equipment-for-calibration?view=${id}`
    case 'calibration_iqc':
      return `/equipment-management/iqc?view=${id}&kind=calibration`
  }
}
