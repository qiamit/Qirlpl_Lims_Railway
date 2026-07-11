import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { FileUp, Eye, X, Trash2, Plus, CheckCircle, AlertTriangle, Settings, MapPin, Activity, ShieldCheck, History, FileText, Wrench, CalendarCheck, Cpu, Info, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import {
  calculateNextDueDate,
  sanitizeDateStr,
  type EquipmentForm,
  type EquipmentStatus,
  type Frequency,
  type EquipmentRow,
} from './types'
import { ClientSearchSelect } from './ClientSearchSelect'
import { ConductMaintenanceDialog } from './ConductMaintenanceDialog'
import { ConductIntermediateCheckDialog } from './ConductIntermediateCheckDialog'
import { MaintenanceHistoryDialog } from './MaintenanceHistoryDialog'
import { IntermediateCheckHistoryDialog } from './IntermediateCheckHistoryDialog'
import {
  buildIntermediateCheckMasterSnapshots,
  createIntermediateCheckHistoryRecord,
  filterIntermediateCheckHistoryLastYears,
  isDateWithinLastYears,
  parseIntermediateCheckResultPayload,
} from './intermediateCheckHistory'
import { IqcMasterSearchSelect } from './IqcMasterSearchSelect'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'

function parseAcceptanceLimit(criteria: string | null | undefined): number | null {
  if (!criteria) return null
  const match = criteria.match(/[\d\.]+/)
  if (match) {
    const num = parseFloat(match[0])
    return isNaN(num) ? null : num
  }
  return null
}

function extractAcceptanceCriteriaUnit(
  criteria: string | null | undefined,
  parsedUnit?: string,
): string {
  if (parsedUnit?.trim()) return parsedUnit.trim()
  if (!criteria?.trim()) return ''
  return criteria.replace(/[\d.\s±+\-]+/g, '').trim()
}

function calcIntermediateCheckError(
  std: string,
  obs: string,
  multiplier = 1,
): number | null {
  const stdNum = parseFloat(std)
  const obsNum = parseFloat(obs)
  if (Number.isNaN(stdNum) || Number.isNaN(obsNum)) return null
  return Math.abs(obsNum * multiplier - stdNum * multiplier)
}

function formatIntermediateCheckError(err: number, unit: string): string {
  return `${err.toFixed(4)}${unit ? ` ${unit}` : ''}`
}

type IntermediateCheckReading = {
  checkPointValue: string
  std: string
  obs: string
}

function normalizeIntermediateCheckReading(row: unknown): IntermediateCheckReading {
  if (!row || typeof row !== 'object') return emptyIntermediateCheckReading()
  const r = row as Record<string, unknown>
  return {
    checkPointValue: String(r.checkPointValue ?? r.checkPoint ?? r.checkpoint ?? ''),
    std: String(r.std ?? ''),
    obs: String(r.obs ?? ''),
  }
}

function emptyIntermediateCheckReading(): IntermediateCheckReading {
  return { checkPointValue: '', std: '', obs: '' }
}

const DEFAULT_INTERMEDIATE_TEMPERATURE = '27'
const DEFAULT_INTERMEDIATE_HUMIDITY = '65'

function safeEvaluate(expr: string): string {
  const sanitized = expr.replace(/\s+/g, '')
  if (!/^[-+*/.0-9]+$/.test(sanitized)) {
    return 'Error'
  }
  try {
    const fn = new Function(`return ${sanitized}`)
    const res = fn()
    return isFinite(res) ? String(res) : 'Error'
  } catch {
    return 'Error'
  }
}

export function EquipmentMasterForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  clients,
  employees,
  locations,
  onViewFile,
  activeSection,
  onAddNewClientClick,
  equipments = [],
  iqcMasters = [],
}: {
  form: EquipmentForm
  onChange: (next: EquipmentForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  clients: Array<{ id: string; company_name: string }>
  employees: Array<{ id: string; full_name: string }>
  locations: string[]
  onViewFile: (storagePath: string, fileName: string) => void
  activeSection?: 'calibration' | 'intermediate' | 'maintenance' | null
  onAddNewClientClick: (field: 'purchasedFrom' | 'externalCalibrationAgency') => void
  equipments?: EquipmentRow[]
  iqcMasters?: any[]
}) {
  const [showCalcSteps, setShowCalcSteps] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [calcInput, setCalcInput] = useState('')
  const [calcResult, setCalcResult] = useState('')

  // Applicability states
  const [calApplicable, setCalApplicable] = useState<'applicable' | 'not-applicable'>('not-applicable')
  const [intermediateApplicable, setIntermediateApplicable] = useState<'applicable' | 'not-applicable'>('not-applicable')
  const [maintApplicable, setMaintApplicable] = useState<'applicable' | 'not-applicable'>('not-applicable')
  const [conductMaintenanceOpen, setConductMaintenanceOpen] = useState(false)
  const [conductIntermediateCheckOpen, setConductIntermediateCheckOpen] = useState(false)
  const [maintenanceHistoryViewOpen, setMaintenanceHistoryViewOpen] = useState(false)
  const [intermediateHistoryViewOpen, setIntermediateHistoryViewOpen] = useState(false)
  const [intermediateCompleteMessage, setIntermediateCompleteMessage] = useState<string | null>(null)
  const [calDetailsOpen, setCalDetailsOpen] = useState(false)
  const [intermediateDetailsOpen, setIntermediateDetailsOpen] = useState(false)
  const [maintDetailsOpen, setMaintDetailsOpen] = useState(false)

  const effectiveMaintenanceDoneBy = form.maintenanceDoneBy || form.custodianEmployeeId || ''

  const maintenanceDoneByName = useMemo(
    () => employees.find((emp) => emp.id === effectiveMaintenanceDoneBy)?.full_name ?? '',
    [employees, effectiveMaintenanceDoneBy],
  )

  const hasMaintenanceChecklistHistory = useMemo(
    () =>
      form.maintenanceHistory.length > 0 ||
      (form.maintenanceChecklist.length > 0 && !!form.lastMaintenanceDate?.trim()),
    [form.maintenanceHistory.length, form.maintenanceChecklist.length, form.lastMaintenanceDate],
  )

  const renderMaintenanceScheduleRow = (
    ids: { last: string; next: string },
    labelClassName = 'text-xs font-semibold',
  ) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor={ids.last} className={labelClassName}>
          Last Date
        </Label>
        <Input
          id={ids.last}
          type="date"
          value={form.lastMaintenanceDate}
          onChange={(e) => onChange({ ...form, lastMaintenanceDate: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.next} className={labelClassName}>
          Next Due (Auto)
        </Label>
        <Input
          id={ids.next}
          type="date"
          value={form.nextMaintenanceDate}
          readOnly
          className="bg-muted text-muted-foreground font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className={labelClassName}>Conduct Maintenance</Label>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full gap-1.5 text-xs"
          onClick={() => setConductMaintenanceOpen(true)}
        >
          <Wrench size={14} />
          Conduct
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className={labelClassName}>View Old Checklist</Label>
        <Button
          type="button"
          variant="secondary"
          className="h-9 w-full gap-1.5 text-xs"
          disabled={!hasMaintenanceChecklistHistory}
          onClick={() => setMaintenanceHistoryViewOpen(true)}
        >
          <History size={14} />
          View
          {form.maintenanceHistory.length > 0 ? ` (${form.maintenanceHistory.length})` : ''}
        </Button>
      </div>
    </div>
  )

  const renderMaintenanceHistoryDialog = () => (
    <MaintenanceHistoryDialog
      open={maintenanceHistoryViewOpen}
      onOpenChange={setMaintenanceHistoryViewOpen}
      equipmentName={form.equipmentName}
      assetCode={form.assetCode}
      history={form.maintenanceHistory}
      currentLastDate={form.lastMaintenanceDate}
      currentDoneByName={maintenanceDoneByName}
      currentChecklist={form.maintenanceChecklist}
    />
  )

  const [prevAssetCode, setPrevAssetCode] = useState<string | null>(null)
  const [prevFormResetState, setPrevFormResetState] = useState<boolean>(false)

  const currentFormResetState = !form.equipmentName && !form.manufacturer && !form.modelNumber && !form.serialNumber && !form.calibrationFrequency && !form.intermediateCheckFrequency && !form.maintenanceScheduleFrequency

  if (form.assetCode !== prevAssetCode || (currentFormResetState && !prevFormResetState)) {
    setPrevAssetCode(form.assetCode)
    setPrevFormResetState(currentFormResetState)
    
    // Determine applicability
    const hasCal = !!(
      form.calibrationFrequency ||
      form.lastCalibrationDate ||
      form.calibrationCertificateNumber ||
      form.calibrationCertificateUncertainty ||
      form.calibrationUncertaintyUnit ||
      form.externalCalibrationAgency ||
      form.uploadCertificatePath ||
      form.certificateFile
    )
    setCalApplicable(hasCal ? 'applicable' : 'not-applicable')

    const hasInter = !!(
      form.intermediateCheckFrequency ||
      form.lastIntermediateCheckDate ||
      form.intermediateCheckResult ||
      form.intermediateCheckHistory.length
    )
    setIntermediateApplicable(hasInter ? 'applicable' : 'not-applicable')

    const hasMaint = !!(
      form.maintenanceScheduleFrequency ||
      form.lastMaintenanceDate ||
      form.maintenanceDoneBy ||
      form.maintenanceChecklist.length ||
      form.maintenanceHistory.length
    )
    setMaintApplicable(hasMaint ? 'applicable' : 'not-applicable')
    setCalDetailsOpen(false)
    setIntermediateDetailsOpen(false)
    setMaintDetailsOpen(false)
  } else if (!currentFormResetState && prevFormResetState) {
    setPrevFormResetState(false)
  }

  const {
    parsedReadings,
    parsedDoneBy,
    parsedMasters,
    parsedUnit,
    parsedConversionMultiplier,
    parsedTemperature,
    parsedHumidity,
    parsedIsEnRatioEnabled,
    parsedLabUncertainty,
    parsedMasterUncertainty,
    isLegacy
  } = (() => {
    const match = form.intermediateCheckResult?.match(/\[DATA:([\s\S]+)\]/)
    if (match) {
      try {
        const parsed = JSON.parse(match[1])
        if (Array.isArray(parsed.readings)) {
          return {
            parsedReadings: parsed.readings.map((row: Record<string, unknown>) =>
              normalizeIntermediateCheckReading(row),
            ),
            parsedDoneBy:
              String(parsed.doneBy ?? '').trim() || form.custodianEmployeeId || '',
            parsedMasters: Array.isArray(parsed.masters) ? (parsed.masters as string[]) : [],
            parsedUnit: parsed.unit !== undefined ? String(parsed.unit) : '',
            parsedConversionMultiplier: parsed.conversionMultiplier !== undefined ? String(parsed.conversionMultiplier) : '1',
            parsedTemperature:
              String(parsed.temperature ?? '').trim() || DEFAULT_INTERMEDIATE_TEMPERATURE,
            parsedHumidity:
              String(parsed.humidity ?? '').trim() || DEFAULT_INTERMEDIATE_HUMIDITY,
            parsedIsEnRatioEnabled: !!parsed.isEnRatioEnabled,
            parsedLabUncertainty: parsed.labUncertainty !== undefined ? String(parsed.labUncertainty) : '',
            parsedMasterUncertainty: parsed.masterUncertainty !== undefined ? String(parsed.masterUncertainty) : '',
            isLegacy: false,
          }
        }
      } catch (e) {
        // ignore
      }
    }
    
    return {
      parsedReadings: [emptyIntermediateCheckReading()],
      parsedDoneBy: form.custodianEmployeeId || '',
      parsedMasters: [],
      parsedUnit: '',
      parsedConversionMultiplier: '1',
      parsedTemperature: DEFAULT_INTERMEDIATE_TEMPERATURE,
      parsedHumidity: DEFAULT_INTERMEDIATE_HUMIDITY,
      parsedIsEnRatioEnabled: false,
      parsedLabUncertainty: '',
      parsedMasterUncertainty: '',
      isLegacy: !!form.intermediateCheckResult?.trim() && !form.intermediateCheckResult.includes('[DATA:'),
    }
  })()

  const defaultLimit = parseAcceptanceLimit(form.accuracyAcceptanceCriteria)

  const handleUpdateCheck = (
    newReadings: IntermediateCheckReading[],
    doneByVal?: string,
    mastersVal?: string[],
    unitVal?: string,
    multiplierVal?: string,
    tempVal?: string,
    humidityVal?: string,
    isEnEnabled?: boolean,
    labUncVal?: string,
    masterUncVal?: string,
    extraForm?: Partial<EquipmentForm>,
  ) => {
    const multiplier = parseFloat(multiplierVal !== undefined ? multiplierVal : parsedConversionMultiplier) || 1
    const finalDoneBy =
      (doneByVal !== undefined ? doneByVal : parsedDoneBy) || form.custodianEmployeeId
    const finalMasters = mastersVal !== undefined ? mastersVal : parsedMasters
    const finalUnit = unitVal !== undefined ? unitVal : parsedUnit
    const finalMultiplier = multiplierVal !== undefined ? multiplierVal : parsedConversionMultiplier
    const finalTemp =
      (tempVal !== undefined ? tempVal : parsedTemperature) || DEFAULT_INTERMEDIATE_TEMPERATURE
    const finalHumidity =
      (humidityVal !== undefined ? humidityVal : parsedHumidity) || DEFAULT_INTERMEDIATE_HUMIDITY
    const finalIsEn = isEnEnabled !== undefined ? isEnEnabled : parsedIsEnRatioEnabled
    const finalLabUnc = labUncVal !== undefined ? labUncVal : parsedLabUncertainty
    const finalMasterUnc = masterUncVal !== undefined ? masterUncVal : parsedMasterUncertainty

    const parsedLimitNum = defaultLimit
    const uLab = parseFloat(finalLabUnc) || 0
    const uRef = parseFloat(finalMasterUnc) || 0
    const enDenom = Math.sqrt(uLab * uLab + uRef * uRef)

    let maxError = 0
    let sumSqError = 0
    let hasFail = false
    let hasValidReading = false

    newReadings.forEach((r) => {
      const stdNum = parseFloat(r.std)
      const obsNum = parseFloat(r.obs)
      if (!isNaN(stdNum) && !isNaN(obsNum)) {
        hasValidReading = true
        // Apply multiplier to convert values to target criteria unit
        const stdConverted = stdNum * multiplier
        const obsConverted = obsNum * multiplier
        const err = Math.abs(obsConverted - stdConverted)
        
        sumSqError += err * err
        if (err > maxError) {
          maxError = err
        }
        
        let pass = true
        if (finalIsEn && enDenom > 0) {
          const enRatio = err / enDenom
          if (enRatio > 1.0) {
            pass = false
          }
        } else if (parsedLimitNum !== null) {
          pass = err <= parsedLimitNum
        }

        if (!pass) {
          hasFail = true
        }
      }
    })

    let overallStatus: 'Satisfactory' | 'Unsatisfactory' | 'N/A' = 'N/A'
    if (hasValidReading) {
      overallStatus = hasFail ? 'Unsatisfactory' : 'Satisfactory'
    }

    const combinedErrorRSSVal = Math.sqrt(sumSqError)
    const displayUnit = finalUnit || form.accuracyAcceptanceCriteria?.replace(/[\d\.\s±]+/g, '') || ''
    
    const summaryLine = hasValidReading
      ? `${overallStatus} (Max Error: ${maxError.toFixed(4)} ${displayUnit}, RSS Combined Error: ${combinedErrorRSSVal.toFixed(4)} ${displayUnit})`
      : 'No check performed yet'

    const dataStr = `[DATA:${JSON.stringify({
      status: overallStatus,
      limit: defaultLimit !== null ? String(defaultLimit) : '',
      readings: newReadings,
      doneBy: finalDoneBy,
      masters: finalMasters,
      unit: finalUnit,
      conversionMultiplier: finalMultiplier,
      temperature: finalTemp,
      humidity: finalHumidity,
      isEnRatioEnabled: finalIsEn,
      labUncertainty: finalLabUnc,
      masterUncertainty: finalMasterUnc,
      combinedErrorRSS: combinedErrorRSSVal.toFixed(4)
    })}]`

    onChange({
      ...form,
      ...extraForm,
      intermediateCheckResult: `${summaryLine}\n${dataStr}`,
    })
  }

  const intermediateDoneBy =
    parsedDoneBy || form.custodianEmployeeId || ''

  const intermediateDoneByName = useMemo(
    () => employees.find((emp) => emp.id === intermediateDoneBy)?.full_name ?? '',
    [employees, intermediateDoneBy],
  )

  const currentIntermediatePayload = useMemo(
    () => parseIntermediateCheckResultPayload(form.intermediateCheckResult),
    [form.intermediateCheckResult],
  )

  const visibleIntermediateHistoryCount = useMemo(
    () =>
      filterIntermediateCheckHistoryLastYears(form.intermediateCheckHistory).length +
      (form.lastIntermediateCheckDate?.trim() &&
      currentIntermediatePayload.readings.length > 0 &&
      isDateWithinLastYears(form.lastIntermediateCheckDate)
        ? 1
        : 0),
    [
      form.intermediateCheckHistory,
      form.lastIntermediateCheckDate,
      currentIntermediatePayload.readings.length,
    ],
  )

  const hasIntermediateCheckHistory = visibleIntermediateHistoryCount > 0

  const handleCompleteIntermediateCheck = (): boolean => {
    const doneBy = intermediateDoneBy
    if (!doneBy?.trim()) {
      setIntermediateCompleteMessage('Select Performed By before completing intermediate check.')
      return false
    }

    const hasValidReading = parsedReadings.some((row) => {
      const stdNum = parseFloat(row.std)
      const obsNum = parseFloat(row.obs)
      return !Number.isNaN(stdNum) && !Number.isNaN(obsNum)
    })

    if (!hasValidReading) {
      setIntermediateCompleteMessage('Add at least one valid Std/Obs reading before completing.')
      return false
    }

    const today = sanitizeDateStr(new Date().toISOString().split('T')[0])
    const nextDue =
      calculateNextDueDate(today, form.intermediateCheckFrequency || 'Quarterly') || ''

    let nextHistory = [...form.intermediateCheckHistory]

    const shouldArchivePrevious =
      form.lastIntermediateCheckDate.trim() &&
      form.intermediateCheckResult.trim() &&
      form.lastIntermediateCheckDate !== today &&
      !nextHistory.some((record) => record.conductedOn === form.lastIntermediateCheckDate)

    if (shouldArchivePrevious) {
      const archived = createIntermediateCheckHistoryRecord({
        conductedOn: form.lastIntermediateCheckDate,
        doneBy: currentIntermediatePayload.doneBy || doneBy,
        doneByName: intermediateDoneByName,
        intermediateCheckResult: form.intermediateCheckResult,
        nextDueDate: form.nextIntermediateCheckDate,
        iqcMasters: iqcMasters ?? [],
      })
      if (archived) {
        nextHistory = [...nextHistory, archived]
      }
    }

    onChange({
      ...form,
      intermediateCheckHistory: nextHistory,
      lastIntermediateCheckDate: today,
      nextIntermediateCheckDate: nextDue,
    })
    setIntermediateCompleteMessage(null)
    return true
  }

  const renderIntermediateScheduleRow = (
    ids: { last: string; next: string },
    labelClassName = 'text-xs font-semibold',
    dueLabel = 'Due Date (Auto)',
  ) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor={ids.last} className={labelClassName}>
          Last Date
        </Label>
        <Input
          id={ids.last}
          type="date"
          value={form.lastIntermediateCheckDate}
          onChange={(e) => onChange({ ...form, lastIntermediateCheckDate: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.next} className={labelClassName}>
          {dueLabel}
        </Label>
        <Input
          id={ids.next}
          type="date"
          value={form.nextIntermediateCheckDate}
          readOnly
          className="bg-muted text-muted-foreground font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className={labelClassName}>Conduct Check</Label>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full gap-1.5 text-xs"
          onClick={() => setConductIntermediateCheckOpen(true)}
        >
          <Activity size={14} />
          Conduct
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className={labelClassName}>Previous Results</Label>
        <Button
          type="button"
          variant="secondary"
          className="h-9 w-full gap-1.5 text-xs"
          disabled={!hasIntermediateCheckHistory}
          onClick={() => setIntermediateHistoryViewOpen(true)}
        >
          <History size={14} />
          View
          {visibleIntermediateHistoryCount > 0 ? ` (${visibleIntermediateHistoryCount})` : ''}
        </Button>
      </div>
    </div>
  )

  const currentIntermediateMasterSnapshots = useMemo(
    () => buildIntermediateCheckMasterSnapshots(parsedMasters, iqcMasters ?? []),
    [parsedMasters, iqcMasters],
  )

  const renderIntermediateCheckHistoryDialog = () => (
    <IntermediateCheckHistoryDialog
      open={intermediateHistoryViewOpen}
      onOpenChange={setIntermediateHistoryViewOpen}
      equipmentName={form.equipmentName}
      assetCode={form.assetCode}
      history={form.intermediateCheckHistory}
      currentLastDate={form.lastIntermediateCheckDate}
      currentDoneByName={intermediateDoneByName}
      currentStatus={currentIntermediatePayload.status}
      currentSummary={currentIntermediatePayload.summaryLine}
      currentReadings={currentIntermediatePayload.readings}
      currentTemperature={parsedTemperature}
      currentHumidity={parsedHumidity}
      currentMasters={currentIntermediateMasterSnapshots}
      currentNextDueDate={form.nextIntermediateCheckDate}
      acceptanceCriteria={form.accuracyAcceptanceCriteria}
    />
  )

  const renderIntermediateCheckCalculator = () => {
    return (
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-slate-700">Intermediate Check Perform</Label>

        {intermediateCompleteMessage ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {intermediateCompleteMessage}
          </div>
        ) : null}
        
        {isLegacy && (
          <div className="p-2 border border-amber-200 bg-amber-50 rounded-md text-[11px] text-amber-800 space-y-1">
            <div className="font-semibold text-xs">Legacy Result Data:</div>
            <div className="font-mono text-[10px] whitespace-pre-wrap">{form.intermediateCheckResult}</div>
            <div className="text-[9px] text-amber-600">
              * Performing a new calculation below will replace this legacy text.
            </div>
          </div>
        )}

        <div className="space-y-4 border border-slate-200 rounded-lg p-3 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b pb-2 text-xs">
            <span className="font-bold text-slate-700 uppercase">Interactive Check Layout (ISO 17025)</span>
            <span className="text-muted-foreground text-[11px]">
              Criteria: <strong className="text-foreground">{form.accuracyAcceptanceCriteria || 'None'}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-start">
            <div className="space-y-1.5">
              <Label htmlFor="eq-check-temperature" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Temperature (°C)
              </Label>
              <Input
                id="eq-check-temperature"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 23.5"
                value={parsedTemperature || DEFAULT_INTERMEDIATE_TEMPERATURE}
                onChange={(e) =>
                  handleUpdateCheck(
                    parsedReadings,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    e.target.value,
                  )
                }
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-check-humidity" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Humidity (% RH)
              </Label>
              <Input
                id="eq-check-humidity"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 55"
                value={parsedHumidity || DEFAULT_INTERMEDIATE_HUMIDITY}
                onChange={(e) =>
                  handleUpdateCheck(
                    parsedReadings,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    e.target.value,
                  )
                }
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Master Standard(s) Used (IQC Masters)
              </Label>
              <IqcMasterSearchSelect
                iqcMasters={iqcMasters ?? []}
                selectedMasterIds={parsedMasters}
                onSelectedMasterIdsChange={(ids) =>
                  handleUpdateCheck(parsedReadings, undefined, ids)
                }
              />
            </div>
          </div>

          {parsedMasters.length > 0 && iqcMasters ? (
            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-150">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1">
                Selected Master Details (Intermediate Check Related)
              </div>
                {parsedMasters.map((id) => {
                  const eq = iqcMasters.find((e) => e.id === id)
                  if (!eq) return null
                  const isOverdue =
                    eq.next_calibration_due && new Date(eq.next_calibration_due) < new Date()
                  const calPoints = Array.isArray(eq.calibration_points) ? eq.calibration_points : []
                  return (
                    <div
                      key={id}
                      className="rounded-md border border-slate-200 bg-white p-2.5 space-y-2 text-[11px]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-800">{eq.equipment_name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{eq.asset_code}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/5"
                            onClick={() =>
                              handleUpdateCheck(
                                parsedReadings,
                                undefined,
                                parsedMasters.filter((masterId) => masterId !== id),
                              )
                            }
                          >
                            Deselect
                          </Button>
                          <span
                            className={
                              isOverdue
                                ? 'text-rose-600 font-bold text-[10px]'
                                : 'text-slate-500 text-[10px]'
                            }
                          >
                            {eq.next_calibration_due
                              ? `Cal Due: ${new Date(eq.next_calibration_due).toLocaleDateString('en-GB')}${isOverdue ? ' (Overdue!)' : ''}`
                              : 'No Calibration Due Date'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600 sm:grid-cols-3">
                        <div>
                          <span className="text-muted-foreground">Range / Capacity: </span>
                          {eq.range_capacity || '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Resolution: </span>
                          {eq.resolution_least_count || '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Acceptance Criteria: </span>
                          {eq.accuracy_acceptance_criteria || '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cal Frequency: </span>
                          {eq.calibration_frequency || '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Last Calibration: </span>
                          {eq.last_calibration_date
                            ? new Date(eq.last_calibration_date).toLocaleDateString('en-GB')
                            : '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Certificate No: </span>
                          {eq.calibration_certificate_number || '-'}
                        </div>
                      </div>

                      {calPoints.length > 0 ? (
                        <div className="overflow-x-auto rounded border border-slate-100">
                          <table className="w-full text-left text-[10px] border-collapse">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 font-semibold uppercase border-b">
                                <th className="py-1 px-1.5">Nominal / Std</th>
                                <th className="py-1 px-1.5">Actual / Certified</th>
                                <th className="py-1 px-1.5">Correction</th>
                                <th className="py-1 px-1.5">Uncertainty</th>
                                <th className="py-1 px-1.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {calPoints.map((pt: { id?: string; nominalValue?: string; actualValue?: string; correction?: string; uncertainty?: string }, ptIdx: number) => (
                                <tr key={pt.id || ptIdx}>
                                  <td className="py-1 px-1.5 font-mono">{pt.nominalValue || '-'}</td>
                                  <td className="py-1 px-1.5 font-mono">{pt.actualValue || '-'}</td>
                                  <td className="py-1 px-1.5 font-mono text-slate-600">{pt.correction || '-'}</td>
                                  <td className="py-1 px-1.5 font-mono text-slate-600">
                                    {pt.uncertainty ? `±${pt.uncertainty}` : '-'}
                                  </td>
                                  <td className="py-1 px-1.5 text-right">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[9px] font-semibold text-primary hover:bg-slate-100"
                                      onClick={() => {
                                        const emptyIdx = parsedReadings.findIndex(
                                          (r) => !r.checkPointValue && !r.std && !r.obs,
                                        )
                                        let nextReadings = [...parsedReadings]
                                        if (emptyIdx >= 0) {
                                          nextReadings[emptyIdx] = {
                                            checkPointValue: pt.nominalValue || '',
                                            std: pt.nominalValue || '',
                                            obs: pt.actualValue || '',
                                          }
                                        } else {
                                          nextReadings.push({
                                            checkPointValue: pt.nominalValue || '',
                                            std: pt.nominalValue || '',
                                            obs: pt.actualValue || '',
                                          })
                                        }
                                        handleUpdateCheck(nextReadings)
                                      }}
                                    >
                                      Use Reading
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">No calibration points recorded for this master.</p>
                      )}
                    </div>
                  )
                })}
            </div>
          ) : null}

          {(() => {
            const criteriaUnit = extractAcceptanceCriteriaUnit(
              form.accuracyAcceptanceCriteria,
              parsedUnit,
            )
            const readingMultiplier = parseFloat(parsedConversionMultiplier) || 1

            return (
          <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-muted-foreground font-semibold text-[10px] uppercase bg-slate-50/50">
                  <th className="py-1.5 px-2 w-[5%]">#</th>
                  <th className="py-1.5 px-2 w-[22%] text-center">Check Point</th>
                  <th className="py-1.5 px-2 w-[20%] text-center">Std Value</th>
                  <th className="py-1.5 px-2 w-[20%] text-center">Obs Value</th>
                  <th className="py-1.5 px-2 w-[18%] text-center">
                    Error{criteriaUnit ? ` (${criteriaUnit})` : ''}
                  </th>
                  <th className="py-1.5 px-2 w-[7%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedReadings.map((r, idx) => {
                  const limitNum = defaultLimit
                  const errValue = calcIntermediateCheckError(r.std, r.obs, readingMultiplier)
                  
                  let errText = '-'
                  let isPass = true
                  
                  if (errValue !== null) {
                    errText = formatIntermediateCheckError(errValue, criteriaUnit)
                    if (limitNum !== null) {
                      isPass = errValue <= limitNum
                    }
                  }
                  
                  const isLastRow = idx === parsedReadings.length - 1
                  
                  return (
                    <tr key={idx} className="group hover:bg-slate-50/50">
                      <td className="py-1.5 px-2 text-slate-500 font-mono align-middle">{idx + 1}</td>
                      <td className="py-0.5 px-1 align-middle text-center">
                        <Input
                          type="text"
                          placeholder="Check Point"
                          value={r.checkPointValue}
                          onChange={(e) => {
                            const newR = [...parsedReadings]
                            newR[idx] = { ...newR[idx], checkPointValue: e.target.value }
                            handleUpdateCheck(newR)
                          }}
                          className="h-7 text-xs py-0.5 px-2 text-center"
                        />
                      </td>
                      <td className="py-0.5 px-1 align-middle text-center">
                        <Input
                          type="text"
                          placeholder="Std"
                          value={r.std}
                          onChange={(e) => {
                            const newR = [...parsedReadings]
                            newR[idx] = { ...newR[idx], std: e.target.value }
                            handleUpdateCheck(newR)
                          }}
                          className="h-7 text-xs py-0.5 px-2 text-center"
                        />
                      </td>
                      <td className="py-0.5 px-1 align-middle text-center">
                        <Input
                          type="text"
                          placeholder="Obs"
                          value={r.obs}
                          onChange={(e) => {
                            const newR = [...parsedReadings]
                            newR[idx] = { ...newR[idx], obs: e.target.value }
                            handleUpdateCheck(newR)
                          }}
                          className="h-7 text-xs py-0.5 px-2 text-center"
                        />
                      </td>
                      <td className="py-1.5 text-center align-middle">
                        {errValue !== null ? (
                          <div className="space-y-0.5">
                            <div className="font-mono font-medium text-slate-700 text-[11px]">{errText}</div>
                            {isPass ? (
                              <span className="inline-flex items-center font-semibold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded text-[9px]">
                                Pass
                              </span>
                            ) : (
                              <span className="inline-flex items-center font-semibold text-rose-600 bg-rose-50 px-1 py-0.5 rounded text-[9px]">
                                Fail
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-350 text-[10px]">-</span>
                        )}
                      </td>
                      <td className="py-0.5 pl-1 align-middle text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {!isLastRow && parsedReadings.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-rose-50"
                              aria-label="Delete reading"
                              onClick={() => {
                                const newR = parsedReadings.filter((_, i) => i !== idx)
                                handleUpdateCheck(newR)
                              }}
                            >
                              <Trash2 size={10} />
                            </Button>
                          ) : null}
                          {isLastRow ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-primary hover:bg-primary/10"
                              aria-label="Add reading"
                              onClick={() => {
                                const newR = [...parsedReadings, emptyIntermediateCheckReading()]
                                handleUpdateCheck(newR)
                              }}
                            >
                              <Plus size={12} />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              
              {parsedReadings.some((r) => calcIntermediateCheckError(r.std, r.obs, readingMultiplier) !== null) && (
                <tfoot className="border-t border-slate-200 bg-slate-50/40 text-[11px] text-slate-700">
                  <tr>
                    <td colSpan={4} className="py-2 px-2 font-semibold text-right">Combined Error (RSS):</td>
                    <td className="py-2 text-center font-mono font-bold text-primary">
                      {formatIntermediateCheckError(
                        (() => {
                        let sumSq = 0
                        parsedReadings.forEach((r) => {
                          const err = calcIntermediateCheckError(r.std, r.obs, readingMultiplier)
                          if (err !== null) sumSq += err * err
                        })
                        return Math.sqrt(sumSq)
                      })(),
                        criteriaUnit,
                      )}
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="py-1 px-2 font-semibold text-right">Max Error:</td>
                    <td className="py-1 text-center font-mono font-semibold">
                      {formatIntermediateCheckError(
                        (() => {
                        let maxE = 0
                        parsedReadings.forEach((r) => {
                          const err = calcIntermediateCheckError(r.std, r.obs, readingMultiplier)
                          if (err !== null && err > maxE) maxE = err
                        })
                        return maxE
                      })(),
                        criteriaUnit,
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
            )
          })()}

          {/* Action and Summary */}
          <div className="flex items-center justify-between border-t pt-2 mt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-[11px] ${showCalcSteps ? 'bg-slate-100 text-primary font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setShowCalcSteps(p => !p)}
              >
                Steps
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-[11px] ${showCalculator ? 'bg-slate-100 text-primary font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setShowCalculator(p => !p)}
              >
                Calculator
              </Button>
            </div>
            
            {/* Overall Verdict */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Result:</span>
              {(() => {
                let hasValid = false
                let hasFail = false
                const limitNum = defaultLimit
                const readingMultiplier = parseFloat(parsedConversionMultiplier) || 1
                
                parsedReadings.forEach((r) => {
                  const err = calcIntermediateCheckError(r.std, r.obs, readingMultiplier)
                  if (err !== null) {
                    hasValid = true
                    if (limitNum !== null && err > limitNum) {
                      hasFail = true
                    }
                  }
                })
                
                if (!hasValid) {
                  return <span className="text-[10px] font-semibold text-slate-400">No readings</span>
                }
                if (hasFail) {
                  return (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.2 rounded text-[10px]">
                      <AlertTriangle size={10} /> Unsatisfactory
                    </span>
                  )
                }
                return (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px]">
                    <CheckCircle size={10} /> Satisfactory
                  </span>
                )
              })()}
            </div>
          </div>

          {/* Steps panel */}
          {showCalcSteps && (
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-[11px] text-slate-700 space-y-2 mt-2">
              <div className="font-bold uppercase text-[10px] text-slate-500 border-b pb-1">Calculation Method & Logic</div>
              <div className="space-y-1.5">
                <div>
                  <span className="font-semibold block text-primary">1. Observed Error:</span>
                  <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">Error = |Observed Value - Standard Value| * Multiplier</code>
                  <span className="text-muted-foreground block mt-0.5">Calculates the absolute difference between what the equipment reads and the standard reference scaled by the unit conversion multiplier.</span>
                </div>
                <div>
                  <span className="font-semibold block text-primary">2. Combined Error (RSS):</span>
                  <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">RSS Error = sqrt( sum(Error_i²) )</code>
                  <span className="text-muted-foreground block mt-0.5">Calculates the Root Sum Square (RSS) of errors across all test readings (ISO 17025 combined measurement estimation).</span>
                </div>
                <div>
                  <span className="font-semibold block text-primary">3. Drift Evaluation (En Ratio):</span>
                  <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">E_n = Error / sqrt(U_lab² + U_ref²)</code>
                  <span className="text-muted-foreground block mt-0.5">If enabled, uses uncertainty of the lab and reference master standard to compute the E_n ratio. E_n ≤ 1.0 passes drift criteria.</span>
                </div>
                <div>
                  <span className="font-semibold block text-primary">4. Criteria Evaluation:</span>
                  <span className="text-muted-foreground block">
                    If E_n ratio is disabled: <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">Error ≤ Acceptance Criteria Limit</code> → <strong className="text-emerald-600">Pass</strong><br />
                    If E_n ratio is enabled: <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">E_n Ratio ≤ 1.0</code> → <strong className="text-emerald-600">Pass</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Calculator panel */}
          {showCalculator && (
            <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 w-[240px] space-y-2 mt-2">
              <div className="text-[10px] font-bold uppercase text-slate-500">Quick Calculator</div>
              <div className="bg-white border rounded p-1.5 text-right font-mono text-sm min-h-[44px] flex flex-col justify-between">
                <div className="text-[10px] text-muted-foreground">{calcInput || '0'}</div>
                <div className="font-bold text-slate-800">{calcResult || '0'}</div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {['7', '8', '9', '/'].map(btn => (
                  <Button key={btn} type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold p-0" onClick={() => setCalcInput(p => p + btn)}>{btn}</Button>
                ))}
                {['4', '5', '6', '*'].map(btn => (
                  <Button key={btn} type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold p-0" onClick={() => setCalcInput(p => p + btn)}>{btn}</Button>
                ))}
                {['1', '2', '3', '-'].map(btn => (
                  <Button key={btn} type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold p-0" onClick={() => setCalcInput(p => p + btn)}>{btn}</Button>
                ))}
                {['0', '.', '=', '+'].map(btn => (
                  <Button key={btn} type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold p-0" onClick={() => {
                    if (btn === '=') {
                      setCalcResult(safeEvaluate(calcInput))
                    } else {
                      setCalcInput(p => p + btn)
                    }
                  }}>{btn}</Button>
                ))}
                <Button type="button" variant="destructive" size="sm" className="h-8 text-xs font-semibold col-span-2 p-0" onClick={() => { setCalcInput(''); setCalcResult(''); }}>Clear</Button>
                <Button type="button" variant="secondary" size="sm" className="h-8 text-xs font-semibold col-span-2 p-0" onClick={() => setCalcInput(p => p.slice(0, -1))}>Back</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const [activeFieldForSymbols, setActiveFieldForSymbols] = useState<
    'rangeCapacity' | 'resolutionLeastCount' | 'accuracyAcceptanceCriteria' | null
  >(null)

  const symbols = [
    '±', 'μ', '°C', '°F', '%', '≤', '≥', 'Ω', 'λ', 'g', 'kg',
    'm', 'cm', 'mm', 'ml', 'L', 'psi', 'bar', 'Pa', 'kPa', 'MPa', 'V', 'A', 'W'
  ]

  const handleSymbolClick = (symbol: string) => {
    if (!activeFieldForSymbols) return
    const currentVal = form[activeFieldForSymbols]
    onChange({
      ...form,
      [activeFieldForSymbols]: currentVal + symbol
    })
  }

  // Handle auto calculation of Next Calibration Due when Last Calibration Date or Frequency changes
  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastCalibrationDate, form.calibrationFrequency)
    if (nextDue !== form.nextCalibrationDue) {
      onChange({ ...form, nextCalibrationDue: nextDue })
    }
  }, [form.lastCalibrationDate, form.calibrationFrequency])

  // Handle auto calculation of Next Intermediate Check when Last Check Date or Frequency changes
  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastIntermediateCheckDate, form.intermediateCheckFrequency)
    if (nextDue !== form.nextIntermediateCheckDate) {
      onChange({ ...form, nextIntermediateCheckDate: nextDue })
    }
  }, [form.lastIntermediateCheckDate, form.intermediateCheckFrequency])

  // Handle auto calculation of Next Maintenance Date when Last Maintenance Date or Frequency changes
  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastMaintenanceDate, form.maintenanceScheduleFrequency)
    if (nextDue !== form.nextMaintenanceDate) {
      onChange({ ...form, nextMaintenanceDate: nextDue })
    }
  }, [form.lastMaintenanceDate, form.maintenanceScheduleFrequency])

  // Default maintenance frequency to Quarterly when Applicable and empty
  useEffect(() => {
    if (maintApplicable === 'applicable' && !form.maintenanceScheduleFrequency) {
      onChange({ ...form, maintenanceScheduleFrequency: 'Quarterly' })
    }
  }, [maintApplicable, form.maintenanceScheduleFrequency])

  useEffect(() => {
    if (activeSection) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`section-${activeSection}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'scale-[1.02]', 'shadow-md')
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'scale-[1.02]', 'shadow-md')
          }, 2000)
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [activeSection])

  const handleFileChange = (field: 'certificateFile' | 'manualSopFile', file: File | null) => {
    onChange({ ...form, [field]: file })
  }

  if (activeSection) {
    let sectionTitle = 'Calibration'
    let sectionContent = null

    if (activeSection === 'calibration') {
      sectionTitle = 'Calibration Details'
      sectionContent = (
        <div className="border rounded-lg p-4 space-y-4 bg-slate-50/50">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Calibration Status</Label>
              <Select
                value={calApplicable}
                onValueChange={(v) => {
                  setCalApplicable(v as 'applicable' | 'not-applicable')
                  if (v === 'not-applicable') {
                    onChange({
                      ...form,
                      calibrationFrequency: '',
                      lastCalibrationDate: '',
                      nextCalibrationDue: '',
                      calibrationCertificateNumber: '',
                      calibrationCertificateUncertainty: '',
                      calibrationUncertaintyUnit: '',
                      calibrationCoverageFactor: '',
                      externalCalibrationAgency: '',
                      certificateFile: null,
                      uploadCertificatePath: '',
                    })
                  } else {
                    onChange({
                      ...form,
                      calibrationFrequency: form.calibrationFrequency || 'Yearly',
                      calibrationCoverageFactor: form.calibrationCoverageFactor || '2',
                    })
                  }
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="applicable">Applicable</SelectItem>
                  <SelectItem value="not-applicable">Not Applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {calApplicable === 'applicable' ? (
              <div className="space-y-1.5">
                <Label htmlFor="eq-cal-freq" className="text-xs font-semibold">Frequency</Label>
                <Select
                  value={form.calibrationFrequency}
                  onValueChange={(v) => onChange({ ...form, calibrationFrequency: v as Frequency })}
                >
                  <SelectTrigger id="eq-cal-freq">
                    <SelectValue placeholder="Select Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                    <SelectItem value="Half Yearly">Half Yearly</SelectItem>
                    <SelectItem value="Yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {calApplicable === 'applicable' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="eq-last-cal" className="text-xs font-semibold">Last Date</Label>
                  <Input
                    id="eq-last-cal"
                    type="date"
                    value={form.lastCalibrationDate}
                    onChange={(e) => onChange({ ...form, lastCalibrationDate: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="eq-next-cal" className="text-xs font-semibold">Next Due (Auto)</Label>
                  <Input
                    id="eq-next-cal"
                    type="date"
                    value={form.nextCalibrationDue}
                    readOnly
                    className="bg-muted text-muted-foreground font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="eq-cal-cert" className="text-xs font-semibold">Certificate Number</Label>
                  <Input
                    id="eq-cal-cert"
                    placeholder="Cert No"
                    value={form.calibrationCertificateNumber}
                    onChange={(e) => onChange({ ...form, calibrationCertificateNumber: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="eq-cal-uncertainty" className="text-xs font-semibold">
                    UOM of Calibration
                  </Label>
                  <Input
                    id="eq-cal-uncertainty"
                    inputMode="decimal"
                    placeholder="e.g. 0.05"
                    value={form.calibrationCertificateUncertainty}
                    onChange={(e) =>
                      onChange({
                        ...form,
                        calibrationCertificateUncertainty: e.target.value.replace(/[^0-9.]/g, ''),
                      })
                    }
                  />
                </div>

                <MeasurementUnitSelect
                  id="eq-cal-uncertainty-unit"
                  label="Unit"
                  labelClassName="text-xs font-semibold"
                  value={form.calibrationUncertaintyUnit}
                  onChange={(calibrationUncertaintyUnit) => onChange({ ...form, calibrationUncertaintyUnit })}
                  className="space-y-1.5"
                />

                <div className="space-y-1.5">
                  <Label htmlFor="eq-cal-coverage-factor" className="text-xs font-semibold">
                    Coverage Factor
                  </Label>
                  <Input
                    id="eq-cal-coverage-factor"
                    inputMode="decimal"
                    placeholder="2"
                    value={form.calibrationCoverageFactor}
                    onChange={(e) =>
                      onChange({
                        ...form,
                        calibrationCoverageFactor: e.target.value.replace(/[^0-9.]/g, '') || '2',
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">External Calibration Agency</Label>
                  <ClientSearchSelect
                    value={form.externalCalibrationAgency}
                    onValueChange={(v) => onChange({ ...form, externalCalibrationAgency: v })}
                    options={clients}
                    placeholder="Search or select Agency..."
                    onAddNewClientClick={() => onAddNewClientClick('externalCalibrationAgency')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Calibration Certificate (PDF)</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative border rounded-md px-3 py-1 bg-white flex items-center justify-between text-sm min-h-9">
                      <span className="text-muted-foreground truncate max-w-[180px] text-xs">
                        {form.certificateFile
                          ? form.certificateFile.name
                          : form.uploadCertificatePath
                          ? form.uploadCertificatePath.split('/').pop()?.replace(/^\d+_/, '')
                          : 'No file selected'}
                      </span>
                      <div className="flex items-center gap-1">
                        {form.uploadCertificatePath && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-primary hover:bg-slate-100"
                              title="View PDF"
                              onClick={() => onViewFile(form.uploadCertificatePath, 'Certificate')}
                            >
                              <Eye size={12} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-red-50"
                              title="Delete PDF"
                              onClick={() => {
                                const ok = window.confirm('Are you sure you want to delete the uploaded certificate?')
                                if (ok) {
                                  onChange({
                                    ...form,
                                    uploadCertificatePath: '',
                                    certificateFile: null,
                                  })
                                }
                              }}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </>
                        )}
                        <label className="cursor-pointer p-0.5 rounded-md text-slate-500 hover:bg-slate-100">
                          <FileUp size={14} />
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null
                              handleFileChange('certificateFile', file)
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    {form.certificateFile && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:bg-destructive/10"
                        onClick={() => handleFileChange('certificateFile', null)}
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )
    } else if (activeSection === 'intermediate') {
      sectionTitle = 'Intermediate Check Details'
      sectionContent = (
        <div className="border rounded-lg p-4 space-y-4 bg-slate-50/50">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Intermediate Check Status</Label>
              <Select
                value={intermediateApplicable}
                onValueChange={(v) => {
                  setIntermediateApplicable(v as 'applicable' | 'not-applicable')
                  if (v === 'not-applicable') {
                    onChange({
                      ...form,
                      intermediateCheckFrequency: '',
                      lastIntermediateCheckDate: '',
                      nextIntermediateCheckDate: '',
                      intermediateCheckResult: '',
                    })
                  } else {
                    if (form.custodianEmployeeId && !parsedDoneBy) {
                      handleUpdateCheck(
                        parsedReadings,
                        form.custodianEmployeeId,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        !form.intermediateCheckFrequency
                          ? { intermediateCheckFrequency: 'Quarterly' }
                          : undefined,
                      )
                    } else if (!form.intermediateCheckFrequency) {
                      onChange({ ...form, intermediateCheckFrequency: 'Quarterly' })
                    }
                  }
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="applicable">Applicable</SelectItem>
                  <SelectItem value="not-applicable">Not Applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {intermediateApplicable === 'applicable' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="eq-check-freq" className="text-xs font-semibold">Frequency</Label>
                  <Select
                    value={form.intermediateCheckFrequency || 'Quarterly'}
                    onValueChange={(v) => onChange({ ...form, intermediateCheckFrequency: v as Frequency })}
                  >
                    <SelectTrigger id="eq-check-freq">
                      <SelectValue placeholder="Select Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Daily">Daily</SelectItem>
                      <SelectItem value="Weekly">Weekly</SelectItem>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                      <SelectItem value="Quarterly">Quarterly</SelectItem>
                      <SelectItem value="Half Yearly">Half Yearly</SelectItem>
                      <SelectItem value="Yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="eq-check-done-by" className="text-xs font-semibold">Performed By</Label>
                  <Select
                    value={parsedDoneBy || form.custodianEmployeeId || ''}
                    onValueChange={(v) => handleUpdateCheck(parsedReadings, v)}
                  >
                    <SelectTrigger id="eq-check-done-by">
                      <SelectValue placeholder="Select Employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
          </div>

          {intermediateApplicable === 'applicable' &&
            renderIntermediateScheduleRow(
              { last: 'eq-last-check', next: 'eq-next-check' },
              'text-xs font-semibold',
            )}
        </div>
      )
    } else if (activeSection === 'maintenance') {
      sectionTitle = 'Maintenance Details'
      sectionContent = (
        <div className="border rounded-lg p-4 space-y-4 bg-slate-50/50">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Maintenance Status</Label>
              <Select
                value={maintApplicable}
                onValueChange={(v) => {
                  setMaintApplicable(v as 'applicable' | 'not-applicable')
                  if (v === 'not-applicable') {
                    onChange({
                      ...form,
                      maintenanceScheduleFrequency: '',
                      lastMaintenanceDate: '',
                      nextMaintenanceDate: '',
                      maintenanceDoneBy: '',
                    })
                  } else {
                    onChange({
                      ...form,
                      maintenanceScheduleFrequency: form.maintenanceScheduleFrequency || 'Quarterly',
                      maintenanceDoneBy: form.maintenanceDoneBy || form.custodianEmployeeId,
                    })
                  }
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="applicable">Applicable</SelectItem>
                  <SelectItem value="not-applicable">Not Applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {maintApplicable === 'applicable' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="eq-maint-freq" className="text-xs font-semibold">Schedule Frequency</Label>
                  <Select
                    value={form.maintenanceScheduleFrequency || 'Quarterly'}
                    onValueChange={(v) => onChange({ ...form, maintenanceScheduleFrequency: v as Frequency })}
                  >
                    <SelectTrigger id="eq-maint-freq">
                      <SelectValue placeholder="Select Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Daily">Daily</SelectItem>
                      <SelectItem value="Weekly">Weekly</SelectItem>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                      <SelectItem value="Quarterly">Quarterly</SelectItem>
                      <SelectItem value="Half Yearly">Half Yearly</SelectItem>
                      <SelectItem value="Yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="eq-maint-done" className="text-xs font-semibold">Maintenance Done By</Label>
                  <Select
                    value={effectiveMaintenanceDoneBy}
                    onValueChange={(v) => onChange({ ...form, maintenanceDoneBy: v })}
                  >
                    <SelectTrigger id="eq-maint-done">
                      <SelectValue placeholder="Select Employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
          </div>

          {maintApplicable === 'applicable' &&
            renderMaintenanceScheduleRow(
              { last: 'eq-last-maint', next: 'eq-next-maint' },
              'text-xs font-semibold',
            )}
        </div>
      )
    }

    return (
      <Card className="border-0 shadow-none">
        <CardContent className="space-y-4 pt-2">
          <div className="bg-slate-50 border rounded-lg p-3.5 space-y-1">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Equipment Info</div>
            <div className="text-sm font-semibold text-slate-800">{form.equipmentName}</div>
            <div className="text-xs text-slate-500 font-mono">Asset Code: {form.assetCode || 'Auto Numbering…'}</div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-primary mb-2">{sectionTitle}</h3>
            {sectionContent}
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-end gap-2 border-t pt-4 px-6 bg-slate-50/50 rounded-b-lg">
          <Button
            type="button"
            onClick={onSave}
            disabled={!canSave || saveLoading}
            className="min-w-32 bg-primary hover:bg-primary/90 text-white"
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </CardFooter>
        <ConductMaintenanceDialog
          open={conductMaintenanceOpen}
          onOpenChange={setConductMaintenanceOpen}
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          manufacturer={form.manufacturer}
          modelNumber={form.modelNumber}
          rangeCapacity={form.rangeCapacity}
          initialChecklist={form.maintenanceChecklist}
          maintenanceHistory={form.maintenanceHistory}
          lastMaintenanceDate={form.lastMaintenanceDate}
          nextMaintenanceDate={form.nextMaintenanceDate}
          maintenanceDoneBy={effectiveMaintenanceDoneBy}
          maintenanceDoneByName={maintenanceDoneByName}
          maintenanceScheduleFrequency={form.maintenanceScheduleFrequency}
          onSaveChecklist={(items) => onChange({ ...form, maintenanceChecklist: items })}
          onCompleteMaintenance={(payload) =>
            onChange({
              ...form,
              maintenanceChecklist: payload.checklist,
              maintenanceHistory: payload.maintenanceHistory,
              lastMaintenanceDate: payload.lastMaintenanceDate,
              nextMaintenanceDate: payload.nextMaintenanceDate,
            })
          }
        />
        <ConductIntermediateCheckDialog
          open={conductIntermediateCheckOpen}
          onOpenChange={(open) => {
            setConductIntermediateCheckOpen(open)
            if (!open) setIntermediateCompleteMessage(null)
          }}
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          onComplete={handleCompleteIntermediateCheck}
        >
          {renderIntermediateCheckCalculator()}
        </ConductIntermediateCheckDialog>
        {renderMaintenanceHistoryDialog()}
        {renderIntermediateCheckHistoryDialog()}
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardContent className="space-y-6 p-5 bg-slate-50/50 border border-slate-100 rounded-xl">
        {/* Section 1: Basic Information */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow duration-300 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <Wrench className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Basic Information</h3>
          </div>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-id" className="text-xs font-semibold text-slate-600">Equipment ID / Asset Code</Label>
              <Input
                id="eq-id"
                value={form.assetCode || 'Auto Numbering…'}
                readOnly
                className="bg-slate-50 border-slate-200 text-muted-foreground font-mono font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-name" className="text-xs font-semibold text-slate-600">Equipment Name *</Label>
              <Input
                id="eq-name"
                placeholder="Enter equipment name"
                value={form.equipmentName}
                onChange={(e) => onChange({ ...form, equipmentName: e.target.value })}
                className="border-slate-200 focus-visible:ring-primary/20 focus-visible:border-primary transition-colors"
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-status" className="text-xs font-semibold text-slate-600">Equipment Status</Label>
              <Select
                value={form.equipmentStatus}
                onValueChange={(v) => onChange({ ...form, equipmentStatus: v as EquipmentStatus })}
              >
                <SelectTrigger id="eq-status" className="border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="In Repair">In Repair</SelectItem>
                  <SelectItem value="Idle">Idle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-make" className="text-xs font-semibold text-slate-600">Manufacturer / Make</Label>
              <Input
                id="eq-make"
                placeholder="Make"
                value={form.manufacturer}
                onChange={(e) => onChange({ ...form, manufacturer: e.target.value })}
                className="border-slate-200"
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-model" className="text-xs font-semibold text-slate-600">Model Number</Label>
              <Input
                id="eq-model"
                placeholder="Model"
                value={form.modelNumber}
                onChange={(e) => onChange({ ...form, modelNumber: e.target.value })}
                className="border-slate-200"
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-serial" className="text-xs font-semibold text-slate-600">Serial Number</Label>
              <Input
                id="eq-serial"
                placeholder="Serial No"
                value={form.serialNumber}
                onChange={(e) => onChange({ ...form, serialNumber: e.target.value })}
                className="border-slate-200"
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-custodian" className="text-xs font-semibold text-slate-600">Custodian / In-charge</Label>
              <Select
                value={form.custodianEmployeeId}
                onValueChange={(v) => {
                  const next: EquipmentForm = {
                    ...form,
                    custodianEmployeeId: v,
                  }
                  if (maintApplicable === 'applicable' && !form.maintenanceDoneBy && v) {
                    next.maintenanceDoneBy = v
                  }
                  onChange(next)
                  if (intermediateApplicable === 'applicable' && !parsedDoneBy && v) {
                    handleUpdateCheck(parsedReadings, v)
                  }
                }}
              >
                <SelectTrigger id="eq-custodian" className="border-slate-200 bg-white">
                  <SelectValue placeholder="Select Custodian" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Section 2: Procurement & Location */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow duration-300 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <MapPin className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Procurement & Location</h3>
          </div>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-purchase-date" className="text-xs font-semibold text-slate-600">Date of Purchased</Label>
              <Input
                id="eq-purchase-date"
                type="date"
                value={form.dateOfPurchase}
                onChange={(e) => onChange({ ...form, dateOfPurchase: e.target.value })}
                className="border-slate-200"
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-service-date" className="text-xs font-semibold text-slate-600">Date Placed in Service</Label>
              <Input
                id="eq-service-date"
                type="date"
                value={form.datePlacedInService}
                onChange={(e) => onChange({ ...form, datePlacedInService: e.target.value })}
                className="border-slate-200"
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Purchase From</Label>
              <ClientSearchSelect
                value={form.purchasedFrom}
                onValueChange={(v) => onChange({ ...form, purchasedFrom: v })}
                options={clients}
                placeholder="Search or select Supplier..."
                onAddNewClientClick={() => onAddNewClientClick('purchasedFrom')}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-location" className="text-xs font-semibold text-slate-600">Current Location</Label>
              <Select
                value={form.currentLocation}
                onValueChange={(v) => onChange({ ...form, currentLocation: v })}
              >
                <SelectTrigger id="eq-location" className="border-slate-200 bg-white">
                  <SelectValue placeholder="Select Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Section 3: Technical Specifications & Symbols */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow duration-300 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <Cpu className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Technical Specifications</h3>
          </div>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-range" className="text-xs font-semibold text-slate-600">Range / Capacity</Label>
              <Input
                id="eq-range"
                placeholder="e.g. 0 to 500 mm"
                value={form.rangeCapacity}
                onFocus={() => setActiveFieldForSymbols('rangeCapacity')}
                onChange={(e) => onChange({ ...form, rangeCapacity: e.target.value })}
                className="border-slate-200 focus-visible:ring-primary/20 focus-visible:border-primary"
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-resolution" className="text-xs font-semibold text-slate-600">Resolution / Least Count</Label>
              <Input
                id="eq-resolution"
                placeholder="e.g. 0.01 mm"
                value={form.resolutionLeastCount}
                onFocus={() => setActiveFieldForSymbols('resolutionLeastCount')}
                onChange={(e) => onChange({ ...form, resolutionLeastCount: e.target.value })}
                className="border-slate-200 focus-visible:ring-primary/20 focus-visible:border-primary"
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-accuracy" className="text-xs font-semibold text-slate-600">Acceptance Criteria</Label>
              <Input
                id="eq-accuracy"
                placeholder="e.g. ±0.02 mm"
                value={form.accuracyAcceptanceCriteria}
                onFocus={() => setActiveFieldForSymbols('accuracyAcceptanceCriteria')}
                onChange={(e) => onChange({ ...form, accuracyAcceptanceCriteria: e.target.value })}
                className="border-slate-200 focus-visible:ring-primary/20 focus-visible:border-primary"
              />
            </div>

            {/* Premium Symbol Inserter */}
            {activeFieldForSymbols && (
              <div className="col-span-12 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5 animate-in fade-in-50 slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Quick Insert Symbol into{' '}
                    <span className="text-primary font-extrabold normal-case">
                      {activeFieldForSymbols === 'rangeCapacity'
                        ? 'Range / Capacity'
                        : activeFieldForSymbols === 'resolutionLeastCount'
                        ? 'Resolution / Least Count'
                        : 'Acceptance Criteria'}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                    onClick={() => setActiveFieldForSymbols(null)}
                  >
                    <X size={14} />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {symbols.map((sym) => (
                    <Button
                      key={sym}
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs font-semibold bg-white hover:bg-primary hover:text-primary-foreground border-slate-200 hover:border-primary transition-all duration-200"
                      onClick={() => handleSymbolClick(sym)}
                    >
                      {sym}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Calibration, Checks & Maintenance */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow duration-300 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Calibration, Intermediate Checks & Maintenance</h3>
          </div>
          <div className="grid grid-cols-12 gap-4">
            {/* Calibration details */}
            <div id="section-calibration" className="col-span-12 md:col-span-4 border rounded-lg p-3 space-y-3 bg-slate-50/50 transition-all duration-300">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Calibration</h4>
                {calApplicable === 'applicable' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => setCalDetailsOpen((open) => !open)}
                  >
                    {calDetailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {calDetailsOpen ? 'Hide Details' : 'Show Details'}
                  </Button>
                ) : null}
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Calibration Status</Label>
                <Select
                  value={calApplicable}
                  onValueChange={(v) => {
                    setCalApplicable(v as 'applicable' | 'not-applicable')
                    if (v === 'not-applicable') {
                      setCalDetailsOpen(false)
                      onChange({
                        ...form,
                        calibrationFrequency: '',
                        lastCalibrationDate: '',
                        nextCalibrationDue: '',
                        calibrationCertificateNumber: '',
                        calibrationCertificateUncertainty: '',
                        calibrationUncertaintyUnit: '',
                        calibrationCoverageFactor: '',
                        externalCalibrationAgency: '',
                        certificateFile: null,
                        uploadCertificatePath: '',
                      })
                    } else {
                      setCalDetailsOpen(false)
                      onChange({
                        ...form,
                        calibrationFrequency: form.calibrationFrequency || 'Yearly',
                        calibrationCoverageFactor: form.calibrationCoverageFactor || '2',
                      })
                    }
                  }}
                >
                  <SelectTrigger className="bg-white border-slate-200">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="applicable">Applicable</SelectItem>
                    <SelectItem value="not-applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {calApplicable === 'not-applicable' && (
                <div className="flex items-start gap-2 bg-slate-100/60 border border-slate-200/50 rounded-xl p-3 animate-in fade-in-50 duration-200">
                  <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-slate-600 leading-relaxed">
                    Calibration is <strong>not applicable</strong> for this equipment. Scheduling and certificate tracking are disabled.
                  </span>
                </div>
              )}

              {calApplicable === 'applicable' && calDetailsOpen && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="eq-cal-freq-grid" className="text-xs">Frequency</Label>
                    <Select
                      value={form.calibrationFrequency}
                      onValueChange={(v) => onChange({ ...form, calibrationFrequency: v as Frequency })}
                    >
                      <SelectTrigger id="eq-cal-freq-grid">
                        <SelectValue placeholder="Select Frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Daily">Daily</SelectItem>
                        <SelectItem value="Weekly">Weekly</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                        <SelectItem value="Quarterly">Quarterly</SelectItem>
                        <SelectItem value="Half Yearly">Half Yearly</SelectItem>
                        <SelectItem value="Yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="eq-last-cal-grid" className="text-xs">Last Date</Label>
                      <Input
                        id="eq-last-cal-grid"
                        type="date"
                        value={form.lastCalibrationDate}
                        onChange={(e) => onChange({ ...form, lastCalibrationDate: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="eq-next-cal-grid" className="text-xs">Next Due (Auto)</Label>
                      <Input
                        id="eq-next-cal-grid"
                        type="date"
                        value={form.nextCalibrationDue}
                        readOnly
                        className="bg-muted text-muted-foreground font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="eq-cal-cert-grid" className="text-xs">Certificate Number</Label>
                      <Input
                        id="eq-cal-cert-grid"
                        placeholder="Cert No"
                        value={form.calibrationCertificateNumber}
                        onChange={(e) => onChange({ ...form, calibrationCertificateNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 items-end gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="eq-cal-uncertainty-grid" className="text-xs">
                        UOM of Calibration
                      </Label>
                      <Input
                        id="eq-cal-uncertainty-grid"
                        inputMode="decimal"
                        placeholder="e.g. 0.05"
                        value={form.calibrationCertificateUncertainty}
                        onChange={(e) =>
                          onChange({
                            ...form,
                            calibrationCertificateUncertainty: e.target.value.replace(/[^0-9.]/g, ''),
                          })
                        }
                      />
                    </div>

                    <MeasurementUnitSelect
                      id="eq-cal-uncertainty-unit-grid"
                      label="Unit"
                      labelClassName="text-xs"
                      value={form.calibrationUncertaintyUnit}
                      onChange={(calibrationUncertaintyUnit) => onChange({ ...form, calibrationUncertaintyUnit })}
                      className="space-y-1.5"
                    />

                    <div className="space-y-1.5">
                      <Label htmlFor="eq-cal-coverage-factor-grid" className="text-xs">
                        Coverage Factor
                      </Label>
                      <Input
                        id="eq-cal-coverage-factor-grid"
                        inputMode="decimal"
                        placeholder="2"
                        value={form.calibrationCoverageFactor}
                        onChange={(e) =>
                          onChange({
                            ...form,
                            calibrationCoverageFactor: e.target.value.replace(/[^0-9.]/g, '') || '2',
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">External Calibration Agency</Label>
                      <ClientSearchSelect
                        value={form.externalCalibrationAgency}
                        onValueChange={(v) => onChange({ ...form, externalCalibrationAgency: v })}
                        options={clients}
                        placeholder="Search or select Agency..."
                        onAddNewClientClick={() => onAddNewClientClick('externalCalibrationAgency')}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Calibration Certificate (PDF)</Label>
                      <div className="flex gap-2">
                        <div className="flex-1 relative border rounded-md px-3 py-1 bg-white flex items-center justify-between text-sm min-h-9">
                          <span className="text-muted-foreground truncate max-w-[150px] text-xs">
                            {form.certificateFile
                              ? form.certificateFile.name
                              : form.uploadCertificatePath
                              ? form.uploadCertificatePath.split('/').pop()?.replace(/^\d+_/, '')
                              : 'No file selected'}
                          </span>
                          <div className="flex items-center gap-1">
                            {form.uploadCertificatePath && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-primary hover:bg-slate-100"
                                  title="View PDF"
                                  onClick={() => onViewFile(form.uploadCertificatePath, 'Certificate')}
                                >
                                  <Eye size={12} />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:bg-red-50"
                                  title="Delete PDF"
                                  onClick={() => {
                                    const ok = window.confirm('Are you sure you want to delete the uploaded certificate?')
                                    if (ok) {
                                      onChange({
                                        ...form,
                                        uploadCertificatePath: '',
                                        certificateFile: null,
                                      })
                                    }
                                  }}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </>
                            )}
                            <label className="cursor-pointer p-0.5 rounded-md text-slate-500 hover:bg-slate-100">
                              <FileUp size={14} />
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null
                                  handleFileChange('certificateFile', file)
                                }}
                              />
                            </label>
                          </div>
                        </div>
                        {form.certificateFile && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:bg-destructive/10"
                            onClick={() => handleFileChange('certificateFile', null)}
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Intermediate Check details */}
            <div id="section-intermediate" className="col-span-12 md:col-span-4 border rounded-lg p-3 space-y-3 bg-slate-50/50 transition-all duration-300">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Intermediate Check</h4>
                {intermediateApplicable === 'applicable' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => setIntermediateDetailsOpen((open) => !open)}
                  >
                    {intermediateDetailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {intermediateDetailsOpen ? 'Hide Details' : 'Show Details'}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Intermediate Check Status</Label>
                <Select
                  value={intermediateApplicable}
                  onValueChange={(v) => {
                    setIntermediateApplicable(v as 'applicable' | 'not-applicable')
                    if (v === 'not-applicable') {
                      setIntermediateDetailsOpen(false)
                      onChange({
                        ...form,
                        intermediateCheckFrequency: '',
                        lastIntermediateCheckDate: '',
                        nextIntermediateCheckDate: '',
                        intermediateCheckResult: '',
                      })
                    } else {
                      setIntermediateDetailsOpen(false)
                      if (form.custodianEmployeeId && !parsedDoneBy) {
                        handleUpdateCheck(
                          parsedReadings,
                          form.custodianEmployeeId,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          !form.intermediateCheckFrequency
                            ? { intermediateCheckFrequency: 'Quarterly' }
                            : undefined,
                        )
                      } else if (!form.intermediateCheckFrequency) {
                        onChange({ ...form, intermediateCheckFrequency: 'Quarterly' })
                      }
                    }
                  }}
                >
                  <SelectTrigger className="bg-white border-slate-200">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="applicable">Applicable</SelectItem>
                    <SelectItem value="not-applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {intermediateApplicable === 'not-applicable' && (
                <div className="flex items-start gap-2 bg-slate-100/60 border border-slate-200/50 rounded-xl p-3 animate-in fade-in-50 duration-200">
                  <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-slate-600 leading-relaxed">
                    Intermediate checks are <strong>not applicable</strong>. Drift calculation and verification logs are disabled.
                  </span>
                </div>
              )}

              {intermediateApplicable === 'applicable' && intermediateDetailsOpen && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="eq-check-freq-grid" className="text-xs">Frequency</Label>
                      <Select
                        value={form.intermediateCheckFrequency || 'Quarterly'}
                        onValueChange={(v) => onChange({ ...form, intermediateCheckFrequency: v as Frequency })}
                      >
                        <SelectTrigger id="eq-check-freq-grid">
                          <SelectValue placeholder="Select Frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Daily">Daily</SelectItem>
                          <SelectItem value="Weekly">Weekly</SelectItem>
                          <SelectItem value="Monthly">Monthly</SelectItem>
                          <SelectItem value="Quarterly">Quarterly</SelectItem>
                          <SelectItem value="Half Yearly">Half Yearly</SelectItem>
                          <SelectItem value="Yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="eq-check-done-by-main" className="text-xs">Performed By</Label>
                      <Select
                        value={parsedDoneBy || form.custodianEmployeeId || ''}
                        onValueChange={(v) => handleUpdateCheck(parsedReadings, v)}
                      >
                        <SelectTrigger id="eq-check-done-by-main">
                          <SelectValue placeholder="Select Employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {renderIntermediateScheduleRow(
                    { last: 'eq-last-check-grid', next: 'eq-next-check-grid' },
                    'text-xs',
                    'Next Due (Auto)',
                  )}
                </>
              )}
            </div>

            {/* Maintenance details */}
            <div id="section-maintenance" className="col-span-12 md:col-span-4 border rounded-lg p-3 space-y-3 bg-slate-50/50 transition-all duration-300">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Maintenance</h4>
                {maintApplicable === 'applicable' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => setMaintDetailsOpen((open) => !open)}
                  >
                    {maintDetailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {maintDetailsOpen ? 'Hide Details' : 'Show Details'}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Maintenance Status</Label>
                <Select
                  value={maintApplicable}
                  onValueChange={(v) => {
                    setMaintApplicable(v as 'applicable' | 'not-applicable')
                    if (v === 'not-applicable') {
                      setMaintDetailsOpen(false)
                      onChange({
                        ...form,
                        maintenanceScheduleFrequency: '',
                        lastMaintenanceDate: '',
                        nextMaintenanceDate: '',
                        maintenanceDoneBy: '',
                      })
                    } else {
                      setMaintDetailsOpen(false)
                      onChange({
                        ...form,
                        maintenanceScheduleFrequency: form.maintenanceScheduleFrequency || 'Quarterly',
                        maintenanceDoneBy: form.maintenanceDoneBy || form.custodianEmployeeId,
                      })
                    }
                  }}
                >
                  <SelectTrigger className="bg-white border-slate-200">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="applicable">Applicable</SelectItem>
                    <SelectItem value="not-applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {maintApplicable === 'not-applicable' && (
                <div className="flex items-start gap-2 bg-slate-100/60 border border-slate-200/50 rounded-xl p-3 animate-in fade-in-50 duration-200">
                  <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-slate-600 leading-relaxed">
                    Preventive maintenance is <strong>not applicable</strong>. Schedule alerts and logs are disabled.
                  </span>
                </div>
              )}

              {maintApplicable === 'applicable' && maintDetailsOpen && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="eq-maint-freq-grid" className="text-xs">Schedule Frequency</Label>
                      <Select
                        value={form.maintenanceScheduleFrequency || 'Quarterly'}
                        onValueChange={(v) => onChange({ ...form, maintenanceScheduleFrequency: v as Frequency })}
                      >
                        <SelectTrigger id="eq-maint-freq-grid">
                          <SelectValue placeholder="Select Frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Daily">Daily</SelectItem>
                          <SelectItem value="Weekly">Weekly</SelectItem>
                          <SelectItem value="Monthly">Monthly</SelectItem>
                          <SelectItem value="Quarterly">Quarterly</SelectItem>
                          <SelectItem value="Half Yearly">Half Yearly</SelectItem>
                          <SelectItem value="Yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="eq-maint-done-grid" className="text-xs">Maintenance Done By</Label>
                      <Select
                        value={effectiveMaintenanceDoneBy}
                        onValueChange={(v) => onChange({ ...form, maintenanceDoneBy: v })}
                      >
                        <SelectTrigger id="eq-maint-done-grid">
                          <SelectValue placeholder="Select Employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {renderMaintenanceScheduleRow(
                    { last: 'eq-last-maint-grid', next: 'eq-next-maint-grid' },
                    'text-xs',
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Section 5: Files & Documentation */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow duration-300 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <History className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Files & History</h3>
          </div>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6 space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Upload Manual / SOP</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50/50 flex items-center justify-between text-sm min-h-10 hover:bg-slate-50 transition-colors">
                  <span className="text-slate-600 truncate max-w-[200px] text-xs font-medium">
                    {form.manualSopFile
                      ? form.manualSopFile.name
                      : form.uploadManualSopPath
                      ? form.uploadManualSopPath.split('/').pop()?.replace(/^\d+_/, '')
                      : 'No file selected'}
                  </span>
                  <div className="flex items-center gap-1">
                    {form.uploadManualSopPath && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-primary hover:bg-white hover:shadow-sm"
                          title="View PDF"
                          onClick={() => onViewFile(form.uploadManualSopPath, 'Manual_SOP')}
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-red-50"
                          title="Delete PDF"
                          onClick={() => {
                            const ok = window.confirm('Are you sure you want to delete the uploaded Manual/SOP?')
                            if (ok) {
                              onChange({
                                ...form,
                                uploadManualSopPath: '',
                                manualSopFile: null,
                              })
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                    <label className="cursor-pointer p-1.5 rounded-md text-slate-500 hover:bg-white hover:shadow-sm transition-all duration-200">
                      <FileUp size={16} />
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          handleFileChange('manualSopFile', file)
                        }}
                      />
                    </label>
                  </div>
                </div>
                {form.manualSopFile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 text-destructive hover:bg-destructive/10 border-slate-200"
                    onClick={() => handleFileChange('manualSopFile', null)}
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>
            </div>

            <div className="col-span-12 md:col-span-6 space-y-1.5">
              <Label htmlFor="eq-damage" className="text-xs font-semibold text-slate-600">History of Damage/Malfunction</Label>
              <Textarea
                id="eq-damage"
                placeholder="Describe any history of damages or malfunctions…"
                value={form.historyOfDamage}
                onChange={(e) => onChange({ ...form, historyOfDamage: e.target.value })}
                className="h-20 border-slate-200 focus-visible:ring-primary/20 focus-visible:border-primary"
              />
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-2 border-t pt-4 px-6 bg-slate-50/50 rounded-b-lg">
        <Button
          type="button"
          onClick={onSave}
          disabled={!canSave || saveLoading}
          className="min-w-32 bg-primary hover:bg-primary/90 text-white"
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </CardFooter>
      <ConductMaintenanceDialog
        open={conductMaintenanceOpen}
        onOpenChange={setConductMaintenanceOpen}
        equipmentName={form.equipmentName}
        assetCode={form.assetCode}
        manufacturer={form.manufacturer}
        modelNumber={form.modelNumber}
        rangeCapacity={form.rangeCapacity}
        initialChecklist={form.maintenanceChecklist}
        maintenanceHistory={form.maintenanceHistory}
        lastMaintenanceDate={form.lastMaintenanceDate}
        nextMaintenanceDate={form.nextMaintenanceDate}
        maintenanceDoneBy={effectiveMaintenanceDoneBy}
        maintenanceDoneByName={maintenanceDoneByName}
        maintenanceScheduleFrequency={form.maintenanceScheduleFrequency}
        onSaveChecklist={(items) => onChange({ ...form, maintenanceChecklist: items })}
        onCompleteMaintenance={(payload) =>
          onChange({
            ...form,
            maintenanceChecklist: payload.checklist,
            maintenanceHistory: payload.maintenanceHistory,
            lastMaintenanceDate: payload.lastMaintenanceDate,
            nextMaintenanceDate: payload.nextMaintenanceDate,
          })
        }
      />
      <ConductIntermediateCheckDialog
        open={conductIntermediateCheckOpen}
        onOpenChange={(open) => {
          setConductIntermediateCheckOpen(open)
          if (!open) setIntermediateCompleteMessage(null)
        }}
        equipmentName={form.equipmentName}
        assetCode={form.assetCode}
        onComplete={handleCompleteIntermediateCheck}
      >
        {renderIntermediateCheckCalculator()}
      </ConductIntermediateCheckDialog>
      {renderMaintenanceHistoryDialog()}
      {renderIntermediateCheckHistoryDialog()}
    </Card>
  )
}
