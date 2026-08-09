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
  type IqcForm,
  type EquipmentStatus,
  type Frequency,
  type CalibrationPoint,
} from './types'
import { ClientSearchSelect } from '../equipment-master/ClientSearchSelect'
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
  onAddNewClientClick,
  iqcMasters = [],
}: {
  form: IqcForm
  onChange: (next: IqcForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  clients: Array<{ id: string; company_name: string }>
  employees: Array<{ id: string; full_name: string }>
  locations: string[]
  onViewFile: (storagePath: string, fileName: string) => void
  activeSection?: 'calibration' | 'intermediate' | 'maintenance' | null
  onAddNewClientClick: (field: 'purchasedFrom' | 'externalCalibrationAgency') => void
  iqcMasters?: IqcForm[]
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

  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastCalibrationDate, form.calibrationFrequency)
    if (nextDue !== form.nextCalibrationDue) {
      onChange({ ...form, nextCalibrationDue: nextDue })
    }
  }, [form.lastCalibrationDate, form.calibrationFrequency])


  const handleFileChange = (field: 'certificateFile' | 'manualSopFile', file: File | null) => {
    onChange({ ...form, [field]: file })
  }

  // Calibration points inline editing functions
  const calibrationPoints = form.calibrationPoints || []

  const handleAddCalPoint = () => {
    const nextPoints = [
      ...calibrationPoints,
      {
        id: crypto.randomUUID(),
        nominalValue: '',
        actualValue: '',
        correction: '0.0000',
        uncertainty: '',
      },
    ]
    onChange({ ...form, calibrationPoints: nextPoints })
  }

  const handleUpdateCalPoint = (idx: number, field: keyof CalibrationPoint, value: string) => {
    const nextPoints = [...calibrationPoints]
    const updatedPoint = { ...nextPoints[idx], [field]: value }
    
    // Auto-calculate correction: Actual - Nominal
    if (field === 'nominalValue' || field === 'actualValue') {
      const nominal = parseFloat(field === 'nominalValue' ? value : updatedPoint.nominalValue)
      const actual = parseFloat(field === 'actualValue' ? value : updatedPoint.actualValue)
      if (!isNaN(nominal) && !isNaN(actual)) {
        updatedPoint.correction = (actual - nominal).toFixed(4)
      } else {
        updatedPoint.correction = '0.0000'
      }
    }
    
    nextPoints[idx] = updatedPoint
    onChange({ ...form, calibrationPoints: nextPoints })
  }

  const handleRemoveCalPoint = (idx: number) => {
    const nextPoints = calibrationPoints.filter((_, i) => i !== idx)
    onChange({ ...form, calibrationPoints: nextPoints })
  }

  if (activeSection) {
    let sectionTitle = 'Calibration Details'
    let sectionContent = (
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
          </div>
        </div>
      </div>
    )

    return (
      <Card className="border-0 shadow-none">
        <CardContent className="space-y-4 pt-2">
          <div className="bg-slate-50 border rounded-lg p-3.5 space-y-1">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">IQC Standard Info</div>
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
              <Label htmlFor="eq-id" className="text-xs">IQC Standard ID / Asset Code</Label>
              <Input
                id="eq-id"
                value={form.assetCode || 'Auto Numbering…'}
                readOnly
                className="bg-muted text-muted-foreground font-mono"
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-name" className="text-xs">Master Standard Name *</Label>
              <Input
                id="eq-name"
                placeholder="Enter standard name"
                value={form.equipmentName}
                onChange={(e) => onChange({ ...form, equipmentName: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-status" className="text-xs">Status</Label>
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

            {activeFieldForSymbols && (
              <div className="col-span-12 bg-stone-800 border rounded-lg p-3 space-y-2">
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

        {/* NEW Section 3.5: Master Calibration Points */}
        <div className="space-y-4 border border-slate-200 rounded-lg p-4 bg-slate-50/20">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-sm font-semibold text-primary">Master Calibration Certificate Points</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs text-primary border-primary/20 hover:bg-primary/5"
              onClick={handleAddCalPoint}
            >
              <Plus size={14} className="mr-1" /> Add Calibration Point
            </Button>
          </div>

          {calibrationPoints.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">No calibration points added yet. Click &quot;Add Calibration Point&quot; above to record certificate reference values.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-muted-foreground font-semibold text-[10px] uppercase bg-slate-100/50">
                    <th className="py-2 px-2 w-[8%]">#</th>
                    <th className="py-2 px-2 w-[28%]">Nominal / Std Value</th>
                    <th className="py-2 px-2 w-[28%]">Actual / Certified Value</th>
                    <th className="py-2 px-2 w-[16%] text-center">Correction Factor</th>
                    <th className="py-2 px-2 w-[15%]">Uncertainty (±)</th>
                    <th className="py-2 px-2 w-[5%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calibrationPoints.map((pt, idx) => (
                    <tr key={pt.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-2 text-slate-500 font-mono align-middle">{idx + 1}</td>
                      <td className="py-1 px-1 align-middle">
                        <Input
                          type="text"
                          placeholder="e.g. 10.0"
                          value={pt.nominalValue}
                          onChange={(e) => handleUpdateCalPoint(idx, 'nominalValue', e.target.value)}
                          className="h-8 text-xs py-1 px-2"
                        />
                      </td>
                      <td className="py-1 px-1 align-middle">
                        <Input
                          type="text"
                          placeholder="e.g. 10.02"
                          value={pt.actualValue}
                          onChange={(e) => handleUpdateCalPoint(idx, 'actualValue', e.target.value)}
                          className="h-8 text-xs py-1 px-2"
                        />
                      </td>
                      <td className="py-2 text-center font-mono font-medium text-slate-700 align-middle bg-slate-50/40">
                        {pt.correction}
                      </td>
                      <td className="py-1 px-1 align-middle">
                        <Input
                          type="text"
                          placeholder="e.g. 0.01"
                          value={pt.uncertainty}
                          onChange={(e) => handleUpdateCalPoint(idx, 'uncertainty', e.target.value)}
                          className="h-8 text-xs py-1 px-2"
                        />
                      </td>
                      <td className="py-1 px-1 align-middle text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-rose-50"
                          onClick={() => handleRemoveCalPoint(idx)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 4: Calibration Details */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary border-b pb-1">Calibration Details</h3>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4 space-y-1.5">
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

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-last-cal" className="text-xs">Last Date</Label>
              <Input
                id="eq-last-cal"
                type="date"
                value={form.lastCalibrationDate}
                onChange={(e) => onChange({ ...form, lastCalibrationDate: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-next-cal" className="text-xs">Next Due (Auto)</Label>
              <Input
                id="eq-next-cal"
                type="date"
                value={form.nextCalibrationDue}
                readOnly
                className="bg-muted text-muted-foreground font-mono"
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="eq-cal-cert" className="text-xs">Certificate Number</Label>
              <Input
                id="eq-cal-cert"
                placeholder="Cert No"
                value={form.calibrationCertificateNumber}
                onChange={(e) => onChange({ ...form, calibrationCertificateNumber: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label className="text-xs">Agency</Label>
              <ClientSearchSelect
                value={form.externalCalibrationAgency}
                onValueChange={(v) => onChange({ ...form, externalCalibrationAgency: v })}
                options={clients}
                placeholder="Search Agency..."
                onAddNewClientClick={() => onAddNewClientClick('externalCalibrationAgency')}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label className="text-xs">Upload Certificate (PDF)</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative border rounded-md px-3 py-1 bg-white flex items-center justify-between text-xs min-h-9">
                  <span className="text-muted-foreground truncate max-w-[130px]">
                    {form.certificateFile
                      ? form.certificateFile.name
                      : form.uploadCertificatePath
                      ? form.uploadCertificatePath.split('/').pop()?.replace(/^\d+_/, '')
                      : 'No file'}
                  </span>
                  <div className="flex items-center gap-1">
                    {form.uploadCertificatePath && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-primary hover:bg-slate-100"
                          onClick={() => onViewFile(form.uploadCertificatePath, 'Certificate')}
                        >
                          <Eye size={12} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-red-50"
                          onClick={() => {
                            const ok = window.confirm('Delete uploaded certificate?')
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
                    <label className="cursor-pointer p-0.5 rounded text-slate-500 hover:bg-slate-100">
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
            </div>
          </div>
        </div>

        {/* Section 5: Manuals, SOP & History */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary border-b pb-1">Documentation & History of Damage</h3>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6 space-y-1.5">
              <Label className="text-xs">Upload Manual / SOP (PDF)</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative border rounded-md px-3 py-1 bg-white flex items-center justify-between text-xs min-h-9">
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
                          className="h-6 w-6 text-primary hover:bg-slate-100"
                          onClick={() => onViewFile(form.uploadManualSopPath, 'Manual/SOP')}
                        >
                          <Eye size={12} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-red-50"
                          onClick={() => {
                            const ok = window.confirm('Delete manual/SOP file?')
                            if (ok) {
                              onChange({
                                ...form,
                                uploadManualSopPath: '',
                                manualSopFile: null,
                              })
                            }
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </>
                    )}
                    <label className="cursor-pointer p-0.5 rounded text-slate-500 hover:bg-slate-100">
                      <FileUp size={14} />
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          handleFileChange('manualSopFile', file)
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 md:col-span-6 space-y-1.5">
              <Label htmlFor="eq-damage" className="text-xs">History of Damage / Discrepancy</Label>
              <Textarea
                id="eq-damage"
                placeholder="Record any damage, malfunction or repairs performed here..."
                value={form.historyOfDamage}
                onChange={(e) => onChange({ ...form, historyOfDamage: e.target.value })}
                className="min-h-9 text-xs py-1 px-3"
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
    </Card>
  )
}
