import { useCallback, useEffect, useState, Fragment } from 'react'
import {
  Briefcase,
  Calculator,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  Gauge,
  Package,
  Plus,
  RefreshCw,
  Sigma,
  Thermometer,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  emptyCalibrationPointsTable,
  masterEquipmentIdsFromTabs,
  parseMeasurementRanges,
  type CalibrationPointsStored,
  type EquipmentRangeEntry,
  type MasterPointsTab,
  type MeasurementRangeStored,
} from '@/features/calibration/equipments/types'
import {
  calculateNextDueDate,
  isPresetFrequency,
  parseStoredFrequency,
  type Frequency,
} from '@/features/calibration/equipment-for-calibration/types'
import {
  applyFormulaColumns,
  buildInitialRawDataSheetPayload,
  defaultRawDataSheetTemplate,
  EMPTY_RAW_DATA_ENVIRONMENT,
  emptyEnvironmentReadingRow,
  emptyValuesForColumns,
  environmentConditionsFilled,
  evaluateEnvParameterFormula,
  explainFormulaCalculation,
  formulaOpMeta,
  isEnvStandardFieldLabel,
  mergeFormulasFromEquipmentTemplate,
  newPayloadRowId,
  parseRawDataSheetPayload,
  parseRawDataSheetTemplate,
  parseTableSettings,
  resolveEnvParameterColumns,
  type FormulaCalculationExplanation,
  type RawDataEnvironmentConditions,
  type RawDataEnvironmentReadingRow,
  type RawDataReportGenerationSettings,
  type RawDataSheetColumn,
  type RawDataSheetPayload,
  type RawDataSheetPayloadRow,
  type RawDataSheetTemplate,
} from '@/features/calibration/rawDataSheetTypes'
import {
  ensureRawDataSheetForJob,
  fetchMasterEquipmentsByIds,
  fetchSrfSummaryForSheet,
  resolveEquipmentMasterForJob,
  updateRawDataSheetPayload,
  type EquipmentMasterForSheet,
  type MasterEquipmentForSheet,
  type SrfSummaryForSheet,
} from './calibrationJobApi'
import { UncertaintyStepByStepDialog } from './UncertaintyStepByStepDialog'
import { type CalibrationJobRow } from '../types'

function cellText(value: string | null | undefined): string {
  const t = (value ?? '').trim()
  return t.length > 0 ? t : '—'
}

/**
 * Lock Environment Condition rows to Calibration Equipment Raw Data Sheet template.
 * Reading / Point labels come from the template; only parameter values are entered in Conduct.
 */
function syncEnvironmentFromEquipmentTemplate(
  template: RawDataSheetTemplate,
  current: RawDataEnvironmentConditions | undefined,
): RawDataEnvironmentConditions {
  const defaults = template.environmentDefaults
  const parameterColumns = resolveEnvParameterColumns(defaults ?? current)
  const selectedParameters =
    defaults?.selectedParameters && defaults.selectedParameters.length > 0
      ? [...defaults.selectedParameters]
      : current?.selectedParameters && current.selectedParameters.length > 0
        ? [...current.selectedParameters]
        : [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters]

  const existingByKey = new Map(
    (current?.rows ?? []).map((r) => [r.readingLabel.trim().toLowerCase(), r]),
  )

  const templateRows = defaults?.rows ?? []
  let rows: RawDataEnvironmentReadingRow[]

  if (templateRows.length > 0) {
    rows = templateRows
      .map((tr) => {
        const label = String(tr.readingLabel ?? '').trim()
        if (!label) return null
        const prev = existingByKey.get(label.toLowerCase())
        const isCalc = isEnvStandardFieldLabel(label)
        const values: Record<string, string> = {}
        for (const col of parameterColumns) {
          const prevVal = String(prev?.values?.[col.id] ?? '').trim()
          const tmplVal = String(tr.values?.[col.id] ?? '').trim()
          // Keep Conduct-entered values; fall back to template defaults.
          values[col.id] = prevVal || tmplVal
        }
        const formulas = isCalc
          ? { ...(tr.formulas ?? prev?.formulas ?? {}) }
          : undefined
        const base = emptyEnvironmentReadingRow(label)
        return {
          id: prev?.id || tr.id || base.id,
          readingLabel: label,
          values,
          ...(formulas && Object.keys(formulas).length > 0 ? { formulas } : {}),
        } satisfies RawDataEnvironmentReadingRow
      })
      .filter((r): r is RawDataEnvironmentReadingRow => r != null)
  } else {
    const points = (defaults?.selectedReadingPoints ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
    rows =
      points.length > 0
        ? points.map((label) => {
            const prev = existingByKey.get(label.toLowerCase())
            if (!prev) return emptyEnvironmentReadingRow(label)
            return { ...prev, readingLabel: label }
          })
        : (current?.rows ?? [])
  }

  return {
    notes: current?.notes ?? '',
    selectedParameters,
    parameterColumns,
    rows,
  }
}

function formatDate(value: string | null | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) return '—'
  const d = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return cellText(raw)
  const [y, m, day] = d.split('-')
  return `${day}-${m}-${y}`
}

/** Prefer stored next due; if blank and frequency is a preset, compute from last calibration. */
function resolveMasterNextCalDue(master: {
  next_calibration_due: string | null
  last_calibration_date: string | null
  calibration_frequency: string | null
}): string {
  const stored = (master.next_calibration_due ?? '').trim()
  if (stored) return formatDate(stored)

  const last = (master.last_calibration_date ?? '').trim().slice(0, 10)
  const freq = parseStoredFrequency(master.calibration_frequency ?? '')
  if (last && isPresetFrequency(freq)) {
    const computed = calculateNextDueDate(last, freq as Frequency)
    if (computed) return formatDate(computed)
  }
  return '—'
}

function takePrefixedPart(parts: string[], prefix: RegExp): string {
  const idx = parts.findIndex((p) => prefix.test(p))
  if (idx < 0) return ''
  const raw = parts[idx]!
  parts.splice(idx, 1)
  return raw.replace(prefix, '').trim()
}

function parseJobEquipmentFields(job: CalibrationJobRow): {
  leastCount: string
  range: string
  make: string
  model: string
  serial: string
  quantity: string
  accuracy: string
  condition: string
  physical: string
  calMethod: string
  methodNotes: string
} {
  const text = (job.equipment_detail || job.equipment_label || '').trim()
  if (!text) {
    return {
      leastCount: '',
      range: '',
      make: '',
      model: '',
      serial: '',
      quantity: '',
      accuracy: '',
      condition: '',
      physical: '',
      calMethod: '',
      methodNotes: '',
    }
  }
  const parts = text.split('·').map((p) => p.trim()).filter(Boolean)
  parts.shift()
  return {
    leastCount: takePrefixedPart(parts, /^lc\s+/i),
    range: takePrefixedPart(parts, /^range\s+/i),
    make: takePrefixedPart(parts, /^make\s+/i),
    model: takePrefixedPart(parts, /^model\s+/i),
    serial: takePrefixedPart(parts, /^s\/n\s+/i),
    accuracy: takePrefixedPart(parts, /^accuracy\s+/i),
    condition: takePrefixedPart(parts, /^condition\s+/i),
    physical: takePrefixedPart(parts, /^physical\s+/i),
    calMethod: takePrefixedPart(parts, /^cal\s*method\s+/i),
    methodNotes: takePrefixedPart(parts, /^method\s*notes\s+/i),
    quantity: takePrefixedPart(parts, /^qty\s+/i),
  }
}

function parseJobSelectedRangeFields(job: CalibrationJobRow): {
  range: string
  leastCount: string
} {
  const f = parseJobEquipmentFields(job)
  return { range: f.range, leastCount: f.leastCount }
}

function formatNumberInput(value: string, decimalPlaces: number): string {
  const t = value.trim()
  if (!t) return ''
  const n = Number(t)
  if (!Number.isFinite(n)) return value
  return n.toFixed(decimalPlaces)
}

/**
 * Pseudo-random in [-1, 1] from a salt. Include a fresh generation seed in the
 * salt so each Generate Report click produces new reading values.
 */
function unitSignedFromSalt(salt: string): number {
  let h = 2166136261
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const unit = (h >>> 0) / 4294967295 // 0..1
  const signed = unit * 2 - 1
  // Avoid exact zero so Error / repeatability columns are not always blank
  return Math.abs(signed) < 0.05 ? (signed < 0 ? -0.37 : 0.37) : signed
}

function newReportGenerationSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Sentinel for "no least count" in the Generate Report least count select. */
const LEAST_COUNT_NONE = '__none__'

/** Sentinel for "no reference" in the Generate Report reference value select. */
const REFERENCE_NONE = '__none__'

/**
 * Reading = (Reference × Multiple) ± (scaled × RandomnessFactor%),
 * so every generated value stays within the given % band of the scaled reference.
 * When a least count is given, the result snaps to the nearest multiple of it.
 * For Reference=None (zero base), one signed LC is used so zero does not
 * collapse every generated value back to zero.
 */
function readingWithRandomnessDeviation(
  reference: number,
  randomnessPercent: number,
  salt: string,
  decimalPlaces: number,
  multiple = 1,
  leastCount = 0,
  referenceIsNone = false,
): string {
  const scaled = reference * (Number.isFinite(multiple) && multiple !== 0 ? multiple : 1)
  const signedRandom = unitSignedFromSalt(salt)
  if (referenceIsNone && Number.isFinite(leastCount) && leastCount > 0) {
    const oneLeastCount = signedRandom < 0 ? -leastCount : leastCount
    return formatNumberInput(String(oneLeastCount), decimalPlaces)
  }
  const band =
    randomnessPercent > 0 ? Math.abs(scaled) * (randomnessPercent / 100) : 0
  const raw = band > 0 ? scaled + band * signedRandom : scaled
  const snapped =
    Number.isFinite(leastCount) && leastCount > 0
      ? Math.round(raw / leastCount) * leastCount
      : raw
  return formatNumberInput(String(snapped), decimalPlaces)
}

type ReportLeastCountOption = {
  /** Unique select value (stored in reportReadingLeastCounts). */
  key: string
  /** Numeric least count used when snapping readings. */
  numeric: number
  label: string
}

