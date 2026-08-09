import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import type { EquipmentRow } from '@/features/masters/equipment-master/types'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  buildEquipmentUncertaintyOption,
  calibrationStandardUncertainty,
  filterEquipmentUncertaintyOptions,
  type EquipmentUncertaintyOption,
} from './equipmentUncertainty'
import type { TestParameterRow } from './types'
import {
  buildUncertaintyCalculationData,
  combineUncertaintyBudget,
  CONFIDENCE_LEVEL_OPTIONS,
  coverageFactorForConfidenceLevel,
  formatTypeBRelativeUncertainty,
  formatToFourDecimals,
  formatUncertaintyOfTestMu,
  newTypeAMeasurement,
  newUncertaintyContributor,
  normalizeConfidenceLevel,
  parseUncertaintyCalculationData,
  totalRelativeUncertaintyPercent,
  TYPE_B_SOURCE_TYPE_OPTIONS,
  typeARelativeUncertaintyPercent,
  relativeUncertaintyFromContributors,
  type TypeAMeasurement,
  type UncertaintyCalculationData,
  type UncertaintyContributor,
} from './testParameterUncertainty'

const CALIBRATION_CERTIFICATE_SOURCE = 'Calibration Certificate'

type UncertaintyImportSource = {
  id: string
  label: string
  itemName: string
  isCodeLabel: string | null
  testMethod: string | null
  clauseNo: string | null
  unitValue: string | null
  uncertaintyMu: string | null
  calculationData: unknown
}

function formatImportSourceLabel(source: {
  item_name: string
  is_code_label: string | null
  uncertainty_mu: string | null
  test_method: string | null
  clause_no: string | null
}): string {
  const parts = [
    source.item_name.trim(),
    source.is_code_label?.trim() || null,
    source.clause_no?.trim() ? `Cl ${source.clause_no.trim()}` : null,
    source.uncertainty_mu?.trim() || null,
  ].filter(Boolean)
  return parts.join(' · ')
}

function cloneImportedWorksheet(
  data: UncertaintyCalculationData,
  defaultUnit: string,
): {
  typeAMeasurements: TypeAMeasurement[]
  typeBContributors: UncertaintyContributor[]
  confidenceLevel: string
  coverageFactor: string
} {
  return {
    typeAMeasurements:
      data.typeAMeasurements.length > 0
        ? data.typeAMeasurements.map((m) => ({
            key: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            value: m.value.trim() ? formatToFourDecimals(m.value) : '',
          }))
        : [newTypeAMeasurement()],
    typeBContributors:
      data.typeBContributors.length > 0
        ? data.typeBContributors.map((c) => ({
            ...c,
            key: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            uncertaintyUnit: c.uncertaintyUnit || defaultUnit,
            uncertainty: c.uncertainty.trim() ? formatToFourDecimals(c.uncertainty) : '',
            measurement: c.measurement.trim() ? formatToFourDecimals(c.measurement) : '',
          }))
        : [newUncertaintyContributor(defaultUnit)],
    confidenceLevel: normalizeConfidenceLevel(data.confidenceLevel),
    coverageFactor:
      data.coverageFactor ||
      coverageFactorForConfidenceLevel(normalizeConfidenceLevel(data.confidenceLevel)),
  }
}

function normalizeTypeAMeasurements(measurements: TypeAMeasurement[]): TypeAMeasurement[] {
  if (measurements.length === 0) return [newTypeAMeasurement()]
  return measurements.map((m) => ({
    ...m,
    value: m.value.trim() ? formatToFourDecimals(m.value) : '',
  }))
}

