import { useMemo, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  RawDataSheetColumn,
  RawDataSheetPayloadRow,
  RawDataSheetRowValues,
} from '@/features/calibration/rawDataSheetTypes'
import {
  flattenMuSectionColumns,
  muBuiltInExternalColumns,
  muCalculationTemplateFromRaw,
  type MuCalculationTemplate,
  type MuSheetSection,
  type MuSheetTable,
} from '@/features/calibration/equipments/muCalculationTypes'
import {
  buildMuBuiltinValues,
  emptyValuesForMuTable,
  evaluateMuTableValues,
  flattenSectionTableValues,
  importRdsValuesIntoMuTable,
  muTemplateHasUsableSections,
  pickExpandedUncertaintyDisplay,
  sectionHasConfiguredColumns,
  sectionRequiredFieldsFilled,
  type MuEquipmentRangeContext,
} from '@/features/calibration/equipments/muCalcEngine'

type WizardStepKind = 'typeA' | 'typeB' | 'calculation'

type WizardStep = {
  kind: WizardStepKind
  title: string
}

/** Per RDS row → per MU component table → cell values. */
type MuByRdsRow = Record<string, Record<string, RawDataSheetRowValues>>

/** Evaluated MU sections for one RDS row — feeds View Budget dialog. */
type RowBudgetBreakdown = {
  point: string
  baseExternalValues: RawDataSheetRowValues
  calcExternalValues: RawDataSheetRowValues
  typeAFlat: RawDataSheetRowValues
  typeBFlat: RawDataSheetRowValues
  calcFlat: RawDataSheetRowValues
  budgetSheetFlat: RawDataSheetRowValues
  typeATableValues: Record<string, RawDataSheetRowValues>
  typeBTableValues: Record<string, RawDataSheetRowValues>
  calcTableValues: Record<string, RawDataSheetRowValues>
  budgetSheetTableValues: Record<string, RawDataSheetRowValues>
}

type RowKeyOutput = {
  rowId: string
  rowIndex: number
  point: string
  expandedLabel: string
  expandedValue: string
  combinedLabel: string
  combinedValue: string
}

function stepTitleForSection(kind: WizardStepKind, section: MuSheetSection): string {
  const label = section.label.trim()
  if (label) return label
  if (kind === 'typeA') return 'Type A — Repeatability'
  if (kind === 'typeB') return 'Type B — Contributions'
  return 'Calculation'
}

function buildWizardSteps(template: MuCalculationTemplate): WizardStep[] {
  const steps: WizardStep[] = []
  if (sectionHasConfiguredColumns(template.typeA)) {
    steps.push({ kind: 'typeA', title: stepTitleForSection('typeA', template.typeA) })
  }
  if (sectionHasConfiguredColumns(template.typeB)) {
    steps.push({ kind: 'typeB', title: stepTitleForSection('typeB', template.typeB) })
  }
  if (sectionHasConfiguredColumns(template.calculation)) {
    steps.push({
      kind: 'calculation',
      title: stepTitleForSection('calculation', template.calculation),
    })
  }
  return steps
}

function initSectionTableValues(section: MuSheetSection): Record<string, RawDataSheetRowValues> {
  const out: Record<string, RawDataSheetRowValues> = {}
  for (const table of section.tables) {
    out[table.id] = emptyValuesForMuTable(table)
  }
  return out
}

function importRdsIntoSection(
  section: MuSheetSection,
  current: Record<string, RawDataSheetRowValues>,
  rdsColumns: RawDataSheetColumn[],
  rdsValues: RawDataSheetRowValues,
): Record<string, RawDataSheetRowValues> {
  const next = { ...current }
  for (const table of section.tables) {
    next[table.id] = importRdsValuesIntoMuTable(
      table,
      current[table.id] ?? emptyValuesForMuTable(table),
      rdsColumns,
      rdsValues,
    )
  }
  return next
}

/** Build MU section values for every Raw Data Sheet row (fill number cols from RDS). */
function initSectionForAllRows(
  section: MuSheetSection,
  rdsColumns: RawDataSheetColumn[],
  rdsRows: RawDataSheetPayloadRow[],
): MuByRdsRow {
  const out: MuByRdsRow = {}
  for (const row of rdsRows) {
    out[row.id] = importRdsIntoSection(
      section,
      initSectionTableValues(section),
      rdsColumns,
      row.values,
    )
  }
  return out
}

function rowPointLabel(
  row: RawDataSheetPayloadRow,
  columns: RawDataSheetColumn[],
): string {
  if (row.pointValue?.trim()) return row.pointValue.trim()
  const key = columns.find((c) => /nominal|point|load/i.test(c.label))?.key
  if (!key) return ''
  return String(row.values[key] ?? '').trim()
}