function parseLeastCountNumber(raw: string | null | undefined): number | null {
  const n = Number(String(raw ?? '').replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Generate Report Least Count choices (fixed set):
 * 1. None (handled in UI)
 * 2. 1
 * 3. Calibration Equipment matched-range LC
 * 4. Master equipment LC(s) used on this job
 */
function buildReportLeastCountOptions(
  job: CalibrationJobRow,
  equipment: EquipmentMasterForSheet | null,
  masters: MasterEquipmentForSheet[],
): ReportLeastCountOption[] {
  const options: ReportLeastCountOption[] = [
    { key: '1', numeric: 1, label: '1' },
  ]

  if (equipment) {
    const matched = matchJobMeasurementRange(
      job,
      equipment.measurement_ranges,
      equipment.range_capacity,
      equipment.resolution_least_count,
      equipment.master_equipment_id,
    )
    const jobLc = parseJobSelectedRangeFields(job).leastCount
    const equipmentLc =
      parseLeastCountNumber(matched?.resolutionLeastCount) ??
      parseLeastCountNumber(jobLc) ??
      parseLeastCountNumber(equipment.resolution_least_count)
    if (equipmentLc != null) {
      options.push({
        key: 'equipment',
        numeric: equipmentLc,
        label: `Equipment Range LC (${equipmentLc})`,
      })
    }
  }

  const seenMasterLc = new Set<string>()
  for (const master of masters) {
    const masterLc = parseLeastCountNumber(master.resolution_least_count)
    if (masterLc == null) continue
    const key = `master:${master.id}`
    if (seenMasterLc.has(key)) continue
    seenMasterLc.add(key)
    const name = (master.asset_code || master.equipment_name || 'Master').trim()
    options.push({
      key,
      numeric: masterLc,
      label: masters.length > 1 ? `Master LC · ${name} (${masterLc})` : `Master LC (${masterLc})`,
    })
  }

  return options
}

function resolveReportLeastCount(
  storedKey: string | undefined,
  options: ReportLeastCountOption[],
): number {
  const key = (storedKey ?? '').trim()
  if (!key || key === LEAST_COUNT_NONE) return 0
  if (key === '1') return 1
  const asNumber = Number(key)
  if (Number.isFinite(asNumber) && asNumber > 0) {
    // Backward-compatible if an older session stored a plain number string.
    return asNumber
  }
  return options.find((o) => o.key === key)?.numeric ?? 0
}

function DetailField({
  label,
  value,
  multiline = false,
  emptyHint,
  className,
}: {
  label: string
  value: string
  multiline?: boolean
  /** Shown when value is blank / em dash — clarifies optional SRF fields. */
  emptyHint?: string
  className?: string
}) {
  const isEmpty = !value || value === '—'
  const display = isEmpty ? (emptyHint ?? '—') : value
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border border-slate-200/90 bg-white px-2.5 py-2',
        className,
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-sm',
          isEmpty ? 'text-slate-400' : 'text-slate-900',
          multiline && !isEmpty ? 'whitespace-pre-wrap break-words' : !multiline ? 'truncate' : '',
        )}
        title={multiline || isEmpty ? undefined : value}
      >
        {display}
      </p>
    </div>
  )
}

function normalizeRangeToken(value: string): string {  return value
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9.\-\s]/g, '')
    .trim()
}