function TypeAUncertaintySection({
  measurements,
  subtotal,
  stats,
  unitLabel,
  onChange,
}: {
  measurements: TypeAMeasurement[]
  subtotal: number
  stats: { n: number; mean: number; s: number }
  unitLabel?: string | null
  onChange: (next: TypeAMeasurement[]) => void
}) {
  const unitSuffix = unitLabel?.trim() ? ` (${unitLabel.trim()})` : ''
  const formatValue = (value: number) => `${value.toFixed(4)}${unitSuffix}`
  const relativeUncertaintyPercent =
    stats.n >= 2 && stats.mean !== 0 ? typeARelativeUncertaintyPercent(subtotal, stats.mean) : null

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Label className="text-sm font-semibold">Type A Uncertainty</Label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1 rounded-md border border-border">
          <table className="w-full table-fixed text-xs">
            <thead className="bg-stone-800">
              <tr>
                <th className="p-2 text-center font-medium w-[calc(50%-1.5rem)]">Reading</th>
                <th className="p-2 text-center font-medium w-[calc(50%-1.5rem)]">
                  Input Value{unitSuffix}
                </th>
                <th className="p-2 w-12 text-center" />
              </tr>
            </thead>
            <tbody>
              {measurements.map((m, index) => {
                const isLastRow = index === measurements.length - 1
                return (
                  <tr key={m.key} className="border-t border-border">
                    <td className="p-2 text-center font-medium text-muted-foreground">
                      Value {index + 1}
                    </td>
                    <td className="p-2 text-center">
                      <Input
                        className="text-center"
                        inputMode="decimal"
                        value={m.value}
                        placeholder={`Enter value ${index + 1}`}
                        onChange={(e) =>
                          onChange(
                            measurements.map((row) =>
                              row.key === m.key
                                ? { ...row, value: e.target.value.replace(/[^0-9.\-]/g, '') }
                                : row,
                            ),
                          )
                        }
                        onBlur={() => {
                          const formatted = formatToFourDecimals(m.value)
                          if (!formatted || formatted === m.value) return
                          onChange(
                            measurements.map((row) =>
                              row.key === m.key ? { ...row, value: formatted } : row,
                            ),
                          )
                        }}
                      />
                    </td>
                    <td className="p-2 text-center">
                      {isLastRow ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          aria-label="Add another value"
                          title="Add Another Value"
                          onClick={() => onChange([...measurements, newTypeAMeasurement()])}
                        >
                          <Plus size={14} />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={`Remove value ${index + 1}`}
                          onClick={() => onChange(measurements.filter((row) => row.key !== m.key))}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex w-full shrink-0 flex-col justify-center rounded-md border border-border bg-muted/20 p-3 sm:w-80">
          <p className="text-xs font-semibold">Type A Calculation</p>
          <dl className="mt-3 space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Average</dt>
              <dd className="text-right font-medium tabular-nums">
                {stats.n === 0 ? '—' : formatValue(stats.mean)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Mean</dt>
              <dd className="text-right font-medium tabular-nums">
                {stats.n === 0 ? '—' : formatValue(stats.mean)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Standard Deviation σ</dt>
              <dd className="text-right font-medium tabular-nums">
                {stats.n < 2 ? '—' : formatValue(stats.s)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">
                u<sub>A</sub> = σ / √{stats.n || 'n'} (Standard Error of Mean)
              </dt>
              <dd className="shrink-0 text-right font-medium tabular-nums">
                {stats.n < 2 ? '—' : formatValue(subtotal)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-border pt-2.5">
              <dt className="font-medium">
                Type A Relative Uncertainty u<sub>A</sub> (%)
              </dt>
              <dd className="text-right font-semibold tabular-nums">
                {relativeUncertaintyPercent == null ? '—' : `${relativeUncertaintyPercent.toFixed(4)} %`}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

function TypeBUncertaintySection({
  contributors,
  subtotal,
  defaultUncertaintyUnit,
  equipmentOptions,
  onChange,
}: {
  contributors: UncertaintyContributor[]
  subtotal: number
  defaultUncertaintyUnit?: string | null
  equipmentOptions: EquipmentUncertaintyOption[]
  onChange: (next: UncertaintyContributor[]) => void
}) {
  const [openEquipmentPickerKey, setOpenEquipmentPickerKey] = useState<string | null>(null)
  const defaultUnit = defaultUncertaintyUnit?.trim() ?? ''
  const [equipmentSearchByKey, setEquipmentSearchByKey] = useState<Record<string, string>>({})

  const updateContributor = (key: string, patch: Partial<UncertaintyContributor>) => {
    onChange(contributors.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  const updateContributorWithAutoRelative = (
    key: string,
    patch: Partial<UncertaintyContributor>,
  ) => {
    onChange(
      contributors.map((c) => {
        if (c.key !== key) return c
        const next = { ...c, ...patch }
        return {
          ...next,
          relativeUncertainty: formatTypeBRelativeUncertainty(next),
        }
      }),
    )
  }

  const handleSourceTypeChange = (key: string, nextType: string) => {
    onChange(
      contributors.map((c) =>
        c.key === key
          ? {
              ...c,
              sourceType: nextType,
              sourceName: '',
              equipmentId: '',
              uncertainty: '',
              uncertaintyUnit: defaultUnit,
              measurement: '',
              relativeUncertainty: '',
              divisor: '1',
            }
          : c,
      ),
    )
  }

  const handleEquipmentSelect = (key: string, option: EquipmentUncertaintyOption) => {
    const current = contributors.find((row) => row.key === key)
    const uncertainty = calibrationStandardUncertainty(option.uncertainty, option.coverageFactor)
    const measurement = current?.measurement ?? ''

    updateContributor(key, {
      equipmentId: option.id,
      sourceName: option.label,
      uncertainty,
      uncertaintyUnit: option.uncertaintyUnit || defaultUnit,
      divisor: '1',
      relativeUncertainty: measurement
        ? formatTypeBRelativeUncertainty({ uncertainty, measurement, divisor: '1' })
        : '',
    })
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Label className="text-sm font-semibold">Type B Uncertainty</Label>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-stone-800">
            <tr>
              <th className="p-2 text-left font-medium w-28">Type of Source</th>
              <th className="p-2 text-center font-medium">Source Name</th>
              <th className="p-2 text-center font-medium w-28">Standard Uncertainty</th>
              <th className="p-2 text-center font-medium w-28">Measurement</th>
              <th className="p-2 text-center font-medium w-28">Relative Uncertainty</th>
              <th className="p-2 w-12 text-center" />
            </tr>
          </thead>
          <tbody>
            {contributors.map((c, index) => {
              const isLastRow = index === contributors.length - 1
              const isCalibrationCertificate = c.sourceType === CALIBRATION_CERTIFICATE_SOURCE
              const isPickerOpen = openEquipmentPickerKey === c.key
              const equipmentSearch = isPickerOpen ? (equipmentSearchByKey[c.key] ?? '') : c.sourceName
              const equipmentPickerOptions = filterEquipmentUncertaintyOptions(
                isPickerOpen ? (equipmentSearchByKey[c.key] ?? '') : '',
                equipmentOptions,
              ).map((opt) => ({ id: opt.id, label: opt.label }))

              return (
                <tr key={c.key} className="border-t border-border">
                  <td className="p-2">
                    <Select
                      value={c.sourceType || undefined}
                      onValueChange={(value) => handleSourceTypeChange(c.key, value)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_B_SOURCE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    {isCalibrationCertificate ? (
                      <FilterCombobox
                        value={equipmentSearch}
                        onValueChange={(value) => {
                          setEquipmentSearchByKey((prev) => ({ ...prev, [c.key]: value }))
                          if (c.equipmentId) {
                            updateContributor(c.key, {
                              sourceName: '',
                              equipmentId: '',
                              uncertainty: '',
                              measurement: '',
                              relativeUncertainty: '',
                            })
                          }
                        }}
                        options={equipmentPickerOptions}
                        onSelectOption={(option) => {
                          const selected = equipmentOptions.find((item) => item.id === option.id)
                          if (selected) {
                            handleEquipmentSelect(c.key, selected)
                            setEquipmentSearchByKey((prev) => {
                              const next = { ...prev }
                              delete next[c.key]
                              return next
                            })
                          }
                        }}
                        open={isPickerOpen}
                        onOpenChange={(open) => {
                          if (open) {
                            setOpenEquipmentPickerKey(c.key)
                            setEquipmentSearchByKey((prev) => ({
                              ...prev,
                              [c.key]: prev[c.key] ?? '',
                            }))
                          } else {
                            setOpenEquipmentPickerKey((current) => (current === c.key ? null : current))
                          }
                        }}
                        onInputFocus={() => {
                          setEquipmentSearchByKey((prev) => ({
                            ...prev,
                            [c.key]: prev[c.key] ?? '',
                          }))
                        }}
                        placeholder="Search equipment..."
                        inputClassName="h-9 text-sm"
                        listId={`equipment-picker-${c.key}`}
                        dropdownPlacement="top"
                      />
                    ) : (
                      <Input
                        value={c.sourceName}
                        placeholder="Source name"
                        onChange={(e) => updateContributor(c.key, { sourceName: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="p-2">
                    <Input
                      className="text-center"
                      inputMode="decimal"
                      value={c.uncertainty}
                      onChange={(e) =>
                        updateContributorWithAutoRelative(c.key, {
                          uncertainty: e.target.value.replace(/[^0-9.]/g, ''),
                        })
                      }
                      onBlur={() => {
                        const formatted = formatToFourDecimals(c.uncertainty)
                        if (formatted !== c.uncertainty) {
                          updateContributorWithAutoRelative(c.key, { uncertainty: formatted })
                        }
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      className="text-center"
                      inputMode="decimal"
                      value={c.measurement}
                      placeholder="Value"
                      onChange={(e) =>
                        updateContributorWithAutoRelative(c.key, {
                          measurement: e.target.value.replace(/[^0-9.]/g, ''),
                        })
                      }
                    />
                  </td>
                  <td className="p-2">
                    <div className="relative">
                      <Input
                        className="text-center pr-7"
                        inputMode="decimal"
                        value={c.relativeUncertainty}
                        placeholder="Auto"
                        onChange={(e) =>
                          updateContributor(c.key, {
                            relativeUncertainty: e.target.value.replace(/[^0-9.]/g, ''),
                          })
                        }
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    {isLastRow ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        aria-label="Add source"
                        title="Add source"
                        onClick={() =>
                          onChange([...contributors, newUncertaintyContributor(defaultUnit)])
                        }
                      >
                        <Plus size={14} />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label="Remove source"
                        onClick={() => onChange(contributors.filter((rowItem) => rowItem.key !== c.key))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3">
        <p className="text-xs font-semibold">Type B Calculation</p>
        <dl className="mt-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="font-medium">Total Type B Uncertainty u<sub>B</sub></dt>
            <dd className="font-semibold tabular-nums">
              {subtotal > 0 ? `${subtotal.toFixed(4)} %` : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

export function TestParameterUncertaintyDialog({
  row,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  row: TestParameterRow | null
  open: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (uncertaintyMu: string, calculationData: UncertaintyCalculationData) => Promise<void>
}) {
  const [typeAMeasurements, setTypeAMeasurements] = useState<TypeAMeasurement[]>([newTypeAMeasurement()])
  const [typeBContributors, setTypeBContributors] = useState<UncertaintyContributor[]>([
    newUncertaintyContributor(),
  ])
  const [confidenceLevel, setConfidenceLevel] = useState('95')
  const [coverageFactor, setCoverageFactor] = useState('2')
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentUncertaintyOption[]>([])
  const [importSources, setImportSources] = useState<UncertaintyImportSource[]>([])
  const [importSearch, setImportSearch] = useState('')
  const [importPickerOpen, setImportPickerOpen] = useState(false)
  const [importPanelOpen, setImportPanelOpen] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !row) return
    const defaultUnit = row.unit_value?.trim() ?? ''
    const saved = parseUncertaintyCalculationData(row.uncertainty_calculation_data, defaultUnit)
    setImportSearch('')
    setImportPickerOpen(false)
    setImportPanelOpen(false)
    setImportMessage(null)

    if (saved) {
      setTypeAMeasurements(
        normalizeTypeAMeasurements(
          saved.typeAMeasurements.length > 0 ? saved.typeAMeasurements : [newTypeAMeasurement()],
        ),
      )
      setTypeBContributors(
        saved.typeBContributors.length > 0
          ? saved.typeBContributors
          : [newUncertaintyContributor(defaultUnit)],
      )
      const savedConfidence = normalizeConfidenceLevel(saved.confidenceLevel)
      setConfidenceLevel(savedConfidence)
      setCoverageFactor(saved.coverageFactor || coverageFactorForConfidenceLevel(savedConfidence))
      return
    }

    setTypeAMeasurements([newTypeAMeasurement()])
    setTypeBContributors([newUncertaintyContributor(defaultUnit)])
    setConfidenceLevel('95')
    setCoverageFactor('2')
  }, [open, row])

  useEffect(() => {
    if (!open) return
    void (async () => {
      const { data, error } = await supabase
        .from('equipment_master')
        .select(
          'id, asset_code, equipment_name, manufacturer, model_number, range_capacity, calibration_certificate_number, calibration_certificate_uncertainty, calibration_uncertainty_unit, calibration_coverage_factor, intermediate_check_result',
        )
        .order('equipment_name', { ascending: true })

      if (error) {
        console.warn('Failed to load equipment for uncertainty:', error)
        setEquipmentOptions([])
        return
      }

      setEquipmentOptions((data as EquipmentRow[] | null)?.map(buildEquipmentUncertaintyOption) ?? [])
    })()
  }, [open])

  useEffect(() => {
    if (!open || !row) return
    void (async () => {
      const { data, error } = await supabase
        .from('test_parameters')
        .select(
          'id, item_name, is_code_label, test_method, clause_no, unit_value, uncertainty_mu, uncertainty_calculation_data',
        )
        .not('uncertainty_calculation_data', 'is', null)
        .order('item_name', { ascending: true })

      if (error) {
        console.warn('Failed to load uncertainty import sources:', error)
        setImportSources([])
        return
      }

      const list = Array.isArray(data) ? data : []
      setImportSources(
        list
          .filter((item) => String(item.id) !== row.id && item.uncertainty_calculation_data != null)
          .map((item) => ({
            id: String(item.id),
            label: formatImportSourceLabel({
              item_name: String(item.item_name ?? ''),
              is_code_label: item.is_code_label ? String(item.is_code_label) : null,
              uncertainty_mu: item.uncertainty_mu ? String(item.uncertainty_mu) : null,
              test_method: item.test_method ? String(item.test_method) : null,
              clause_no: item.clause_no ? String(item.clause_no) : null,
            }),
            itemName: String(item.item_name ?? ''),
            isCodeLabel: item.is_code_label ? String(item.is_code_label) : null,
            testMethod: item.test_method ? String(item.test_method) : null,
            clauseNo: item.clause_no ? String(item.clause_no) : null,
            unitValue: item.unit_value ? String(item.unit_value) : null,
            uncertaintyMu: item.uncertainty_mu ? String(item.uncertainty_mu) : null,
            calculationData: item.uncertainty_calculation_data,
          })),
      )
    })()
  }, [open, row])

  const suggestedImportSources = useMemo(() => {
    if (!row) return importSources
    const itemName = row.item_name.trim().toLowerCase()
    const testMethod = row.test_method?.trim().toLowerCase() ?? ''
    const sameNameOrMethod = importSources.filter((source) => {
      const sourceName = source.itemName.trim().toLowerCase()
      const sourceMethod = source.testMethod?.trim().toLowerCase() ?? ''
      return (
        (itemName && sourceName === itemName) ||
        (testMethod && sourceMethod && sourceMethod === testMethod)
      )
    })
    return sameNameOrMethod.length > 0 ? sameNameOrMethod : importSources
  }, [importSources, row])

  const importPickerOptions = useMemo(() => {
    const q = importSearch.trim().toLowerCase()
    const pool = suggestedImportSources
    const filtered = !q
      ? pool
      : pool.filter(
          (source) =>
            source.label.toLowerCase().includes(q) ||
            source.itemName.toLowerCase().includes(q) ||
            source.isCodeLabel?.toLowerCase().includes(q) ||
            source.testMethod?.toLowerCase().includes(q) ||
            source.clauseNo?.toLowerCase().includes(q) ||
            source.uncertaintyMu?.toLowerCase().includes(q),
        )
    return filtered.slice(0, 50).map((source) => ({ id: source.id, label: source.label }))
  }, [importSearch, suggestedImportSources])

  const applyImportedSource = (sourceId: string) => {
    if (!row) return
    const source = importSources.find((item) => item.id === sourceId)
    if (!source) {
      setImportMessage('Selected test parameter was not found.')
      return
    }

    const defaultUnit = row.unit_value?.trim() ?? ''
    const parsed = parseUncertaintyCalculationData(source.calculationData, defaultUnit)
    if (!parsed) {
      setImportMessage('Selected test parameter has no usable uncertainty calculation data.')
      return
    }

    const cloned = cloneImportedWorksheet(parsed, defaultUnit)
    setTypeAMeasurements(cloned.typeAMeasurements)
    setTypeBContributors(cloned.typeBContributors)
    setConfidenceLevel(cloned.confidenceLevel)
    setCoverageFactor(cloned.coverageFactor)
    setImportSearch(source.label)
    setImportPickerOpen(false)
    setImportPanelOpen(false)
    setImportMessage(
      `Imported from ${source.itemName}${source.isCodeLabel ? ` (${source.isCodeLabel})` : ''}. Review and Save MU.`,
    )
  }

  const { uTypeA, uc, expanded, typeAStats } = useMemo(
    () => combineUncertaintyBudget(typeAMeasurements, typeBContributors, Number.parseFloat(coverageFactor)),
    [typeAMeasurements, typeBContributors, coverageFactor],
  )

  const uTypeBRelative = useMemo(
    () => relativeUncertaintyFromContributors(typeBContributors),
    [typeBContributors],
  )

  const totalRelativeUncertainty = useMemo(
    () => totalRelativeUncertaintyPercent(uTypeA, typeAStats, uTypeBRelative),
    [uTypeA, typeAStats, uTypeBRelative],
  )

  const unitLabel = row?.unit_value?.trim() ?? ''
  const unitSuffix = unitLabel ? ` ${unitLabel}` : ''

  const uncertaintyInUnitDisplay = useMemo(() => {
    if (expanded <= 0) return '—'
    return unitLabel ? `${expanded.toFixed(4)}${unitSuffix}` : expanded.toFixed(4)
  }, [expanded, unitLabel, unitSuffix])

  const computedResultMu = useMemo(
    () => formatUncertaintyOfTestMu(row?.unit_value, expanded, totalRelativeUncertainty),
    [row?.unit_value, expanded, totalRelativeUncertainty],
  )

  const handleConfidenceLevelChange = (level: string) => {
    const nextLevel = normalizeConfidenceLevel(level)
    setConfidenceLevel(nextLevel)
    setCoverageFactor(coverageFactorForConfidenceLevel(nextLevel))
  }

  const handleSave = async () => {
    const trimmed = computedResultMu.trim()
    if (!trimmed) return
    await onSave(
      trimmed,
      buildUncertaintyCalculationData({
        typeAMeasurements,
        typeBContributors,
        confidenceLevel,
        coverageFactor,
        referenceValue: '',
        resultMu: trimmed,
      }),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Uncertainty Calculation</DialogTitle>
        </DialogHeader>

        {row ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p>
                    <span className="text-muted-foreground">Test Parameter:</span>{' '}
                    <span className="font-medium">{row.item_name}</span>
                  </p>
                  {row.uncertainty_mu ? (
                    <p>
                      <span className="text-muted-foreground">Current MU:</span> {row.uncertainty_mu}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <p className="text-sm sm:text-right shrink-0">
                    <span className="text-muted-foreground">IS Code:</span> {row.is_code_label || '—'}
                    {row.clause_no ? ` · Clause ${row.clause_no}` : ''}
                    {row.unit_value ? ` · Unit ${row.unit_value}` : ''}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 self-end"
                    disabled={importSources.length === 0}
                    aria-expanded={importPanelOpen}
                    onClick={() => {
                      setImportPanelOpen((prev) => !prev)
                      setImportPickerOpen(false)
                      setImportMessage(null)
                      if (importPanelOpen) setImportSearch('')
                    }}
                  >
                    <Download size={14} />
                    Import Uncertainty Data
                  </Button>
                </div>
              </div>

              {importPanelOpen ? (
                <div className="rounded-md border border-border bg-background/80 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Search another test parameter (same test / method under another IS Code) to import Type A,
                    Type B, and summary settings.
                  </p>
                  <FilterCombobox
                    value={importSearch}
                    onValueChange={(value) => {
                      setImportSearch(value)
                      setImportMessage(null)
                    }}
                    options={importPickerOptions}
                    onSelectOption={(option) => applyImportedSource(option.id)}
                    open={importPickerOpen}
                    onOpenChange={setImportPickerOpen}
                    placeholder="Search by test name / IS code / method / MU..."
                    inputClassName="h-9 text-sm"
                    listId="uncertainty-import-picker"
                    dropdownPlacement="bottom"
                  />
                  {importMessage ? (
                    <p className="text-xs text-primary">{importMessage}</p>
                  ) : suggestedImportSources.length > 0 &&
                    suggestedImportSources.length < importSources.length ? (
                    <p className="text-xs text-muted-foreground">
                      Showing matching test name / method first ({suggestedImportSources.length} of{' '}
                      {importSources.length}).
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {importSources.length} saved uncertainty source
                      {importSources.length === 1 ? '' : 's'} available.
                    </p>
                  )}
                </div>
              ) : importMessage ? (
                <p className="text-xs text-primary text-right">{importMessage}</p>
              ) : null}
            </div>

            <TypeAUncertaintySection
              measurements={typeAMeasurements}
              subtotal={uTypeA}
              stats={typeAStats}
              unitLabel={row.unit_value}
              onChange={setTypeAMeasurements}
            />

            <TypeBUncertaintySection
              contributors={typeBContributors}
              subtotal={uTypeBRelative}
              defaultUncertaintyUnit={row.unit_value}
              equipmentOptions={equipmentOptions}
              onChange={setTypeBContributors}
            />

            <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-semibold">Combined Uncertainty Summary</p>
              <div className="overflow-x-auto">
                <div className="grid min-w-[920px] grid-cols-5 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex justify-center text-center">Total Relative Uncertainty</Label>
                    <div className="flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm tabular-nums text-center">
                      {totalRelativeUncertainty > 0 ? `${totalRelativeUncertainty.toFixed(4)} %` : '—'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex justify-center text-center">Combined Uncertainty</Label>
                    <div className="flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm tabular-nums text-center">
                      {uc > 0 ? `${uc.toFixed(4)}${unitSuffix}` : '—'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tp-unc-confidence" className="flex justify-center text-center">
                      Confidence Level
                    </Label>
                    <Select value={confidenceLevel} onValueChange={handleConfidenceLevelChange}>
                      <SelectTrigger id="tp-unc-confidence" className="justify-center text-center [&>span]:text-center">
                        <SelectValue placeholder="Select confidence level" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONFIDENCE_LEVEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label} (k = {option.coverageFactor})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tp-unc-k" className="flex justify-center text-center">
                      Coverage Factor
                    </Label>
                    <Input
                      id="tp-unc-k"
                      readOnly
                      value={coverageFactor}
                      className="bg-muted/40 text-center"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex justify-center text-center">Uncertainty of Test in Unit</Label>
                    <div className="flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm tabular-nums text-center">
                      {uncertaintyInUnitDisplay}
                    </div>
                  </div>
                </div>
              </div>
              {computedResultMu ? (
                <p className="text-xs text-muted-foreground">
                  Save MU will store: <span className="font-medium text-foreground">{computedResultMu}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !computedResultMu.trim()}>
            {saving ? 'Saving…' : 'Save MU'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