/** Numeric parse for Point labels (e.g. "100", "10.5"); null if non-numeric. */
function parsePointNumeric(label: string): number | null {
  const t = label.trim().replace(/,/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Ascending by numeric Point; non-numeric / empty last, then string compare. */
function comparePointLabels(a: string, b: string): number {
  const na = parsePointNumeric(a)
  const nb = parsePointNumeric(b)
  if (na != null && nb != null) return na - nb
  if (na != null) return -1
  if (nb != null) return 1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function sortRdsRowsByPoint(
  rdsRows: RawDataSheetPayloadRow[],
  columns: RawDataSheetColumn[],
): RawDataSheetPayloadRow[] {
  return [...rdsRows].sort((ra, rb) =>
    comparePointLabels(rowPointLabel(ra, columns), rowPointLabel(rb, columns)),
  )
}

export function UncertaintyStepByStepDialog({
  open,
  onOpenChange,
  columns,
  rows,
  decimalPlaces,
  muCalculationTemplate,
  equipmentRange,
  onApplyUncertainty,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: RawDataSheetColumn[]
  rows: RawDataSheetPayloadRow[]
  decimalPlaces: number
  /** Equipment MU Calculation Sheet template (drive_from_mu). */
  muCalculationTemplate?: MuCalculationTemplate | Record<string, unknown> | null
  /** Matched measurement range fields for built-in MU formula refs. */
  equipmentRange?: MuEquipmentRangeContext | null
  /** Optional: push expanded U into Generate Report uncertainty field. */
  onApplyUncertainty?: (expandedU: string) => void
}) {
  const template = useMemo(
    () => muCalculationTemplateFromRaw(muCalculationTemplate ?? null),
    [muCalculationTemplate],
  )
  const hasTemplate = muTemplateHasUsableSections(template)
  const wizardSteps = useMemo(
    () => (hasTemplate ? buildWizardSteps(template) : []),
    [hasTemplate, template],
  )

  const [stepIndex, setStepIndex] = useState(0)
  /** Selected RDS row feeds Apply / highlighted USE. */
  const [rowId, setRowId] = useState('')
  const [budgetViewRowId, setBudgetViewRowId] = useState<string | null>(null)
  const [typeAByRdsRow, setTypeAByRdsRow] = useState<MuByRdsRow>({})
  const [typeBByRdsRow, setTypeBByRdsRow] = useState<MuByRdsRow>({})
  const [calcByRdsRow, setCalcByRdsRow] = useState<MuByRdsRow>({})

  const dp = Math.max(
    0,
    Math.min(6, Number.isFinite(template.decimalPlaces) ? template.decimalPlaces : decimalPlaces),
  )

  const selectedRow = rows.find((r) => r.id === rowId) ?? rows[0] ?? null

  const baseExternalColumns = useMemo((): RawDataSheetColumn[] => {
    const builtIn = muBuiltInExternalColumns()
    const builtInKeys = new Set(builtIn.map((c) => c.key))
    const rds = columns.filter((c) => c.key.trim() && !builtInKeys.has(c.key))
    return [...rds, ...builtIn]
  }, [columns])

  const calcExternalColumns = useMemo((): RawDataSheetColumn[] => {
    const seen = new Set<string>()
    const merged: RawDataSheetColumn[] = []
    for (const col of [
      ...flattenMuSectionColumns(template.typeA),
      ...flattenMuSectionColumns(template.typeB),
      ...baseExternalColumns,
    ]) {
      if (seen.has(col.key)) continue
      seen.add(col.key)
      merged.push(col)
    }
    return merged
  }, [template.typeA, template.typeB, baseExternalColumns])

  useEffect(() => {
    if (!open) return
    const firstRow = rows[0]
    setStepIndex(0)
    setRowId(firstRow?.id ?? '')
    setBudgetViewRowId(null)
    setTypeAByRdsRow(initSectionForAllRows(template.typeA, columns, rows))
    setTypeBByRdsRow(initSectionForAllRows(template.typeB, columns, rows))
    setCalcByRdsRow(initSectionForAllRows(template.calculation, columns, rows))
  }, [open, rows, template, columns])

  /** Per-RDS-row Calculation flat values (Type A / Type B / RDS / builtins as externals). */
  const buildCalcContextForRow = (
    rdsRow: RawDataSheetPayloadRow,
  ): {
    baseExternalValues: RawDataSheetRowValues
    typeAFlat: RawDataSheetRowValues
    typeBFlat: RawDataSheetRowValues
    calcExternalValues: RawDataSheetRowValues
    calcFlat: RawDataSheetRowValues
  } => {
    const point = rowPointLabel(rdsRow, columns)
    const baseExternalValues: RawDataSheetRowValues = {
      ...rdsRow.values,
      ...buildMuBuiltinValues(point, equipmentRange),
    }
    const typeATables =
      typeAByRdsRow[rdsRow.id] ?? initSectionTableValues(template.typeA)
    const typeBTables =
      typeBByRdsRow[rdsRow.id] ?? initSectionTableValues(template.typeB)
    const calcTables =
      calcByRdsRow[rdsRow.id] ?? initSectionTableValues(template.calculation)
    const typeAFlat = flattenSectionTableValues(
      template.typeA,
      typeATables,
      dp,
      baseExternalColumns,
      baseExternalValues,
    )
    const typeBFlat = flattenSectionTableValues(
      template.typeB,
      typeBTables,
      dp,
      baseExternalColumns,
      baseExternalValues,
    )
    const calcExternalValues: RawDataSheetRowValues = {
      ...baseExternalValues,
      ...typeAFlat,
      ...typeBFlat,
    }
    const calcFlat = flattenSectionTableValues(
      template.calculation,
      calcTables,
      dp,
      calcExternalColumns,
      calcExternalValues,
    )
    return { baseExternalValues, typeAFlat, typeBFlat, calcExternalValues, calcFlat }
  }

  const selectedTypeAValues = useMemo((): Record<string, RawDataSheetRowValues> => {
    if (!selectedRow) return initSectionTableValues(template.typeA)
    return typeAByRdsRow[selectedRow.id] ?? initSectionTableValues(template.typeA)
  }, [selectedRow, typeAByRdsRow, template.typeA])

  const selectedTypeBValues = useMemo((): Record<string, RawDataSheetRowValues> => {
    if (!selectedRow) return initSectionTableValues(template.typeB)
    return typeBByRdsRow[selectedRow.id] ?? initSectionTableValues(template.typeB)
  }, [selectedRow, typeBByRdsRow, template.typeB])

  const selectedCalcValues = useMemo((): Record<string, RawDataSheetRowValues> => {
    if (!selectedRow) return initSectionTableValues(template.calculation)
    return calcByRdsRow[selectedRow.id] ?? initSectionTableValues(template.calculation)
  }, [selectedRow, calcByRdsRow, template.calculation])

  const selectedContext = useMemo(() => {
    if (!selectedRow) {
      return {
        typeAFlat: {} as RawDataSheetRowValues,
        typeBFlat: {} as RawDataSheetRowValues,
        calcFlat: {} as RawDataSheetRowValues,
      }
    }
    return buildCalcContextForRow(selectedRow)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when row/section inputs change
  }, [
    selectedRow,
    typeAByRdsRow,
    typeBByRdsRow,
    calcByRdsRow,
    template,
    columns,
    equipmentRange,
    dp,
    baseExternalColumns,
    calcExternalColumns,
  ])

  const calcFlat = selectedContext.calcFlat

  const expandedPick = useMemo(
    () =>
      pickExpandedUncertaintyDisplay(
        template.calculation,
        calcFlat,
        template.coverageFactorK,
      ),
    [template.calculation, calcFlat, template.coverageFactorK],
  )

  const allRowKeyOutputs = useMemo((): RowKeyOutput[] => {
    const mapped = rows.map((rdsRow, index) => {
      const { calcFlat: rowCalcFlat } = buildCalcContextForRow(rdsRow)
      const pick = pickExpandedUncertaintyDisplay(
        template.calculation,
        rowCalcFlat,
        template.coverageFactorK,
      )
      const combined = pickCombinedUncertaintyDisplay(template.calculation, rowCalcFlat)
      return {
        rowId: rdsRow.id,
        rowIndex: index,
        point: rowPointLabel(rdsRow, columns),
        expandedLabel: pick?.label ?? 'Expanded U',
        expandedValue: pick?.value ?? '',
        combinedLabel: combined?.label ?? 'Combined U',
        combinedValue: combined?.value ?? '',
      }
    })
    return mapped.sort((a, b) => comparePointLabels(a.point, b.point))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows,
    typeAByRdsRow,
    typeBByRdsRow,
    calcByRdsRow,
    template,
    columns,
    equipmentRange,
    dp,
    baseExternalColumns,
    calcExternalColumns,
  ])

  const keyOutputByRowId = useMemo(() => {
    const map: Record<string, RowKeyOutput> = {}
    for (const row of allRowKeyOutputs) map[row.rowId] = row
    return map
  }, [allRowKeyOutputs])

  const rowBudgetById = useMemo(() => {
    const map: Record<string, RowBudgetBreakdown> = {}
    for (const rdsRow of rows) {
      const point = rowPointLabel(rdsRow, columns)
      const ctx = buildCalcContextForRow(rdsRow)
      const budgetSheetTableValues = initSectionTableValues(template.uncertaintyBudgetSheet)
      const budgetSheetFlat = sectionHasConfiguredColumns(template.uncertaintyBudgetSheet)
        ? flattenSectionTableValues(
            template.uncertaintyBudgetSheet,
            budgetSheetTableValues,
            dp,
            calcExternalColumns,
            ctx.calcExternalValues,
          )
        : {}
      map[rdsRow.id] = {
        point,
        baseExternalValues: ctx.baseExternalValues,
        calcExternalValues: ctx.calcExternalValues,
        typeAFlat: ctx.typeAFlat,
        typeBFlat: ctx.typeBFlat,
        calcFlat: ctx.calcFlat,
        budgetSheetFlat,
        typeATableValues:
          typeAByRdsRow[rdsRow.id] ?? initSectionTableValues(template.typeA),
        typeBTableValues:
          typeBByRdsRow[rdsRow.id] ?? initSectionTableValues(template.typeB),
        calcTableValues:
          calcByRdsRow[rdsRow.id] ?? initSectionTableValues(template.calculation),
        budgetSheetTableValues,
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows,
    typeAByRdsRow,
    typeBByRdsRow,
    calcByRdsRow,
    template,
    columns,
    equipmentRange,
    dp,
    baseExternalColumns,
    calcExternalColumns,
  ])

  const currentStep = wizardSteps[stepIndex] ?? null

  const budgetViewRow = budgetViewRowId ? keyOutputByRowId[budgetViewRowId] : undefined
  const budgetViewBreakdown = budgetViewRowId ? rowBudgetById[budgetViewRowId] : undefined

  const patchTypeACell = (rdsRowId: string, tableId: string, key: string, value: string) => {
    setTypeAByRdsRow((prev) => {
      const rowTables = prev[rdsRowId] ?? initSectionTableValues(template.typeA)
      return {
        ...prev,
        [rdsRowId]: {
          ...rowTables,
          [tableId]: { ...(rowTables[tableId] ?? {}), [key]: value },
        },
      }
    })
  }

  const patchTypeBCell = (rdsRowId: string, tableId: string, key: string, value: string) => {
    setTypeBByRdsRow((prev) => {
      const rowTables = prev[rdsRowId] ?? initSectionTableValues(template.typeB)
      return {
        ...prev,
        [rdsRowId]: {
          ...rowTables,
          [tableId]: { ...(rowTables[tableId] ?? {}), [key]: value },
        },
      }
    })
  }

  const patchCalcCell = (rdsRowId: string, tableId: string, key: string, value: string) => {
    setCalcByRdsRow((prev) => {
      const rowTables = prev[rdsRowId] ?? initSectionTableValues(template.calculation)
      return {
        ...prev,
        [rdsRowId]: {
          ...rowTables,
          [tableId]: { ...(rowTables[tableId] ?? {}), [key]: value },
        },
      }
    })
  }

  /** Select which RDS row feeds Apply / highlighted USE. */
  const onSelectRdsRow = (id: string) => {
    setRowId(id)
  }

  const canNext = (() => {
    if (!hasTemplate || !currentStep) return false
    if (currentStep.kind === 'typeA') {
      if (!selectedRow) return false
      return sectionRequiredFieldsFilled(template.typeA, selectedTypeAValues)
    }
    if (currentStep.kind === 'typeB') {
      if (!selectedRow) return false
      return sectionRequiredFieldsFilled(template.typeB, selectedTypeBValues)
    }
    if (currentStep.kind === 'calculation') {
      if (!selectedRow) return false
      return sectionRequiredFieldsFilled(template.calculation, selectedCalcValues)
    }
    return true
  })()

  const goNext = () => {
    if (stepIndex < wizardSteps.length - 1 && canNext) setStepIndex((s) => s + 1)
  }
  const goBack = () => {
    if (stepIndex > 0) setStepIndex((s) => s - 1)
  }

  const renderTypeAStep = () => {
    const tables = template.typeA.tables.filter((t) => t.columns.length > 0)
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No Raw Data Sheet rows available.</p>
        ) : tables.length === 0 ? (
          <p className="text-sm text-slate-500">No components configured for this section.</p>
        ) : (
          tables.map((table, tableIndex) => (
            <MuSectionMultiRowEditor
              key={table.id || `tbl-${tableIndex}`}
              table={table}
              tableIndex={tableIndex}
              rdsRows={rows}
              rdsColumns={columns}
              valuesByRdsRow={typeAByRdsRow}
              selectedRowId={selectedRow?.id ?? ''}
              useRadioName="uncertainty-type-a-use"
              decimalPlaces={dp}
              equipmentRange={equipmentRange}
              baseExternalColumns={baseExternalColumns}
              onSelectRow={onSelectRdsRow}
              onChangeCell={(rdsRowId, key, value) =>
                patchTypeACell(rdsRowId, table.id, key, value)
              }
            />
          ))
        )}
      </div>
    )
  }

  const renderTypeBStep = () => {
    const tables = template.typeB.tables.filter((t) => t.columns.length > 0)
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No Raw Data Sheet rows available.</p>
        ) : tables.length === 0 ? (
          <p className="text-sm text-slate-500">No components configured for this section.</p>
        ) : (
          tables.map((table, tableIndex) => (
            <MuSectionMultiRowEditor
              key={table.id || `tbl-${tableIndex}`}
              table={table}
              tableIndex={tableIndex}
              rdsRows={rows}
              rdsColumns={columns}
              valuesByRdsRow={typeBByRdsRow}
              selectedRowId={selectedRow?.id ?? ''}
              useRadioName="uncertainty-type-b-use"
              decimalPlaces={dp}
              equipmentRange={equipmentRange}
              baseExternalColumns={baseExternalColumns}
              onSelectRow={onSelectRdsRow}
              onChangeCell={(rdsRowId, key, value) =>
                patchTypeBCell(rdsRowId, table.id, key, value)
              }
            />
          ))
        )}
      </div>
    )
  }

  const renderCalculationStep = () => {
    const tables = template.calculation.tables.filter((t) => t.columns.length > 0)
    const budgetTableIndex = tables.length > 0 ? tables.length - 1 : -1
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No Raw Data Sheet rows available.</p>
        ) : tables.length === 0 ? (
          <p className="text-sm text-slate-500">No components configured for this section.</p>
        ) : (
          tables.map((table, tableIndex) => (
            <MuSectionMultiRowEditor
              key={table.id || `tbl-${tableIndex}`}
              table={table}
              tableIndex={tableIndex}
              rdsRows={rows}
              rdsColumns={columns}
              valuesByRdsRow={calcByRdsRow}
              selectedRowId={selectedRow?.id ?? ''}
              useRadioName="uncertainty-calc-use"
              decimalPlaces={dp}
              equipmentRange={equipmentRange}
              baseExternalColumns={calcExternalColumns}
              buildExternalValues={(rdsRow) =>
                buildCalcContextForRow(rdsRow).calcExternalValues
              }
              onSelectRow={onSelectRdsRow}
              onChangeCell={(rdsRowId, key, value) =>
                patchCalcCell(rdsRowId, table.id, key, value)
              }
              showBudgetColumn={tableIndex === budgetTableIndex}
              keyOutputByRowId={keyOutputByRowId}
              rowBudgetById={rowBudgetById}
              onViewBudget={setBudgetViewRowId}
            />
          ))
        )}
      </div>
    )
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
            <DialogTitle className="text-xl font-semibold tracking-tight text-white">
              Uncertainty Calculation — Step by Step
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
          {!hasTemplate ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-950">
              <p className="font-medium">MU Calculation Sheet is not configured</p>
              <p className="mt-2 text-xs leading-relaxed text-amber-900/90">
                Open Calibration Equipments → edit this equipment → configure Type A, Type B, and
                Calculation columns on the MU Calculation Sheet. Required fields and calculated
                (Auto) columns defined there will appear in this wizard.
              </p>
            </div>
          ) : (
            <>
              <ol className="flex flex-wrap gap-1.5">
                {wizardSteps.map((s, index) => (
                  <li key={`${s.kind}-${index}`}>
                    <button
                      type="button"
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                        stepIndex === index
                          ? 'border-teal-600 bg-teal-50 text-teal-900'
                          : stepIndex > index
                            ? 'border-slate-300 bg-white text-slate-700'
                            : 'border-slate-200 bg-slate-50 text-slate-400',
                      )}
                      onClick={() => {
                        if (index <= stepIndex) setStepIndex(index)
                      }}
                    >
                      {index + 1}. {s.title}
                    </button>
                  </li>
                ))}
              </ol>

              {currentStep?.kind === 'typeA' ? renderTypeAStep() : null}

              {currentStep?.kind === 'typeB' ? renderTypeBStep() : null}

              {currentStep?.kind === 'calculation' ? renderCalculationStep() : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1"
            disabled={stepIndex <= 0 || !hasTemplate}
            onClick={goBack}
          >
            <ChevronLeft size={14} />
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {currentStep?.kind === 'calculation' && expandedPick && onApplyUncertainty ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-teal-600/40 text-teal-800"
                onClick={() => {
                  onApplyUncertainty(expandedPick.value)
                  onOpenChange(false)
                }}
              >
                Use {expandedPick.label} in Generate Report
              </Button>
            ) : null}
            {hasTemplate && stepIndex < wizardSteps.length - 1 ? (
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1 bg-teal-600 text-white hover:bg-teal-500"
                disabled={!canNext}
                onClick={goNext}
              >
                Next
                <ChevronRight size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-9 bg-teal-600 text-white hover:bg-teal-500"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            )}
          </div>
        </div>

        {budgetViewRow && budgetViewBreakdown ? (
          <PointUncertaintyBudgetDialog
            open={budgetViewRowId !== null}
            onOpenChange={(next) => {
              if (!next) setBudgetViewRowId(null)
            }}
            template={template}
            breakdown={budgetViewBreakdown}
            combinedLabel={budgetViewRow.combinedLabel}
            combinedValue={budgetViewRow.combinedValue}
            expandedLabel={budgetViewRow.expandedLabel}
            expandedValue={budgetViewRow.expandedValue}
            decimalPlaces={dp}
            baseExternalColumns={baseExternalColumns}
            calcExternalColumns={calcExternalColumns}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** One MU component table with one data row per Raw Data Sheet row (Type A / Type B / Calculation). */
function MuSectionMultiRowEditor({
  table,
  tableIndex,
  rdsRows,
  rdsColumns,
  valuesByRdsRow,
  selectedRowId,
  useRadioName,
  decimalPlaces,
  equipmentRange,
  baseExternalColumns,
  buildExternalValues,
  onSelectRow,
  onChangeCell,
  showBudgetColumn = false,
  keyOutputByRowId,
  rowBudgetById,
  onViewBudget,
}: {
  table: MuSheetTable
  tableIndex: number
  rdsRows: RawDataSheetPayloadRow[]
  rdsColumns: RawDataSheetColumn[]
  valuesByRdsRow: MuByRdsRow
  selectedRowId: string
  useRadioName: string
  decimalPlaces: number
  equipmentRange?: MuEquipmentRangeContext | null
  baseExternalColumns: RawDataSheetColumn[]
  /** Override per-row external formula inputs (e.g. Calculation merges Type A / Type B). */
  buildExternalValues?: (rdsRow: RawDataSheetPayloadRow) => RawDataSheetRowValues
  onSelectRow: (rdsRowId: string) => void
  onChangeCell: (rdsRowId: string, key: string, value: string) => void
  /** Calculation step: show View Budget column (one row per point). */
  showBudgetColumn?: boolean
  keyOutputByRowId?: Record<string, RowKeyOutput>
  rowBudgetById?: Record<string, RowBudgetBreakdown>
  onViewBudget?: (rdsRowId: string) => void
}) {
  const label = table.label.trim() || `Component ${tableIndex + 1}`
  const sortedRdsRows = useMemo(
    () => sortRdsRowsByPoint(rdsRows, rdsColumns),
    [rdsRows, rdsColumns],
  )

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/40 p-2.5">
      <p className="text-xs font-semibold text-slate-800">{label}</p>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full table-auto border-collapse text-center text-sm">
          <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap border border-slate-200 px-2 py-2 text-center">
                USE
              </th>
              <th className="whitespace-nowrap border border-slate-200 px-2 py-2 text-center">
                <span className="normal-case tracking-normal">Point</span>
              </th>
              {table.columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap border border-slate-200 px-2 py-2 text-center',
                    col.type === 'formula' && 'bg-teal-50/60 text-teal-900',
                  )}
                >
                  <span className="normal-case tracking-normal">
                    {col.label || col.key}
                    {col.required && col.type !== 'formula' ? (
                      <span className="ml-0.5 text-red-500">*</span>
                    ) : null}
                  </span>
                </th>
              ))}
              {showBudgetColumn ? (
                <th className="whitespace-nowrap border border-slate-200 px-2 py-2 text-center">
                  Uncertainty Budget
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sortedRdsRows.map((rdsRow, rowIndex) => {
              const rawValues =
                valuesByRdsRow[rdsRow.id]?.[table.id] ?? emptyValuesForMuTable(table)
              const point = rowPointLabel(rdsRow, rdsColumns)
              const externalValues: RawDataSheetRowValues = buildExternalValues
                ? buildExternalValues(rdsRow)
                : {
                    ...rdsRow.values,
                    ...buildMuBuiltinValues(point, equipmentRange),
                  }
              const evaluated = evaluateMuTableValues(
                table,
                rawValues,
                decimalPlaces,
                baseExternalColumns,
                externalValues,
              )
              const isSelected = selectedRowId === rdsRow.id
              const keyOut = keyOutputByRowId?.[rdsRow.id]
              const breakdown = rowBudgetById?.[rdsRow.id]
              const canViewBudget =
                showBudgetColumn &&
                rowHasComputableBudget(
                  keyOut?.point ?? point,
                  keyOut?.combinedValue ?? '',
                  keyOut?.expandedValue ?? '',
                  breakdown,
                )
              return (
                <tr
                  key={rdsRow.id}
                  className={cn(isSelected && 'bg-teal-50/30')}
                >
                  <td className="whitespace-nowrap border border-slate-200 px-1.5 py-1.5 text-center">
                    <input
                      type="radio"
                      name={useRadioName}
                      checked={isSelected}
                      onChange={() => onSelectRow(rdsRow.id)}
                      aria-label={`Select row ${rowIndex + 1}`}
                      className="h-4 w-4 accent-teal-600"
                    />
                  </td>
                  <td className="whitespace-nowrap border border-slate-200 px-2 py-1.5 text-center font-mono text-xs text-slate-700">
                    {point || '—'}
                  </td>
                  {table.columns.map((col) => {
                    const isFormula = col.type === 'formula'
                    const display = evaluated[col.key] ?? ''
                    const missingRequired =
                      !isFormula && col.required && !String(rawValues[col.key] ?? '').trim()
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          'whitespace-nowrap border border-slate-200 px-1.5 py-1.5 text-center',
                          isFormula && 'bg-teal-50/40',
                          missingRequired && 'bg-amber-50/50',
                        )}
                      >
                        {isFormula ? (
                          <p className="px-1 text-center font-mono text-xs font-semibold text-teal-900">
                            {display.trim() || '—'}
                          </p>
                        ) : (
                          <Input
                            type={col.type === 'number' ? 'number' : 'text'}
                            step="any"
                            value={rawValues[col.key] ?? ''}
                            onChange={(e) => onChangeCell(rdsRow.id, col.key, e.target.value)}
                            className={cn(
                              'mx-auto h-8 bg-white text-center font-mono text-xs',
                              missingRequired && 'border-amber-400',
                            )}
                            aria-label={`${col.label || col.key} row ${rowIndex + 1}`}
                            aria-required={col.required}
                            placeholder={col.required ? 'Required' : ''}
                          />
                        )}
                      </td>
                    )
                  })}
                  {showBudgetColumn ? (
                    <td className="whitespace-nowrap border border-slate-200 px-1.5 py-1.5 text-center">
                      {canViewBudget ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-teal-600/40 px-2 text-[11px] text-teal-800 hover:bg-teal-50"
                          onClick={() => onViewBudget?.(rdsRow.id)}
                          aria-label={`View uncertainty budget for point ${point || rowIndex + 1}`}
                        >
                          View Budget
                        </Button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function pickCombinedUncertaintyDisplay(
  calculation: MuSheetSection | null | undefined,
  calcValues: RawDataSheetRowValues,
): { label: string; value: string } | null {
  if (!calculation) return null
  const cols = flattenMuSectionColumns(calculation)
  const formulaCols = cols.filter((c) => c.type === 'formula')
  const ucCol =
    formulaCols.find((c) => /combined/i.test(c.label)) ??
    formulaCols.find((c) => /u\s*c\b|uc\b|standard\s*uncertainty/i.test(c.label)) ??
    null
  if (!ucCol) return null
  const v = String(calcValues[ucCol.key] ?? '').trim()
  if (!v) return null
  return { label: ucCol.label || 'Combined U', value: v }
}

function rowHasComputableBudget(
  point: string,
  combinedValue: string,
  expandedValue: string,
  breakdown: RowBudgetBreakdown | undefined,
): boolean {
  if (!point.trim()) return false
  if (combinedValue.trim() || expandedValue.trim()) return true
  if (!breakdown) return false
  const hasData = (flat: RawDataSheetRowValues) =>
    Object.values(flat).some((v) => String(v ?? '').trim() !== '')
  return (
    hasData(breakdown.typeAFlat) ||
    hasData(breakdown.typeBFlat) ||
    hasData(breakdown.calcFlat) ||
    hasData(breakdown.budgetSheetFlat)
  )
}

function muColumnFormulaHint(col: { type: string; formula?: { expression?: string | null } }): string {
  if (col.type !== 'formula') return 'Input'
  const expr = String(col.formula?.expression ?? '').trim()
  return expr || 'Calculated'
}

/** Read-only component tables for one RDS row inside View Budget dialog. */
function SingleRowMuSectionBreakdown({
  section,
  subtitle,
  tableValues,
  decimalPlaces,
  externalColumns,
  externalValues,
}: {
  section: MuSheetSection
  subtitle: string
  tableValues: Record<string, RawDataSheetRowValues>
  decimalPlaces: number
  externalColumns: RawDataSheetColumn[]
  externalValues: RawDataSheetRowValues
}) {
  const tables = section.tables.filter((t) => t.columns.length > 0)
  if (tables.length === 0) return null

  const evaluatedByTableId: Record<string, RawDataSheetRowValues> = {}
  const chain: RawDataSheetRowValues = { ...externalValues }
  for (const table of tables) {
    const rawValues = tableValues[table.id] ?? emptyValuesForMuTable(table)
    const evaluated = evaluateMuTableValues(
      table,
      rawValues,
      decimalPlaces,
      externalColumns,
      chain,
    )
    evaluatedByTableId[table.id] = evaluated
    Object.assign(chain, evaluated)
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{subtitle}</p>
      {tables.map((table, tableIndex) => {
        const rawValues = tableValues[table.id] ?? emptyValuesForMuTable(table)
        const evaluated = evaluatedByTableId[table.id] ?? rawValues
        return (
          <div
            key={table.id || `tbl-${tableIndex}`}
            className="overflow-x-auto rounded-md border border-slate-200"
          >
            {tables.length > 1 ? (
              <p className="border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-center text-[11px] font-medium text-slate-600">
                {table.label.trim() || `Component ${tableIndex + 1}`}
              </p>
            ) : null}
            <table className="w-full table-auto border-collapse text-center text-xs">
              <thead className="bg-white text-[10px] font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Field</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-center">Type</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-center">Formula</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-center">Value</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((col) => {
                  const isFormula = col.type === 'formula'
                  const display = isFormula
                    ? String(evaluated[col.key] ?? '').trim()
                    : String(rawValues[col.key] ?? '').trim()
                  return (
                    <tr key={col.key} className="border-t border-slate-100">
                      <td className="border border-slate-200 px-2 py-1.5 text-left text-slate-700">
                        {col.label || col.key}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">
                        {isFormula ? 'Calculated' : 'Input'}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-left font-mono text-[10px] text-slate-500">
                        {muColumnFormulaHint(col)}
                      </td>
                      <td
                        className={cn(
                          'border border-slate-200 px-2 py-1.5 text-center font-mono',
                          isFormula && 'bg-teal-50/40 font-semibold text-teal-900',
                        )}
                      >
                        {display || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function PointUncertaintyBudgetDialog({
  open,
  onOpenChange,
  template,
  breakdown,
  combinedLabel,
  combinedValue,
  expandedLabel,
  expandedValue,
  decimalPlaces,
  baseExternalColumns,
  calcExternalColumns,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: MuCalculationTemplate
  breakdown: RowBudgetBreakdown
  combinedLabel: string
  combinedValue: string
  expandedLabel: string
  expandedValue: string
  decimalPlaces: number
  baseExternalColumns: RawDataSheetColumn[]
  calcExternalColumns: RawDataSheetColumn[]
}) {
  const coverageK = Number.isFinite(template.coverageFactorK)
    ? String(template.coverageFactorK)
    : ''
  const point = breakdown.point.trim() || '—'
  const typeAExternalValues = breakdown.baseExternalValues
  const typeBExternalValues = breakdown.baseExternalValues
  const calcExternalValues = breakdown.calcExternalValues

  const showTypeA = sectionHasConfiguredColumns(template.typeA)
  const showTypeB = sectionHasConfiguredColumns(template.typeB)
  const showCalculation = sectionHasConfiguredColumns(template.calculation)
  const showBudgetSheet = sectionHasConfiguredColumns(template.uncertaintyBudgetSheet)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90dvh,720px)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        layer="nested"
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-3 text-left sm:px-5">
          <DialogTitle className="text-base font-semibold text-slate-900">
            Uncertainty Budget — Point {point}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-5">
          <dl className="grid gap-2 rounded-md border border-teal-200 bg-teal-50/30 px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">Point</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-800">{point}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">
                {combinedLabel || 'Combined Uncertainty'}
              </dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-800">
                {combinedValue.trim() || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">
                Coverage Factor
              </dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-800">
                {coverageK ? `k = ${coverageK}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">
                {expandedLabel || 'Expanded Uncertainty'}
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-teal-900">
                {expandedValue.trim() || '—'}
              </dd>
            </div>
          </dl>

          {showTypeA ? (
            <SingleRowMuSectionBreakdown
              section={template.typeA}
              subtitle={template.typeA.label.trim() || 'Type A'}
              tableValues={breakdown.typeATableValues}
              decimalPlaces={decimalPlaces}
              externalColumns={baseExternalColumns}
              externalValues={typeAExternalValues}
            />
          ) : null}

          {showTypeB ? (
            <SingleRowMuSectionBreakdown
              section={template.typeB}
              subtitle={template.typeB.label.trim() || 'Type B'}
              tableValues={breakdown.typeBTableValues}
              decimalPlaces={decimalPlaces}
              externalColumns={baseExternalColumns}
              externalValues={typeBExternalValues}
            />
          ) : null}

          {showCalculation ? (
            <SingleRowMuSectionBreakdown
              section={template.calculation}
              subtitle={template.calculation.label.trim() || 'Calculation'}
              tableValues={breakdown.calcTableValues}
              decimalPlaces={decimalPlaces}
              externalColumns={calcExternalColumns}
              externalValues={calcExternalValues}
            />
          ) : null}

          {showBudgetSheet ? (
            <SingleRowMuSectionBreakdown
              section={template.uncertaintyBudgetSheet}
              subtitle={
                template.uncertaintyBudgetSheet.label.trim() || 'Uncertainty Budget Sheet'
              }
              tableValues={breakdown.budgetSheetTableValues}
              decimalPlaces={decimalPlaces}
              externalColumns={calcExternalColumns}
              externalValues={calcExternalValues}
            />
          ) : null}

          <p className="text-[11px] text-slate-500">
            Decimal places: {decimalPlaces}. Calculated fields are evaluated from wizard inputs and
            linked Raw Data Sheet values.
          </p>
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-200 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