/** Strip common unit suffixes so "0 - 1000 kN" ≡ "0 - 1000". */
function stripRangeUnits(value: string): string {
  return normalizeRangeToken(value)
    .replace(
      /\b(kn|kgf|kg|n|mpa|kpa|pa|bar|psi|mm|cm|m|c|f|%|deg|degree|degrees)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim()
}

function rangeEntryLabel(r: EquipmentRangeEntry): string {
  const capacity = r.rangeCapacity.trim()
  const unit = r.unit.trim()
  if (!capacity) return ''
  return unit ? `${capacity} ${unit}` : capacity
}

function leastCountLabel(r: EquipmentRangeEntry): string {
  const lc = r.resolutionLeastCount.trim()
  const unit = r.unit.trim()
  if (!lc) return ''
  return unit ? `${lc} ${unit}` : lc
}

function parsePointsFromDetail(detail: string): string[] {
  const m = detail.match(/\bPoints\s+([^·]+)/i)
  if (!m?.[1]) return []
  return m[1]
    .split(/[,;|/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Match the job's selected measurement range from Calibration Equipment.
 * Prefer exact capacity (+ LC) matches. Never use naive substring includes —
 * "0 - 1000" must not match "0 - 100".
 */
function matchJobMeasurementRange(
  job: CalibrationJobRow,
  measurementRanges: unknown,
  rangeCapacity: string | null,
  resolutionLeastCount: string | null,
  fallbackMasterEquipmentId?: string | null,
): EquipmentRangeEntry | undefined {
  const fields = parseJobSelectedRangeFields(job)
  const selectedRange = normalizeRangeToken(fields.range)
  const selectedLc = normalizeRangeToken(fields.leastCount)
  const selectedCapacity = stripRangeUnits(fields.range)
  const selectedLcBare = stripRangeUnits(fields.leastCount)

  const ranges = parseMeasurementRanges(
    measurementRanges as MeasurementRangeStored[] | null,
    rangeCapacity,
    resolutionLeastCount,
    fallbackMasterEquipmentId,
  )

  const rangeHasPoints = (r: EquipmentRangeEntry) =>
    r.calibrationPointsTable.rows.some((row) =>
      Object.values(row.values).some((v) => String(v ?? '').trim().length > 0),
    ) ||
    r.calibrationPoints.some((p) => p.pointValue.trim().length > 0) ||
    (r.masterPointsTabs ?? []).some((tab) =>
      tab.calibrationPointsTable.rows.some((row) =>
        Object.values(row.values).some((v) => String(v ?? '').trim().length > 0),
      ),
    )

  const withPoints = ranges.filter(rangeHasPoints)
  const pool = withPoints.length > 0 ? withPoints : ranges
  if (pool.length === 0) return undefined
  if (pool.length === 1) return pool[0]

  const scoreRange = (r: EquipmentRangeEntry): number => {
    const label = normalizeRangeToken(rangeEntryLabel(r))
    const capacity = stripRangeUnits(r.rangeCapacity)
    const labelBare = stripRangeUnits(rangeEntryLabel(r))
    const lc = normalizeRangeToken(leastCountLabel(r))
    const lcOnly = normalizeRangeToken(r.resolutionLeastCount)
    const lcBare = stripRangeUnits(r.resolutionLeastCount)

    let score = 0
    if (selectedCapacity) {
      if (capacity === selectedCapacity || labelBare === selectedCapacity) score += 100
      else if (label === selectedRange) score += 90
    }
    if (selectedLcBare || selectedLc) {
      const lcHit =
        (selectedLc && (lc === selectedLc || lcOnly === selectedLc)) ||
        (selectedLcBare && (lcBare === selectedLcBare || stripRangeUnits(lc) === selectedLcBare))
      if (lcHit) score += 50
    }
    return score
  }

  let best: EquipmentRangeEntry | undefined
  let bestScore = 0
  for (const r of pool) {
    const s = scoreRange(r)
    if (s > bestScore) {
      bestScore = s
      best = r
    }
  }

  // Require at least a capacity or LC hit — don't pick an arbitrary first range.
  if (best && bestScore > 0) return best

  return undefined
}

/**
 * All master points tabs for the job's selected range (each master keeps its own table).
 * Includes every tab with a selected master — even if points are still empty —
 * so Conduct creates a section/table for each reference standard.
 */
function collectMasterPointsTabsForJob(
  job: CalibrationJobRow,
  measurementRanges: unknown,
  rangeCapacity: string | null,
  resolutionLeastCount: string | null,
  fallbackMasterEquipmentId?: string | null,
): MasterPointsTab[] {
  const matched = matchJobMeasurementRange(
    job,
    measurementRanges,
    rangeCapacity,
    resolutionLeastCount,
    fallbackMasterEquipmentId,
  )
  if (!matched) return []
  const tabs = matched.masterPointsTabs ?? []

  // Every tab that has a Master Equipment selected (order preserved).
  const withMaster = tabs.filter((tab) => tab.masterEquipmentId.trim().length > 0)
  if (withMaster.length > 0) return withMaster

  // Tabs with point data but no master id yet
  const withData = tabs.filter(
    (tab) =>
      tab.calibrationPointsTable.columns.length > 0 &&
      tab.calibrationPointsTable.rows.some((row) =>
        Object.values(row.values).some((v) => String(v ?? '').trim().length > 0),
      ),
  )
  if (withData.length > 0) return withData

  // Fallback: single primary table as one anonymous tab
  if (
    matched.calibrationPointsTable.columns.length > 0 &&
    matched.calibrationPointsTable.rows.length > 0
  ) {
    return [
      {
        id: 'primary',
        masterEquipmentId: matched.masterEquipmentIds[0] ?? '',
        calibrationPointsTable: matched.calibrationPointsTable,
      },
    ]
  }

  if (matched.calibrationPoints.length > 0) {
    const colId = 'nominal'
    return [
      {
        id: 'legacy',
        masterEquipmentId: matched.masterEquipmentIds[0] ?? '',
        calibrationPointsTable: {
          columns: [{ id: colId, header: 'Nominal' }],
          rows: matched.calibrationPoints
            .map((p) => p.pointValue.trim())
            .filter(Boolean)
            .map((pointValue, i) => ({
              id: matched.calibrationPoints[i]?.id || `pt-${i}`,
              values: { [colId]: pointValue },
            })),
        },
      },
    ]
  }

  // Masters linked on the range but tabs not yet structured
  const ids = (matched.masterEquipmentIds ?? []).map((id) => id.trim()).filter(Boolean)
  if (ids.length > 0) {
    return ids.map((masterEquipmentId, index) => ({
      id: `master-${index}`,
      masterEquipmentId,
      calibrationPointsTable: emptyCalibrationPointsTable(),
    }))
  }

  return []
}

/**
 * Seed check points for the job's selected range from Calibration Equipment.
 * Prefer the full multi-column points table (Load, Indicator Reading, …).
 * When multiple masters exist, primary table is first filled tab (backward compatible).
 * SRF "Points …" is only a fallback when the equipment range has no table.
 */
function collectCalibrationPointsTableForJob(
  job: CalibrationJobRow,
  measurementRanges: unknown,
  rangeCapacity: string | null,
  resolutionLeastCount: string | null,
): CalibrationPointsStored | null {
  const tabs = collectMasterPointsTabsForJob(
    job,
    measurementRanges,
    rangeCapacity,
    resolutionLeastCount,
  )
  if (tabs.length > 0) {
    return tabs[0]!.calibrationPointsTable
  }

  // Fallback: SRF equipment_detail "Points 0, 100, …" (flat list only)
  const fromDetail = parsePointsFromDetail(job.equipment_detail || '')
  if (fromDetail.length > 0) {
    const colId = 'nominal'
    return {
      columns: [{ id: colId, header: 'Nominal' }],
      rows: fromDetail.map((pointValue, i) => ({
        id: `detail-${i}`,
        values: { [colId]: pointValue },
      })),
    }
  }

  return null
}

/** @deprecated Prefer {@link collectCalibrationPointsTableForJob} — kept for seed APIs that only need nominal. */
function collectCalibrationPointsForJob(
  job: CalibrationJobRow,
  measurementRanges: unknown,
  rangeCapacity: string | null,
  resolutionLeastCount: string | null,
): Array<{ pointValue: string }> {
  const table = collectCalibrationPointsTableForJob(
    job,
    measurementRanges,
    rangeCapacity,
    resolutionLeastCount,
  )
  if (!table) return []
  return table.rows
    .map((row) => {
      const firstCol = table.columns[0]
      const pointValue = firstCol
        ? String(row.values[firstCol.id] ?? '').trim()
        : Object.values(row.values)
            .map((v) => String(v ?? '').trim())
            .find((v) => v.length > 0) ?? ''
      return { pointValue }
    })
    .filter((p) => p.pointValue.length > 0)
}

/** Prefer masterPointsTabs order; append any extra masterEquipmentIds. */
function collectMasterIdsFromRange(range: EquipmentRangeEntry): string[] {
  const fromTabs = masterEquipmentIdsFromTabs(range.masterPointsTabs ?? [])
  const out = [...fromTabs]
  for (const raw of range.masterEquipmentIds ?? []) {
    const id = raw.trim()
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/**
 * All master equipment ids used on this Calibration Equipment.
 * Prefers the job's matched range order, then unions every other range + legacy id.
 */
function collectMasterEquipmentIdsForJob(
  job: CalibrationJobRow,
  equipment: EquipmentMasterForSheet,
  extraIds: string[] = [],
): string[] {
  const ranges = parseMeasurementRanges(
    equipment.measurement_ranges as MeasurementRangeStored[] | null,
    equipment.range_capacity,
    equipment.resolution_least_count,
    equipment.master_equipment_id,
  )

  const matched = matchJobMeasurementRange(
    job,
    equipment.measurement_ranges,
    equipment.range_capacity,
    equipment.resolution_least_count,
    equipment.master_equipment_id,
  )

  const out: string[] = []
  const add = (raw: string) => {
    const id = raw.trim()
    if (id && !out.includes(id)) out.push(id)
  }

  // Matched range first (job's selected range), then remaining ranges on the equipment.
  if (matched) {
    for (const id of collectMasterIdsFromRange(matched)) add(id)
  }
  for (const range of ranges) {
    for (const id of collectMasterIdsFromRange(range)) add(id)
  }
  add((equipment.master_equipment_id ?? '').trim())
  for (const id of extraIds) add(id)
  return out
}

function payloadHasUserReadings(payload: RawDataSheetPayload): boolean {
  if (Object.values(payload.verificationAnswers).some(Boolean)) return true
  if (environmentConditionsFilled(payload.environmentConditions)) return true
  for (const row of payload.rows) {
    for (const col of payload.template.columns) {
      if (col.key === 'nominal') continue
      if ((row.values[col.key] ?? '').trim()) return true
    }
  }
  return false
}

function normalizeHeaderToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[%()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Loose header groups so "Load in Kn" ↔ "Load", "Indicator Reading" ↔ "Indicator", etc. */
const HEADER_ALIAS_GROUPS: string[][] = [
  ['nominal', 'check point', 'calibration point', 'cal point', 'point', 'set point'],
  ['load', 'load in kn', 'load kn', 'force', 'applied load'],
  ['indicator', 'indicator reading', 'indication', 'reading', 'uut reading', 'dut reading'],
  ['actual', 'certified', 'standard', 'std', 'reference'],
  ['correction', 'corr'],
  ['uncertainty', 'u expanded', 'expanded uncertainty'],
  ['as found', 'asfound', 'found'],
  ['as left', 'asleft', 'left'],
  ['error', 'deviation'],
]

function headerAliasGroup(token: string): number {
  const n = normalizeHeaderToken(token)
  if (!n) return -1
  return HEADER_ALIAS_GROUPS.findIndex((group) =>
    group.some((alias) => n === alias || n.includes(alias) || alias.includes(n)),
  )
}

function headersCompatible(a: string, b: string): boolean {
  const na = normalizeHeaderToken(a)
  const nb = normalizeHeaderToken(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const ga = headerAliasGroup(na)
  const gb = headerAliasGroup(nb)
  return ga >= 0 && ga === gb
}

/**
 * Map each points-table column → a raw-data-sheet input column (skip formula cols).
 * Prefer exact label match, then contains / alias match. Each sheet column used at most once.
 */
function mapPointsColumnsToSheetColumns(
  pointsTable: CalibrationPointsStored,
  sheetColumns: RawDataSheetColumn[],
): Array<{ sourceColId: string; sheetKey: string }> {
  const fillable = sheetColumns.filter((c) => c.type !== 'formula')
  const used = new Set<string>()
  const mapping: Array<{ sourceColId: string; sheetKey: string }> = []

  const score = (header: string, col: RawDataSheetColumn): number => {
    const nh = normalizeHeaderToken(header)
    const nl = normalizeHeaderToken(col.label)
    const nk = normalizeHeaderToken(col.key)
    if (!nh) return 0
    if (nl === nh || nk === nh) return 100
    if (nl.includes(nh) || nh.includes(nl) || nk.includes(nh) || nh.includes(nk)) return 70
    if (headersCompatible(header, col.label) || headersCompatible(header, col.key)) return 50
    return 0
  }

  for (const source of pointsTable.columns) {
    let best: RawDataSheetColumn | null = null
    let bestScore = 0
    for (const col of fillable) {
      if (used.has(col.key)) continue
      const s = score(source.header, col)
      if (s > bestScore) {
        bestScore = s
        best = col
      }
    }
    if (best && bestScore > 0) {
      used.add(best.key)
      mapping.push({ sourceColId: source.id, sheetKey: best.key })
    }
  }

  return mapping
}

/**
 * Build sheet rows from the full Calibration Equipment points table.
 * Copies every mapped column (Load, Indicator Reading, …), not just Nominal.
 */
function rowsFromCalibrationPointsTable(
  columns: RawDataSheetColumn[],
  pointsTable: CalibrationPointsStored,
  decimalPlaces: number,
  masterMeta?: { masterEquipmentId?: string; masterLabel?: string },
): RawDataSheetPayloadRow[] {
  const mapping = mapPointsColumnsToSheetColumns(pointsTable, columns)
  const firstMapped = mapping[0]
  const out: RawDataSheetPayloadRow[] = []

  for (const row of pointsTable.rows) {
    let values = emptyValuesForColumns(columns)
    let hasAny = false
    for (const { sourceColId, sheetKey } of mapping) {
      const raw = String(row.values[sourceColId] ?? '').trim()
      if (!raw) continue
      values[sheetKey] = raw
      hasAny = true
    }
    if (!hasAny) continue

    values = applyFormulaColumns(columns, values, decimalPlaces)
    const pointValue = firstMapped
      ? String(row.values[firstMapped.sourceColId] ?? '').trim()
      : (Object.values(row.values)
          .map((v) => String(v ?? '').trim())
          .find((v) => v.length > 0) ?? '')

    out.push({
      id: newPayloadRowId(),
      pointValue,
      masterEquipmentId: masterMeta?.masterEquipmentId || undefined,
      masterLabel: masterMeta?.masterLabel || undefined,
      values,
    })
  }

  return out
}

/** Seed sheet rows from every master tab (preserves master identity). */
function rowsFromMasterPointsTabs(
  columns: RawDataSheetColumn[],
  tabs: MasterPointsTab[],
  decimalPlaces: number,
  masterNameById: Map<string, string>,
): RawDataSheetPayloadRow[] {
  const out: RawDataSheetPayloadRow[] = []
  for (const tab of tabs) {
    const masterId = tab.masterEquipmentId.trim()
    const masterLabel =
      (masterId ? masterNameById.get(masterId) : undefined) ||
      (masterId ? masterId : undefined)
    const seeded = rowsFromCalibrationPointsTable(
      columns,
      tab.calibrationPointsTable,
      decimalPlaces,
      {
        masterEquipmentId: masterId || undefined,
        masterLabel,
      },
    )
    if (seeded.length > 0) {
      out.push(...seeded)
      continue
    }
    // Empty points for this master → still create one blank row so its table/section appears.
    out.push({
      id: newPayloadRowId(),
      masterEquipmentId: masterId || undefined,
      masterLabel,
      values: emptyValuesForColumns(columns),
    })
  }
  return out
}

/**
 * Ensure every linked master has at least one row group in an existing sheet
 * (so Conduct shows all masters, not only the first that was originally seeded).
 * Row groups are ordered to match Calibration Equipment master tabs.
 */
function ensureAllMasterRowGroups(
  payload: RawDataSheetPayload,
  tabs: MasterPointsTab[],
  masterNameById: Map<string, string>,
  decimalPlaces: number,
): RawDataSheetPayload {
  const tabsWithMaster = tabs.filter((t) => t.masterEquipmentId.trim().length > 0)
  if (tabsWithMaster.length === 0) return payload

  let rows = [...payload.rows]
  const present = new Set(
    rows.map((r) => (r.masterEquipmentId ?? '').trim()).filter(Boolean),
  )

  // Legacy sheet: rows exist but none tagged → assign to first master.
  if (present.size === 0 && rows.length > 0) {
    const firstId = tabsWithMaster[0]!.masterEquipmentId.trim()
    const firstLabel = masterNameById.get(firstId) || firstId
    rows = rows.map((r) => ({
      ...r,
      masterEquipmentId: firstId,
      masterLabel: firstLabel,
    }))
    present.add(firstId)
  }

  const missingTabs = tabsWithMaster.filter(
    (t) => !present.has(t.masterEquipmentId.trim()),
  )
  if (missingTabs.length > 0) {
    const extra = rowsFromMasterPointsTabs(
      payload.template.columns,
      missingTabs,
      decimalPlaces,
      masterNameById,
    )
    rows = [...rows, ...extra]
  }

  // Keep master sections in the same order as Calibration Equipment tabs.
  const byMaster = new Map<string, RawDataSheetPayloadRow[]>()
  const untagged: RawDataSheetPayloadRow[] = []
  for (const row of rows) {
    const id = (row.masterEquipmentId ?? '').trim()
    if (!id) {
      untagged.push(row)
      continue
    }
    const list = byMaster.get(id)
    if (list) list.push(row)
    else byMaster.set(id, [row])
  }

  const ordered: RawDataSheetPayloadRow[] = []
  for (const tab of tabsWithMaster) {
    const id = tab.masterEquipmentId.trim()
    const group = byMaster.get(id)
    if (!group) continue
    const label = masterNameById.get(id) || group[0]?.masterLabel || id
    for (const row of group) {
      ordered.push({
        ...row,
        masterEquipmentId: id,
        masterLabel: label,
      })
    }
    byMaster.delete(id)
  }
  for (const group of byMaster.values()) ordered.push(...group)
  ordered.push(...untagged)

  return { ...payload, rows: ordered }
}

export function RawDataSheetDialog({
  job,
  open,
  onOpenChange,
}: {
  job: CalibrationJobRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [payload, setPayload] = useState<RawDataSheetPayload | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [srf, setSrf] = useState<SrfSummaryForSheet | null>(null)
  const [equipmentMaster, setEquipmentMaster] = useState<EquipmentMasterForSheet | null>(null)
  const [masterEquipments, setMasterEquipments] = useState<MasterEquipmentForSheet[]>([])
  const [reportOpen, setReportOpen] = useState(false)
  const [uncertaintyOpen, setUncertaintyOpen] = useState(false)
  const [environmentOpen, setEnvironmentOpen] = useState(false)
  const [reportRandomnessFactor, setReportRandomnessFactor] = useState('')
  const [reportReadingCols, setReportReadingCols] = useState<string[]>([])
  const [reportReferenceCols, setReportReferenceCols] = useState<Record<string, string>>({})
  const [reportReadingDecimals, setReportReadingDecimals] = useState<Record<string, number>>({})
  const [reportReadingMultiples, setReportReadingMultiples] = useState<Record<string, number>>({})
  const [reportReadingLeastCounts, setReportReadingLeastCounts] = useState<Record<string, string>>(
    {},
  )
  const [calculationsRowId, setCalculationsRowId] = useState<string | null>(null)
  const [contextPanel, setContextPanel] = useState<
    'srf' | 'customer' | 'job' | 'master' | 'verification' | null
  >(null)

  const loadSheet = useCallback(async (activeJob: CalibrationJobRow) => {
    setLoading(true)
    setError(null)
    setMessage(null)
    setPayload(null)
    setSheetId(null)
    setReadOnly(false)
    setSrf(null)
    setEquipmentMaster(null)
    setMasterEquipments([])
    setCalculationsRowId(null)
    setContextPanel(null)

    try {
      const [equipment, srfRow] = await Promise.all([
        resolveEquipmentMasterForJob(activeJob),
        activeJob.service_request_id
          ? fetchSrfSummaryForSheet(activeJob.service_request_id, {
              clientId: activeJob.client_id,
              clientName: activeJob.client_name,
            })
          : Promise.resolve(null),
      ])
      setSrf(srfRow)
      setEquipmentMaster(equipment)

      if (!equipment) {
        setError(
          `No Calibration Equipment matched "${activeJob.equipment_label}". Add or rename it under Calibration Equipments, then open this sheet again.`,
        )
        return
      }

      const masterTabs = collectMasterPointsTabsForJob(
        activeJob,
        equipment.measurement_ranges,
        equipment.range_capacity,
        equipment.resolution_least_count,
        equipment.master_equipment_id,
      )
      const masterIds = collectMasterEquipmentIdsForJob(
        activeJob,
        equipment,
        masterTabs.map((t) => t.masterEquipmentId),
      )
      let masters: MasterEquipmentForSheet[] = []
      try {
        masters = await fetchMasterEquipmentsByIds(masterIds)
        setMasterEquipments(masters)
      } catch {
        setMasterEquipments([])
      }

      const sheet = await ensureRawDataSheetForJob(activeJob.id)
      setSheetId(sheet.id)
      setReadOnly(sheet.sheet_status === 'approved')

      const existing = parseRawDataSheetPayload(sheet.payload)
      // Re-fetch masters including any ids already on the sheet rows.
      if (existing) {
        const withRowIds = collectMasterEquipmentIdsForJob(
          activeJob,
          equipment,
          [
            ...masterTabs.map((t) => t.masterEquipmentId),
            ...existing.rows.map((r) => r.masterEquipmentId ?? ''),
          ],
        )
        if (withRowIds.length > masterIds.length) {
          try {
            masters = await fetchMasterEquipmentsByIds(withRowIds)
            setMasterEquipments(masters)
          } catch {
            // keep previous masters
          }
        }
      }
      const pointsTable = collectCalibrationPointsTableForJob(
        activeJob,
        equipment.measurement_ranges,
        equipment.range_capacity,
        equipment.resolution_least_count,
      )
      const points = collectCalibrationPointsForJob(
        activeJob,
        equipment.measurement_ranges,
        equipment.range_capacity,
        equipment.resolution_least_count,
      )

      const masterNameById = new Map(
        masters.map((m) => [
          m.id,
          (m.equipment_name || '').trim() || (m.asset_code || '').trim() || m.id,
        ]),
      )

      // Keep filled drafts; still append any missing master sections.
      if (
        existing &&
        existing.template.columns.length > 0 &&
        (payloadHasUserReadings(existing) || sheet.sheet_status !== 'draft')
      ) {
        const withMasters = ensureAllMasterRowGroups(
          {
            ...existing,
            environmentConditions: syncEnvironmentFromEquipmentTemplate(
              existing.template,
              existing.environmentConditions,
            ),
          },
          masterTabs,
          masterNameById,
          existing.tableSettings?.decimalPlaces ?? 2,
        )
        setPayload(withMasters)
        return
      }

      // Empty draft → always follow the CURRENT Calibration Equipment format.
      // (Filled sheets are returned above, keeping their snapshot for integrity.)
      const template =
        parseRawDataSheetTemplate(equipment.raw_data_sheet_template) ??
        existing?.template ??
        defaultRawDataSheetTemplate()

      const initial = buildInitialRawDataSheetPayload(template, points)
      // Prefer all master tabs (Load, Indicator Reading, …) so every master’s points appear.
      if (masterTabs.length > 0) {
        const multiRows = rowsFromMasterPointsTabs(
          initial.template.columns,
          masterTabs,
          initial.tableSettings?.decimalPlaces ?? 4,
          masterNameById,
        )
        if (multiRows.length > 0) {
          initial.rows = multiRows
        }
      } else if (pointsTable && pointsTable.rows.length > 0) {
        const multiRows = rowsFromCalibrationPointsTable(
          initial.template.columns,
          pointsTable,
          initial.tableSettings?.decimalPlaces ?? 4,
        )
        if (multiRows.length > 0) {
          initial.rows = multiRows
        }
      }
      if (existing?.verificationAnswers) {
        initial.verificationAnswers = existing.verificationAnswers
      }
      if (existing?.environmentConditions) {
        initial.environmentConditions = existing.environmentConditions
      }
      if (existing?.temperatureCorrection) {
        initial.temperatureCorrection = existing.temperatureCorrection
      }
      await updateRawDataSheetPayload(sheet.id, initial as unknown as Record<string, unknown>)
      setPayload(initial)
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to open Raw Data Sheet'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !job) return
    void loadSheet(job)
  }, [open, job, loadSheet])

  const handleSave = async (asComplete = false) => {
    if (!sheetId || !payload || readOnly) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      if (asComplete) {
        for (const item of payload.template.verification.items) {
          if (item.required && !payload.verificationAnswers[item.id]) {
            throw new Error(`Complete required verification: ${item.label}`)
          }
        }
        for (const row of payload.rows) {
          for (const col of payload.template.columns) {
            if (col.required && !(row.values[col.key] ?? '').trim()) {
              throw new Error(`Fill required column "${col.label}" on all rows`)
            }
          }
        }
      }

      await updateRawDataSheetPayload(
        sheetId,
        payload as unknown as Record<string, unknown>,
        asComplete ? 'under_review' : 'draft',
      )
      setMessage(asComplete ? 'Sheet saved and marked for review.' : 'Draft saved.')
      if (asComplete) setReadOnly(false)
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!job) return null

  const verificationItems = payload?.template.verification.items ?? []
  const verifiedCount = verificationItems.filter((item) =>
    Boolean(payload?.verificationAnswers[item.id]),
  ).length
  const verificationComplete =
    verificationItems.length > 0 && verifiedCount === verificationItems.length
  const eqFields = parseJobEquipmentFields(job)
  const locationLabel =
    job.calibration_location === 'On Site' ? 'Outside (On Site)' : 'Inside (In Lab)'
  /** Proper IS / procedure method from Equipment Master (fallback: SRF equipment line). */
  const calibrationMethodLabel = cellText(
    (equipmentMaster?.calibration_method_label ?? '').trim() ||
      eqFields.calMethod ||
      '',
  )
  const tableSettings = parseTableSettings(payload?.tableSettings)
  const environment: RawDataEnvironmentConditions =
    payload?.environmentConditions ?? {
      ...EMPTY_RAW_DATA_ENVIRONMENT,
      selectedParameters: [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters],
      rows: [],
    }

  const setEnvironment = (next: RawDataEnvironmentConditions) => {
    if (!payload || readOnly) return
    setPayload({ ...payload, environmentConditions: next })
  }

  /** Reading / Point options locked to Calibration Equipment Raw Data Sheet template. */
  // Labels come from template rows via syncEnvironmentFromEquipmentTemplate.

  /** Environment Condition readings always show 2 decimal places (Temp, Humidity, …). */
  const ENV_DECIMAL_PLACES = 2

  const formatEnvironmentNumberValues = (
    env: RawDataEnvironmentConditions,
    decimalPlaces: number = ENV_DECIMAL_PLACES,
  ): RawDataEnvironmentConditions => {
    const paramIds = resolveEnvParameterColumns(env).map((c) => c.id)
    return {
      ...env,
      rows: env.rows.map((row) => {
        if (isEnvStandardFieldLabel(row.readingLabel)) return row
        const values = { ...row.values }
        const keys = paramIds.length > 0 ? paramIds : Object.keys(values)
        for (const key of keys) {
          const raw = String(values[key] ?? '').trim()
          if (!raw) continue
          values[key] = formatNumberInput(raw, decimalPlaces)
        }
        return { ...row, values }
      }),
    }
  }

  const openEnvironmentPanel = (next: boolean) => {
    if (next && payload) {
      const synced = syncEnvironmentFromEquipmentTemplate(
        payload.template,
        payload.environmentConditions,
      )
      setPayload({
        ...payload,
        environmentConditions: formatEnvironmentNumberValues(synced, ENV_DECIMAL_PLACES),
      })
    }
    setEnvironmentOpen(next)
  }

  const patchEnvironmentRow = (
    rowId: string,
    patch: {
      values?: Record<string, string>
      formulas?: Record<string, string>
    },
  ) => {
    setEnvironment({
      ...environment,
      rows: environment.rows.map((row) => {
        if (row.id !== rowId) return row
        const nextFormulas = patch.formulas
          ? { ...(row.formulas ?? {}), ...patch.formulas }
          : row.formulas
        return {
          ...row,
          values: patch.values ? { ...row.values, ...patch.values } : row.values,
          ...(nextFormulas && Object.keys(nextFormulas).length > 0
            ? { formulas: nextFormulas }
            : {}),
        }
      }),
    })
  }

  const commitEnvironmentNumberCell = (rowId: string, paramId: string, raw: string) => {
    if (readOnly) return
    const formatted = formatNumberInput(raw, ENV_DECIMAL_PLACES)
    patchEnvironmentRow(rowId, { values: { [paramId]: formatted } })
  }

  /**
   * Pull latest formulas from Calibration Equipment Raw Data Sheet Format,
   * then recompute all calculated columns from current inputs + Environment.
   */
  const refreshTable = () => {
    if (!payload || readOnly || !job) return

    const equipmentTemplate = equipmentMaster
      ? parseRawDataSheetTemplate(equipmentMaster.raw_data_sheet_template)
      : null
    const mergedTemplate = mergeFormulasFromEquipmentTemplate(
      payload.template,
      equipmentTemplate,
    )

    const syncedEnv = formatEnvironmentNumberValues(
      syncEnvironmentFromEquipmentTemplate(mergedTemplate, payload.environmentConditions),
      ENV_DECIMAL_PLACES,
    )
    const dp = tableSettings.decimalPlaces

    let nextPayload: RawDataSheetPayload = {
      ...payload,
      template: mergedTemplate,
      environmentConditions: syncedEnv,
      rows: payload.rows.map((r) => {
        // Keep input cells; clear stale formula cell values before recompute.
        const values = { ...r.values }
        for (const col of mergedTemplate.columns) {
          if (col.type === 'formula') values[col.key] = ''
        }
        return {
          ...r,
          values: applyFormulaColumns(mergedTemplate.columns, values, dp, syncedEnv),
        }
      }),
    }

    if (equipmentMaster) {
      const masterTabs = collectMasterPointsTabsForJob(
        job,
        equipmentMaster.measurement_ranges,
        equipmentMaster.range_capacity,
        equipmentMaster.resolution_least_count,
        equipmentMaster.master_equipment_id,
      )
      const masterNameById = new Map(
        masterEquipments.map((m) => [
          m.id,
          (m.equipment_name || '').trim() || (m.asset_code || '').trim() || m.id,
        ]),
      )
      nextPayload = ensureAllMasterRowGroups(nextPayload, masterTabs, masterNameById, dp)
      nextPayload = {
        ...nextPayload,
        rows: nextPayload.rows.map((r) => ({
          ...r,
          values: applyFormulaColumns(
            nextPayload.template.columns,
            r.values,
            dp,
            syncedEnv,
          ),
        })),
      }
    }

    setPayload(nextPayload)
    setError(null)
    setMessage(
      'Table refreshed — formulas synced from Calibration Equipment and recalculated.',
    )
  }

  const selectedEnvParams = resolveEnvParameterColumns(environment)

  const addRow = () => {
    if (!payload || readOnly) return
    setPayload({
      ...payload,
      rows: [
        ...payload.rows,
        {
          id: newPayloadRowId(),
          values: emptyValuesForColumns(payload.template.columns),
        },
      ],
    })
  }

  /** Change decimal places and immediately reformat all number + formula cells. */
  const setDecimalPlaces = (nextDp: number) => {
    if (!payload || readOnly) return
    const clamped = Math.max(0, Math.min(6, Math.trunc(nextDp)))
    if (clamped === tableSettings.decimalPlaces) return

    const rows = payload.rows.map((r) => {
      let values = { ...r.values }
      for (const col of payload.template.columns) {
        if (col.type !== 'number') continue
        const raw = String(values[col.key] ?? '').trim()
        if (!raw) continue
        values[col.key] = formatNumberInput(raw, clamped)
      }
      values = applyFormulaColumns(payload.template.columns, values, clamped, environment)
      return { ...r, values }
    })

    setPayload({
      ...payload,
      tableSettings: { ...tableSettings, decimalPlaces: clamped },
      rows,
      environmentConditions: formatEnvironmentNumberValues(environment, ENV_DECIMAL_PLACES),
    })
  }

  const updateCellValue = (rowId: string, colKey: string, value: string) => {
    if (!payload) return
    const nextRows = payload.rows.map((r) => {
      if (r.id !== rowId) return r
      let values = { ...r.values, [colKey]: value }
      values = applyFormulaColumns(
        payload.template.columns,
        values,
        tableSettings.decimalPlaces,
        environment,
      )
      return { ...r, values }
    })
    setPayload({ ...payload, rows: nextRows })
  }

  const inputColumns = (payload?.template.columns ?? []).filter((c) => c.type !== 'formula')
  const reportLeastCountOptions = buildReportLeastCountOptions(
    job,
    equipmentMaster,
    masterEquipments,
  )
  const formulaColumns = (payload?.template.columns ?? []).filter((c) => c.type === 'formula')
  const calculationsRow =
    calculationsRowId && payload
      ? payload.rows.find((r) => r.id === calculationsRowId) ?? null
      : null
  const calculationsRowIndex = calculationsRow
    ? payload!.rows.findIndex((r) => r.id === calculationsRow.id)
    : -1
  const calculationsValues =
    calculationsRow && payload
      ? applyFormulaColumns(
          payload.template.columns,
          calculationsRow.values,
          payload.tableSettings?.decimalPlaces ?? 2,
          payload.environmentConditions,
        )
      : null
  const calculationExplanations: FormulaCalculationExplanation[] =
    calculationsRow && payload
      ? formulaColumns.map((col) =>
          explainFormulaCalculation(
            col,
            calculationsValues ?? calculationsRow.values,
            payload.tableSettings?.decimalPlaces ?? 0,
            payload.template.columns,
            payload.environmentConditions,
          ),
        )
      : []
  const openGenerateReport = () => {
    if (!payload || readOnly) return
    const cols = payload.template.columns.filter((c) => c.type !== 'formula')
    const saved = payload.reportGenerationSettings
    const colKeys = new Set(cols.map((c) => c.key))
    const defaultDp = payload.tableSettings?.decimalPlaces ?? 2

    const decimals: Record<string, number> = {}
    const references: Record<string, string> = {}
    const multiples: Record<string, number> = {}
    const leastCounts: Record<string, string> = {}
    for (const col of cols) {
      decimals[col.key] =
        saved?.decimals[col.key] != null && Number.isFinite(saved.decimals[col.key])
          ? Math.max(0, Math.min(6, Math.round(saved.decimals[col.key]!)))
          : defaultDp
      multiples[col.key] =
        saved?.multiples[col.key] != null && Number.isFinite(saved.multiples[col.key])
          ? saved.multiples[col.key]!
          : 1
      leastCounts[col.key] = saved?.leastCounts[col.key] ?? ''
      const savedRef = saved?.referenceCols[col.key] ?? ''
      references[col.key] =
        savedRef && savedRef !== REFERENCE_NONE && colKeys.has(savedRef) ? savedRef : ''
    }

    const savedReadingCols = (saved?.readingCols ?? []).filter((key) => colKeys.has(key))
    if (savedReadingCols.length > 0) {
      setReportReadingCols(savedReadingCols)
    } else {
      const refGuess =
        cols.find((c) => /load|nominal|reference|std|standard/i.test(c.label) || c.key === 'nominal')
          ?.key ??
        cols[0]?.key ??
        ''
      const readingGuess = cols
        .filter(
          (c) =>
            c.key !== refGuess &&
            /reading|indicator|obs|observed|as\s*found|as\s*left/i.test(c.label),
        )
        .map((c) => c.key)
      setReportReadingCols(
        readingGuess.length > 0
          ? readingGuess
          : cols.filter((c) => c.key !== refGuess).map((c) => c.key),
      )
    }

    setReportReadingDecimals(decimals)
    setReportReadingMultiples(multiples)
    setReportReadingLeastCounts(leastCounts)
    setReportReferenceCols(references)
    setReportRandomnessFactor(saved?.randomnessFactor ?? '')
    setReportOpen(true)
    setError(null)
    setMessage(null)
  }

  const toggleReportReadingCol = (key: string) => {
    setReportReadingCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
    setReportReadingDecimals((prev) => {
      if (prev[key] != null) return prev
      const defaultDp = payload?.tableSettings?.decimalPlaces ?? 2
      return { ...prev, [key]: defaultDp }
    })
    setReportReadingMultiples((prev) => {
      if (prev[key] != null) return prev
      return { ...prev, [key]: 1 }
    })
    setReportReadingLeastCounts((prev) => {
      if (prev[key] != null) return prev
      return { ...prev, [key]: '' }
    })
    setReportReferenceCols((prev) => {
      if (prev[key] != null) return prev
      return { ...prev, [key]: '' }
    })
  }

  const setReportReadingDecimal = (key: string, raw: string) => {
    const n = Number(raw)
    const next =
      !raw.trim() || !Number.isFinite(n) ? 0 : Math.max(0, Math.min(6, Math.round(n)))
    setReportReadingDecimals((prev) => ({ ...prev, [key]: next }))
  }

  const setReportReadingMultiple = (key: string, raw: string) => {
    const n = Number(raw)
    if (!raw.trim() || !Number.isFinite(n)) {
      setReportReadingMultiples((prev) => ({ ...prev, [key]: 1 }))
      return
    }
    setReportReadingMultiples((prev) => ({ ...prev, [key]: n }))
  }

  const setReportReadingLeastCount = (key: string, value: string) => {
    setReportReadingLeastCounts((prev) => ({
      ...prev,
      [key]: value === LEAST_COUNT_NONE ? '' : value,
    }))
  }

  /**
   * Reverse calculation: fill Reading columns near Reference with a small
   * deviation inside ±RandomnessFactor% of (Reference × Multiple), then
   * recalc formula columns. Settings are saved on the sheet; each click uses
   * a fresh random seed so values change on regenerate.
   */
  const generateReportReverseCalc = () => {
    if (!payload || readOnly || !sheetId) return
    if (reportReadingCols.length === 0) {
      setError('Select at least one Reading column.')
      return
    }
    const factorText = reportRandomnessFactor.trim()
    if (!factorText) {
      setError(
        'Enter Randomness Factor (%). Readings will populate within ± that % of Reference × Multiple.',
      )
      return
    }
    const factor = Number(factorText)
    if (!Number.isFinite(factor) || factor < 0) {
      setError('Randomness Factor must be a non-negative percentage.')
      return
    }
    if (factor === 0) {
      setError('Randomness Factor must be greater than 0 so readings can deviate from Reference.')
      return
    }

    const dp = tableSettings.decimalPlaces
    const generationSeed = newReportGenerationSeed()
    const reportGenerationSettings: RawDataReportGenerationSettings = {
      randomnessFactor: factorText,
      readingCols: [...reportReadingCols],
      referenceCols: { ...reportReferenceCols },
      multiples: { ...reportReadingMultiples },
      leastCounts: { ...reportReadingLeastCounts },
      decimals: { ...reportReadingDecimals },
    }

    let filledRows = 0
    const nextRows = payload.rows.map((row) => {
      let values = { ...row.values }
      let rowFilled = false
      for (const key of reportReadingCols) {
        const referenceKey = reportReferenceCols[key]
        const hasReference =
          Boolean(referenceKey) && referenceKey !== REFERENCE_NONE
        const refRaw = hasReference
          ? String(row.values[referenceKey] ?? '').trim()
          : '0'
        const ref = Number(refRaw)
        if (hasReference && (!refRaw || !Number.isFinite(ref))) continue
        const colDp = reportReadingDecimals[key] ?? dp
        const multiple = reportReadingMultiples[key] ?? 1
        const leastCount = resolveReportLeastCount(
          reportReadingLeastCounts[key],
          reportLeastCountOptions,
        )
        values[key] = readingWithRandomnessDeviation(
          ref,
          factor,
          `${generationSeed}:${row.id}:${key}`,
          colDp,
          multiple,
          leastCount,
          !hasReference,
        )
        rowFilled = true
      }
      if (!rowFilled) return row
      values = applyFormulaColumns(payload.template.columns, values, dp, environment)
      filledRows += 1
      return { ...row, values }
    })

    if (filledRows === 0) {
      setError(
        'No numeric values found in the selected Reference Value columns.',
      )
      setMessage(null)
      return
    }

    const nextPayload: RawDataSheetPayload = {
      ...payload,
      rows: nextRows,
      reportGenerationSettings,
    }
    setPayload(nextPayload)
    setReportOpen(false)
    setError(null)
    setMessage(
      `Generated report for ${filledRows} point(s): Readings ≈ (Reference × Multiple) ± ${formatNumberInput(String(factor), Math.min(dp, 4))}%. Settings saved.`,
    )

    void updateRawDataSheetPayload(
      sheetId,
      nextPayload as unknown as Record<string, unknown>,
      'draft',
    ).catch((err) => {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Could not save generated report settings'
      setError(msg)
    })
  }

  const openMasterDetails = () => {
    setContextPanel('master')
    if (!job || !equipmentMaster) return
    const extra = [
      ...(payload?.rows.map((r) => r.masterEquipmentId ?? '') ?? []),
      ...collectMasterPointsTabsForJob(
        job,
        equipmentMaster.measurement_ranges,
        equipmentMaster.range_capacity,
        equipmentMaster.resolution_least_count,
        equipmentMaster.master_equipment_id,
      ).map((t) => t.masterEquipmentId),
    ]
    const ids = collectMasterEquipmentIdsForJob(job, equipmentMaster, extra)
    void fetchMasterEquipmentsByIds(ids)
      .then((masters) => {
        setMasterEquipments(masters)
      })
      .catch(() => {
        /* keep existing list */
      })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
        layer="nested"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
          <DialogHeader className="relative pr-12 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              Calibration Conduct · Raw Data Sheet
            </p>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                  {cellText(job.equipment_label)}
                </DialogTitle>
              </div>
              {!loading ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-white/25 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setContextPanel('srf')}
                    aria-label="Open SRF Details"
                  >
                    <ClipboardList size={14} className="mr-1.5" aria-hidden />
                    SRF Details
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-white/25 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setContextPanel('customer')}
                    aria-label="Open Customer Details"
                  >
                    <Briefcase size={14} className="mr-1.5" aria-hidden />
                    Customer Details
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-white/25 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setContextPanel('job')}
                    aria-label="Open Job Allocation Details"
                  >
                    <Package size={14} className="mr-1.5" aria-hidden />
                    Job Allocation
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-white/25 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                    onClick={openMasterDetails}
                    aria-label="Open Master Details"
                  >
                    <Gauge size={14} className="mr-1.5" aria-hidden />
                    Master Details
                  </Button>
                </div>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading sheet…</p>
          ) : null}

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
              {message}
            </p>
          ) : null}

          {/* Context detail dialogs (opened from header buttons) */}
          <Dialog
            open={contextPanel === 'srf'}
            onOpenChange={(next) => {
              if (!next) setContextPanel(null)
            }}
          >
            <DialogContent
              className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
              layer="nested"
              aria-describedby={undefined}
            >
              <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                    Request Context
                  </p>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                    SRF Details
                  </DialogTitle>
                </DialogHeader>
              </div>
              <div className="max-h-[min(70vh,640px)] overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
                <div className="grid grid-cols-2 gap-2">
                  <DetailField
                    label="SRF Number"
                    value={cellText(srf?.srf_number ?? job.srf_number)}
                  />
                  <DetailField label="SRF Date" value={formatDate(srf?.srf_date)} />
                  <DetailField label="SRF Status" value={cellText(srf?.status)} />
                  <DetailField
                    label="Calibration Method"
                    value={calibrationMethodLabel}
                    multiline
                  />
                  <DetailField
                    label="Accreditation"
                    value={cellText(srf?.accreditation_status)}
                  />
                  <DetailField
                    label="Required Completion"
                    value={formatDate(srf?.required_completion_date)}
                  />
                  <DetailField
                    label="Customer Ref. No"
                    value={cellText(srf?.customer_reference_no)}
                    emptyHint="Not entered on SRF"
                  />
                  <DetailField
                    label="Customer Required Date"
                    value={formatDate(srf?.customer_required_date)}
                  />
                  <DetailField label="Condition" value={cellText(eqFields.condition)} />
                  <DetailField label="Physical" value={cellText(eqFields.physical)} />
                  <DetailField
                    label="Method Notes"
                    value={cellText(srf?.method_notes)}
                    multiline
                    emptyHint="Not entered on SRF"
                    className="col-span-2"
                  />
                  <DetailField
                    label="Special Instruction"
                    value={cellText(srf?.special_instruction)}
                    multiline
                    emptyHint="Not entered on SRF"
                    className="col-span-2"
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={contextPanel === 'customer'}
            onOpenChange={(next) => {
              if (!next) setContextPanel(null)
            }}
          >
            <DialogContent
              className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
              layer="nested"
              aria-describedby={undefined}
            >
              <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                    Request Context
                  </p>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                    Customer Details
                  </DialogTitle>
                </DialogHeader>
              </div>
              <div className="max-h-[min(70vh,640px)] overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
                <div className="grid grid-cols-2 gap-2">
                  <DetailField
                    label="Client"
                    value={cellText(srf?.client_name ?? job.client_name)}
                    className="col-span-2"
                  />
                  <DetailField
                    label="Contact Person"
                    value={cellText(srf?.contact_person)}
                    emptyHint="Not on SRF / Client"
                  />
                  <DetailField
                    label="Phone"
                    value={cellText(srf?.contact_phone)}
                    emptyHint="Not on SRF / Client"
                  />
                  <DetailField
                    label="Email"
                    value={cellText(srf?.contact_email ?? srf?.contact_number_mail)}
                    multiline
                    emptyHint="Not on SRF / Client"
                    className="col-span-2"
                  />
                  <DetailField
                    label="Customer Address"
                    value={cellText(srf?.customer_address)}
                    multiline
                    emptyHint="Not on Client Master"
                    className="col-span-2"
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={contextPanel === 'job'}
            onOpenChange={(next) => {
              if (!next) setContextPanel(null)
            }}
          >
            <DialogContent
              className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
              layer="nested"
              aria-describedby={undefined}
            >
              <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                    Request Context
                  </p>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                    Job Allocation Details
                  </DialogTitle>
                </DialogHeader>
              </div>
              <div className="max-h-[min(70vh,640px)] overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
                <div className="grid grid-cols-2 gap-2">
                  <DetailField label="Equipment" value={cellText(job.equipment_label)} />
                  <DetailField label="Range" value={cellText(eqFields.range)} />
                  <DetailField label="Least Count" value={cellText(eqFields.leastCount)} />
                  <DetailField label="Make" value={cellText(eqFields.make)} />
                  <DetailField label="Model" value={cellText(eqFields.model)} />
                  <DetailField label="Serial No." value={cellText(eqFields.serial)} />
                  <DetailField label="Quantity" value={cellText(eqFields.quantity)} />
                  <DetailField label="Accuracy" value={cellText(eqFields.accuracy)} />
                  <DetailField label="Location" value={locationLabel} />
                  <DetailField
                    label="Allocated Engineer"
                    value={cellText(job.allocated_engineer_name)}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={contextPanel === 'master'}
            onOpenChange={(next) => {
              if (!next) setContextPanel(null)
            }}
          >
            <DialogContent
              className={cn(
                'max-h-[90vh] w-[calc(100vw-1rem)] gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg',
                masterEquipments.length > 1 ? 'max-w-3xl' : 'max-w-2xl',
              )}
              layer="nested"
              aria-describedby={undefined}
            >
              <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                    Reference Standards
                    {masterEquipments.length > 1
                      ? ` · ${masterEquipments.length} masters`
                      : ''}
                  </p>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                    Master Details
                  </DialogTitle>
                </DialogHeader>
              </div>
              <div className="max-h-[min(70vh,640px)] space-y-4 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
                {masterEquipments.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-200 bg-white/70 px-3 py-6 text-center text-sm text-slate-500">
                    No master equipment linked for this Calibration Equipment. Set Master Equipment
                    in Calibration Equipments → Points for each range that uses a reference
                    standard.
                  </p>
                ) : (
                  <>
                    {masterEquipments.length > 1 ? (
                      <p className="text-xs text-slate-600">
                        Showing all {masterEquipments.length} reference standards linked on this
                        Calibration Equipment.
                      </p>
                    ) : null}
                    {masterEquipments.map((master, index) => (
                      <div
                        key={master.id}
                        className="rounded-md border border-slate-200 bg-white/80 px-3 py-3"
                      >
                        {masterEquipments.length > 1 ? (
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-teal-800">
                            Master {index + 1}
                            {(master.equipment_name || master.asset_code)
                              ? ` · ${(master.equipment_name || master.asset_code || '').trim()}`
                              : ''}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2">
                          <DetailField label="Asset Code" value={cellText(master.asset_code)} />
                          <DetailField
                            label="Equipment Name"
                            value={cellText(master.equipment_name)}
                          />
                          <DetailField
                            label="Manufacturer"
                            value={cellText(master.manufacturer)}
                          />
                          <DetailField label="Model" value={cellText(master.model_number)} />
                          <DetailField
                            label="Serial No."
                            value={cellText(master.serial_number)}
                          />
                          <DetailField
                            label="Status"
                            value={cellText(master.equipment_status)}
                          />
                          <DetailField label="Range" value={cellText(master.range_capacity)} />
                          <DetailField
                            label="Least Count"
                            value={cellText(master.resolution_least_count)}
                          />
                          <DetailField
                            label="Accuracy"
                            value={cellText(master.accuracy_acceptance_criteria)}
                          />
                          <DetailField
                            label="Location"
                            value={cellText(master.current_location)}
                          />
                          <DetailField
                            label="Cal Frequency"
                            value={cellText(master.calibration_frequency)}
                          />
                          <DetailField
                            label="Last Calibration"
                            value={formatDate(master.last_calibration_date)}
                          />
                          <DetailField
                            label="Next Cal Due"
                            value={resolveMasterNextCalDue(master)}
                            emptyHint={
                              (master.last_calibration_date ?? '').trim()
                                ? 'Set Next Due on Equipment for Calibration'
                                : undefined
                            }
                          />
                          <DetailField
                            label="Certificate No."
                            value={cellText(master.calibration_certificate_number)}
                          />
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={contextPanel === 'verification'}
            onOpenChange={(next) => {
              if (!next) setContextPanel(null)
            }}
          >
            <DialogContent
              className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
              layer="nested"
              aria-describedby={undefined}
            >
              <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                    Before Calibration
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                      Pre-Calibration Verification
                    </DialogTitle>
                    {verificationItems.length > 0 ? (
                      <span
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums',
                          verificationComplete
                            ? 'border-teal-400/50 bg-teal-500/20 text-teal-100'
                            : 'border-white/20 bg-white/10 text-white/80',
                        )}
                      >
                        {verifiedCount}/{verificationItems.length} verified
                      </span>
                    ) : null}
                  </div>
                </DialogHeader>
              </div>
              <div className="max-h-[min(70vh,640px)] overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
                {!payload || verificationItems.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-200 bg-white/70 px-3 py-6 text-center text-sm text-slate-500">
                    No verification checks on this template.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-1">
                    {verificationItems.map((item, index) => {
                      const checked = Boolean(payload.verificationAnswers[item.id])
                      return (
                        <li key={item.id}>
                          <div
                            className={cn(
                              'flex h-full items-start gap-3 rounded-lg border px-3 py-3 transition-colors',
                              checked
                                ? 'border-teal-300 bg-teal-50/60'
                                : 'border-slate-200 bg-white',
                              readOnly && 'opacity-90',
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="mb-1 flex items-center gap-2">
                                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                                {item.required ? (
                                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700">
                                    Required
                                  </span>
                                ) : (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                    Optional
                                  </span>
                                )}
                              </span>
                              <span
                                className={cn(
                                  'block text-sm leading-snug',
                                  checked ? 'font-medium text-slate-900' : 'text-slate-700',
                                )}
                              >
                                {item.label}
                              </span>
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={checked}
                              aria-label={item.label}
                              disabled={readOnly}
                              onClick={() => {
                                setPayload({
                                  ...payload,
                                  verificationAnswers: {
                                    ...payload.verificationAnswers,
                                    [item.id]: !checked,
                                  },
                                })
                              }}
                              className={cn(
                                'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
                                checked
                                  ? 'border-teal-600 bg-teal-600'
                                  : 'border-slate-300 bg-slate-200',
                              )}
                            >
                              <span
                                className={cn(
                                  'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                                  checked ? 'translate-x-[22px]' : 'translate-x-0.5',
                                )}
                                aria-hidden
                              />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {payload ? (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={18} className="text-cyan-800" aria-hidden />
                    <h3 className="text-sm font-semibold text-foreground">Raw Data</h3>
                    <div
                      className="inline-flex h-7 items-center overflow-hidden rounded border border-slate-200 bg-slate-50"
                      title="Decimal places for all number fields"
                    >
                      <button
                        type="button"
                        className="flex h-full items-center px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                        disabled={readOnly || tableSettings.decimalPlaces <= 0}
                        onClick={() => setDecimalPlaces(tableSettings.decimalPlaces - 1)}
                        aria-label="Decrease decimal places"
                      >
                        <ChevronDown size={12} aria-hidden />
                      </button>
                      <span className="min-w-[2.25rem] px-1 text-center font-mono text-[10px] tabular-nums text-slate-600">
                        {tableSettings.decimalPlaces} dp
                      </span>
                      <button
                        type="button"
                        className="flex h-full items-center px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                        disabled={readOnly || tableSettings.decimalPlaces >= 6}
                        onClick={() => setDecimalPlaces(tableSettings.decimalPlaces + 1)}
                        aria-label="Increase decimal places"
                      >
                        <ChevronUp size={12} aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-slate-400/50 text-slate-800 hover:bg-slate-50"
                      disabled={readOnly || !payload}
                      onClick={refreshTable}
                      aria-label="Refresh table formulas"
                      title="Recalculate all formula columns from inputs and Environment Condition"
                    >
                      <RefreshCw size={14} className="mr-1" />
                      Table Refresh
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-8 border-amber-600/40 text-amber-900 hover:bg-amber-50',
                        verificationItems.length > 0 &&
                          verificationComplete &&
                          'border-teal-600/50 bg-teal-50 text-teal-900',
                      )}
                      onClick={() => setContextPanel('verification')}
                      aria-label="Open Pre-Calibration Verification"
                      title={
                        verificationItems.length > 0
                          ? `${verifiedCount}/${verificationItems.length} verified`
                          : 'Pre-Calibration Verification'
                      }
                    >
                      <ClipboardCheck size={14} className="mr-1" />
                      Verification
                      {verificationItems.length > 0 ? (
                        <span className="ml-1.5 font-mono text-[10px] tabular-nums opacity-80">
                          {verifiedCount}/{verificationItems.length}
                        </span>
                      ) : null}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-sky-600/40 text-sky-800 hover:bg-sky-50"
                      disabled={readOnly}
                      onClick={() => openEnvironmentPanel(true)}
                      aria-label="Environment condition"
                      title="Record temperature, humidity and pressure"
                    >
                      <Thermometer size={14} className="mr-1" />
                      Environment Condition
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-indigo-600/40 text-indigo-800 hover:bg-indigo-50"
                      disabled={readOnly || payload.rows.length === 0}
                      onClick={() => setUncertaintyOpen(true)}
                      aria-label="Uncertainty calculation step by step"
                      title="Type A / Type B budget → combined & expanded uncertainty"
                    >
                      <Sigma size={14} className="mr-1" />
                      Uncertainty Step by Step
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                      disabled={readOnly}
                      onClick={openGenerateReport}
                      aria-label="Generate report with reverse calculation"
                      title="Enter uncertainty U; readings deviate within ±U of Reference"
                    >
                      <Calculator size={14} className="mr-1" />
                      Generate Report
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-12 border border-slate-200 px-2 py-2 text-center">#</th>
                        {inputColumns.map((col) => (
                          <th
                            key={col.key}
                            className="min-w-[110px] border border-slate-200 px-2 py-2 text-center"
                          >
                            {col.label}
                            {col.required ? (
                              <span className="ml-0.5 text-destructive">*</span>
                            ) : null}
                          </th>
                        ))}
                        {formulaColumns.length > 0 ? (
                          <th className="min-w-[120px] border border-slate-200 px-2 py-2 text-center">
                            Calculations
                            <span
                              className="ml-1 text-indigo-600"
                              title={`${formulaColumns.length} auto-calculated fields`}
                            >
                              Σ
                            </span>
                          </th>
                        ) : null}
                        {!readOnly ? (
                          <th className="w-20 border border-slate-200 px-2 py-2 text-center">
                            Action
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {payload.rows.map((row, index) => {
                        const isLast = index === payload.rows.length - 1
                        const rowValues = applyFormulaColumns(
                          payload.template.columns,
                          row.values,
                          tableSettings.decimalPlaces,
                          environment,
                        )
                        const prevMaster = index > 0 ? payload.rows[index - 1]?.masterEquipmentId : null
                        const showMasterHeader =
                          Boolean(row.masterLabel || row.masterEquipmentId) &&
                          (index === 0 || prevMaster !== (row.masterEquipmentId ?? ''))
                        const colSpan =
                          1 +
                          inputColumns.length +
                          (formulaColumns.length > 0 ? 1 : 0) +
                          (!readOnly ? 1 : 0)
                        const filledCalcCount = formulaColumns.filter(
                          (c) => (rowValues[c.key] ?? '').trim().length > 0,
                        ).length
                        return (
                          <Fragment key={row.id}>
                            {showMasterHeader ? (
                              <tr className="bg-slate-50/90">
                                <td
                                  colSpan={colSpan}
                                  className="border border-slate-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-800"
                                >
                                  {row.masterLabel ||
                                    row.masterEquipmentId ||
                                    'Master Equipment'}
                                </td>
                              </tr>
                            ) : null}
                          <tr>
                            <td className="border border-slate-200 px-2 py-2 text-center text-slate-500">
                              {index + 1}
                            </td>
                            {inputColumns.map((col) => (
                                <td key={col.key} className="border border-slate-200 px-2 py-1.5">
                                  <Input
                                    type={col.type === 'number' ? 'number' : 'text'}
                                    step={
                                      col.type === 'number'
                                        ? tableSettings.decimalPlaces === 0
                                          ? '1'
                                          : `0.${'1'.padStart(tableSettings.decimalPlaces, '0')}`
                                        : undefined
                                    }
                                    className="h-9 text-center"
                                    value={rowValues[col.key] ?? ''}
                                    disabled={readOnly}
                                    aria-label={`${col.label} row ${index + 1}`}
                                    onChange={(e) =>
                                      updateCellValue(row.id, col.key, e.target.value)
                                    }
                                    onBlur={(e) => {
                                      if (col.type !== 'number') return
                                      const formatted = formatNumberInput(
                                        e.target.value,
                                        tableSettings.decimalPlaces,
                                      )
                                      if (formatted !== e.target.value) {
                                        updateCellValue(row.id, col.key, formatted)
                                      }
                                    }}
                                  />
                                </td>
                            ))}
                            {formulaColumns.length > 0 ? (
                              <td className="border border-slate-200 px-2 py-1.5 text-center">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 border-indigo-600/40 text-indigo-800 hover:bg-indigo-50"
                                  onClick={() => setCalculationsRowId(row.id)}
                                  aria-label={`View calculations for row ${index + 1}`}
                                  title="View all calculated fields for this row"
                                >
                                  <Eye size={14} className="mr-1.5" aria-hidden />
                                  View
                                  <span className="ml-1.5 font-mono text-[10px] tabular-nums text-indigo-600/80">
                                    {filledCalcCount}/{formulaColumns.length}
                                  </span>
                                </Button>
                              </td>
                            ) : null}
                            {!readOnly ? (
                              <td className="border border-slate-200 px-2 py-2 text-center">
                                {isLast ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 px-0 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                                    onClick={addRow}
                                    aria-label="Add row"
                                    title="Add row"
                                  >
                                    <Plus size={16} />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                                    onClick={() => {
                                      setPayload({
                                        ...payload,
                                        rows: payload.rows.filter((r) => r.id !== row.id),
                                      })
                                    }}
                                    aria-label={`Delete row ${index + 1}`}
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                )}
                              </td>
                            ) : null}
                          </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <Dialog open={environmentOpen} onOpenChange={openEnvironmentPanel}>
                <DialogContent
                  className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
                  layer="nested"
                  aria-describedby={undefined}
                >
                  <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                    <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
                    <DialogHeader className="relative pr-10 text-left">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                        ISO / IEC 17025 · Clause 6.3
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                          Environment Condition
                        </DialogTitle>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">
                          Parameters
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          {selectedEnvParams.map((opt) => (
                            <span
                              key={opt.id}
                              className="rounded border border-teal-400/50 bg-teal-500/25 px-2 py-0.5 text-[10px] font-medium text-teal-50"
                              title={opt.header}
                            >
                              {opt.header}
                            </span>
                          ))}
                        </div>
                        {selectedEnvParams.length === 0 ? (
                          <span className="text-[11px] text-amber-200/90">
                            No parameter columns configured on equipment template
                          </span>
                        ) : null}
                      </div>
                    </DialogHeader>
                  </div>

                  <div className="max-h-[min(70vh,640px)] space-y-3 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
                    <p className="text-xs text-slate-600">
                      Reading / Point rows come from Calibration Equipment → Raw Data Sheet Format.
                      Enter only the parameter readings below.
                    </p>

                    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                      <table className="w-full min-w-[420px] border-collapse text-sm">
                        <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="min-w-[160px] border border-slate-200 px-2 py-2 text-left">
                              Reading / Point
                            </th>
                            {selectedEnvParams.map((opt) => (
                              <th
                                key={opt.id}
                                className="min-w-[120px] border border-slate-200 px-2 py-2 text-center"
                              >
                                {opt.header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {environment.rows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={Math.max(1, selectedEnvParams.length + 1)}
                                className="border border-slate-200 px-3 py-8 text-center text-sm text-slate-500"
                              >
                                No environment rows on the equipment Raw Data Sheet Format. Add Field
                                rows under Calibration Equipments → Raw Data Sheet Format →
                                Environment Condition.
                              </td>
                            </tr>
                          ) : (
                            environment.rows.map((row, index) => {
                              const isCalcRow = isEnvStandardFieldLabel(row.readingLabel)
                              return (
                              <tr key={row.id}>
                                <td className="border border-slate-200 px-2.5 py-2 align-middle">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-medium text-slate-800">
                                      {row.readingLabel || `Row ${index + 1}`}
                                    </span>
                                    {isCalcRow ? (
                                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-800">
                                        Calculated
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                {selectedEnvParams.map((opt) => {
                                  if (isCalcRow) {
                                    const formula =
                                      row.formulas?.[opt.id] ?? row.values[opt.id] ?? ''
                                    let computed = ''
                                    if (formula.trim()) {
                                      try {
                                        const n = evaluateEnvParameterFormula(
                                          formula,
                                          environment.rows,
                                          opt.id,
                                        )
                                        if (n != null && Number.isFinite(n)) {
                                          computed = n.toFixed(ENV_DECIMAL_PLACES)
                                        }
                                      } catch {
                                        computed = ''
                                      }
                                    }
                                    return (
                                      <td
                                        key={opt.id}
                                        className="border border-slate-200 px-1.5 py-1"
                                      >
                                        <Input
                                          readOnly
                                          value={computed}
                                          title={formula || undefined}
                                          placeholder={formula || opt.header}
                                          className="h-8 bg-indigo-50/50 text-center font-mono text-indigo-950"
                                          aria-label={`${opt.header} calculated for row ${index + 1}`}
                                        />
                                      </td>
                                    )
                                  }
                                  return (
                                  <td key={opt.id} className="border border-slate-200 px-1.5 py-1">
                                    <Input
                                      inputMode="decimal"
                                      placeholder={opt.header}
                                      value={row.values[opt.id] ?? ''}
                                      disabled={readOnly}
                                      onChange={(e) =>
                                        patchEnvironmentRow(row.id, {
                                          values: { [opt.id]: e.target.value },
                                        })
                                      }
                                      onBlur={(e) =>
                                        commitEnvironmentNumberCell(
                                          row.id,
                                          opt.id,
                                          e.target.value,
                                        )
                                      }
                                      className="h-8 text-center font-mono"
                                      aria-label={`${opt.header} for row ${index + 1}`}
                                    />
                                  </td>
                                  )
                                })}
                              </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="rds-env-notes">Notes</Label>
                      <Input
                        id="rds-env-notes"
                        placeholder="Optional remarks"
                        value={environment.notes}
                        disabled={readOnly}
                        onChange={(e) =>
                          setEnvironment({ ...environment, notes: e.target.value })
                        }
                        className="h-9"
                      />
                    </div>

                    <div className="flex justify-end border-t border-slate-200 pt-3">
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 bg-teal-600 text-white hover:bg-teal-500"
                        onClick={() => {
                          if (payload && !readOnly) {
                            const nextEnv = formatEnvironmentNumberValues(
                              environment,
                              ENV_DECIMAL_PLACES,
                            )
                            const rows = payload.rows.map((r) => ({
                              ...r,
                              values: applyFormulaColumns(
                                payload.template.columns,
                                r.values,
                                tableSettings.decimalPlaces,
                                nextEnv,
                              ),
                            }))
                            setPayload({
                              ...payload,
                              environmentConditions: nextEnv,
                              rows,
                            })
                          }
                          openEnvironmentPanel(false)
                        }}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={Boolean(calculationsRowId)}
                onOpenChange={(next) => {
                  if (!next) setCalculationsRowId(null)
                }}
              >
                <DialogContent
                  className="fixed inset-2 z-[60] flex h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
                  layer="nested"
                  aria-describedby={undefined}
                >
                  <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                    <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-indigo-400 via-violet-500 to-transparent" />
                    <DialogHeader className="relative pr-10 text-left">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-indigo-300/90">
                        Raw Data · Calculated Fields
                      </p>
                      <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                        Calculations
                        {calculationsRowIndex >= 0 ? (
                          <span className="ml-2 font-mono text-sm font-normal text-white/70">
                            Row {calculationsRowIndex + 1}
                          </span>
                        ) : null}
                      </DialogTitle>
                      {calculationsRow?.masterLabel || calculationsRow?.pointValue ? (
                        <p className="mt-1 text-xs text-white/65">
                          {[calculationsRow.masterLabel, calculationsRow.pointValue]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </DialogHeader>
                  </div>

                  <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
                    {formulaColumns.length === 0 ? (
                      <p className="text-sm text-slate-500">No calculated columns on this sheet.</p>
                    ) : (
                      <>
                        <div className="overflow-auto rounded-md border border-slate-200">
                          <table className="w-full min-w-[640px] border-collapse text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="w-12 border border-slate-200 px-2 py-2 text-center">
                                  #
                                </th>
                                {formulaColumns.map((col) => (
                                  <th
                                    key={col.key}
                                    className="min-w-[110px] border border-slate-200 px-2 py-2 text-center"
                                  >
                                    {col.label}
                                    <span
                                      className="ml-1 text-indigo-600"
                                      title={`Auto-calculated (${formulaOpMeta(col.formula?.op ?? 'sum').label})`}
                                    >
                                      Σ
                                    </span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="border border-slate-200 px-2 py-2 text-center text-slate-500">
                                  {calculationsRowIndex >= 0 ? calculationsRowIndex + 1 : ''}
                                </td>
                                {formulaColumns.map((col) => (
                                  <td
                                    key={col.key}
                                    className="border border-slate-200 px-2 py-1.5"
                                  >
                                    <Input
                                      type="text"
                                      className="h-9 bg-slate-50 text-center font-medium text-indigo-900"
                                      value={calculationsValues?.[col.key] ?? ''}
                                      disabled
                                      readOnly
                                      aria-label={`${col.label} calculated value`}
                                    />
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="space-y-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Calculation Steps
                          </p>
                          <div className="grid gap-3 lg:grid-cols-2">
                            {calculationExplanations.map((item, index) => (
                              <div
                                key={item.columnKey}
                                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                              >
                                <div className="mb-2 flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-600">
                                      Column {index + 1}
                                    </p>
                                    <h4 className="truncate text-sm font-semibold text-slate-900">
                                      {item.columnLabel}
                                    </h4>
                                  </div>
                                  <div className="shrink-0 rounded-md bg-indigo-50 px-2.5 py-1 text-sm font-semibold text-indigo-900">
                                    {item.result || '—'}
                                  </div>
                                </div>

                                {item.formulaText ? (
                                  <p className="mb-2 break-words rounded border border-slate-100 bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-700">
                                    {item.formulaText}
                                  </p>
                                ) : null}

                                {item.inputs.length > 0 ? (
                                  <div className="mb-2 space-y-1">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                      Inputs
                                    </p>
                                    <ul className="space-y-0.5 text-xs text-slate-700">
                                      {item.inputs.map((input) => (
                                        <li
                                          key={`${item.columnKey}-${input.label}`}
                                          className="flex items-center justify-between gap-2"
                                        >
                                          <span className="min-w-0 truncate text-slate-600">
                                            {input.label}
                                          </span>
                                          <span className="shrink-0 font-mono text-slate-900">
                                            {input.value}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-700">
                                  {item.steps.map((step, stepIndex) => (
                                    <li key={`${item.columnKey}-step-${stepIndex}`}>{step}</li>
                                  ))}
                                </ol>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 justify-end border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
                    <Button
                      type="button"
                      className="bg-indigo-600 text-white hover:bg-indigo-500"
                      onClick={() => setCalculationsRowId(null)}
                    >
                      Close
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <UncertaintyStepByStepDialog
                open={uncertaintyOpen}
                onOpenChange={setUncertaintyOpen}
                columns={payload.template.columns}
                rows={payload.rows}
                decimalPlaces={tableSettings.decimalPlaces}
                onApplyUncertainty={(u) => {
                  setMessage(`Expanded uncertainty U = ${u} calculated (use Randomness Factor % in Generate Report to populate readings).`)
                  setError(null)
                }}
              />

              <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent
                  className="max-w-3xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
                  layer="nested"
                  aria-describedby={undefined}
                >
                  <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                    <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
                    <DialogHeader className="relative pr-10 text-left">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                        Raw Data · Reverse Calculation
                      </p>
                      <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                        Generate Report
                      </DialogTitle>
                    </DialogHeader>
                  </div>

                  <div className="space-y-4 bg-[#fafbfc] px-4 py-4 sm:px-5">
                    <div className="space-y-2">
                      <Label htmlFor="rds-report-randomness">Randomness Factor (%) *</Label>
                      <Input
                        id="rds-report-randomness"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        placeholder="e.g. 0.5"
                        value={reportRandomnessFactor}
                        onChange={(e) => setReportRandomnessFactor(e.target.value)}
                        aria-label="Randomness Factor percent"
                        title="All reading values populate within ± this % of (Reference × Multiple)"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,0.75fr)_64px_minmax(150px,0.85fr)_56px] items-end gap-2 px-1">
                        <Label>Input / Reading column</Label>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Reference Value
                        </span>
                        <span className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Multiple
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Least Count
                        </span>
                        <span className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Decimals
                        </span>
                      </div>
                      <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                        {inputColumns.length === 0 ? (
                          <p className="px-1 py-2 text-xs text-muted-foreground">
                            No input columns available.
                          </p>
                        ) : (
                          inputColumns.map((col) => {
                              const checked = reportReadingCols.includes(col.key)
                              const colDp =
                                reportReadingDecimals[col.key] ??
                                tableSettings.decimalPlaces
                              const multiple = reportReadingMultiples[col.key] ?? 1
                              const leastCount = reportReadingLeastCounts[col.key] ?? ''
                              return (
                                <div
                                  key={col.key}
                                  className="grid grid-cols-[minmax(0,1fr)_minmax(120px,0.75fr)_64px_minmax(150px,0.85fr)_56px] items-center gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-slate-50"
                                >
                                  <label className="flex min-w-0 cursor-pointer items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 shrink-0 accent-teal-600"
                                      checked={checked}
                                      onChange={() => toggleReportReadingCol(col.key)}
                                      onKeyDown={(e) => {
                                        if (e.key !== 'Enter') return
                                        e.preventDefault()
                                        e.stopPropagation()
                                        toggleReportReadingCol(col.key)
                                      }}
                                    />
                                    <span className="min-w-0 flex-1 truncate">{col.label}</span>
                                  </label>
                                  <Select
                                    value={reportReferenceCols[col.key] || REFERENCE_NONE}
                                    disabled={!checked}
                                    onValueChange={(value) =>
                                      setReportReferenceCols((prev) => ({
                                        ...prev,
                                        [col.key]: value === REFERENCE_NONE ? '' : value,
                                      }))
                                    }
                                  >
                                    <SelectTrigger
                                      className="h-8 min-w-0 text-xs"
                                      aria-label={`Reference value for ${col.label}`}
                                    >
                                      <SelectValue placeholder="None" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={REFERENCE_NONE}>None</SelectItem>
                                      {inputColumns
                                        .filter((candidate) => candidate.key !== col.key)
                                        .map((candidate) => (
                                          <SelectItem key={candidate.key} value={candidate.key}>
                                            {candidate.label}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    step="any"
                                    inputMode="decimal"
                                    className="h-7 w-full px-2 text-center text-xs"
                                    value={multiple}
                                    disabled={!checked}
                                    aria-label={`Multiple for ${col.label}`}
                                    title="Reading = (Reference × Multiple) ± Randomness Factor %"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      setReportReadingMultiple(col.key, e.target.value)
                                    }
                                  />
                                  <Select
                                    value={leastCount || LEAST_COUNT_NONE}
                                    disabled={!checked}
                                    onValueChange={(value) =>
                                      setReportReadingLeastCount(col.key, value)
                                    }
                                  >
                                    <SelectTrigger
                                      className="h-7 min-w-0 px-2 text-xs"
                                      aria-label={`Least count for ${col.label}`}
                                      title="Readings snap to the nearest multiple of this least count"
                                    >
                                      <SelectValue placeholder="None" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={LEAST_COUNT_NONE}>None</SelectItem>
                                      {reportLeastCountOptions.map((option) => (
                                        <SelectItem key={option.key} value={option.key}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={6}
                                    step={1}
                                    inputMode="numeric"
                                    className="h-7 w-full px-2 text-center text-xs"
                                    value={colDp}
                                    disabled={!checked}
                                    aria-label={`Decimal places for ${col.label}`}
                                    title="Decimal places for this column"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      setReportReadingDecimal(col.key, e.target.value)
                                    }
                                  />
                                </div>
                              )
                            })
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setReportOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="bg-teal-600 text-white hover:bg-teal-500"
                        onClick={generateReportReverseCalc}
                      >
                        Generate Report
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

            </>
          ) : null}
        </div>

        {payload && !loading ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
            <p className="text-xs text-muted-foreground">
              Format comes from Calibration Equipments. Values are saved on this job only.
              {!readOnly ? ' Use + on the last row to add points.' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              {!readOnly ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 border-teal-600/40 text-teal-800"
                    disabled={saving}
                    onClick={() => void handleSave(false)}
                  >
                    {saving ? 'Saving…' : 'Save Draft'}
                  </Button>
                  <Button
                    type="button"
                    className="h-9 bg-teal-600 text-white hover:bg-teal-500"
                    disabled={saving}
                    onClick={() => void handleSave(true)}
                  >
                    {saving ? 'Saving…' : 'Save & Mark Complete'}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
