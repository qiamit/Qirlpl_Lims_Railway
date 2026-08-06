import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import {
  Briefcase,
  Calculator,
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
import { cn } from '@/lib/utils'
import {
  emptyCalibrationPointsTable,
  masterEquipmentIdsFromTabs,
  parseGenerateReportConfig,
  parseGenerateReportRandomnessMode,
  parseMeasurementRanges,
  resolveGenerateReportRandomnessForPoint,
  resolveRangeGenerateReportConfig,
  resolveRangeMuCalculationTemplate,
  resolveRangeRawDataSheetTemplate,
  splitRangeCapacityToMinMax,
  type CalibrationPointsStored,
  type EquipmentRangeEntry,
  type GenerateReportConfigRow,
  type GenerateReportRandomnessMode,
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
  computeFormulaValue,
  defaultRawDataSheetTemplate,
  EMPTY_RAW_DATA_ENVIRONMENT,
  emptyEnvironmentReadingRow,
  emptyValuesForColumns,
  environmentConditionsFilled,
  evaluateEnvParameterFormula,
  explainFormulaCalculation,
  formatPlusMinusPairDisplay,
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
  type RawDataSheetRowValues,
  type RawDataSheetTemplate,
} from '@/features/calibration/rawDataSheetTypes'
import {
  ensureRawDataSheetForJob,
  fetchMasterEquipmentsByIds,
  fetchRawDataSheetByJobId,
  fetchSrfSummaryForSheet,
  resolveEquipmentMasterForJob,
  updateRawDataSheetPayload,
  type EquipmentMasterForSheet,
  type MasterEquipmentForSheet,
  type SrfSummaryForSheet,
} from './calibrationJobApi'
import { UncertaintyStepByStepDialog } from './UncertaintyStepByStepDialog'
import { muCalculationTemplateFromRaw } from '@/features/calibration/equipments/muCalculationTypes'
import { type CalibrationJobRow } from '../types'
import {
  buildMuBuiltinValues,
  type MuEquipmentRangeContext,
} from '@/features/calibration/equipments/muCalcEngine'
import {
  isMuEquipmentRangeFieldKey,
  MU_CALIBRATION_POINT_FIELD_KEY,
  MU_LEAST_COUNT_FIELD_KEY,
} from '@/features/calibration/equipments/muCalculationTypes'

function cellText(value: string | null | undefined): string {
  const t = (value ?? '').trim()
  return t.length > 0 ? t : '—'
}

/**
 * Live formula evaluation for a sheet row (View Calculations + grid badge).
 * Uses current template formulas, clears stored formula cells, restores Generate
 * Report fills, then recomputes any formula columns that were not generated.
 */
function liveRowCalculationValues(
  columns: RawDataSheetColumn[],
  rowValues: RawDataSheetRowValues,
  decimalPlaces: number,
  env: RawDataEnvironmentConditions | null | undefined,
  reportSettings?: RawDataReportGenerationSettings | null,
): RawDataSheetRowValues {
  const base: RawDataSheetRowValues = { ...rowValues }
  for (const col of columns) {
    if (col.type === 'formula') base[col.key] = ''
  }
  let values = applyFormulaColumns(columns, base, decimalPlaces, env)
  const preserved = new Set<string>()
  for (const key of reportSettings?.readingCols ?? []) {
    const generated = rowValues[key]
    if (generated != null && String(generated).trim() !== '') {
      values[key] = generated
      preserved.add(key)
    }
  }
  for (const col of columns) {
    if (col.type !== 'formula' || preserved.has(col.key)) continue
    values[col.key] = computeFormulaValue(col, values, decimalPlaces, columns, env)
  }
  return values
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
function resolveMasterNextCalDueValue(master: {
  next_calibration_due: string | null
  last_calibration_date: string | null
  calibration_frequency: string | null
}): string {
  const stored = (master.next_calibration_due ?? '').trim()
  if (stored) return formatDateForSheet(stored)

  const last = (master.last_calibration_date ?? '').trim().slice(0, 10)
  const freq = parseStoredFrequency(master.calibration_frequency ?? '')
  if (last && isPresetFrequency(freq)) {
    const computed = calculateNextDueDate(last, freq as Frequency)
    if (computed) return formatDateForSheet(computed)
  }
  return ''
}

function formatDateForSheet(value: string | null | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const d = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return raw
  const [y, m, day] = d.split('-')
  return `${day}-${m}-${y}`
}

function formatMasterUncertainty(master: MasterEquipmentForSheet): string {
  const value = (master.calibration_certificate_uncertainty ?? '').trim()
  if (!value) return '—'
  const unit = (master.calibration_uncertainty_unit ?? '').trim()
  return unit ? `${value} ${unit}` : value
}

/**
 * Numeric magnitude of an uncertainty string.
 * For `mean±U` / `mean-U` pairs, uses the U (right) side only — never the mean.
 */
function parseUncertaintyMagnitude(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '')
  if (!t) return null
  const display = formatPlusMinusPairDisplay(t).trim()
  const pm = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*±\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
    display,
  )
  if (pm) {
    const u = Math.abs(Number(pm[2]))
    return Number.isFinite(u) ? u : null
  }
  const cleaned = t.replace(/^[±+\s]+/, '').trim()
  const m = cleaned.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)
  if (!m) return null
  const n = Math.abs(Number(m[0]))
  return Number.isFinite(n) ? n : null
}

/** Matches "Actual Expanded Uncertainty" / typo "Uncertainity". */
function findActualExpandedUncertaintyColumn(
  columns: RawDataSheetColumn[],
): RawDataSheetColumn | null {
  return (
    columns.find((c) => /actual\s*expanded\s*uncertain/i.test((c.label ?? '').trim())) ?? null
  )
}

/**
 * Prefer the dedicated "Actual Expanded Uncertainty" formula column;
 * fall back to the ±U half of the EMRE display value.
 */
function resolveActualExpandedUncertainty(
  columns: RawDataSheetColumn[],
  rowValues: RawDataSheetRowValues,
  emreRaw?: string,
): number | null {
  const col = findActualExpandedUncertaintyColumn(columns)
  if (col) {
    const fromCol = parseUncertaintyMagnitude(String(rowValues[col.key] ?? ''))
    if (fromCol != null) return fromCol
  }
  return parseUncertaintyMagnitude(String(emreRaw ?? ''))
}

/**
 * Uncertainty of the master used for this row (certificate U).
 * Falls back to the smallest parseable U among loaded used masters when the row
 * has no linked master id.
 */
function resolveUsedMasterUncertainty(
  row: { masterEquipmentId?: string },
  masters: MasterEquipmentForSheet[],
): number | null {
  if (masters.length === 0) return null
  const rowMasterId = (row.masterEquipmentId ?? '').trim()
  if (rowMasterId) {
    const master = masters.find((m) => m.id === rowMasterId)
    if (!master) return null
    return parseUncertaintyMagnitude(master.calibration_certificate_uncertainty ?? '')
  }
  let min: number | null = null
  for (const master of masters) {
    const u = parseUncertaintyMagnitude(master.calibration_certificate_uncertainty ?? '')
    if (u == null) continue
    if (min == null || u < min) min = u
  }
  return min
}

/** Red when Actual Expanded Uncertainty > used master certificate uncertainty. */
function isEmreExpandedUncertaintyExceeded(
  actualExpanded: number | null,
  masterUncertainty: number | null,
): boolean {
  if (actualExpanded == null || masterUncertainty == null) return false
  return actualExpanded > masterUncertainty
}

