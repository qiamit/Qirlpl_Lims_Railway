import { useEffect, useState } from 'react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { FileUp, Eye, X, Trash2, Plus, CheckCircle, AlertTriangle } from 'lucide-react'
import {
  calculateNextDueDate,
  type EquipmentForm,
  type EquipmentStatus,
  type Frequency,
  type EquipmentRow,
} from './types'
import { ClientSearchSelect } from './ClientSearchSelect'

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

export function EquipmentMasterForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onClear,
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
  onClear: () => void
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

          {/* 1. Setup & Environment Grid */}
          <div className="grid grid-cols-12 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-150">
            {/* Masters checklist */}
            <div className="col-span-12 md:col-span-6 space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Master Standard(s) Used (IQC Masters)</Label>
              <div className="border border-slate-200 rounded-md p-1.5 bg-white max-h-[110px] overflow-y-auto space-y-1 shadow-inner">
                {iqcMasters && iqcMasters.length > 0 ? (
                  iqcMasters
                    .map((e) => {
                      const isChecked = parsedMasters.includes(e.id)
                      return (
                        <label key={e.id} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer hover:bg-slate-50 p-0.5 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const nextMasters = isChecked
                                ? parsedMasters.filter((id) => id !== e.id)
                                : [...parsedMasters, e.id]
                              handleUpdateCheck(parsedReadings, undefined, nextMasters)
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5"
                          />
                          <span className="truncate">{e.equipment_name} ({e.asset_code})</span>
                        </label>
                      )
                    })
                ) : (
                  <div className="text-[10px] text-muted-foreground p-1 text-center">No IQC Masters found</div>
                )}
              </div>
              <Input
                type="text"
                placeholder="Or type custom master standard(s)..."
                value={parsedMasters.filter(id => !iqcMasters?.some(e => e.id === id)).join(', ')}
                onChange={(e) => {
                  const typed = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  const eqIds = parsedMasters.filter(id => iqcMasters?.some(e => e.id === id))
                  handleUpdateCheck(parsedReadings, undefined, [...eqIds, ...typed])
                }}
                className="h-7 text-xs px-2"
              />
              {parsedMasters.length > 0 && iqcMasters && (
                <div className="mt-1 space-y-1">
                  {parsedMasters.map(id => {
                    const eq = iqcMasters.find(e => e.id === id)
                    if (!eq) return null
                    const isOverdue = eq.next_calibration_due && new Date(eq.next_calibration_due) < new Date()
                    return (
                      <div key={id} className="flex items-center justify-between text-[9px] bg-white border border-slate-100 px-1.5 py-0.5 rounded shadow-sm">
                        <span className="text-slate-600 truncate max-w-[120px] font-medium">{eq.equipment_name}</span>
                        {eq.next_calibration_due ? (
                          <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                            Cal Due: {new Date(eq.next_calibration_due).toLocaleDateString('en-GB')} {isOverdue && '(Overdue!)'}
                          </span>
                        ) : (
                          <span className="text-amber-600">No Calibration Date</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Units and conversion */}
            <div className="col-span-12 md:col-span-6 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="eq-calc-unit" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reading Unit</Label>
                  <Input
                    id="eq-calc-unit"
                    type="text"
                    placeholder="e.g. N, mm"
                    value={parsedUnit}
                    onChange={(e) => handleUpdateCheck(parsedReadings, undefined, undefined, e.target.value)}
                    className="h-7 text-xs py-0.5 px-2 bg-white"
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="eq-calc-mult" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Multiplier to Criteria Unit</Label>
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
                  { label: 'kN → N (1000)', val: '1000' },
                  { label: 'mm → cm (0.1)', val: '0.1' },
                  { label: 'cm → mm (10)', val: '10' }
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

              {/* Environmental details */}
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

          {/* 2. ISO 17025 Drift Evaluation toggle and uncertainties */}
          <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50/50 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={parsedIsEnRatioEnabled}
                onChange={(e) => handleUpdateCheck(parsedReadings, undefined, undefined, undefined, undefined, undefined, undefined, e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
              />
              Enable Drift Evaluation (E_n Ratio) - ISO 17025:2017
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
                <div className="col-span-2 text-[9px] text-muted-foreground leading-normal mt-0.5">
                  Formula: E_n = |Observed - Standard| / sqrt(U_lab² + U_ref²). E_n ≤ 1.0 indicates satisfactory drift evaluation.
                </div>
              </div>
            )}
          </div>

          {/* Selected IQC Masters Calibration Points Reference */}
          {(() => {
            const selectedIqcMastersWithPoints = iqcMasters.filter(
              (e) => parsedMasters.includes(e.id) && Array.isArray(e.calibration_points) && e.calibration_points.length > 0
            )
            if (selectedIqcMastersWithPoints.length === 0) return null

            return (
              <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50/50 space-y-2 text-xs">
                <div className="font-bold text-slate-700 uppercase text-[10px] tracking-wider border-b pb-1">
                  Calibration Points of Selected Masters (Reference)
                </div>
                <div className="max-h-[150px] overflow-y-auto space-y-2">
                  {selectedIqcMastersWithPoints.map((master) => (
                    <div key={master.id} className="space-y-1">
                      <div className="font-semibold text-primary text-[10px]">{master.equipment_name} ({master.asset_code})</div>
                      <table className="w-full text-left text-[11px] border-collapse bg-white rounded shadow-sm overflow-hidden">
                        <thead>
                          <tr className="bg-slate-100 text-slate-500 font-semibold uppercase text-[9px] border-b">
                            <th className="py-1 px-1.5">Nominal / Std</th>
                            <th className="py-1 px-1.5">Actual / Certified</th>
                            <th className="py-1 px-1.5">Correction</th>
                            <th className="py-1 px-1.5">Uncertainty</th>
                            <th className="py-1 px-1.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(master.calibration_points as any[]).map((pt: any, ptIdx: number) => (
                            <tr key={pt.id || ptIdx}>
                              <td className="py-1 px-1.5 font-mono">{pt.nominalValue}</td>
                              <td className="py-1 px-1.5 font-mono">{pt.actualValue}</td>
                              <td className="py-1 px-1.5 font-mono text-slate-600">{pt.correction}</td>
                              <td className="py-1 px-1.5 font-mono text-slate-600">±{pt.uncertainty}</td>
                              <td className="py-1 px-1.5 text-right space-x-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[9px] font-semibold text-primary hover:bg-slate-100"
                                  onClick={() => {
                                    const emptyIdx = parsedReadings.findIndex((r) => !r.std && !r.obs)
                                    let nextReadings = [...parsedReadings]
                                    if (emptyIdx >= 0) {
                                      nextReadings[emptyIdx] = { std: pt.nominalValue, obs: pt.actualValue }
                                    } else {
                                      nextReadings.push({ std: pt.nominalValue, obs: pt.actualValue })
                                    }
                                    handleUpdateCheck(nextReadings)
                                  }}
                                >
                                  Use Reading
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[9px] font-semibold text-primary hover:bg-slate-100"
                                  onClick={() => {
                                    handleUpdateCheck(
                                      parsedReadings,
                                      undefined,
                                      undefined,
                                      undefined,
                                      undefined,
                                      undefined,
                                      undefined,
                                      undefined,
                                      undefined,
                                      pt.uncertainty
                                    )
                                  }}
                                >
                                  Use U_ref
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Readings Table */}
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
                      <td className="py-1.5 text-center align-middle font-sans">
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
              
              {parsedReadings.some(r => !isNaN(parseFloat(r.std)) && !isNaN(parseFloat(r.obs))) && (
                <tfoot className="border-t border-slate-200 bg-slate-50/40 text-[11px] text-slate-700">
                  <tr>
                    <td colSpan={parsedIsEnRatioEnabled ? 4 : 3} className="py-2 px-2 font-semibold text-right">Combined Error (RSS):</td>
                    <td className="py-2 text-center font-mono font-bold text-primary">
                      {(() => {
                        let sumSq = 0
                        const mult = parseFloat(parsedConversionMultiplier) || 1
                        parsedReadings.forEach(r => {
                          const s = parseFloat(r.std)
                          const o = parseFloat(r.obs)
                          if (!isNaN(s) && !isNaN(o)) {
                            const err = Math.abs(o * mult - s * mult)
                            sumSq += err * err
                          }
                        })
                        return Math.sqrt(sumSq).toFixed(4)
                      })()}
                    </td>
                    <td></td>
                    {parsedIsEnRatioEnabled && <td></td>}
                  </tr>
                  <tr>
                    <td colSpan={parsedIsEnRatioEnabled ? 4 : 3} className="py-1 px-2 font-semibold text-right">Max Error:</td>
                    <td className="py-1 text-center font-mono font-semibold">
                      {(() => {
                        let maxE = 0
                        const mult = parseFloat(parsedConversionMultiplier) || 1
                        parsedReadings.forEach(r => {
                          const s = parseFloat(r.std)
                          const o = parseFloat(r.obs)
                          if (!isNaN(s) && !isNaN(o)) {
                            const err = Math.abs(o * mult - s * mult)
                            if (err > maxE) maxE = err
                          }
                        })
                        return maxE.toFixed(4)
                      })()}
                    </td>
                    <td></td>
                    {parsedIsEnRatioEnabled && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Action and Summary */}
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
            
            {/* Overall Verdict */}
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
      )
    } else if (activeSection === 'intermediate') {
      sectionTitle = 'Intermediate Check Details'
      sectionContent = (
        <div className="border rounded-lg p-4 space-y-4 bg-slate-50/50">
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="eq-check-freq" className="text-xs font-semibold">Frequency</Label>
              <Select
                value={form.intermediateCheckFrequency}
                onValueChange={(v) => onChange({ ...form, intermediateCheckFrequency: v as Frequency })}
              >
                <SelectTrigger id="eq-check-freq" className="h-9 text-xs">
                  <SelectValue placeholder="Freq" />
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
              <Label htmlFor="eq-last-check" className="text-xs font-semibold">Last Date</Label>
              <Input
                id="eq-last-check"
                type="date"
                value={form.lastIntermediateCheckDate}
                onChange={(e) => onChange({ ...form, lastIntermediateCheckDate: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eq-next-check" className="text-xs font-semibold">Due Date (Auto)</Label>
              <Input
                id="eq-next-check"
                type="date"
                value={form.nextIntermediateCheckDate}
                readOnly
                className="bg-muted text-muted-foreground font-mono h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eq-check-done-by" className="text-xs font-semibold">Performed By</Label>
              <Select
                value={parsedDoneBy}
                onValueChange={(v) => handleUpdateCheck(parsedReadings, v)}
              >
                <SelectTrigger id="eq-check-done-by" className="h-9 text-xs">
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

          {renderIntermediateCheckCalculator()}
        </div>
      )
    } else if (activeSection === 'maintenance') {
      sectionTitle = 'Maintenance Details'
      sectionContent = (
        <div className="border rounded-lg p-4 space-y-4 bg-slate-50/50">
          <div className="space-y-1.5">
            <Label htmlFor="eq-maint-freq" className="text-xs font-semibold">Schedule Frequency</Label>
            <Select
              value={form.maintenanceScheduleFrequency}
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
            <Label htmlFor="eq-last-maint" className="text-xs font-semibold">Last Date</Label>
            <Input
              id="eq-last-maint"
              type="date"
              value={form.lastMaintenanceDate}
              onChange={(e) => onChange({ ...form, lastMaintenanceDate: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="eq-next-maint" className="text-xs font-semibold">Next Due (Auto)</Label>
            <Input
              id="eq-next-maint"
              type="date"
              value={form.nextMaintenanceDate}
              readOnly
              className="bg-muted text-muted-foreground font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="eq-maint-done" className="text-xs font-semibold">Maintenance Done By</Label>
            <Select
              value={form.maintenanceDoneBy}
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
            variant="outline"
            onClick={onClear}
            disabled={saveLoading}
            className="w-28"
          >
            Clear
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={!canSave || saveLoading}
            className="w-28 bg-primary hover:bg-primary/90 text-white"
          >
            {saveLoading ? 'Saving…' : 'Save'}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-none">
      <CardContent className="space-y-6 pt-2">
        {/* Section 1: Basic Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary border-b pb-1">Basic Info</h3>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-id" className="text-xs">Equipment ID / Asset Code</Label>
              <Input
                id="eq-id"
                value={form.assetCode || 'Auto Numbering…'}
                readOnly
                className="bg-muted text-muted-foreground font-mono"
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-name" className="text-xs">Equipment Name *</Label>
              <Input
                id="eq-name"
                placeholder="Enter equipment name"
                value={form.equipmentName}
                onChange={(e) => onChange({ ...form, equipmentName: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-status" className="text-xs">Equipment Status</Label>
              <Select
                value={form.equipmentStatus}
                onValueChange={(v) => onChange({ ...form, equipmentStatus: v as EquipmentStatus })}
              >
                <SelectTrigger id="eq-status">
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
              <Label htmlFor="eq-make" className="text-xs">Manufacturer / Make</Label>
              <Input
                id="eq-make"
                placeholder="Make"
                value={form.manufacturer}
                onChange={(e) => onChange({ ...form, manufacturer: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-model" className="text-xs">Model Number</Label>
              <Input
                id="eq-model"
                placeholder="Model"
                value={form.modelNumber}
                onChange={(e) => onChange({ ...form, modelNumber: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-serial" className="text-xs">Serial Number</Label>
              <Input
                id="eq-serial"
                placeholder="Serial No"
                value={form.serialNumber}
                onChange={(e) => onChange({ ...form, serialNumber: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-custodian" className="text-xs">Custodian / In-charge</Label>
              <Select
                value={form.custodianEmployeeId}
                onValueChange={(v) => onChange({ ...form, custodianEmployeeId: v })}
              >
                <SelectTrigger id="eq-custodian">
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
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary border-b pb-1">Procurement & Location</h3>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-purchase-date" className="text-xs">Date of Purchased</Label>
              <Input
                id="eq-purchase-date"
                type="date"
                value={form.dateOfPurchase}
                onChange={(e) => onChange({ ...form, dateOfPurchase: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-service-date" className="text-xs">Date Placed in Service</Label>
              <Input
                id="eq-service-date"
                type="date"
                value={form.datePlacedInService}
                onChange={(e) => onChange({ ...form, datePlacedInService: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label className="text-xs">Purchase From</Label>
              <ClientSearchSelect
                value={form.purchasedFrom}
                onValueChange={(v) => onChange({ ...form, purchasedFrom: v })}
                options={clients}
                placeholder="Search or select Supplier..."
                onAddNewClientClick={() => onAddNewClientClick('purchasedFrom')}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-location" className="text-xs">Current Location</Label>
              <Select
                value={form.currentLocation}
                onValueChange={(v) => onChange({ ...form, currentLocation: v })}
              >
                <SelectTrigger id="eq-location">
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
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary border-b pb-1">Technical Specifications</h3>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-range" className="text-xs">Range / Capacity</Label>
              <Input
                id="eq-range"
                placeholder="e.g. 0 to 500 mm"
                value={form.rangeCapacity}
                onFocus={() => setActiveFieldForSymbols('rangeCapacity')}
                onChange={(e) => onChange({ ...form, rangeCapacity: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-resolution" className="text-xs">Resolution / Least Count</Label>
              <Input
                id="eq-resolution"
                placeholder="e.g. 0.01 mm"
                value={form.resolutionLeastCount}
                onFocus={() => setActiveFieldForSymbols('resolutionLeastCount')}
                onChange={(e) => onChange({ ...form, resolutionLeastCount: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-accuracy" className="text-xs">Accuracy / Acceptance Criteria</Label>
              <Input
                id="eq-accuracy"
                placeholder="e.g. ±0.02 mm"
                value={form.accuracyAcceptanceCriteria}
                onFocus={() => setActiveFieldForSymbols('accuracyAcceptanceCriteria')}
                onChange={(e) => onChange({ ...form, accuracyAcceptanceCriteria: e.target.value })}
              />
            </div>

            {/* Premium Symbol Inserter */}
            {activeFieldForSymbols && (
              <div className="col-span-12 bg-muted/50 border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Insert Symbol into{' '}
                    <span className="text-primary">
                      {activeFieldForSymbols === 'rangeCapacity'
                        ? 'Range / Capacity'
                        : activeFieldForSymbols === 'resolutionLeastCount'
                        ? 'Resolution / Least Count'
                        : 'Accuracy / Acceptance Criteria'}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
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
                      className="h-8 px-2.5 text-sm font-medium hover:bg-primary hover:text-primary-foreground"
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
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary border-b pb-1">Calibration, Intermediate Checks & Maintenance</h3>
          <div className="grid grid-cols-12 gap-4">
            {/* Calibration details */}
            <div id="section-calibration" className="col-span-12 md:col-span-4 border rounded-lg p-3 space-y-3 bg-slate-50/50 transition-all duration-300">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Calibration</h4>
              
              <div className="space-y-1.5">
                <Label htmlFor="eq-cal-freq" className="text-xs">Frequency</Label>
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

              <div className="space-y-1.5">
                <Label htmlFor="eq-last-cal" className="text-xs">Last Date</Label>
                <Input
                  id="eq-last-cal"
                  type="date"
                  value={form.lastCalibrationDate}
                  onChange={(e) => onChange({ ...form, lastCalibrationDate: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="eq-next-cal" className="text-xs">Next Due (Auto)</Label>
                <Input
                  id="eq-next-cal"
                  type="date"
                  value={form.nextCalibrationDue}
                  readOnly
                  className="bg-muted text-muted-foreground font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="eq-cal-cert" className="text-xs">Certificate Number</Label>
                <Input
                  id="eq-cal-cert"
                  placeholder="Cert No"
                  value={form.calibrationCertificateNumber}
                  onChange={(e) => onChange({ ...form, calibrationCertificateNumber: e.target.value })}
                />
              </div>

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

            {/* Intermediate Check details */}
            <div id="section-intermediate" className="col-span-12 md:col-span-4 border rounded-lg p-3 space-y-3 bg-slate-50/50 transition-all duration-300">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Intermediate Check</h4>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="eq-check-freq" className="text-xs">Frequency</Label>
                  <Select
                    value={form.intermediateCheckFrequency}
                    onValueChange={(v) => onChange({ ...form, intermediateCheckFrequency: v as Frequency })}
                  >
                    <SelectTrigger id="eq-check-freq" className="h-9 text-xs">
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
                  <Label htmlFor="eq-last-check" className="text-xs">Last Date</Label>
                  <Input
                    id="eq-last-check"
                    type="date"
                    value={form.lastIntermediateCheckDate}
                    onChange={(e) => onChange({ ...form, lastIntermediateCheckDate: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="eq-next-check" className="text-xs">Next Due (Auto)</Label>
                  <Input
                    id="eq-next-check"
                    type="date"
                    value={form.nextIntermediateCheckDate}
                    readOnly
                    className="bg-muted text-muted-foreground font-mono h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="eq-check-done-by-main" className="text-xs">Performed By</Label>
                  <Select
                    value={parsedDoneBy}
                    onValueChange={(v) => handleUpdateCheck(parsedReadings, v)}
                  >
                    <SelectTrigger id="eq-check-done-by-main" className="h-9 text-xs">
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

              {renderIntermediateCheckCalculator()}
            </div>

            {/* Maintenance details */}
            <div id="section-maintenance" className="col-span-12 md:col-span-4 border rounded-lg p-3 space-y-3 bg-slate-50/50 transition-all duration-300">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Maintenance</h4>

              <div className="space-y-1.5">
                <Label htmlFor="eq-maint-freq" className="text-xs">Schedule Frequency</Label>
                <Select
                  value={form.maintenanceScheduleFrequency}
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
                <Label htmlFor="eq-last-maint" className="text-xs">Last Date</Label>
                <Input
                  id="eq-last-maint"
                  type="date"
                  value={form.lastMaintenanceDate}
                  onChange={(e) => onChange({ ...form, lastMaintenanceDate: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="eq-next-maint" className="text-xs">Next Due (Auto)</Label>
                <Input
                  id="eq-next-maint"
                  type="date"
                  value={form.nextMaintenanceDate}
                  readOnly
                  className="bg-muted text-muted-foreground font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="eq-maint-done" className="text-xs">Maintenance Done By</Label>
                <Select
                  value={form.maintenanceDoneBy}
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
            </div>
          </div>
        </div>

        {/* Section 5: Files & Documentation */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary border-b pb-1">Files & History</h3>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6 space-y-1.5">
              <Label className="text-xs">Upload Manual / SOP</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative border rounded-md px-3 py-1.5 bg-white flex items-center justify-between text-sm min-h-10">
                  <span className="text-muted-foreground truncate max-w-[200px]">
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
                          className="h-7 w-7 text-primary hover:bg-slate-100"
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
                    <label className="cursor-pointer p-1 rounded-md text-slate-500 hover:bg-slate-100">
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
                    className="h-10 w-10 text-destructive hover:bg-destructive/10"
                    onClick={() => handleFileChange('manualSopFile', null)}
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>
            </div>

            <div className="col-span-12 md:col-span-6 space-y-1.5">
              <Label htmlFor="eq-damage" className="text-xs">History of Damage/Malfunction</Label>
              <Textarea
                id="eq-damage"
                placeholder="Describe any history of damages or malfunctions…"
                value={form.historyOfDamage}
                onChange={(e) => onChange({ ...form, historyOfDamage: e.target.value })}
                className="h-20"
              />
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-2 border-t pt-4 px-6 bg-slate-50/50 rounded-b-lg">
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          disabled={saveLoading}
          className="w-28"
        >
          Clear
        </Button>
        <Button
          type="button"
          onClick={onSave}
          disabled={!canSave || saveLoading}
          className="w-28 bg-primary hover:bg-primary/90 text-white"
        >
          {saveLoading ? 'Saving…' : 'Save'}
        </Button>
      </CardFooter>
    </Card>
  )
}
