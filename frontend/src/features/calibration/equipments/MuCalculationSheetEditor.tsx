import { Fragment, useMemo, useState } from 'react'
import { Calculator, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import {
  emptyColumnFormula,
  type RawDataColumnFormula,
  type RawDataSheetColumn,
} from '@/features/calibration/rawDataSheetTypes'
import {
  ColumnCalculationDialog,
  formulaRefLocation,
} from '@/features/calibration/equipments/RawDataSheetTemplateEditor'
import {
  MU_CALIBRATION_POINT_FIELD_KEY,
  emptyMuSheetColumn,
  emptyMuSheetTable,
  flattenMuSectionColumns,
  isMuEquipmentRangeFieldKey,
  muBuiltInExternalColumns,
  type MuCalculationTemplate,
  type MuFormulaSourceColumn,
  type MuSheetSection,
  type MuSheetTable,
} from './muCalculationTypes'

const muThClass =
  'border border-stone-700 bg-stone-800 px-2 py-2 text-center text-[10px] font-bold uppercase leading-tight tracking-[0.08em] text-amber-200'
const muTdClass = 'border border-[#e7e0d4] px-2 py-2 align-middle'

type FormulaRefKind = 'sheet' | 'rds' | 'point' | 'typeA' | 'typeB' | 'calc' | 'range'

function MuSheetTableEditor({
  table,
  tableIndex,
  canRemove,
  onChange,
  onRemove,
  formulaSourceColumns,
  externalColumns,
  externalRefKindOf,
  sectionEnabled,
  onSectionEnabledChange,
}: {
  table: MuSheetTable
  tableIndex: number
  canRemove: boolean
  onChange: (next: MuSheetTable) => void
  onRemove: () => void
  /** Other columns in this Type section (same + sibling tables) for formulas. */
  formulaSourceColumns: MuFormulaSourceColumn[]
  externalColumns: MuFormulaSourceColumn[]
  externalRefKindOf?: (key: string) => FormulaRefKind
  sectionEnabled?: boolean
  onSectionEnabledChange?: (enabled: boolean) => void
}) {
  const [calculationColumnKey, setCalculationColumnKey] = useState<string | null>(null)

  const updateColumn = (key: string, patch: Partial<RawDataSheetColumn>) => {
    onChange({
      ...table,
      columns: table.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    })
  }

  const changeColumnType = (col: RawDataSheetColumn, type: RawDataSheetColumn['type']) => {
    if (type === 'formula') {
      updateColumn(col.key, {
        type,
        formula: col.formula ?? emptyColumnFormula(),
      })
      setCalculationColumnKey(col.key)
      return
    }
    onChange({
      ...table,
      columns: table.columns.map((c) => {
        if (c.key !== col.key) return c
        const next: RawDataSheetColumn = { ...c, type }
        delete next.formula
        return next
      }),
    })
    if (calculationColumnKey === col.key) setCalculationColumnKey(null)
  }

  const updateFormula = (col: RawDataSheetColumn, patch: Partial<RawDataColumnFormula>) => {
    updateColumn(col.key, {
      formula: { ...(col.formula ?? emptyColumnFormula()), ...patch },
    })
  }

  const addColumn = () => {
    onChange({
      ...table,
      columns: [...table.columns, emptyMuSheetColumn()],
    })
  }

  const removeColumn = (key: string) => {
    if (calculationColumnKey === key) setCalculationColumnKey(null)
    onChange({
      ...table,
      columns: table.columns.filter((c) => c.key !== key),
    })
  }

  const moveColumn = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= table.columns.length) return
    const cols = [...table.columns]
    ;[cols[index], cols[next]] = [cols[next]!, cols[index]!]
    onChange({ ...table, columns: cols })
  }

  const calculationColumn =
    table.columns.find((c) => c.key === calculationColumnKey && c.type === 'formula') ?? null

  return (
    <div className="space-y-2 rounded-none border-2 border-stone-300 bg-[#fffcf7] p-2.5">
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <label
          htmlFor={`mu-component-name-${table.id}`}
          className="flex h-8 shrink-0 items-center text-xs font-semibold text-stone-700"
        >
          Component Name
        </label>
        <Input
          id={`mu-component-name-${table.id}`}
          value={table.label}
          onChange={(e) => onChange({ ...table, label: e.target.value })}
          className={cn(limsFieldClass, 'h-8 min-w-0 max-w-sm flex-1 bg-white text-sm')}
          placeholder="e.g. Resolution / Reference std"
          aria-label={`Component ${tableIndex + 1} name`}
        />
        {onSectionEnabledChange ? (
          <label className="ml-auto flex shrink-0 items-center gap-2 text-xs font-medium text-stone-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-700"
              checked={Boolean(sectionEnabled)}
              onChange={(e) => onSectionEnabledChange(e.target.checked)}
              aria-label={`Enable ${table.label || `component ${tableIndex + 1}`}`}
            />
            Enabled
          </label>
        ) : null}
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1 text-destructive hover:bg-destructive/10"
            onClick={onRemove}
            aria-label={`Remove component ${tableIndex + 1}`}
          >
            <Trash2 size={14} />
            Remove
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-none border-2 border-stone-400 bg-white">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(muThClass, 'w-16')}>Order</th>
              <th className={muThClass}>Column label</th>
              <th className={cn(muThClass, 'w-28')}>Type</th>
              <th className={cn(muThClass, 'w-24')}>Required</th>
              <th className={cn(muThClass, 'w-32')}>Required in Certificate</th>
              <th className={cn(muThClass, 'w-16')}>Action</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border border-[#e7e0d4] bg-[#fffcf7] px-3 py-8 text-center text-stone-500"
                >
                  <p className="mb-3 text-sm">No columns yet — add fields like Raw Data Sheet Format.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsOutlineBtnClass, 'gap-1.5')}
                    onClick={addColumn}
                    aria-label={`Add first column to component ${tableIndex + 1}`}
                  >
                    <Plus size={14} />
                    Add column
                  </Button>
                </td>
              </tr>
            ) : (
              table.columns.map((col, index) => {
                const isFormula = col.type === 'formula'
                return (
                  <Fragment key={col.key}>
                    <tr className={index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                      <td className={cn(muTdClass, 'px-1 text-center')}>
                        <div className="flex items-center justify-center gap-0.5">
                          <GripVertical size={14} className="text-stone-400" aria-hidden />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1 text-xs"
                            disabled={index === 0}
                            onClick={() => moveColumn(index, -1)}
                            aria-label={`Move column ${index + 1} up`}
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1 text-xs"
                            disabled={index === table.columns.length - 1}
                            onClick={() => moveColumn(index, 1)}
                            aria-label={`Move column ${index + 1} down`}
                          >
                            ↓
                          </Button>
                        </div>
                      </td>
                      <td className={muTdClass}>
                        <div className="flex items-center gap-2">
                          <Input
                            value={col.label}
                            onChange={(e) => updateColumn(col.key, { label: e.target.value })}
                            placeholder={
                              isFormula ? 'e.g. Combined u' : 'e.g. Resolution'
                            }
                            className={limsFieldClass}
                            aria-label={`Column label ${index + 1}`}
                          />
                          {isFormula ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 shrink-0 border-indigo-600/40 text-indigo-800 hover:bg-indigo-50"
                              onClick={() => setCalculationColumnKey(col.key)}
                              aria-label={`Column calculation for ${col.label || `column ${index + 1}`}`}
                              title="Set formula"
                            >
                              <Calculator size={16} />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className={cn(muTdClass, 'text-center')}>
                        <Select
                          value={col.type}
                          onValueChange={(v) =>
                            changeColumnType(
                              col,
                              v === 'number' ? 'number' : v === 'formula' ? 'formula' : 'text',
                            )
                          }
                        >
                          <SelectTrigger
                            className={cn(limsFieldClass, 'mx-auto w-[110px]')}
                            aria-label={`Column type ${index + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="formula">Calculated</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={cn(muTdClass, 'text-center')}>
                        <input
                          type="checkbox"
                          className="mx-auto block h-4 w-4 accent-amber-700"
                          checked={col.required !== false}
                          onChange={(e) =>
                            updateColumn(col.key, { required: e.target.checked })
                          }
                          aria-label={`Required column ${index + 1}`}
                        />
                      </td>
                      <td className={cn(muTdClass, 'text-center')}>
                        <input
                          type="checkbox"
                          className="mx-auto block h-4 w-4 accent-amber-700"
                          checked={col.requiredInCertificate !== false}
                          onChange={(e) =>
                            updateColumn(col.key, {
                              requiredInCertificate: e.target.checked,
                            })
                          }
                          aria-label={`Required in certificate for ${col.label || `column ${index + 1}`}`}
                          title="If checked, this column is shown on the calibration certificate"
                        />
                      </td>
                      <td className={cn(muTdClass, 'text-center')}>
                        <div className="flex items-center justify-center gap-1">
                          {index === table.columns.length - 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 px-0 text-amber-800 hover:bg-amber-50 hover:text-amber-950"
                              onClick={addColumn}
                              aria-label="Add column"
                            >
                              <Plus size={16} />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                              onClick={() => removeColumn(col.key)}
                              aria-label={`Delete column ${index + 1}`}
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <ColumnCalculationDialog
        open={calculationColumn != null}
        onOpenChange={(open) => {
          if (!open) setCalculationColumnKey(null)
        }}
        column={calculationColumn}
        columns={formulaSourceColumns}
        envColumns={externalColumns}
        onUpdateFormula={updateFormula}
        layer="stacked"
        locationOf={(col) => {
          const fromKey = formulaRefLocation(col)
          if (fromKey !== 'This Table') return fromKey
          const kind = externalRefKindOf?.(col.key)
          if (kind === 'rds') return 'Raw Data Sheet'
          if (kind === 'point') return 'Calibration Point'
          if (kind === 'range') return 'Range'
          if (kind === 'typeA') return 'Type A'
          if (kind === 'typeB') return 'Type B'
          if (kind === 'calc') return 'Calculation'
          const fromSection = formulaSourceColumns.find((c) => c.key === col.key)
          if (fromSection?.componentLabel?.trim()) return fromSection.componentLabel.trim()
          return 'This Table'
        }}
      />
    </div>
  )
}

function MuSheetSectionEditor({
  title,
  section,
  onChange,
  externalColumns,
  externalRefKindOf,
}: {
  title: string
  section: MuSheetSection
  onChange: (next: MuSheetSection) => void
  externalColumns: MuFormulaSourceColumn[]
  externalRefKindOf?: (key: string) => FormulaRefKind
}) {
  const tables =
    section.tables.length > 0 ? section.tables : [emptyMuSheetTable('Component 1')]

  const setTables = (nextTables: MuSheetTable[]) => {
    onChange({
      ...section,
      tables: nextTables.length > 0 ? nextTables : [emptyMuSheetTable('Component 1')],
    })
  }

  const updateTable = (id: string, next: MuSheetTable) => {
    setTables(tables.map((t) => (t.id === id ? next : t)))
  }

  const addTable = () => {
    setTables([
      ...tables,
      emptyMuSheetTable(`Component ${tables.length + 1}`),
    ])
  }

  const removeTable = (id: string) => {
    if (tables.length <= 1) return
    setTables(tables.filter((t) => t.id !== id))
  }

  const sectionColumns = flattenMuSectionColumns({ ...section, tables })

  return (
    <div className={cn(limsPanelClass, 'space-y-0')}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={limsDarkBarGlowStyle}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
            {title}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsDarkBarBtnClass, 'h-7 gap-1 px-2 text-[11px]')}
            onClick={addTable}
            aria-label={`Add ${title} component table`}
          >
            <Plus size={13} />
            Add component
          </Button>
        </div>
      </div>

      <div className="space-y-3 bg-gradient-to-b from-stone-100/80 to-white p-3">
        <div className="space-y-3">
          {tables.map((table, index) => (
            <MuSheetTableEditor
              key={table.id}
              table={table}
              tableIndex={index}
              canRemove={tables.length > 1}
              onChange={(next) => updateTable(table.id, next)}
              onRemove={() => removeTable(table.id)}
              formulaSourceColumns={sectionColumns}
              externalColumns={externalColumns}
              externalRefKindOf={externalRefKindOf}
              sectionEnabled={index === 0 ? section.enabled : undefined}
              onSectionEnabledChange={
                index === 0
                  ? (enabled) => onChange({ ...section, enabled })
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function MuCalculationSheetEditor({
  value,
  onChange,
  rawDataSheetColumns = [],
}: {
  value: MuCalculationTemplate
  onChange: (next: MuCalculationTemplate) => void
  /** Columns from equipment Raw Data Sheet Format (formula refs). */
  rawDataSheetColumns?: Array<{ key: string; label: string; type?: string }>
}) {
  const baseExternalColumns = useMemo((): MuFormulaSourceColumn[] => {
    const builtIn = muBuiltInExternalColumns()
    const builtInKeys = new Set(builtIn.map((c) => c.key))
    const rds: MuFormulaSourceColumn[] = rawDataSheetColumns
      .filter((c) => c.key.trim() && !builtInKeys.has(c.key))
      .map((c) => ({
        key: c.key,
        label: c.label.trim() || c.key,
        type:
          c.type === 'formula' ? 'formula' : c.type === 'text' ? 'text' : 'number',
        required: false,
      }))
    return [...rds, ...builtIn]
  }, [rawDataSheetColumns])

  const typeAColumns = useMemo(
    () => flattenMuSectionColumns(value.typeA),
    [value.typeA],
  )
  const typeBColumns = useMemo(
    () => flattenMuSectionColumns(value.typeB),
    [value.typeB],
  )

  /** Calculation can reference Type A + Type B + RDS + built-in range/point fields. */
  const calculationExternalColumns = useMemo((): MuFormulaSourceColumn[] => {
    const seen = new Set<string>()
    const merged: MuFormulaSourceColumn[] = []
    for (const col of [...typeAColumns, ...typeBColumns, ...baseExternalColumns]) {
      if (seen.has(col.key)) continue
      seen.add(col.key)
      merged.push(col)
    }
    return merged
  }, [typeAColumns, typeBColumns, baseExternalColumns])

  const baseRefKindOf = (key: string): FormulaRefKind => {
    if (key === MU_CALIBRATION_POINT_FIELD_KEY) return 'point'
    if (isMuEquipmentRangeFieldKey(key)) return 'range'
    if (baseExternalColumns.some((c) => c.key === key)) return 'rds'
    return 'sheet'
  }

  const calculationRefKindOf = (key: string): FormulaRefKind => {
    if (typeAColumns.some((c) => c.key === key)) return 'typeA'
    if (typeBColumns.some((c) => c.key === key)) return 'typeB'
    return baseRefKindOf(key)
  }

  const patch = (partial: Partial<MuCalculationTemplate>) => {
    onChange({
      ...value,
      calculation: value.calculation ?? {
        enabled: true,
        label: 'Calculation',
        tables: [emptyMuSheetTable('Component 1')],
      },
      // Preserve sheet field in template JSON even though UI editor is removed.
      uncertaintyBudgetSheet: value.uncertaintyBudgetSheet ?? {
        enabled: true,
        label: 'Uncertainty Budget',
        tables: [emptyMuSheetTable('Component 1')],
      },
      ...partial,
    })
  }

  const calculationSection =
    value.calculation ?? {
      enabled: true,
      label: 'Calculation',
      tables: [emptyMuSheetTable('Component 1')],
    }

  return (
    <div className="space-y-4">
      <MuSheetSectionEditor
        title="Type A"
        section={value.typeA}
        onChange={(typeA) => patch({ typeA })}
        externalColumns={baseExternalColumns}
        externalRefKindOf={baseRefKindOf}
      />

      <MuSheetSectionEditor
        title="Type B"
        section={value.typeB}
        onChange={(typeB) => patch({ typeB })}
        externalColumns={baseExternalColumns}
        externalRefKindOf={baseRefKindOf}
      />

      <MuSheetSectionEditor
        title="Calculation"
        section={calculationSection}
        onChange={(calculation) => patch({ calculation })}
        externalColumns={calculationExternalColumns}
        externalRefKindOf={calculationRefKindOf}
      />
    </div>
  )
}