function masterCalDueTone(
  nextDue: string | null | undefined,
): 'overdue' | 'dueSoon' | 'ok' | 'none' {
  const raw = (nextDue ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'none'
  const due = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(due.getTime())) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'dueSoon'
  return 'ok'
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

/** Sentinel for "no least count" when resolving stored least-count keys. */
const LEAST_COUNT_NONE = '__none__'

/** Sentinel for "no reference" in Generate Report reference keys. */
const REFERENCE_NONE = '__none__'

function isGenerateReportEquipmentRefKey(key: string): boolean {
  return isMuEquipmentRangeFieldKey(key) || key === MU_CALIBRATION_POINT_FIELD_KEY
}

function isValidGenerateReportReferenceKey(
  key: string,
  sheetColumnKeys: Set<string>,
  inputKey?: string,
): boolean {
  const k = key.trim()
  if (!k || k === REFERENCE_NONE) return false
  if (inputKey && k === inputKey) return false
  if (isGenerateReportEquipmentRefKey(k)) return true
  return sheetColumnKeys.has(k)
}

/**
 * Parse a measurement text to a number (units / ± / joined multi-range LC).
 * Examples: "0.05 kN" → 0.05, "0.010 | 0.050" → first positive segment.
 */
function parseGenerateReportReferenceNumber(raw: string): number | null {
  const full = raw.trim().replace(/,/g, '')
  if (!full) return null

  // Prefer pipe/semicolon segments so legacy joined LC columns don't become NaN.
  const segments = full
    .split(/[|;/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const pool = segments.length > 0 ? segments : [full]

  for (const segment of pool) {
    const t = segment.replace(/^[±+\s]+/, '').trim()
    if (!t) continue
    const direct = Number(t)
    if (Number.isFinite(direct)) return direct
    const m = t.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!m) continue
    const n = Number(m[0])
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Keep a human LC token that still parses (strip multi-range joins). */
function normalizeLeastCountRawToken(raw: string | null | undefined): string {
  const full = String(raw ?? '').trim()
  if (!full) return ''
  const segments = full
    .split(/[|;/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const pool = segments.length > 0 ? segments : [full]
  for (const segment of pool) {
    const n = parseGenerateReportReferenceNumber(segment)
    if (n != null && n > 0) return segment
  }
  return full
}

/** Resolve Reference value: equipment range / point fields, else RDS row cell. */
function resolveGenerateReportReferenceRaw(
  referenceKey: string,
  row: RawDataSheetPayloadRow,
  equipmentRange: MuEquipmentRangeContext | null | undefined,
  /** Extra LC sources when range context is empty (job / equipment legacy). */
  leastCountFallbacks: Array<string | null | undefined> = [],
): string {
  if (isGenerateReportEquipmentRefKey(referenceKey)) {
    const builtins = buildMuBuiltinValues(row.pointValue, equipmentRange)
    if (referenceKey === MU_LEAST_COUNT_FIELD_KEY) {
      const candidates = [
        builtins[MU_LEAST_COUNT_FIELD_KEY],
        ...leastCountFallbacks,
      ]
      for (const candidate of candidates) {
        const token = normalizeLeastCountRawToken(candidate)
        if (!token) continue
        const n = parseGenerateReportReferenceNumber(token)
        if (n != null && n > 0) return token
      }
      return ''
    }
    return String(builtins[referenceKey] ?? '').trim()
  }
  return String(row.values[referenceKey] ?? '').trim()
}

/**
 * Reading = scaledRef ± band, then round-off snap, then decimals.
 * - percent: band = |scaledRef| × (factor/100)
 * - absolute: band = |factor| (engineering units)
 * - range_span: band = |rangeMax − rangeMin| × (factor/100) — same band at every point
 * - range_max: band = |rangeMax| × (factor/100) (full-scale style)
 * Then optional absolute floor/cap. Empty / 0 floor or cap means unused.
 * Multiple stays 1 for equipment apply.
 * For Reference=None (zero base), one signed LC is used so zero does not
 * collapse every generated value back to zero.
 */
function parseOptionalAbsoluteBand(raw: string | number | null | undefined): number {
  if (raw == null) return 0
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

/** Parse a numeric range bound from equipment / job range text. */
function parseRangeBoundNumber(raw: string | null | undefined): number | null {
  const token = String(raw ?? '').trim()
  if (!token) return null
  const n = parseGenerateReportReferenceNumber(token)
  if (n == null || !Number.isFinite(n)) return null
  return n
}

/**
 * Resolve Range Min / Max / Span for Generate Report modes.
 * Prefers matched equipment range; falls back to job selected range label.
 */
function resolveGenerateReportRangeBounds(
  equipmentRange: MuEquipmentRangeContext | null | undefined,
  jobRangeLabel?: string | null,
): { rangeMin: number | null; rangeMax: number | null; rangeSpan: number | null } {
  let min = parseRangeBoundNumber(equipmentRange?.rangeMin)
  let max = parseRangeBoundNumber(equipmentRange?.rangeMax)

  if ((min == null || max == null) && jobRangeLabel?.trim()) {
    const split = splitRangeCapacityToMinMax(jobRangeLabel)
    if (min == null) min = parseRangeBoundNumber(split.rangeMin)
    if (max == null) max = parseRangeBoundNumber(split.rangeMax)
  }

  const rangeSpan =
    min != null && max != null && Number.isFinite(min) && Number.isFinite(max)
      ? Math.abs(max - min)
      : null

  return { rangeMin: min, rangeMax: max, rangeSpan }
}

function readingWithRandomnessDeviation(
  reference: number,
  randomnessFactor: number,
  salt: string,
  decimalPlaces: number,
  multiple = 1,
  leastCount = 0,
  referenceIsNone = false,
  options?: {
    mode?: GenerateReportRandomnessMode
    floor?: number
    cap?: number
    rangeSpan?: number
    rangeMax?: number
  },
): string {
  const scaled = reference * (Number.isFinite(multiple) && multiple !== 0 ? multiple : 1)
  const signedRandom = unitSignedFromSalt(salt)
  const factor = Number.isFinite(randomnessFactor) ? randomnessFactor : 0

  // Factor 0 / unset → exact reference (snap + decimals). Never invent ±LC noise.
  if (!(factor > 0)) {
    const snapped =
      Number.isFinite(leastCount) && leastCount > 0
        ? Math.round(scaled / leastCount) * leastCount
        : scaled
    return formatNumberInput(String(snapped), decimalPlaces)
  }

  // Reference=None with intentional randomness: one signed least-count step.
  if (referenceIsNone && Number.isFinite(leastCount) && leastCount > 0) {
    const oneLeastCount = signedRandom < 0 ? -leastCount : leastCount
    return formatNumberInput(String(oneLeastCount), decimalPlaces)
  }

  const mode = parseGenerateReportRandomnessMode(options?.mode)
  const floor = parseOptionalAbsoluteBand(options?.floor)
  const cap = parseOptionalAbsoluteBand(options?.cap)
  const rangeSpan =
    typeof options?.rangeSpan === 'number' && Number.isFinite(options.rangeSpan)
      ? Math.abs(options.rangeSpan)
      : 0
  const rangeMaxAbs =
    typeof options?.rangeMax === 'number' && Number.isFinite(options.rangeMax)
      ? Math.abs(options.rangeMax)
      : 0

  let band = 0
  if (mode === 'absolute') {
    band = Math.abs(factor)
  } else if (mode === 'range_span') {
    band = factor > 0 && rangeSpan > 0 ? rangeSpan * (factor / 100) : 0
  } else if (mode === 'range_max') {
    band = factor > 0 && rangeMaxAbs > 0 ? rangeMaxAbs * (factor / 100) : 0
  } else {
    // percent (default / unknown)
    band = Math.abs(scaled) * (factor / 100)
  }

  // Min/Max band clamps only apply when randomness factor is active.
  if (floor > 0) band = Math.max(band, floor)
  if (cap > 0) band = Math.min(band, cap)

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
  const token = normalizeLeastCountRawToken(raw)
  if (!token) return null
  const n = parseGenerateReportReferenceNumber(token)
  if (n == null || !Number.isFinite(n) || n <= 0) return null
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

function pointsTableHasValues(table: CalibrationPointsStored | null | undefined): boolean {
  if (!table) return false
  return table.rows.some((row) =>
    Object.values(row.values).some((v) => String(v ?? '').trim().length > 0),
  )
}

function legacyPointsAsTable(
  points: EquipmentRangeEntry['calibrationPoints'],
): CalibrationPointsStored {
  const colId = 'nominal'
  return {
    columns: [{ id: colId, header: 'Nominal' }],
    rows: points
      .map((p) => p.pointValue.trim())
      .filter(Boolean)
      .map((pointValue, i) => ({
        id: points[i]?.id || `pt-${i}`,
        values: { [colId]: pointValue },
      })),
  }
}

/** Prefer tab points; if empty, fall back to the range primary / legacy table. */
function enrichMasterTabsWithRangePoints(
  tabs: MasterPointsTab[],
  range: EquipmentRangeEntry,
): MasterPointsTab[] {
  const primary =
    pointsTableHasValues(range.calibrationPointsTable)
      ? range.calibrationPointsTable
      : range.calibrationPoints.length > 0
        ? legacyPointsAsTable(range.calibrationPoints)
        : null
  if (!primary) return tabs

  return tabs.map((tab, index) => {
    if (pointsTableHasValues(tab.calibrationPointsTable)) return tab
    // First empty master tab inherits the range primary points table.
    if (index === 0) {
      return { ...tab, calibrationPointsTable: primary }
    }
    return tab
  })
}

function tabsFromRange(range: EquipmentRangeEntry): MasterPointsTab[] {
  const tabs = range.masterPointsTabs ?? []

  // Every tab that has a Master Equipment selected (order preserved).
  const withMaster = tabs.filter((tab) => tab.masterEquipmentId.trim().length > 0)
  if (withMaster.length > 0) {
    return enrichMasterTabsWithRangePoints(withMaster, range)
  }

  // Tabs with point data but no master id yet
  const withData = tabs.filter((tab) => pointsTableHasValues(tab.calibrationPointsTable))
  if (withData.length > 0) return withData

  // Fallback: single primary table as one anonymous tab
  if (pointsTableHasValues(range.calibrationPointsTable)) {
    return [
      {
        id: 'primary',
        masterEquipmentId: range.masterEquipmentIds[0] ?? '',
        calibrationPointsTable: range.calibrationPointsTable,
      },
    ]
  }

  if (range.calibrationPoints.length > 0) {
    return [
      {
        id: 'legacy',
        masterEquipmentId: range.masterEquipmentIds[0] ?? '',
        calibrationPointsTable: legacyPointsAsTable(range.calibrationPoints),
      },
    ]
  }

  // Masters linked on the range but tabs not yet structured
  const ids = (range.masterEquipmentIds ?? []).map((id) => id.trim()).filter(Boolean)
  if (ids.length > 0) {
    return enrichMasterTabsWithRangePoints(
      ids.map((masterEquipmentId, index) => ({
        id: `master-${index}`,
        masterEquipmentId,
        calibrationPointsTable: emptyCalibrationPointsTable(),
      })),
      range,
    )
  }

  return []
}

/**
 * All master points tabs for the job's selected range (each master keeps its own table).
 * Includes every tab with a selected master — even if points are still empty —
 * so Conduct creates a section/table for each reference standard.
 * When the job range cannot be matched, falls back to the first range that has masters/points.
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
  if (matched) {
    const fromMatched = tabsFromRange(matched)
    if (fromMatched.length > 0) return fromMatched
  }

  const ranges = parseMeasurementRanges(
    measurementRanges as MeasurementRangeStored[] | null,
    rangeCapacity,
    resolutionLeastCount,
    fallbackMasterEquipmentId,
  )
  for (const range of ranges) {
    const tabs = tabsFromRange(range)
    if (tabs.length > 0) return tabs
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

  // Positional fallback only when no header matched — avoids wrong-column fills.
  if (mapping.length === 0 && pointsTable.columns.length > 0 && fillable.length > 0) {
    const limit = Math.min(pointsTable.columns.length, fillable.length)
    for (let i = 0; i < limit; i++) {
      const source = pointsTable.columns[i]!
      const col = fillable[i]!
      mapping.push({ sourceColId: source.id, sheetKey: col.key })
    }
  }

  return mapping
}

/**
 * Master equipment / IQC detail fields that can fill matching RDS columns
 * (by column key or label). Only non-empty master values are applied.
 */
const MASTER_DETAIL_FIELD_DEFS: Array<{
  id: string
  label: string
  aliases: string[]
  getValue: (master: MasterEquipmentForSheet) => string
}> = [
  {
    id: 'asset_code',
    label: 'Asset Code',
    aliases: ['asset code', 'asset', 'master asset', 'master code'],
    getValue: (m) => (m.asset_code ?? '').trim(),
  },
  {
    id: 'equipment_name',
    label: 'Equipment Name',
    aliases: ['equipment name', 'master name', 'master equipment name'],
    getValue: (m) => (m.equipment_name ?? '').trim(),
  },
  {
    id: 'manufacturer',
    label: 'Manufacturer',
    aliases: ['manufacturer', 'make'],
    getValue: (m) => (m.manufacturer ?? '').trim(),
  },
  {
    id: 'model_number',
    label: 'Model',
    aliases: ['model', 'model number', 'model no'],
    getValue: (m) => (m.model_number ?? '').trim(),
  },
  {
    id: 'serial_number',
    label: 'Serial No.',
    aliases: ['serial no', 'serial number', 'serial', 'sl no', 'sr no'],
    getValue: (m) => (m.serial_number ?? '').trim(),
  },
  {
    id: 'range_capacity',
    label: 'Range',
    aliases: ['range', 'range capacity', 'master range', 'capacity'],
    getValue: (m) => (m.range_capacity ?? '').trim(),
  },
  {
    id: 'resolution_least_count',
    label: 'Least Count',
    aliases: ['least count', 'resolution', 'resolution least count', 'lc', 'master lc'],
    getValue: (m) => (m.resolution_least_count ?? '').trim(),
  },
  {
    id: 'accuracy_acceptance_criteria',
    label: 'Accuracy',
    aliases: [
      'accuracy',
      'acceptance criteria',
      'accuracy acceptance criteria',
      'acceptance',
    ],
    getValue: (m) => (m.accuracy_acceptance_criteria ?? '').trim(),
  },
  {
    id: 'current_location',
    label: 'Location',
    aliases: ['location', 'current location'],
    getValue: (m) => (m.current_location ?? '').trim(),
  },
  {
    id: 'calibration_frequency',
    label: 'Cal Frequency',
    aliases: ['cal frequency', 'calibration frequency', 'frequency'],
    getValue: (m) => (m.calibration_frequency ?? '').trim(),
  },
  {
    id: 'last_calibration_date',
    label: 'Last Calibration',
    aliases: ['last calibration', 'last cal', 'last calibration date'],
    getValue: (m) => formatDateForSheet(m.last_calibration_date),
  },
  {
    id: 'next_calibration_due',
    label: 'Next Cal Due',
    aliases: ['next cal due', 'next due', 'next calibration due', 'due date'],
    getValue: (m) => resolveMasterNextCalDueValue(m),
  },
  {
    id: 'calibration_certificate_number',
    label: 'Certificate No.',
    aliases: [
      'certificate no',
      'certificate number',
      'cert no',
      'certificate',
      'calibration certificate number',
      'cal certificate',
    ],
    getValue: (m) => (m.calibration_certificate_number ?? '').trim(),
  },
]

function scoreAliasAgainstColumn(alias: string, col: RawDataSheetColumn): number {
  const na = normalizeHeaderToken(alias)
  const nl = normalizeHeaderToken(col.label)
  const nk = normalizeHeaderToken(col.key)
  if (!na) return 0
  if (nl === na || nk === na) return 100
  if (nl.includes(na) || nk.includes(na)) return 70
  if (na.includes(nl) && nl.length >= 3) return 55
  if (headersCompatible(alias, col.label) || headersCompatible(alias, col.key)) return 50
  return 0
}

/** Map one master detail field → at most one fillable sheet column. */
function mapMasterDetailFieldsToColumns(
  columns: RawDataSheetColumn[],
  master: MasterEquipmentForSheet,
): Array<{ fieldLabel: string; sheetKey: string; value: string }> {
  const fillable = columns.filter((c) => c.type !== 'formula')
  const used = new Set<string>()
  const out: Array<{ fieldLabel: string; sheetKey: string; value: string }> = []

  for (const field of MASTER_DETAIL_FIELD_DEFS) {
    const value = field.getValue(master)
    if (!value) continue

    let best: RawDataSheetColumn | null = null
    let bestScore = 0
    for (const col of fillable) {
      if (used.has(col.key)) continue
      let s = 0
      for (const alias of field.aliases) {
        s = Math.max(s, scoreAliasAgainstColumn(alias, col))
      }
      // Also allow exact match on the display label used in Master Details panel.
      s = Math.max(s, scoreAliasAgainstColumn(field.label, col))
      if (s > bestScore) {
        bestScore = s
        best = col
      }
    }
    // Accept includes / alias-group matches (50+) — 70 was too strict for Cert / LC labels.
    if (best && bestScore >= 50) {
      used.add(best.key)
      out.push({ fieldLabel: field.label, sheetKey: best.key, value })
    }
  }

  return out
}

/**
 * Apply linked Calibration Master settings into the current sheet:
 * 1) measurement/point values from Calibration Equipment master tabs
 * 2) master equipment details (certificate, LC, accuracy, …) into matching columns
 *
 * Retained for optional sync callers. The Raw Data Sheet "Master Details" button
 * is view-only and does not invoke this.
 */
export function applyMasterSettingsToPayload(
  payload: RawDataSheetPayload,
  tabs: MasterPointsTab[],
  masters: MasterEquipmentForSheet[],
  decimalPlaces: number,
  environment?: RawDataEnvironmentConditions,
): { payload: RawDataSheetPayload; appliedLabels: string[]; filledCells: number } {
  const tabsWithData = tabs.filter(
    (t) =>
      t.masterEquipmentId.trim().length > 0 ||
      pointsTableHasValues(t.calibrationPointsTable),
  )
  if (masters.length === 0 && tabsWithData.length === 0) {
    return { payload, appliedLabels: [], filledCells: 0 }
  }

  const masterById = new Map(masters.map((m) => [m.id, m]))
  const masterNameById = new Map(
    masters.map((m) => [
      m.id,
      (m.equipment_name || '').trim() || (m.asset_code || '').trim() || m.id,
    ]),
  )

  let next = ensureAllMasterRowGroups(payload, tabs, masterNameById, decimalPlaces)
  const columns = next.template.columns
  const appliedLabelSet = new Set<string>()
  let filledCells = 0

  const tabsWithMaster = tabs.filter((t) => t.masterEquipmentId.trim().length > 0)
  const masterOrder =
    tabsWithMaster.length > 0
      ? tabsWithMaster.map((t) => t.masterEquipmentId.trim())
      : masters.length > 0
        ? masters.map((m) => m.id)
        : tabs
            .map((t) => t.masterEquipmentId.trim())
            .filter(Boolean)
  const uniqueMasterOrder = [...new Set(masterOrder)].filter(
    (id) => masterById.has(id) || tabsWithMaster.some((t) => t.masterEquipmentId.trim() === id),
  )
  // Anonymous / untabbed points still need a group key for rebuild.
  const fallbackMasterId =
    uniqueMasterOrder[0] ?? masters[0]?.id ?? tabsWithMaster[0]?.masterEquipmentId.trim() ?? ''

  // --- 1) Measurement / point values from master points tabs ---
  const rowsByMaster = new Map<string, RawDataSheetPayloadRow[]>()
  const untagged: RawDataSheetPayloadRow[] = []
  for (const row of next.rows) {
    const id = (row.masterEquipmentId ?? '').trim()
    if (!id) {
      untagged.push(row)
      continue
    }
    const list = rowsByMaster.get(id)
    if (list) list.push(row)
    else rowsByMaster.set(id, [row])
  }

  if (untagged.length > 0 && fallbackMasterId) {
    const list = rowsByMaster.get(fallbackMasterId) ?? []
    for (const row of untagged) {
      list.push({
        ...row,
        masterEquipmentId: fallbackMasterId,
        masterLabel: masterNameById.get(fallbackMasterId) || fallbackMasterId,
      })
    }
    rowsByMaster.set(fallbackMasterId, list)
  } else if (untagged.length > 0 && uniqueMasterOrder.length === 0) {
    // Keep untagged rows as a synthetic group so points can still merge.
    rowsByMaster.set('__untagged__', untagged)
  }

  const orderKeys =
    uniqueMasterOrder.length > 0
      ? uniqueMasterOrder
      : tabsWithData.length > 0
        ? tabsWithData.map((t, i) => t.masterEquipmentId.trim() || `__tab-${i}`)
        : [...rowsByMaster.keys()]

  const rebuilt: RawDataSheetPayloadRow[] = []
  const seenKeys = new Set<string>()

  for (let orderIndex = 0; orderIndex < orderKeys.length; orderIndex++) {
    const masterId = orderKeys[orderIndex]!
    seenKeys.add(masterId)
    const tab =
      tabsWithMaster.find((t) => t.masterEquipmentId.trim() === masterId) ??
      tabsWithData[orderIndex] ??
      tabsWithData.find((t) => pointsTableHasValues(t.calibrationPointsTable))
    const existingGroup = [...(rowsByMaster.get(masterId) ?? [])]
    const seeded =
      tab && pointsTableHasValues(tab.calibrationPointsTable)
        ? rowsFromCalibrationPointsTable(
            columns,
            tab.calibrationPointsTable,
            decimalPlaces,
            {
              masterEquipmentId: masterId.startsWith('__') ? undefined : masterId || undefined,
              masterLabel: masterNameById.get(masterId),
            },
          )
        : []

    const groupLabel =
      masterNameById.get(masterId) ||
      existingGroup[0]?.masterLabel ||
      (masterId.startsWith('__') ? undefined : masterId)
    const maxLen = Math.max(existingGroup.length, seeded.length, existingGroup.length > 0 ? 0 : 1)

    for (let i = 0; i < maxLen; i++) {
      const base =
        existingGroup[i] ??
        seeded[i] ??
        ({
          id: newPayloadRowId(),
          masterEquipmentId: masterId.startsWith('__') ? undefined : masterId || undefined,
          masterLabel: groupLabel,
          values: emptyValuesForColumns(columns),
        } satisfies RawDataSheetPayloadRow)

      let values = { ...base.values }
      const seedValues = seeded[i]?.values
      if (seedValues) {
        for (const col of columns) {
          if (col.type === 'formula') continue
          const raw = String(seedValues[col.key] ?? '').trim()
          if (!raw) continue
          if (values[col.key] !== raw) {
            values[col.key] = raw
            filledCells += 1
          }
          appliedLabelSet.add(col.label)
        }
      }

      rebuilt.push({
        ...base,
        masterEquipmentId: masterId.startsWith('__')
          ? base.masterEquipmentId
          : masterId || base.masterEquipmentId,
        masterLabel: groupLabel,
        pointValue: seeded[i]?.pointValue ?? base.pointValue,
        values,
      })
    }
    rowsByMaster.delete(masterId)
  }

  // Keep any leftover master groups not in current tab order.
  for (const [masterId, group] of rowsByMaster) {
    if (seenKeys.has(masterId)) continue
    rebuilt.push(
      ...group.map((r) => ({
        ...r,
        masterEquipmentId: masterId.startsWith('__') ? r.masterEquipmentId : masterId,
        masterLabel: masterNameById.get(masterId) || r.masterLabel || masterId,
      })),
    )
  }

  // --- 2) Master equipment details → matching sheet columns ---
  const detailMaps = new Map(
    (uniqueMasterOrder.length > 0 ? uniqueMasterOrder : masters.map((m) => m.id)).map((id) => {
      const master = masterById.get(id)
      if (!master) return [id, [] as ReturnType<typeof mapMasterDetailFieldsToColumns>] as const
      return [id, mapMasterDetailFieldsToColumns(columns, master)] as const
    }),
  )

  const withDetails = rebuilt.map((row) => {
    const masterId = (row.masterEquipmentId ?? '').trim() || fallbackMasterId
    const mappings = detailMaps.get(masterId) ?? detailMaps.get(fallbackMasterId) ?? []
    if (mappings.length === 0) return row

    const values = { ...row.values }
    for (const { fieldLabel, sheetKey, value } of mappings) {
      if (values[sheetKey] !== value) {
        values[sheetKey] = value
        filledCells += 1
      }
      appliedLabelSet.add(fieldLabel)
    }
    return {
      ...row,
      masterEquipmentId: masterId || row.masterEquipmentId,
      masterLabel: masterNameById.get(masterId) || row.masterLabel,
      values,
    }
  })

  const finalRows = withDetails.map((r) => ({
    ...r,
    values: applyFormulaColumns(columns, r.values, decimalPlaces, environment),
  }))

  return {
    payload: { ...next, rows: finalRows },
    appliedLabels: [...appliedLabelSet],
    filledCells,
  }
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
  forceReadOnly = false,
  initialOpenUncertainty = false,
}: {
  job: CalibrationJobRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Review Data: view-only; do not create or rewrite the sheet. */
  forceReadOnly?: boolean
  /** After a usable sheet loads, open Uncertainty Step-by-Step. */
  initialOpenUncertainty?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [payload, setPayload] = useState<RawDataSheetPayload | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [srf, setSrf] = useState<SrfSummaryForSheet | null>(null)
  const [equipmentMaster, setEquipmentMaster] = useState<EquipmentMasterForSheet | null>(null)
  const [masterEquipments, setMasterEquipments] = useState<MasterEquipmentForSheet[]>([])
  const [uncertaintyOpen, setUncertaintyOpen] = useState(false)
  const [environmentOpen, setEnvironmentOpen] = useState(false)
  const [calculationsRowId, setCalculationsRowId] = useState<string | null>(null)
  const [contextPanel, setContextPanel] = useState<
    'srf' | 'customer' | 'job' | 'master' | 'verification' | null
  >(null)
  const [masterDetailsLoading, setMasterDetailsLoading] = useState(false)

  const loadSheet = useCallback(async (activeJob: CalibrationJobRow) => {
    setLoading(true)
    setError(null)
    setPayload(null)
    setSheetId(null)
    setReadOnly(forceReadOnly)
    setUncertaintyOpen(false)
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

      const sheet = forceReadOnly
        ? await fetchRawDataSheetByJobId(activeJob.id)
        : await ensureRawDataSheetForJob(activeJob.id)

      if (!sheet) {
        setError('No Calibration Raw Data sheet is available for this job yet.')
        return
      }

      setSheetId(sheet.id)
      setReadOnly(forceReadOnly || sheet.sheet_status === 'approved')

      const existing = parseRawDataSheetPayload(sheet.payload)

      if (forceReadOnly) {
        if (!existing || existing.template.columns.length === 0) {
          setError('No Calibration Raw Data is available for this job yet.')
          return
        }
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
        const masterNameById = new Map(
          masters.map((m) => [
            m.id,
            (m.equipment_name || '').trim() || (m.asset_code || '').trim() || m.id,
          ]),
        )
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
        if (initialOpenUncertainty) setUncertaintyOpen(true)
        return
      }
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

      // Empty draft → follow matched range's format, then equipment-level fallback.
      const matchedRange = matchJobMeasurementRange(
        activeJob,
        equipment.measurement_ranges,
        equipment.range_capacity,
        equipment.resolution_least_count,
        equipment.master_equipment_id,
      )
      const equipmentRawFallback =
        parseRawDataSheetTemplate(equipment.raw_data_sheet_template) ??
        defaultRawDataSheetTemplate()
      const template =
        resolveRangeRawDataSheetTemplate(matchedRange, equipmentRawFallback) ??
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
  }, [forceReadOnly, initialOpenUncertainty])

  useEffect(() => {
    if (!open || !job) return
    void loadSheet(job)
  }, [open, job, loadSheet])

  const equipmentRawDataFallback = useMemo(
    () =>
      parseRawDataSheetTemplate(equipmentMaster?.raw_data_sheet_template) ??
      defaultRawDataSheetTemplate(),
    [equipmentMaster?.raw_data_sheet_template],
  )
  const equipmentMuFallback = useMemo(
    () => muCalculationTemplateFromRaw(equipmentMaster?.mu_calculation_template ?? null),
    [equipmentMaster?.mu_calculation_template],
  )
  const equipmentGenerateReportFallback = useMemo(
    () => parseGenerateReportConfig(equipmentMaster?.generate_report_config),
    [equipmentMaster?.generate_report_config],
  )
  const matchedEquipmentRange = useMemo(() => {
    if (!job || !equipmentMaster) return undefined
    return matchJobMeasurementRange(
      job,
      equipmentMaster.measurement_ranges,
      equipmentMaster.range_capacity,
      equipmentMaster.resolution_least_count,
      equipmentMaster.master_equipment_id,
    )
  }, [job, equipmentMaster])
  const resolvedRawDataSheetTemplate = useMemo(
    () => resolveRangeRawDataSheetTemplate(matchedEquipmentRange, equipmentRawDataFallback),
    [matchedEquipmentRange, equipmentRawDataFallback],
  )
  const resolvedMuCalculationTemplate = useMemo(
    () => resolveRangeMuCalculationTemplate(matchedEquipmentRange, equipmentMuFallback),
    [matchedEquipmentRange, equipmentMuFallback],
  )
  const generateReportConfig = useMemo(
    () =>
      resolveRangeGenerateReportConfig(
        matchedEquipmentRange,
        equipmentGenerateReportFallback,
      ),
    [matchedEquipmentRange, equipmentGenerateReportFallback],
  )

  const masterPointsTabsForView = useMemo(() => {
    if (!job || !equipmentMaster) return [] as MasterPointsTab[]
    return collectMasterPointsTabsForJob(
      job,
      equipmentMaster.measurement_ranges,
      equipmentMaster.range_capacity,
      equipmentMaster.resolution_least_count,
      equipmentMaster.master_equipment_id,
    )
  }, [job, equipmentMaster])

  const masterDetailEntries = useMemo(() => {
    const byId = new Map(masterEquipments.map((m) => [m.id, m]))
    const seen = new Set<string>()
    const entries: Array<{
      key: string
      master: MasterEquipmentForSheet | null
      label: string
    }> = []

    masterPointsTabsForView.forEach((tab, index) => {
      const id = tab.masterEquipmentId.trim()
      if (id) seen.add(id)
      const master = id ? (byId.get(id) ?? null) : null
      const label =
        (master?.equipment_name || master?.asset_code || '').trim() ||
        (id ? `Master ${index + 1}` : `Master Tab ${index + 1}`)
      entries.push({
        key: tab.id || `tab-${index}`,
        master,
        label,
      })
    })

    masterEquipments.forEach((master, index) => {
      if (seen.has(master.id)) return
      entries.push({
        key: master.id,
        master,
        label:
          (master.equipment_name || master.asset_code || '').trim() ||
          `Master ${index + 1}`,
      })
    })

    return entries
  }, [masterEquipments, masterPointsTabsForView])

  const handleSave = async (asComplete = false) => {
    if (!sheetId || !payload || readOnly) return
    setSaving(true)
    setError(null)
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
  const showGenerateReport = generateReportConfig.enabled
  const jobSelectedRangeFields = parseJobSelectedRangeFields(job)
  const jobRangeSplit = splitRangeCapacityToMinMax(jobSelectedRangeFields.range)
  const muEquipmentRange = matchedEquipmentRange
    ? {
        rangeMin: matchedEquipmentRange.rangeMin || jobRangeSplit.rangeMin,
        rangeMax: matchedEquipmentRange.rangeMax || jobRangeSplit.rangeMax,
        leastCount: normalizeLeastCountRawToken(
          matchedEquipmentRange.resolutionLeastCount.trim() ||
            jobSelectedRangeFields.leastCount ||
            (equipmentMaster?.resolution_least_count ?? ''),
        ),
        accuracy: matchedEquipmentRange.accuracy,
      }
    : equipmentMaster
      ? {
          rangeMin: jobRangeSplit.rangeMin,
          rangeMax: jobRangeSplit.rangeMax,
          leastCount: normalizeLeastCountRawToken(
            jobSelectedRangeFields.leastCount ||
              (equipmentMaster.resolution_least_count ?? ''),
          ),
          accuracy: '',
        }
      : null
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

    const equipmentTemplate = equipmentMaster ? resolvedRawDataSheetTemplate : null
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

  const updateCellValue = (rowId: string, colKey: string, value: string) => {
    if (!payload) return
    const evalColumns = mergeFormulasFromEquipmentTemplate(
      payload.template,
      equipmentMaster ? resolvedRawDataSheetTemplate : null,
    ).columns
    const nextRows = payload.rows.map((r) => {
      if (r.id !== rowId) return r
      let values = { ...r.values, [colKey]: value }
      values = applyFormulaColumns(
        evalColumns,
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
  /**
   * Always prefer live Calibration Equipment formulas for grid + Calculations so
   * separators like ± stay in sync (sheet snapshots may still have ASCII `-`).
   */
  const liveEvalColumns: RawDataSheetColumn[] = payload
    ? mergeFormulasFromEquipmentTemplate(
        payload.template,
        equipmentMaster ? resolvedRawDataSheetTemplate : null,
      ).columns
    : []
  const formulaColumns = liveEvalColumns.filter((c) => c.type === 'formula')
  /**
   * Pin Estimate Mean Relative Error onto the main Raw Data grid (before Calculations),
   * mirroring the same formula column shown in the View Calculations dialog.
   * Cell turns red when Actual Expanded Uncertainty > used master certificate uncertainty.
   */
  const pinnedFormulaColumns = formulaColumns.filter((c) =>
    /estimate\s*mean\s*relative\s*error/i.test((c.label ?? '').trim()),
  )
  const calculationsEvalColumns: RawDataSheetColumn[] = liveEvalColumns
  const calculationsFormulaColumns = formulaColumns
  const calculationsRow =
    calculationsRowId && payload
      ? payload.rows.find((r) => r.id === calculationsRowId) ?? null
      : null
  const calculationsRowIndex = calculationsRow
    ? payload!.rows.findIndex((r) => r.id === calculationsRow.id)
    : -1
  const calculationsValues =
    calculationsRow && payload
      ? liveRowCalculationValues(
          calculationsEvalColumns,
          calculationsRow.values,
          tableSettings.decimalPlaces,
          environment,
          payload.reportGenerationSettings,
        )
      : null
  const calculationExplanations: FormulaCalculationExplanation[] =
    calculationsRow && payload && calculationsValues
      ? calculationsFormulaColumns.map((col) =>
          explainFormulaCalculation(
            col,
            calculationsValues,
            tableSettings.decimalPlaces,
            calculationsEvalColumns,
            environment,
          ),
        )
      : []
  /**
   * Apply Calibration Equipment Generate Report Format settings into sheet
   * input columns (randomness / round-off / decimals) — no dialog.
   * Input targets may be any template column (including formula); generated
   * values for formula-type inputs are kept after formula recompute.
   */
  const applyGenerateReportSettings = () => {
    if (!payload || !sheetId) {
      setError('Raw Data Sheet is still loading.')
      return
    }
    if (readOnly) {
      setError('Sheet is approved (read-only). Generate Report settings cannot be applied.')
      return
    }
    if (!generateReportConfig.enabled) {
      setError('Generate Report is not enabled on this Calibration Equipment.')
      return
    }

    const allColumns = payload.template.columns
    const colByKey = new Map(allColumns.map((c) => [c.key, c]))
    const colKeys = new Set(allColumns.map((c) => c.key))
    const skipReasons: string[] = []
    const equipmentRows: typeof generateReportConfig.rows = []

    for (const row of generateReportConfig.rows ?? []) {
      const inputKey = row.inputColumnKey.trim()
      if (!inputKey) continue
      const col = colByKey.get(inputKey)
      if (!col) {
        skipReasons.push(
          `skipped ${inputKey}: column not on sheet`,
        )
        continue
      }
      equipmentRows.push(row)
    }

    if (equipmentRows.length === 0) {
      setError(
        skipReasons.length > 0
          ? `No Generate Report Format rows could be applied. ${skipReasons.join('; ')}.`
          : 'No Generate Report Format rows match this sheet’s columns. Configure Input / Reference under Calibration Equipments → Generate Report Format.',
      )
      return
    }

    const saved = payload.reportGenerationSettings
    const dp = tableSettings.decimalPlaces
    const readingCols: string[] = []
    const references: Record<string, string> = {}
    const multiples: Record<string, number> = {}
    const leastCounts: Record<string, string> = {}
    const decimals: Record<string, number> = {}
    const configByInputKey = new Map<string, GenerateReportConfigRow>()
    const leastCountFallbacks = [
      muEquipmentRange?.leastCount,
      matchedEquipmentRange?.resolutionLeastCount,
      jobSelectedRangeFields.leastCount,
      equipmentMaster?.resolution_least_count,
    ].map((v) => normalizeLeastCountRawToken(v) || String(v ?? '').trim())

    for (const row of equipmentRows) {
      const inputKey = row.inputColumnKey.trim()
      const col = colByKey.get(inputKey)!
      const colLabel = (col.label || inputKey).trim() || inputKey

      const refRawKey = row.referenceColumnKey.trim()
      const refKey = isValidGenerateReportReferenceKey(refRawKey, colKeys, inputKey)
        ? refRawKey
        : ''
      if (refRawKey && refRawKey !== REFERENCE_NONE && !refKey) {
        skipReasons.push(`skipped ${colLabel}: invalid Reference`)
        continue
      }

      const hasPointViewFactor = (row.randomnessByPoint ?? []).some(
        (p) => !p.isDefault && p.point.trim() && p.randomnessFactor.trim(),
      )
      if (!hasPointViewFactor) {
        skipReasons.push(
          `skipped ${colLabel}: no View Factor points configured (Calibration Equipments → Generate Report Format → View Factor)`,
        )
        continue
      }

      readingCols.push(inputKey)
      references[inputKey] = refKey
      configByInputKey.set(inputKey, row)

      // Equipment Generate Report Format has no Multiple field — always 1.
      // Do not reuse stale payload multiples (e.g. 0.01) which can snap LC→0.000.
      multiples[inputKey] = 1

      if (row.roundOff.trim()) {
        const roundN = Number(row.roundOff)
        if (Number.isFinite(roundN) && roundN > 0) {
          leastCounts[inputKey] = String(roundN)
        } else {
          leastCounts[inputKey] = saved?.leastCounts[inputKey] ?? ''
        }
      } else {
        leastCounts[inputKey] = saved?.leastCounts[inputKey] ?? ''
      }

      decimals[inputKey] = Number.isFinite(row.decimalPlaces)
        ? Math.max(0, Math.min(6, Math.round(row.decimalPlaces)))
        : (saved?.decimals[inputKey] ?? dp)
    }

    if (readingCols.length === 0) {
      setError(
        skipReasons.length > 0
          ? `No Generate Report Format rows could be applied. ${skipReasons.join('; ')}.`
          : 'No Generate Report Format rows match this sheet’s columns.',
      )
      return
    }

    const collectModesForRow = (row: GenerateReportConfigRow): GenerateReportRandomnessMode[] => {
      const modes: GenerateReportRandomnessMode[] = []
      for (const p of row.randomnessByPoint ?? []) {
        if (p.isDefault || !p.point.trim() || !p.randomnessFactor.trim()) continue
        modes.push(parseGenerateReportRandomnessMode(p.randomnessMode))
      }
      return modes
    }
    const allConfiguredModes = readingCols.flatMap((k) => {
      const cfg = configByInputKey.get(k)
      return cfg ? collectModesForRow(cfg) : (['percent'] as GenerateReportRandomnessMode[])
    })
    const rangeBounds = resolveGenerateReportRangeBounds(
      muEquipmentRange,
      jobSelectedRangeFields.range,
    )
    const needsRangeSpan = allConfiguredModes.includes('range_span')
    const needsRangeMax = allConfiguredModes.includes('range_max')
    if (needsRangeSpan && (rangeBounds.rangeSpan == null || rangeBounds.rangeSpan <= 0)) {
      setError(
        'Range span (%) requires equipment Range Min and Range Max. Set them on the Calibration Equipment measurement range (or job selected range).',
      )
      return
    }
    if (
      needsRangeMax &&
      (rangeBounds.rangeMax == null ||
        !Number.isFinite(rangeBounds.rangeMax) ||
        Math.abs(rangeBounds.rangeMax) === 0)
    ) {
      setError(
        'Range max (%) requires a non-zero equipment Range Maximum. Set Range Max on the Calibration Equipment measurement range (or job selected range).',
      )
      return
    }

    const generationSeed = newReportGenerationSeed()
    const primaryConfig = configByInputKey.get(readingCols[0]!)
    const primaryPointFactor =
      (primaryConfig?.randomnessByPoint ?? []).find(
        (p) => !p.isDefault && p.point.trim() && p.randomnessFactor.trim(),
      )?.randomnessFactor ?? ''
    const primaryFactor = Number(primaryPointFactor)
    const reportGenerationSettings: RawDataReportGenerationSettings = {
      randomnessFactor: Number.isFinite(primaryFactor) && primaryFactor > 0
        ? String(primaryFactor)
        : primaryPointFactor || '0',
      readingCols: [...readingCols],
      referenceCols: { ...references },
      multiples: { ...multiples },
      leastCounts: { ...leastCounts },
      decimals: { ...decimals },
    }

    const emptyRefKeys = new Set<string>()
    let filledRows = 0
    const nextRows = payload.rows.map((row) => {
      let values = { ...row.values }
      let rowFilled = false
      const preservedGenerated: Record<string, string> = {}
      for (const key of readingCols) {
        const configRow = configByInputKey.get(key)
        if (!configRow) continue
        const referenceKey = references[key]
        const hasReference = Boolean(referenceKey) && referenceKey !== REFERENCE_NONE
        const refIsLeastCount = referenceKey === MU_LEAST_COUNT_FIELD_KEY
        const refRaw = hasReference
          ? resolveGenerateReportReferenceRaw(
              referenceKey,
              row,
              muEquipmentRange,
              leastCountFallbacks,
            )
          : '0'
        const ref = hasReference ? parseGenerateReportReferenceNumber(refRaw) : 0
        const leastCountRefMissing =
          refIsLeastCount && (ref == null || !(ref > 0) || !refRaw)
        if (hasReference && (ref == null || !refRaw || leastCountRefMissing)) {
          emptyRefKeys.add(key)
          continue
        }
        const resolved = resolveGenerateReportRandomnessForPoint(
          configRow,
          row.pointValue,
          refRaw,
        )
        if (!resolved) {
          const col = colByKey.get(key)
          const label = (col?.label || key).trim() || key
          const pointHint = String(row.pointValue ?? '').trim()
          skipReasons.push(
            pointHint
              ? `skipped ${label} @ ${pointHint}: no View Factor for this point`
              : `skipped ${label}: sheet point missing for View Factor match`,
          )
          continue
        }
        const factorText = resolved.randomnessFactor.trim()
        const factor = Number(factorText)
        const mode = parseGenerateReportRandomnessMode(resolved.randomnessMode)
        const floor = parseOptionalAbsoluteBand(resolved.randomnessFloor)
        const cap = parseOptionalAbsoluteBand(resolved.randomnessCap)

        const colDp = decimals[key] ?? dp
        const multiple = multiples[key] ?? 1
        const leastCount = resolveReportLeastCount(leastCounts[key], reportLeastCountOptions)
        // Factor 0 / empty → write exact reference (e.g. point 0 → reading 0).
        // Positive factor → Ref ± band (with optional Min/Max clamps).
        const effectiveFactor =
          factorText && Number.isFinite(factor) && factor > 0 ? factor : 0
        const generated = readingWithRandomnessDeviation(
          ref ?? 0,
          effectiveFactor,
          `${generationSeed}:${row.id}:${key}`,
          colDp,
          multiple,
          leastCount,
          !hasReference,
          {
            mode,
            floor: effectiveFactor > 0 ? floor : 0,
            cap: effectiveFactor > 0 ? cap : 0,
            rangeSpan: rangeBounds.rangeSpan ?? 0,
            rangeMax: rangeBounds.rangeMax ?? 0,
          },
        )
        values[key] = generated
        // Always restore Generate Report fills after formula recompute.
        preservedGenerated[key] = generated
        rowFilled = true
      }
      if (!rowFilled) return row
      values = applyFormulaColumns(payload.template.columns, values, dp, environment)
      for (const [key, generated] of Object.entries(preservedGenerated)) {
        values[key] = generated
      }
      filledRows += 1
      return { ...row, values }
    })

    for (const key of emptyRefKeys) {
      const col = colByKey.get(key)
      const label = (col?.label || key).trim() || key
      const refKey = references[key]
      const refLabel =
        refKey === MU_LEAST_COUNT_FIELD_KEY
          ? 'Least Count'
          : isGenerateReportEquipmentRefKey(refKey ?? '')
            ? refKey
            : colByKey.get(refKey ?? '')?.label || refKey || 'Reference'
      skipReasons.push(`skipped ${label}: ${refLabel} empty`)
    }

    if (filledRows === 0) {
      setError(
        skipReasons.length > 0
          ? `No cells filled. ${skipReasons.join('; ')}.`
          : 'No numeric values found in the configured Reference columns. Fill Reference / point values first, then apply Generate Report again.',
      )
      return
    }

    const nextPayload: RawDataSheetPayload = {
      ...payload,
      rows: nextRows,
      reportGenerationSettings,
    }
    setPayload(nextPayload)
    setError(null)

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

  const openMasterDetails = async () => {
    if (!job || !equipmentMaster) {
      setError('Calibration Equipment is not loaded yet. Close and reopen this sheet.')
      return
    }
    setError(null)
    setMasterDetailsLoading(true)

    const masterTabs = collectMasterPointsTabsForJob(
      job,
      equipmentMaster.measurement_ranges,
      equipmentMaster.range_capacity,
      equipmentMaster.resolution_least_count,
      equipmentMaster.master_equipment_id,
    )
    const extra = [
      ...(payload?.rows.map((r) => r.masterEquipmentId ?? '') ?? []),
      ...masterTabs.map((t) => t.masterEquipmentId),
    ]
    const ids = collectMasterEquipmentIdsForJob(job, equipmentMaster, extra)

    try {
      if (ids.length > 0) {
        const masters = await fetchMasterEquipmentsByIds(ids)
        setMasterEquipments(masters)
      }
      setContextPanel('master')
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Could not load master equipment'
      setError(msg)
    } finally {
      setMasterDetailsLoading(false)
    }
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
                    onClick={() => void openMasterDetails()}
                    disabled={loading || masterDetailsLoading}
                    aria-label="View used master equipment details"
                    title="View linked Calibration Master equipment details"
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
              className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
              layer="nested"
              aria-describedby={undefined}
            >
              <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
                <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                    Calibration Standards
                  </p>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                    Master Details
                  </DialogTitle>
                </DialogHeader>
              </div>
              <div className="max-h-[min(70vh,720px)] space-y-3 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
                {masterDetailsLoading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading master details…
                  </p>
                ) : masterDetailEntries.length === 0 ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    No master equipment linked for this job range. Set Master Equipment and Points
                    under Calibration Equipments.
                  </p>
                ) : (
                  masterDetailEntries.map((entry, index) => {
                    const master = entry.master
                    const dueRaw = master?.next_calibration_due
                    const dueTone = masterCalDueTone(dueRaw)
                    const dueLabel =
                      dueTone === 'overdue'
                        ? 'Overdue'
                        : dueTone === 'dueSoon'
                          ? 'Due Soon'
                          : dueTone === 'ok'
                            ? 'Valid'
                            : null

                    return (
                      <div
                        key={entry.key}
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                      >
                        <div className="border-b border-slate-200 bg-slate-900 px-3 py-2.5 text-white sm:px-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-teal-300/90">
                                Master {index + 1}
                                {master?.asset_code ? ` · ${master.asset_code}` : ''}
                              </p>
                              <p className="mt-0.5 text-base font-semibold tracking-tight">
                                {entry.label}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {master?.equipment_status ? (
                                <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                  {master.equipment_status}
                                </span>
                              ) : null}
                              {dueLabel ? (
                                <span
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                    dueTone === 'overdue' &&
                                      'border-rose-300/60 bg-rose-500/20 text-rose-100',
                                    dueTone === 'dueSoon' &&
                                      'border-amber-300/60 bg-amber-500/20 text-amber-100',
                                    dueTone === 'ok' &&
                                      'border-emerald-300/60 bg-emerald-500/20 text-emerald-100',
                                  )}
                                >
                                  Cal {dueLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {master ? (
                          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:p-4">
                            <DetailField label="Asset Code" value={cellText(master.asset_code)} />
                            <DetailField
                              label="Serial No."
                              value={cellText(master.serial_number)}
                            />
                            <DetailField
                              label="Status"
                              value={cellText(master.equipment_status)}
                            />
                            <DetailField
                              label="Manufacturer"
                              value={cellText(master.manufacturer)}
                            />
                            <DetailField label="Model" value={cellText(master.model_number)} />
                            <DetailField
                              label="Location"
                              value={cellText(master.current_location)}
                            />
                            <DetailField
                              label="Range / Capacity"
                              value={cellText(master.range_capacity)}
                            />
                            <DetailField
                              label="Least Count"
                              value={cellText(master.resolution_least_count)}
                            />
                            <DetailField
                              label="Accuracy"
                              value={cellText(master.accuracy_acceptance_criteria)}
                            />
                            <DetailField
                              label="Uncertainty"
                              value={formatMasterUncertainty(master)}
                            />
                            <DetailField
                              label="Coverage Factor"
                              value={cellText(master.calibration_coverage_factor)}
                            />
                            <DetailField
                              label="Certificate No."
                              value={cellText(master.calibration_certificate_number)}
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
                              value={
                                formatDate(master.next_calibration_due) !== '—'
                                  ? formatDate(master.next_calibration_due)
                                  : cellText(resolveMasterNextCalDueValue(master)) || '—'
                              }
                            />
                          </div>
                        ) : (
                          <p className="px-4 py-3 text-sm text-slate-500">
                            Master equipment record not found for this tab.
                          </p>
                        )}
                      </div>
                    )
                  })
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 border-slate-400/50 text-slate-800 hover:bg-slate-50"
                      disabled={readOnly || !payload}
                      onClick={refreshTable}
                      aria-label="Refresh table formulas"
                      title="Recalculate all formula columns from inputs and Environment Condition"
                    >
                      <RefreshCw size={14} aria-hidden />
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
                    {showGenerateReport ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                        disabled={readOnly}
                        onClick={applyGenerateReportSettings}
                        aria-label="Apply Generate Report settings"
                        title="Apply Generate Report Format from Calibration Equipment into reading columns"
                      >
                        <Calculator size={14} className="mr-1" />
                        Generate Report
                      </Button>
                    ) : null}
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
                        {pinnedFormulaColumns.map((col) => (
                          <th
                            key={`pinned-${col.key}`}
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
                        const rowValues = liveRowCalculationValues(
                          liveEvalColumns,
                          row.values,
                          tableSettings.decimalPlaces,
                          environment,
                          payload.reportGenerationSettings,
                        )
                        const prevMaster = index > 0 ? payload.rows[index - 1]?.masterEquipmentId : null
                        const showMasterHeader =
                          Boolean(row.masterLabel || row.masterEquipmentId) &&
                          (index === 0 || prevMaster !== (row.masterEquipmentId ?? ''))
                        const colSpan =
                          1 +
                          inputColumns.length +
                          pinnedFormulaColumns.length +
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
                            {pinnedFormulaColumns.map((col) => {
                              const emreRaw = rowValues[col.key] ?? ''
                              const emreExceeded = isEmreExpandedUncertaintyExceeded(
                                resolveActualExpandedUncertainty(
                                  liveEvalColumns,
                                  rowValues,
                                  emreRaw,
                                ),
                                resolveUsedMasterUncertainty(row, masterEquipments),
                              )
                              return (
                                <td
                                  key={`pinned-${col.key}`}
                                  className="border border-slate-200 px-2 py-1.5"
                                >
                                  <Input
                                    type="text"
                                    className={cn(
                                      'h-9 text-center font-medium',
                                      emreExceeded
                                        ? 'border-red-300 bg-red-50 text-red-800'
                                        : 'bg-slate-50 text-indigo-900',
                                    )}
                                    value={formatPlusMinusPairDisplay(emreRaw)}
                                    disabled
                                    readOnly
                                    aria-label={`${col.label} calculated value row ${index + 1}`}
                                    title={
                                      emreExceeded
                                        ? 'Actual Expanded Uncertainty exceeds used master uncertainty'
                                        : undefined
                                    }
                                  />
                                </td>
                              )
                            })}
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
                  key={calculationsRowId ?? 'calculations-closed'}
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
                    {calculationsFormulaColumns.length === 0 ? (
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
                                {calculationsFormulaColumns.map((col) => (
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
                                {calculationsFormulaColumns.map((col) => (
                                  <td
                                    key={col.key}
                                    className="border border-slate-200 px-2 py-1.5"
                                  >
                                    <Input
                                      type="text"
                                      className="h-9 bg-slate-50 text-center font-medium text-indigo-900"
                                      value={formatPlusMinusPairDisplay(
                                        calculationsValues?.[col.key] ?? '',
                                      )}
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
                muCalculationTemplate={resolvedMuCalculationTemplate}
                equipmentRange={muEquipmentRange}
                onApplyUncertainty={
                  forceReadOnly
                    ? undefined
                    : () => {
                        setError(null)
                      }
                }
              />

            </>
          ) : null}
        </div>

        {payload && !loading ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
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
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
