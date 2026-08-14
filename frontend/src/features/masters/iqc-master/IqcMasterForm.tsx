import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileUp, Eye, Trash2, Plus, CheckCircle, AlertTriangle, ClipboardCheck, ListChecks, Wrench, History } from 'lucide-react'
import {
  calculateNextDueDate,
  type IqcForm,
  type EquipmentStatus,
  type Frequency,
} from './types'
import { ClientSearchSelect } from '../equipment-master/ClientSearchSelect'
import { ConductMaintenanceDialog } from '../equipment-master/ConductMaintenanceDialog'
import { MaintenanceHistoryDialog } from '../equipment-master/MaintenanceHistoryDialog'
import { joinValueAndUnit } from '../equipment-master/types'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { MasterCalibrationPointsEditor } from '@/features/calibration/equipment-for-calibration/MasterCalibrationPointsEditor'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldWithAddShellClass,
  limsOutlineBtnClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'

const sectionTitleClass =
  'mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800'

function parseAcceptanceLimit(criteria: string | null | undefined): number | null {
  if (!criteria) return null
  const match = criteria.match(/[\d\.]+/)
  if (match) {
    const num = parseFloat(match[0])
    return isNaN(num) ? null : num
  }
  return null
}

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

export function IqcMasterForm({
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
  hideScheduleSections = false,
  readOnly = false,
  onClose,
  onAddNewClientClick,
  iqcMasters = [],
}: {
  form: IqcForm
  onChange: (next: IqcForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  clients: Array<{ id: string; company_name: string }>
  employees: Array<{
    id: string
    full_name: string
    department_name?: string | null
    designation?: string | null
  }>
  locations: string[]
  onViewFile: (storagePath: string, fileName: string) => void
  activeSection?: 'calibration' | 'intermediate' | 'maintenance' | null
  hideScheduleSections?: boolean
  readOnly?: boolean
  onClose?: () => void
  onAddNewClientClick: (field: 'purchasedFrom' | 'externalCalibrationAgency') => void
  iqcMasters?: IqcForm[]
}) {
  const [showCalcSteps, setShowCalcSteps] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [calcInput, setCalcInput] = useState('')
  const [calcResult, setCalcResult] = useState('')
  const [calApplicable, setCalApplicable] = useState<'applicable' | 'not-applicable'>('applicable')
  const [intermediateApplicable, setIntermediateApplicable] = useState<'applicable' | 'not-applicable'>(
    'not-applicable',
  )
  const [maintApplicable, setMaintApplicable] = useState<'applicable' | 'not-applicable'>('applicable')

  const [calDetailsOpen, setCalDetailsOpen] = useState(false)
  const [intermediateDetailsOpen, setIntermediateDetailsOpen] = useState(false)
  const [maintenanceDetailsOpen, setMaintenanceDetailsOpen] = useState(false)
  const [conductMaintenanceOpen, setConductMaintenanceOpen] = useState(false)
  const [maintenanceHistoryViewOpen, setMaintenanceHistoryViewOpen] = useState(false)
  const [custodianOpen, setCustodianOpen] = useState(false)
  const [custodianQuery, setCustodianQuery] = useState('')
  const [maintDoneByOpen, setMaintDoneByOpen] = useState(false)
  const [maintDoneByQuery, setMaintDoneByQuery] = useState('')
  const [locationOpen, setLocationOpen] = useState(false)
  const [locationQuery, setLocationQuery] = useState('')

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
            parsedReadings: parsed.readings as Array<{ std: string; obs: string }>,
            parsedDoneBy: parsed.doneBy !== undefined ? String(parsed.doneBy) : '',
            parsedMasters: Array.isArray(parsed.masters) ? (parsed.masters as string[]) : [],
            parsedUnit: parsed.unit !== undefined ? String(parsed.unit) : '',
            parsedConversionMultiplier: parsed.conversionMultiplier !== undefined ? String(parsed.conversionMultiplier) : '1',
            parsedTemperature: parsed.temperature !== undefined ? String(parsed.temperature) : '',
            parsedHumidity: parsed.humidity !== undefined ? String(parsed.humidity) : '',
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
      parsedReadings: [{ std: '', obs: '' }],
      parsedDoneBy: '',
      parsedMasters: [],
      parsedUnit: '',
      parsedConversionMultiplier: '1',
      parsedTemperature: '',
      parsedHumidity: '',
      parsedIsEnRatioEnabled: false,
      parsedLabUncertainty: '',
      parsedMasterUncertainty: '',
      isLegacy: !!form.intermediateCheckResult?.trim() && !form.intermediateCheckResult.includes('[DATA:'),
    }
  })()


  const employeeOptions = useMemo<FilterComboboxOption[]>(
    () =>
      employees
        .map((emp) => {
          const label = String(emp.full_name ?? '').trim()
          const secondaryLabel = [emp.department_name, emp.designation]
            .map((part) => String(part ?? '').trim())
            .filter(Boolean)
            .join(' | ')
          return {
            id: emp.id,
            label,
            ...(secondaryLabel ? { secondaryLabel } : {}),
          }
        })
        .filter((opt) => opt.label.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [employees],
  )

  const selectedCustodianLabel =
    employees.find((emp) => emp.id === form.custodianEmployeeId)?.full_name ?? ''

  const effectiveMaintenanceDoneBy = form.maintenanceDoneBy || form.custodianEmployeeId || ''
  const selectedMaintDoneByLabel =
    employees.find((emp) => emp.id === effectiveMaintenanceDoneBy)?.full_name ?? ''
  const maintenanceDoneByName = selectedMaintDoneByLabel

  const filteredCustodianOptions = useMemo(() => {
    const q = custodianQuery.trim().toLowerCase()
    if (!q || !custodianOpen) return employeeOptions
    return employeeOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.secondaryLabel ?? '').toLowerCase().includes(q),
    )
  }, [custodianQuery, custodianOpen, employeeOptions])

  const filteredMaintDoneByOptions = useMemo(() => {
    const q = maintDoneByQuery.trim().toLowerCase()
    if (!q || !maintDoneByOpen) return employeeOptions
    return employeeOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.secondaryLabel ?? '').toLowerCase().includes(q),
    )
  }, [maintDoneByQuery, maintDoneByOpen, employeeOptions])

  const hasMaintenanceChecklistHistory = useMemo(
    () =>
      form.maintenanceHistory.length > 0 ||
      (form.maintenanceChecklist.length > 0 && !!form.lastMaintenanceDate?.trim()),
    [form.maintenanceHistory.length, form.maintenanceChecklist.length, form.lastMaintenanceDate],
  )

  const applyCustodianSelection = (employeeId: string) => {
    onChange({ ...form, custodianEmployeeId: employeeId })
  }

  const locationOptions = useMemo<FilterComboboxOption[]>(
    () =>
      locations
        .map((loc) => String(loc ?? '').trim())
        .filter(Boolean)
        .map((loc) => ({ id: loc, label: loc }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [locations],
  )

  const filteredLocationOptions = useMemo(() => {
    const q = locationQuery.trim().toLowerCase()
    if (!q || !locationOpen) return locationOptions
    return locationOptions.filter((opt) => opt.label.toLowerCase().includes(q))
  }, [locationQuery, locationOpen, locationOptions])


  const defaultLimit = parseAcceptanceLimit(form.accuracyAcceptanceCriteria)

  const handleUpdateCheck = (
    newReadings: Array<{ std: string; obs: string }>,
    doneByVal?: string,
    mastersVal?: string[],
    unitVal?: string,
    multiplierVal?: string,
    tempVal?: string,
    humidityVal?: string,
    isEnEnabled?: boolean,
    labUncVal?: string,
    masterUncVal?: string
  ) => {
    const multiplier = parseFloat(multiplierVal !== undefined ? multiplierVal : parsedConversionMultiplier) || 1
    const finalDoneBy = doneByVal !== undefined ? doneByVal : parsedDoneBy
    const finalMasters = mastersVal !== undefined ? mastersVal : parsedMasters
    const finalUnit = unitVal !== undefined ? unitVal : parsedUnit
    const finalMultiplier = multiplierVal !== undefined ? multiplierVal : parsedConversionMultiplier
    const finalTemp = tempVal !== undefined ? tempVal : parsedTemperature
    const finalHumidity = humidityVal !== undefined ? humidityVal : parsedHumidity
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
      intermediateCheckResult: `${summaryLine}\n${dataStr}`,
    })
  }

  const renderIntermediateCheckCalculator = () => {
    return (
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-slate-700">Intermediate Check Perform</Label>
        
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

          <div className="grid grid-cols-12 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-150">
            <div className="col-span-12 md:col-span-6 space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Master Standard(s) Used</Label>
              <div className="border border-slate-200 rounded-md p-1.5 bg-white max-h-[110px] overflow-y-auto space-y-1 shadow-inner">
                {iqcMasters && iqcMasters.length > 0 ? (
                  iqcMasters
                    .filter((e) => e.assetCode !== form.assetCode)
                    .map((e) => {
                      // Note: We use e.assetCode as the key for typed values, or standard checks
                      const isChecked = parsedMasters.includes(e.assetCode)
                      return (
                        <label key={e.assetCode} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer hover:bg-slate-50 p-0.5 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const nextMasters = isChecked
                                ? parsedMasters.filter((id) => id !== e.assetCode)
                                : [...parsedMasters, e.assetCode]
                              handleUpdateCheck(parsedReadings, undefined, nextMasters)
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5"
                          />
                          <span className="truncate">{e.equipmentName} ({e.assetCode})</span>
                        </label>
                      )
                    })
                ) : (
                  <div className="text-[10px] text-muted-foreground p-1 text-center">No other IQC standards found</div>
                )}
              </div>
              <Input
                type="text"
                placeholder="Or type custom master standard(s)..."
                value={parsedMasters.filter(code => !iqcMasters?.some(e => e.assetCode === code)).join(', ')}
                onChange={(e) => {
                  const typed = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  const eqCodes = parsedMasters.filter(code => iqcMasters?.some(e => e.assetCode === code))
                  handleUpdateCheck(parsedReadings, undefined, [...eqCodes, ...typed])
                }}
                className="h-7 text-xs px-2"
              />
            </div>

            <div className="col-span-12 md:col-span-6 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="eq-calc-unit" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reading Unit</Label>
                  <MeasurementUnitSelect
                    id="eq-calc-unit"
                    value={parsedUnit}
                    onChange={(unit) => handleUpdateCheck(parsedReadings, undefined, undefined, unit)}
                    showLabel={false}
                    inputClassName="h-7 text-xs py-0.5 px-2 bg-white"
                    className="space-y-0"
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="eq-calc-mult" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Multiplier to Criteria</Label>
                  <Input
                    id="eq-calc-mult"
                    type="text"
                    placeholder="e.g. 0.001"
                    value={parsedConversionMultiplier}
                    onChange={(e) => handleUpdateCheck(parsedReadings, undefined, undefined, undefined, e.target.value)}
                    className="h-7 text-xs py-0.5 px-2 bg-white"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'None (1)', val: '1' },
                  { label: 'N → kN (0.001)', val: '0.001' },
                  { label: 'kN → N (1000)', val: '1000' }
                ].map(p => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => handleUpdateCheck(parsedReadings, undefined, undefined, undefined, p.val)}
                    className={`text-[8px] px-1 py-0.5 rounded border transition-colors ${parsedConversionMultiplier === p.val ? 'bg-primary text-white border-primary font-semibold' : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <Label htmlFor="eq-calc-temp" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Temp (°C)</Label>
                  <Input
                    id="eq-calc-temp"
                    type="text"
                    placeholder="e.g. 23.5"
                    value={parsedTemperature}
                    onChange={(e) => handleUpdateCheck(parsedReadings, undefined, undefined, undefined, undefined, e.target.value)}
                    className="h-7 text-xs py-0.5 px-2 bg-white"
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="eq-calc-humidity" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Humidity (% RH)</Label>
                  <Input
                    id="eq-calc-humidity"
                    type="text"
                    placeholder="e.g. 50"
                    value={parsedHumidity}
                    onChange={(e) => handleUpdateCheck(parsedReadings, undefined, undefined, undefined, undefined, undefined, e.target.value)}
                    className="h-7 text-xs py-0.5 px-2 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50/50 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={parsedIsEnRatioEnabled}
                onChange={(e) => handleUpdateCheck(parsedReadings, undefined, undefined, undefined, undefined, undefined, undefined, e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
              />
              Enable Drift Evaluation (E_n Ratio)
            </label>

            {parsedIsEnRatioEnabled && (
              <div className="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t border-slate-200/50">
                <div className="space-y-1">
                  <Label htmlFor="eq-calc-lab-unc" className="text-[10px] font-semibold text-slate-600">Lab Uncertainty (U_lab)</Label>
                  <Input
                    id="eq-calc-lab-unc"
                    type="text"
                    placeholder="e.g. 0.05"
                    value={parsedLabUncertainty}
                    onChange={(e) => handleUpdateCheck(parsedReadings, undefined, undefined, undefined, undefined, undefined, undefined, undefined, e.target.value)}
                    className="h-7 text-xs py-0.5 px-2 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eq-calc-master-unc" className="text-[10px] font-semibold text-slate-600">Master Uncertainty (U_ref)</Label>
                  <Input
                    id="eq-calc-master-unc"
                    type="text"
                    placeholder="e.g. 0.02"
                    value={parsedMasterUncertainty}
                    onChange={(e) => handleUpdateCheck(parsedReadings, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, e.target.value)}
                    className="h-7 text-xs py-0.5 px-2 bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-muted-foreground font-semibold text-[10px] uppercase bg-slate-50/50">
                  <th className="py-1.5 px-2 w-[6%]">#</th>
                  <th className="py-1.5 px-2 w-[24%]">Std Value</th>
                  <th className="py-1.5 px-2 w-[24%]">Obs Value</th>
                  <th className="py-1.5 px-2 w-[16%] text-center">Error</th>
                  {parsedIsEnRatioEnabled && <th className="py-1.5 px-2 w-[12%] text-center">E_n Ratio</th>}
                  <th className="py-1.5 px-2 w-[10%] text-center">Status</th>
                  <th className="py-1.5 px-2 w-[8%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedReadings.map((r, idx) => {
                  const stdNum = parseFloat(r.std)
                  const obsNum = parseFloat(r.obs)
                  const limitNum = defaultLimit
                  
                  let errText = '-'
                  let enRatioText = '-'
                  let isPass = true
                  
                  if (!isNaN(stdNum) && !isNaN(obsNum)) {
                    const mult = parseFloat(parsedConversionMultiplier) || 1
                    const err = Math.abs(obsNum * mult - stdNum * mult)
                    errText = err.toFixed(4)
                    
                    if (parsedIsEnRatioEnabled) {
                      const uLab = parseFloat(parsedLabUncertainty) || 0
                      const uRef = parseFloat(parsedMasterUncertainty) || 0
                      const enDenom = Math.sqrt(uLab * uLab + uRef * uRef)
                      if (enDenom > 0) {
                        const enRatio = err / enDenom
                        enRatioText = enRatio.toFixed(3)
                        isPass = enRatio <= 1.0
                      }
                    } else if (limitNum !== null) {
                      isPass = err <= limitNum
                    }
                  }
                  
                  return (
                    <tr key={idx} className="group hover:bg-slate-50/50">
                      <td className="py-1.5 px-2 text-slate-500 font-mono align-middle">{idx + 1}</td>
                      <td className="py-0.5 px-1 align-middle">
                        <Input
                          type="text"
                          placeholder="Std"
                          value={r.std}
                          onChange={(e) => {
                            const newR = [...parsedReadings]
                            newR[idx] = { ...newR[idx], std: e.target.value }
                            handleUpdateCheck(newR)
                          }}
                          className="h-7 text-xs py-0.5 px-2"
                        />
                      </td>
                      <td className="py-0.5 px-1 align-middle">
                        <Input
                          type="text"
                          placeholder="Obs"
                          value={r.obs}
                          onChange={(e) => {
                            const newR = [...parsedReadings]
                            newR[idx] = { ...newR[idx], obs: e.target.value }
                            handleUpdateCheck(newR)
                          }}
                          className="h-7 text-xs py-0.5 px-2"
                        />
                      </td>
                      <td className="py-1.5 text-center font-mono font-medium text-slate-700 align-middle">
                        {errText}
                      </td>
                      {parsedIsEnRatioEnabled && (
                        <td className="py-1.5 text-center font-mono font-medium text-slate-700 align-middle">
                          {enRatioText}
                        </td>
                      )}
                      <td className="py-1.5 text-center align-middle">
                        {errText !== '-' ? (
                          isPass ? (
                            <span className="inline-flex items-center font-semibold text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded text-[9px]">
                              Pass
                            </span>
                          ) : (
                            <span className="inline-flex items-center font-semibold text-rose-600 bg-rose-50 px-1 py-0.2 rounded text-[9px]">
                              Fail
                            </span>
                          )
                        ) : (
                          <span className="text-slate-350 text-[10px]">-</span>
                        )}
                      </td>
                      <td className="py-0.5 pl-1 align-middle text-right">
                        {parsedReadings.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              const newR = parsedReadings.filter((_, i) => i !== idx)
                              handleUpdateCheck(newR)
                            }}
                          >
                            <Trash2 size={10} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t pt-2 mt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] text-primary border-primary/20 hover:bg-primary/5"
                onClick={() => {
                  const newR = [...parsedReadings, { std: '', obs: '' }]
                  handleUpdateCheck(newR)
                }}
              >
                <Plus size={10} className="mr-1" /> Add Reading
              </Button>
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
            
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Result:</span>
              {(() => {
                let hasValid = false
                let hasFail = false
                const limitNum = defaultLimit
                const uLab = parseFloat(parsedLabUncertainty) || 0
                const uRef = parseFloat(parsedMasterUncertainty) || 0
                const enDenom = Math.sqrt(uLab * uLab + uRef * uRef)
                
                parsedReadings.forEach((r) => {
                  const stdNum = parseFloat(r.std)
                  const obsNum = parseFloat(r.obs)
                  if (!isNaN(stdNum) && !isNaN(obsNum)) {
                    hasValid = true
                    const mult = parseFloat(parsedConversionMultiplier) || 1
                    const err = Math.abs(obsNum * mult - stdNum * mult)
                    
                    let pass = true
                    if (parsedIsEnRatioEnabled && enDenom > 0) {
                      pass = (err / enDenom) <= 1.0
                    } else if (limitNum !== null) {
                      pass = err <= limitNum
                    }
                    if (!pass) {
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
        </div>
      </div>
    )
  }

  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastCalibrationDate, form.calibrationFrequency)
    if (nextDue !== form.nextCalibrationDue) {
      onChange({ ...form, nextCalibrationDue: nextDue })
    }
  }, [form.lastCalibrationDate, form.calibrationFrequency])

  useEffect(() => {
    const nextDue = calculateNextDueDate(
      form.lastIntermediateCheckDate,
      form.intermediateCheckFrequency,
    )
    if (nextDue !== form.nextIntermediateCheckDate) {
      onChange({ ...form, nextIntermediateCheckDate: nextDue })
    }
  }, [form.lastIntermediateCheckDate, form.intermediateCheckFrequency])

  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastMaintenanceDate, form.maintenanceScheduleFrequency)
    if (nextDue !== form.nextMaintenanceDate) {
      onChange({ ...form, nextMaintenanceDate: nextDue })
    }
  }, [form.lastMaintenanceDate, form.maintenanceScheduleFrequency])

  useEffect(() => {
    const hasInter = !!(
      form.intermediateCheckFrequency?.trim() ||
      form.lastIntermediateCheckDate?.trim() ||
      form.nextIntermediateCheckDate?.trim() ||
      form.intermediateCheckResult?.trim()
    )
    // Defaults: Calibration & Maintenance = Applicable; Intermediate Check = Not Applicable.
    // Saved intermediate data still forces Applicable for that section.
    setCalApplicable('applicable')
    setIntermediateApplicable(hasInter ? 'applicable' : 'not-applicable')
    setMaintApplicable('applicable')
  }, [form.assetCode])

  useEffect(() => {
    if (calApplicable === 'applicable' && !form.calibrationFrequency) {
      onChange({ ...form, calibrationFrequency: 'Yearly' as Frequency })
    }
  }, [calApplicable])

  useEffect(() => {
    if (intermediateApplicable === 'applicable' && !form.intermediateCheckFrequency) {
      onChange({ ...form, intermediateCheckFrequency: 'Quarterly' as Frequency })
    }
  }, [intermediateApplicable])

  useEffect(() => {
    if (maintApplicable === 'applicable' && !form.maintenanceScheduleFrequency) {
      onChange({ ...form, maintenanceScheduleFrequency: 'Quarterly' as Frequency })
    }
  }, [maintApplicable])

  const frequencySelectItems = (
    <>
      <SelectItem value="Daily">Daily</SelectItem>
      <SelectItem value="Weekly">Weekly</SelectItem>
      <SelectItem value="Monthly">Monthly</SelectItem>
      <SelectItem value="Quarterly">Quarterly</SelectItem>
      <SelectItem value="Half Yearly">Half Yearly</SelectItem>
      <SelectItem value="Yearly">Yearly</SelectItem>
    </>
  )

  const renderMasterCalibrationPoints = () => (
    <MasterCalibrationPointsEditor
      className={cn(limsPanelClass, 'p-4')}
      title="Master Calibration Points"
      columns={form.calibrationPointsColumns}
      rows={form.calibrationPoints}
      readOnly={readOnly}
      dialogLayer="stacked"
      inputIdPrefix="iqc-cal"
      formulaMaster={{
        asset_code: form.assetCode,
        equipment_name: form.equipmentName,
        manufacturer: form.manufacturer,
        model_number: form.modelNumber,
        serial_number: form.serialNumber,
        current_location: form.currentLocation,
        range_capacity: joinValueAndUnit(form.rangeCapacity, form.rangeCapacityUnit),
        resolution_least_count: joinValueAndUnit(
          form.resolutionLeastCount,
          form.resolutionLeastCountUnit,
        ),
        accuracy_acceptance_criteria: joinValueAndUnit(
          form.accuracyAcceptanceCriteria,
          form.accuracyAcceptanceCriteriaUnit,
        ),
        calibration_temperature: form.calibrationTemperature,
        calibration_humidity: form.calibrationHumidity,
        calibration_certificate_number: form.calibrationCertificateNumber,
      }}
      onChange={({ columns, rows }) =>
        onChange({
          ...form,
          calibrationPointsColumns: columns,
          calibrationPoints: rows,
        })
      }
    />
  )

  const renderCalibrationSectionFields = () => (
    <div className="space-y-4">
    <div className={cn(limsPanelClass, 'space-y-4 p-4')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="eq-cal-freq" className="text-xs font-semibold">
            Frequency
          </Label>
          <Select
            value={form.calibrationFrequency}
            onValueChange={(v) => onChange({ ...form, calibrationFrequency: v as Frequency })}
          >
            <SelectTrigger id="eq-cal-freq">
              <SelectValue placeholder="Select Frequency" />
            </SelectTrigger>
            <SelectContent>{frequencySelectItems}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eq-last-cal" className="text-xs font-semibold">
            Last Date
          </Label>
          <Input
            id="eq-last-cal"
            type="date"
            value={form.lastCalibrationDate}
            onChange={(e) => onChange({ ...form, lastCalibrationDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eq-next-cal" className="text-xs font-semibold">
            Next Due (Auto)
          </Label>
          <Input
            id="eq-next-cal"
            type="date"
            value={form.nextCalibrationDue}
            readOnly
            className="bg-muted font-mono text-muted-foreground"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="eq-cal-cert" className="text-xs font-semibold">
            Certificate Number
          </Label>
          <Input
            id="eq-cal-cert"
            placeholder="Cert No"
            value={form.calibrationCertificateNumber}
            onChange={(e) => onChange({ ...form, calibrationCertificateNumber: e.target.value })}
          />
        </div>
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
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="min-w-0 space-y-1.5 sm:col-span-6">
          <Label className="text-xs font-semibold">Calibration Certificate (PDF)</Label>
          <div className="relative flex h-8 min-h-8 flex-1 items-center justify-between rounded-none border border-stone-500 bg-stone-50 px-3 text-sm">
            <span className="max-w-[140px] truncate text-xs text-muted-foreground sm:max-w-[200px]">
              {form.certificateFile
                ? form.certificateFile.name
                : form.uploadCertificatePath
                  ? form.uploadCertificatePath.split('/').pop()?.replace(/^\d+_/, '')
                  : 'No file selected'}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {form.uploadCertificatePath ? (
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
                      const ok = window.confirm(
                        'Are you sure you want to delete the uploaded certificate?',
                      )
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
              ) : null}
              <label className="cursor-pointer rounded-md p-0.5 text-slate-500 hover:bg-slate-100">
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
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-3">
          <Label htmlFor="iqc-cal-temp" className="text-xs font-semibold">
            Temperature
          </Label>
          <Input
            id="iqc-cal-temp"
            value={form.calibrationTemperature}
            onChange={(e) => onChange({ ...form, calibrationTemperature: e.target.value })}
            placeholder="e.g. 23 °C"
          />
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-3">
          <Label htmlFor="iqc-cal-humidity" className="text-xs font-semibold">
            Humidity
          </Label>
          <Input
            id="iqc-cal-humidity"
            value={form.calibrationHumidity}
            onChange={(e) => onChange({ ...form, calibrationHumidity: e.target.value })}
            placeholder="e.g. 55 %RH"
          />
        </div>
      </div>
    </div>
    {renderMasterCalibrationPoints()}
    </div>
  )

  const renderIntermediateSectionFields = () => (
    <div className="space-y-4">
      <div className={cn(limsPanelClass, 'space-y-4 p-4')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="iqc-inter-freq" className="text-xs font-semibold">
              Frequency
            </Label>
            <Select
              value={form.intermediateCheckFrequency || 'Quarterly'}
              onValueChange={(v) =>
                onChange({ ...form, intermediateCheckFrequency: v as Frequency })
              }
            >
              <SelectTrigger id="iqc-inter-freq">
                <SelectValue placeholder="Select Frequency" />
              </SelectTrigger>
              <SelectContent>{frequencySelectItems}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iqc-inter-last" className="text-xs font-semibold">
              Last Date
            </Label>
            <Input
              id="iqc-inter-last"
              type="date"
              value={form.lastIntermediateCheckDate}
              onChange={(e) => onChange({ ...form, lastIntermediateCheckDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iqc-inter-next" className="text-xs font-semibold">
              Next Due (Auto)
            </Label>
            <Input
              id="iqc-inter-next"
              type="date"
              value={form.nextIntermediateCheckDate}
              readOnly
              className="bg-muted font-mono text-muted-foreground"
            />
          </div>
        </div>
      </div>
      {renderIntermediateCheckCalculator()}
    </div>
  )

  const renderMaintenanceSectionFields = () => (
    <div className={cn(limsPanelClass, 'space-y-4 p-4')}>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
          <Label htmlFor="iqc-maint-freq" className="text-xs font-semibold">
            Schedule Frequency
          </Label>
          <Select
            value={form.maintenanceScheduleFrequency || 'Quarterly'}
            onValueChange={(v) =>
              onChange({ ...form, maintenanceScheduleFrequency: v as Frequency })
            }
          >
            <SelectTrigger id="iqc-maint-freq">
              <SelectValue placeholder="Select Frequency" />
            </SelectTrigger>
            <SelectContent>{frequencySelectItems}</SelectContent>
          </Select>
        </div>
        <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
          <Label htmlFor="iqc-maint-last" className="text-xs font-semibold">
            Last Date
          </Label>
          <Input
            id="iqc-maint-last"
            type="date"
            value={form.lastMaintenanceDate}
            onChange={(e) => onChange({ ...form, lastMaintenanceDate: e.target.value })}
          />
        </div>
        <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
          <Label htmlFor="iqc-maint-next" className="text-xs font-semibold">
            Next Due (Auto)
          </Label>
          <Input
            id="iqc-maint-next"
            type="date"
            value={form.nextMaintenanceDate}
            readOnly
            className="bg-slate-50 font-mono text-slate-600"
          />
        </div>
        <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
          <Label htmlFor="iqc-maint-by" className="text-xs font-semibold">
            Maintenance Done By
          </Label>
          <FilterCombobox
            inputId="iqc-maint-by"
            listId="iqc-maint-by-list"
            value={maintDoneByOpen ? maintDoneByQuery : selectedMaintDoneByLabel}
            onValueChange={(v) => {
              setMaintDoneByQuery(v)
              if (!maintDoneByOpen) setMaintDoneByOpen(true)
              if (!v.trim()) onChange({ ...form, maintenanceDoneBy: '' })
            }}
            options={filteredMaintDoneByOptions}
            onSelectOption={(opt) => {
              onChange({ ...form, maintenanceDoneBy: opt.id })
              setMaintDoneByQuery(opt.label)
              setMaintDoneByOpen(false)
            }}
            open={maintDoneByOpen}
            onOpenChange={(open) => {
              setMaintDoneByOpen(open)
              if (open) setMaintDoneByQuery(selectedMaintDoneByLabel)
            }}
            placeholder="Type to search employee…"
          />
        </div>
        <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
          <Label className="text-xs font-semibold">Conduct Maintenance</Label>
          <Button
            type="button"
            variant="outline"
            className={cn('h-10 w-full gap-1.5 text-xs', limsOutlineBtnClass)}
            onClick={() => setConductMaintenanceOpen(true)}
          >
            <Wrench size={14} />
            Conduct
          </Button>
        </div>
        <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
          <Label className="text-xs font-semibold">View Old Checklist</Label>
          <Button
            type="button"
            variant="secondary"
            className="h-10 w-full gap-1.5 text-xs"
            disabled={!hasMaintenanceChecklistHistory}
            onClick={() => setMaintenanceHistoryViewOpen(true)}
          >
            <History size={14} />
            View
            {form.maintenanceHistory.length > 0 ? ` (${form.maintenanceHistory.length})` : ''}
          </Button>
        </div>
      </div>
    </div>
  )

  const handleFileChange = (field: 'certificateFile' | 'manualSopFile', file: File | null) => {
    onChange({ ...form, [field]: file })
  }

  if (activeSection) {
    const sectionTitle =
      activeSection === 'intermediate'
        ? 'Intermediate Check Details'
        : activeSection === 'maintenance'
          ? 'Maintenance Details'
          : 'Calibration Details'
    const sectionContent =
      activeSection === 'intermediate'
        ? renderIntermediateSectionFields()
        : activeSection === 'maintenance'
          ? renderMaintenanceSectionFields()
          : renderCalibrationSectionFields()

    return (
      <>
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className={cn('space-y-4 p-0', labRegistryFormClass)}>
            <div>
              <h3 className={cn(sectionTitleClass, 'mb-3')}>{sectionTitle}</h3>
              {sectionContent}
            </div>
          </CardContent>
          <CardFooter className="-mx-0 mt-4 flex items-center justify-end gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3">
            <Button
              type="button"
              onClick={onSave}
              disabled={!canSave || saveLoading}
              className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
            >
              {saveLoading ? 'Saving…' : 'Save & Close'}
            </Button>
          </CardFooter>
        </Card>

        <ConductMaintenanceDialog
          open={conductMaintenanceOpen}
          onOpenChange={setConductMaintenanceOpen}
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          manufacturer={form.manufacturer}
          modelNumber={form.modelNumber}
          rangeCapacity={joinValueAndUnit(form.rangeCapacity, form.rangeCapacityUnit)}
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

        <MaintenanceHistoryDialog
          open={maintenanceHistoryViewOpen}
          onOpenChange={setMaintenanceHistoryViewOpen}
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          history={form.maintenanceHistory}
          currentLastDate={form.lastMaintenanceDate}
          currentDoneByName={maintenanceDoneByName}
          currentChecklist={form.maintenanceChecklist}
          onDirectorChange={(next) =>
            onChange({
              ...form,
              maintenanceHistory: next.history,
              lastMaintenanceDate: next.currentLastDate,
              maintenanceDoneBy: next.currentDoneByName,
              maintenanceChecklist: next.currentChecklist,
            })
          }
        />
      </>
    )
  }

  const renderScheduleDialog = (
    open: boolean,
    onOpenChange: (open: boolean) => void,
    title: string,
    content: JSX.Element,
  ) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {title}
            </DialogTitle>
          </DialogHeader>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            labRegistryFormClass,
          )}
        >
          {content}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            disabled={saveLoading}
            onClick={() => {
              onSave()
              onOpenChange(false)
            }}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardContent
        className={cn(
          'space-y-5 p-0',
          labRegistryFormClass,
          readOnly &&
            'pointer-events-none select-text [&_[data-readonly-action]]:pointer-events-auto',
        )}
      >
        <div className="space-y-4">
          <section className={cn(limsPanelClass, 'p-4')}>
            <h3 className={sectionTitleClass}>IQC Identity</h3>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 space-y-0.5 md:col-span-3">
                <Label htmlFor="iqc-id">IQC Standard ID / Asset Code *</Label>
                <Input
                  id="iqc-id"
                  value={form.assetCode}
                  onChange={(e) =>
                    onChange({ ...form, assetCode: e.target.value.toUpperCase() })
                  }
                  placeholder="Enter unique asset code"
                  className="font-mono font-medium uppercase"
                  autoComplete="off"
                  required
                  aria-required="true"
                />
              </div>
              <div className="col-span-12 space-y-0.5 md:col-span-6">
                <Label htmlFor="iqc-name">Master Standard Name *</Label>
                <Input
                  id="iqc-name"
                  placeholder="Enter standard name"
                  value={form.equipmentName}
                  onChange={(e) => onChange({ ...form, equipmentName: e.target.value })}
                />
              </div>
              <div className="col-span-12 space-y-0.5 md:col-span-3">
                <Label htmlFor="iqc-status">Status</Label>
                <Select
                  value={form.equipmentStatus}
                  onValueChange={(v) => onChange({ ...form, equipmentStatus: v as EquipmentStatus })}
                >
                  <SelectTrigger id="iqc-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="In Repair">In Repair</SelectItem>
                    <SelectItem value="Idle">Idle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className={cn(limsPanelClass, 'p-4')}>
            <h3 className={sectionTitleClass}>Identification & Custodian</h3>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 space-y-0.5 md:col-span-3">
                <Label htmlFor="iqc-make">Manufacturer / Make</Label>
                <Input
                  id="iqc-make"
                  placeholder="Make"
                  value={form.manufacturer}
                  onChange={(e) => onChange({ ...form, manufacturer: e.target.value })}
                />
              </div>
              <div className="col-span-12 space-y-0.5 md:col-span-3">
                <Label htmlFor="iqc-model">Model Number</Label>
                <Input
                  id="iqc-model"
                  placeholder="Model"
                  value={form.modelNumber}
                  onChange={(e) => onChange({ ...form, modelNumber: e.target.value })}
                />
              </div>
              <div className="col-span-12 space-y-0.5 md:col-span-3">
                <Label htmlFor="iqc-serial">Serial Number</Label>
                <Input
                  id="iqc-serial"
                  placeholder="Serial No"
                  value={form.serialNumber}
                  onChange={(e) => onChange({ ...form, serialNumber: e.target.value })}
                />
              </div>
              <div className="col-span-12 space-y-0.5 md:col-span-3">
                <Label htmlFor="iqc-custodian">Custodian / In-charge</Label>
                <FilterCombobox
                  inputId="iqc-custodian"
                  listId="iqc-custodian-list"
                  value={custodianOpen ? custodianQuery : selectedCustodianLabel}
                  onValueChange={(v) => {
                    setCustodianQuery(v)
                    if (!custodianOpen) setCustodianOpen(true)
                    if (!v.trim()) applyCustodianSelection('')
                  }}
                  options={filteredCustodianOptions}
                  onSelectOption={(opt) => {
                    applyCustodianSelection(opt.id)
                    setCustodianQuery(opt.label)
                    setCustodianOpen(false)
                  }}
                  open={custodianOpen}
                  onOpenChange={(open) => {
                    setCustodianOpen(open)
                    if (open) setCustodianQuery(selectedCustodianLabel)
                  }}
                  placeholder="Type to search employee…"
                />
              </div>
            </div>
          </section>

          <section className={cn(limsPanelClass, 'p-4')}>
            <h3 className={sectionTitleClass}>Purchase & Location</h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="iqc-purchase-date">Date of Purchased</Label>
                <Input
                  id="iqc-purchase-date"
                  type="date"
                  value={form.dateOfPurchase}
                  onChange={(e) => onChange({ ...form, dateOfPurchase: e.target.value })}
                />
              </div>
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="iqc-service-date">Date Placed in Service</Label>
                <Input
                  id="iqc-service-date"
                  type="date"
                  value={form.datePlacedInService}
                  onChange={(e) => onChange({ ...form, datePlacedInService: e.target.value })}
                />
              </div>
              <div className="min-w-0 space-y-0.5">
                <Label>Purchase From</Label>
                <LimsFieldWithAdd
                  addButton={
                    <LimsFieldAddButton
                      aria-label="Add new supplier client"
                      title="Add New Client"
                      onClick={() => onAddNewClientClick('purchasedFrom')}
                    />
                  }
                >
                  <ClientSearchSelect
                    value={form.purchasedFrom}
                    onValueChange={(v) => onChange({ ...form, purchasedFrom: v })}
                    options={clients}
                    placeholder="Type to search supplier…"
                  />
                </LimsFieldWithAdd>
              </div>
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="iqc-location">Current Location</Label>
                <FilterCombobox
                  inputId="iqc-location"
                  listId="iqc-location-list"
                  value={locationOpen ? locationQuery : form.currentLocation}
                  onValueChange={(v) => {
                    setLocationQuery(v)
                    if (!locationOpen) setLocationOpen(true)
                    if (!v.trim()) onChange({ ...form, currentLocation: '' })
                  }}
                  options={filteredLocationOptions}
                  onSelectOption={(opt) => {
                    onChange({ ...form, currentLocation: opt.label })
                    setLocationQuery(opt.label)
                    setLocationOpen(false)
                  }}
                  open={locationOpen}
                  onOpenChange={(open) => {
                    setLocationOpen(open)
                    if (open) setLocationQuery(form.currentLocation)
                  }}
                  placeholder="Type to search department…"
                />
              </div>
            </div>
          </section>

          <section className={cn(limsPanelClass, 'p-4')} data-iqc-tech-specs="value-unit">
            <h3 className={sectionTitleClass}>Technical Specifications</h3>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 space-y-0.5 md:col-span-4">
                <Label htmlFor="eq-range">Range / Capacity</Label>
                <div className={limsFieldWithAddShellClass}>
                  <Input
                    id="eq-range"
                    placeholder="Value"
                    aria-label="Range / capacity value"
                    value={form.rangeCapacity}
                    onChange={(e) => onChange({ ...form, rangeCapacity: e.target.value })}
                    className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                  />
                  <div className="min-w-0 flex-1 border-l border-stone-500">
                    <MeasurementUnitSelect
                      id="eq-range-unit"
                      value={form.rangeCapacityUnit ?? ''}
                      onChange={(rangeCapacityUnit) => onChange({ ...form, rangeCapacityUnit })}
                      showLabel={false}
                      showManageButton
                      placeholder="Unit"
                      className="min-w-0"
                      shellClassName="h-full border-0 focus-within:border-transparent focus-within:ring-0"
                      inputClassName="px-2"
                    />
                  </div>
                </div>
              </div>

              <div className="col-span-12 space-y-0.5 md:col-span-4">
                <Label htmlFor="eq-resolution">Resolution / Least Count</Label>
                <div className={limsFieldWithAddShellClass}>
                  <Input
                    id="eq-resolution"
                    placeholder="Value"
                    aria-label="Resolution / least count value"
                    value={form.resolutionLeastCount}
                    onChange={(e) => onChange({ ...form, resolutionLeastCount: e.target.value })}
                    className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                  />
                  <div className="min-w-0 flex-1 border-l border-stone-500">
                    <MeasurementUnitSelect
                      id="eq-resolution-unit"
                      value={form.resolutionLeastCountUnit ?? ''}
                      onChange={(resolutionLeastCountUnit) =>
                        onChange({ ...form, resolutionLeastCountUnit })
                      }
                      showLabel={false}
                      showManageButton
                      placeholder="Unit"
                      className="min-w-0"
                      shellClassName="h-full border-0 focus-within:border-transparent focus-within:ring-0"
                      inputClassName="px-2"
                    />
                  </div>
                </div>
              </div>

              <div className="col-span-12 space-y-0.5 md:col-span-4">
                <Label htmlFor="eq-accuracy">Acceptance Criteria</Label>
                <div className={limsFieldWithAddShellClass}>
                  <Input
                    id="eq-accuracy"
                    placeholder="Value"
                    aria-label="Acceptance criteria value"
                    value={form.accuracyAcceptanceCriteria}
                    onChange={(e) =>
                      onChange({ ...form, accuracyAcceptanceCriteria: e.target.value })
                    }
                    className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                  />
                  <div className="min-w-0 flex-1 border-l border-stone-500">
                    <MeasurementUnitSelect
                      id="eq-accuracy-unit"
                      value={form.accuracyAcceptanceCriteriaUnit ?? ''}
                      onChange={(accuracyAcceptanceCriteriaUnit) =>
                        onChange({ ...form, accuracyAcceptanceCriteriaUnit })
                      }
                      showLabel={false}
                      showManageButton
                      placeholder="Unit"
                      className="min-w-0"
                      shellClassName="h-full border-0 focus-within:border-transparent focus-within:ring-0"
                      inputClassName="px-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {!hideScheduleSections ? (
            <section className={cn(limsPanelClass, 'p-4')} data-iqc-schedule="open-form">
              <h3 className={sectionTitleClass}>Schedule Applicability</h3>
              <div className="grid grid-cols-12 gap-3">
                <div id="section-calibration" className="col-span-12 space-y-3 md:col-span-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Calibration
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Select
                        value={calApplicable}
                        onValueChange={(v) => {
                          const next = v as 'applicable' | 'not-applicable'
                          setCalApplicable(next)
                          if (next === 'not-applicable') {
                            setCalDetailsOpen(false)
                            onChange({
                              ...form,
                              calibrationFrequency: '',
                              lastCalibrationDate: '',
                              nextCalibrationDue: '',
                              calibrationCertificateNumber: '',
                              calibrationTemperature: '',
                              calibrationHumidity: '',
                              externalCalibrationAgency: '',
                              certificateFile: null,
                              uploadCertificatePath: '',
                              calibrationPointsColumns: [],
                              calibrationPoints: [],
                            })
                          } else {
                            onChange({
                              ...form,
                              calibrationFrequency: form.calibrationFrequency || 'Yearly',
                            })
                          }
                        }}
                      >
                        <SelectTrigger className="min-w-0 flex-1 border-slate-200 bg-white">
                          <SelectValue placeholder="Select Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="applicable">Applicable</SelectItem>
                          <SelectItem value="not-applicable">Not Applicable</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn('h-8 shrink-0 gap-1.5 px-3', limsOutlineBtnClass)}
                        disabled={calApplicable !== 'applicable'}
                        aria-disabled={calApplicable !== 'applicable'}
                        title={
                          calApplicable === 'applicable'
                            ? 'Open Calibration form'
                            : 'Set status to Applicable to open the form'
                        }
                        aria-label={
                          calApplicable === 'applicable'
                            ? 'Open Calibration form'
                            : 'Open Calibration form (disabled when Not Applicable)'
                        }
                        onClick={() => {
                          if (calApplicable !== 'applicable') return
                          if (!form.calibrationFrequency) {
                            onChange({ ...form, calibrationFrequency: 'Yearly' })
                          }
                          setCalDetailsOpen(true)
                        }}
                      >
                        <ClipboardCheck size={14} />
                        Open Form
                      </Button>
                    </div>
                  </div>
                </div>

                <div id="section-intermediate" className="col-span-12 space-y-3 md:col-span-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Intermediate Check
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Select
                        value={intermediateApplicable}
                        onValueChange={(v) => {
                          const next = v as 'applicable' | 'not-applicable'
                          setIntermediateApplicable(next)
                          if (next === 'not-applicable') {
                            setIntermediateDetailsOpen(false)
                            onChange({
                              ...form,
                              intermediateCheckFrequency: '',
                              lastIntermediateCheckDate: '',
                              nextIntermediateCheckDate: '',
                              intermediateCheckResult: '',
                            })
                          } else {
                            onChange({
                              ...form,
                              intermediateCheckFrequency:
                                form.intermediateCheckFrequency || 'Quarterly',
                            })
                          }
                        }}
                      >
                        <SelectTrigger className="min-w-0 flex-1 border-slate-200 bg-white">
                          <SelectValue placeholder="Select Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="applicable">Applicable</SelectItem>
                          <SelectItem value="not-applicable">Not Applicable</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn('h-8 shrink-0 gap-1.5 px-3', limsOutlineBtnClass)}
                        disabled={intermediateApplicable !== 'applicable'}
                        aria-disabled={intermediateApplicable !== 'applicable'}
                        title={
                          intermediateApplicable === 'applicable'
                            ? 'Open Intermediate Check form'
                            : 'Set status to Applicable to open the form'
                        }
                        aria-label={
                          intermediateApplicable === 'applicable'
                            ? 'Open Intermediate Check form'
                            : 'Open Intermediate Check form (disabled when Not Applicable)'
                        }
                        onClick={() => {
                          if (intermediateApplicable !== 'applicable') return
                          setIntermediateDetailsOpen(true)
                        }}
                      >
                        <ListChecks size={14} />
                        Open Form
                      </Button>
                    </div>
                  </div>
                </div>

                <div id="section-maintenance" className="col-span-12 space-y-3 md:col-span-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Maintenance
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Select
                        value={maintApplicable}
                        onValueChange={(v) => {
                          const next = v as 'applicable' | 'not-applicable'
                          setMaintApplicable(next)
                          if (next === 'not-applicable') {
                            setMaintenanceDetailsOpen(false)
                            onChange({
                              ...form,
                              maintenanceScheduleFrequency: '',
                              lastMaintenanceDate: '',
                              nextMaintenanceDate: '',
                              maintenanceDoneBy: '',
                              maintenanceChecklist: [],
                              maintenanceHistory: [],
                            })
                          } else {
                            onChange({
                              ...form,
                              maintenanceScheduleFrequency:
                                form.maintenanceScheduleFrequency || 'Quarterly',
                              maintenanceDoneBy:
                                form.maintenanceDoneBy || form.custodianEmployeeId || '',
                            })
                          }
                        }}
                      >
                        <SelectTrigger className="min-w-0 flex-1 border-slate-200 bg-white">
                          <SelectValue placeholder="Select Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="applicable">Applicable</SelectItem>
                          <SelectItem value="not-applicable">Not Applicable</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn('h-8 shrink-0 gap-1.5 px-3', limsOutlineBtnClass)}
                        disabled={maintApplicable !== 'applicable'}
                        aria-disabled={maintApplicable !== 'applicable'}
                        title={
                          maintApplicable === 'applicable'
                            ? 'Open Maintenance form'
                            : 'Set status to Applicable to open the form'
                        }
                        aria-label={
                          maintApplicable === 'applicable'
                            ? 'Open Maintenance form'
                            : 'Open Maintenance form (disabled when Not Applicable)'
                        }
                        onClick={() => {
                          if (maintApplicable !== 'applicable') return
                          setMaintenanceDetailsOpen(true)
                        }}
                      >
                        <Wrench size={14} />
                        Open Form
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className={cn(limsPanelClass, 'p-4')}>
            <h3 className={sectionTitleClass}>Documents & History</h3>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 space-y-1.5 md:col-span-3">
                <Label>Upload Manual / SOP</Label>
                <div className="flex h-8 items-center gap-0.5 rounded-none border border-stone-500 bg-stone-50 px-1">
                  <span
                    className="min-w-0 flex-1 truncate px-1.5 text-xs text-stone-600"
                    title={
                      form.manualSopFile?.name ||
                      (form.uploadManualSopPath
                        ? form.uploadManualSopPath.split('/').pop()?.replace(/^\d+_/, '')
                        : undefined)
                    }
                  >
                    {form.manualSopFile
                      ? form.manualSopFile.name
                      : form.uploadManualSopPath
                        ? form.uploadManualSopPath.split('/').pop()?.replace(/^\d+_/, '')
                        : 'No file'}
                  </span>
                  <label
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-none text-base leading-none hover:bg-stone-200/80"
                    title="Upload"
                    aria-label="Upload Manual / SOP"
                  >
                    <span aria-hidden>📤</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null
                        handleFileChange('manualSopFile', file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-readonly-action=""
                    className="h-7 w-7 shrink-0 rounded-none text-base hover:bg-stone-200/80"
                    title="View"
                    aria-label="View Manual / SOP"
                    disabled={!form.uploadManualSopPath && !form.manualSopFile}
                    onClick={() => {
                      if (form.uploadManualSopPath) {
                        onViewFile(form.uploadManualSopPath, 'Manual_SOP')
                        return
                      }
                      if (form.manualSopFile) {
                        const url = URL.createObjectURL(form.manualSopFile)
                        window.open(url, '_blank', 'noopener,noreferrer')
                        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
                      }
                    }}
                  >
                    <span aria-hidden>👁</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-none text-base hover:bg-red-50"
                    title="Delete"
                    aria-label="Delete Manual / SOP"
                    disabled={!form.uploadManualSopPath && !form.manualSopFile}
                    onClick={() => {
                      const ok = window.confirm(
                        'Are you sure you want to delete the uploaded Manual/SOP?',
                      )
                      if (!ok) return
                      onChange({
                        ...form,
                        uploadManualSopPath: '',
                        manualSopFile: null,
                      })
                    }}
                  >
                    <span aria-hidden>🗑</span>
                  </Button>
                </div>
              </div>
              <div className="col-span-12 space-y-1.5 md:col-span-9">
                <Label htmlFor="iqc-damage">History of Damage/Malfunction</Label>
                <Input
                  id="iqc-damage"
                  placeholder="Describe any history of damages or malfunctions…"
                  value={form.historyOfDamage}
                  onChange={(e) => onChange({ ...form, historyOfDamage: e.target.value })}
                  className="h-8"
                />
              </div>
            </div>
          </section>
        </div>
      </CardContent>

      <CardFooter className="-mx-4 mt-5 flex items-center justify-end gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:-mx-6 sm:px-6">
        {readOnly ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onClose?.()}
            className={cn(limsOutlineBtnClass, 'min-w-[8.5rem]')}
            data-readonly-action
          >
            Close
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onSave}
            disabled={!canSave || saveLoading}
            className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        )}
      </CardFooter>

      {renderScheduleDialog(
        calDetailsOpen,
        setCalDetailsOpen,
        'Calibration Form',
        renderCalibrationSectionFields(),
      )}
      {renderScheduleDialog(
        intermediateDetailsOpen,
        setIntermediateDetailsOpen,
        'Intermediate Check Form',
        renderIntermediateSectionFields(),
      )}

      <Dialog open={maintenanceDetailsOpen} onOpenChange={setMaintenanceDetailsOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="nested"
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
            'left-0 top-0',
            'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          )}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Maintenance Schedule Form
              </DialogTitle>
            </DialogHeader>
          </div>
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
              labRegistryFormClass,
            )}
          >
            {renderMaintenanceSectionFields()}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              disabled={saveLoading}
              onClick={() => {
                onSave()
                setMaintenanceDetailsOpen(false)
              }}
            >
              {saveLoading ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConductMaintenanceDialog
        open={conductMaintenanceOpen}
        onOpenChange={setConductMaintenanceOpen}
        equipmentName={form.equipmentName}
        assetCode={form.assetCode}
        manufacturer={form.manufacturer}
        modelNumber={form.modelNumber}
        rangeCapacity={joinValueAndUnit(form.rangeCapacity, form.rangeCapacityUnit)}
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

      <MaintenanceHistoryDialog
        open={maintenanceHistoryViewOpen}
        onOpenChange={setMaintenanceHistoryViewOpen}
        equipmentName={form.equipmentName}
        assetCode={form.assetCode}
        history={form.maintenanceHistory}
        currentLastDate={form.lastMaintenanceDate}
        currentDoneByName={maintenanceDoneByName}
        currentChecklist={form.maintenanceChecklist}
        onDirectorChange={(next) =>
          onChange({
            ...form,
            maintenanceHistory: next.history,
            lastMaintenanceDate: next.currentLastDate,
            maintenanceDoneBy: next.currentDoneByName,
            maintenanceChecklist: next.currentChecklist,
          })
        }
      />
    </Card>
  )
}
