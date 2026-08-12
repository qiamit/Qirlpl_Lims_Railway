import { Fragment, useEffect, useMemo, useState } from 'react'
import { Calculator, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { ColumnCalculationDialog } from '@/features/calibration/equipments/RawDataSheetTemplateEditor'
import {
  emptyColumnFormula,
  type RawDataColumnFormula,
  type RawDataSheetColumn,
} from '@/features/calibration/rawDataSheetTypes'
import {
  emptyCalibrationPointRow,
  emptyCalibrationPointsColumn,
  newCalibrationColumnId,
  type CalibrationPointsColumn,
  type CalibrationPointsColumnType,
  type CalibrationPointRow,
} from './types'
import {
  calibrationColumnToRaw,
  equipmentFormulaRefColumns,
} from './calibrationPointsFormula'

const MAX_SETUP_COLUMNS = 12

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: CalibrationPointsColumn[]
  rows: CalibrationPointRow[]
  onApply: (columns: CalibrationPointsColumn[], rows: CalibrationPointRow[]) => void
  title?: string
  layer?: 'nested' | 'stacked' | 'top'
}

export function CalibrationPointsTableSetupDialog({
  open,
  onOpenChange,
  columns,
  rows,
  onApply,
  title,
  layer = 'stacked',
}: Props) {
  const [draft, setDraft] = useState<CalibrationPointsColumn[]>([])
  const [calculationColumnId, setCalculationColumnId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setCalculationColumnId(null)
      return
    }
    if (columns.length > 0) {
      setDraft(
        columns.map((c) => ({
          ...c,
          type: c.type || 'number',
          ...(c.type === 'formula' && !c.formula ? { formula: emptyColumnFormula() } : {}),
        })),
      )
    } else {
      setDraft([emptyCalibrationPointsColumn('', 'number')])
    }
    setCalculationColumnId(null)
    // Re-init only when Create Table opens — not when parent columns identity changes mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const rawColumns: RawDataSheetColumn[] = useMemo(
    () => draft.map(calibrationColumnToRaw),
    [draft],
  )

  const calculationColumn = useMemo(() => {
    if (!calculationColumnId) return null
    return rawColumns.find((c) => c.key === calculationColumnId) ?? null
  }, [calculationColumnId, rawColumns])

  const equipmentRefs = useMemo(() => equipmentFormulaRefColumns(), [])

  const updateColumn = (id: string, patch: Partial<CalibrationPointsColumn>) => {
    setDraft((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const changeColumnType = (col: CalibrationPointsColumn, type: CalibrationPointsColumnType) => {
    if (type === 'formula') {
      updateColumn(col.id, {
        type: 'formula',
        required: false,
        formula: col.formula ?? emptyColumnFormula(),
      })
      setCalculationColumnId(col.id)
      return
    }
    updateColumn(col.id, {
      type,
      formula: undefined,
      required: Boolean(col.required),
    })
  }

  const addColumn = () => {
    setDraft((prev) => {
      if (prev.length >= MAX_SETUP_COLUMNS) return prev
      return [...prev, emptyCalibrationPointsColumn('', 'number')]
    })
  }

  const removeColumn = (id: string) => {
    setDraft((prev) => prev.filter((c) => c.id !== id))
    if (calculationColumnId === id) setCalculationColumnId(null)
  }

  const moveColumn = (index: number, delta: number) => {
    setDraft((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item!)
      return next
    })
  }

  const handleUpdateFormula = (col: RawDataSheetColumn, patch: Partial<RawDataColumnFormula>) => {
    setDraft((prev) =>
      prev.map((c) => {
        if (c.id !== col.key) return c
        return {
          ...c,
          type: 'formula',
          required: false,
          formula: { ...(c.formula ?? emptyColumnFormula()), ...patch },
        }
      }),
    )
  }

  const apply = () => {
    const cleaned = draft
      .map((c, i) => ({
        ...c,
        id: c.id || newCalibrationColumnId(),
        header: c.header.trim() || `Column ${i + 1}`,
        type: c.type || 'number',
        ...(c.type === 'formula'
          ? { formula: c.formula ?? emptyColumnFormula(), required: false }
          : { formula: undefined }),
      }))
      .filter((c) => c.header.trim().length > 0)

    if (cleaned.length === 0) return

    const nextRows =
      rows.length > 0
        ? rows.map((r) => {
            const values: Record<string, string> = {}
            for (const col of cleaned) {
              values[col.id] = r.values[col.id] ?? ''
            }
            return { ...r, values }
          })
        : [emptyCalibrationPointRow(cleaned)]

    onApply(cleaned, nextRows)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          layer={layer}
          aria-describedby={undefined}
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          className={cn(
            limsDialogClass,
            'flex max-h-[min(90dvh,44rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col',
            'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2',
            'md:w-[min(48rem,calc(100vw-268px-2rem))] md:max-w-[min(48rem,calc(100vw-268px-2rem))]',
            'md:!-translate-x-1/2 md:!-translate-y-1/2',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {title ?? (columns.length > 0 ? 'Edit Table' : 'Create Table')}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5',
              labRegistryFormClass,
            )}
          >
            <div className="overflow-x-auto rounded-none border-2 border-stone-400 bg-white">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                  <tr>
                    <th className="border border-stone-700 px-2 py-2 w-10">#</th>
                    <th className="border border-stone-700 px-2 py-2 text-left">Column Name</th>
                    <th className="border border-stone-700 px-2 py-2 w-[120px]">Type</th>
                    <th className="border border-stone-700 px-2 py-2 w-24">Required</th>
                    <th className="border border-stone-700 px-2 py-2 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.map((col, index) => {
                    const isFormula = col.type === 'formula'
                    return (
                      <Fragment key={col.id}>
                        <tr className="align-middle">
                          <td className="border border-stone-300 px-1 py-2 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[11px] text-slate-500">{index + 1}</span>
                              <div className="flex gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1 text-xs"
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
                                  className="h-6 px-1 text-xs"
                                  disabled={index === draft.length - 1}
                                  onClick={() => moveColumn(index, 1)}
                                  aria-label={`Move column ${index + 1} down`}
                                >
                                  ↓
                                </Button>
                              </div>
                            </div>
                          </td>
                          <td className="border border-stone-300 px-2 py-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={col.header}
                                onChange={(e) => updateColumn(col.id, { header: e.target.value })}
                                placeholder={
                                  isFormula ? 'e.g. Temp Corrected' : 'e.g. Nominal Value'
                                }
                                className="h-9"
                                aria-label={`Column name ${index + 1}`}
                              />
                              {isFormula ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className={cn('h-9 w-9 shrink-0', limsOutlineBtnClass)}
                                  onClick={() => setCalculationColumnId(col.id)}
                                  aria-label={`Set formula for ${col.header || `column ${index + 1}`}`}
                                  title="Set formula"
                                >
                                  <Calculator size={16} />
                                </Button>
                              ) : null}
                            </div>
                          </td>
                          <td className="border border-stone-300 px-2 py-2 text-center">
                            <Select
                              value={col.type || 'number'}
                              onValueChange={(v) =>
                                changeColumnType(
                                  col,
                                  v === 'number'
                                    ? 'number'
                                    : v === 'formula'
                                      ? 'formula'
                                      : 'text',
                                )
                              }
                            >
                              <SelectTrigger
                                className="mx-auto h-9 w-[110px]"
                                aria-label={`Column type ${index + 1}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="z-[80]">
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="formula">Calculated</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="border border-stone-300 px-2 py-2 text-center">
                            {isFormula ? (
                              <span className="text-[11px] text-muted-foreground">Auto</span>
                            ) : (
                              <input
                                type="checkbox"
                                className="mx-auto block h-4 w-4 accent-amber-700"
                                checked={Boolean(col.required)}
                                onChange={(e) =>
                                  updateColumn(col.id, { required: e.target.checked })
                                }
                                title="Show this column in the generated table"
                                aria-label={`Show column ${index + 1} in generated table`}
                              />
                            )}
                          </td>
                          <td className="border border-stone-300 px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {index === draft.length - 1 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 px-0 text-amber-800 hover:bg-amber-500/15 hover:text-amber-950"
                                  disabled={draft.length >= MAX_SETUP_COLUMNS}
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
                                  onClick={() => removeColumn(col.id)}
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
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={apply}
              disabled={draft.length === 0}
            >
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ColumnCalculationDialog
        open={calculationColumn != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCalculationColumnId(null)
        }}
        column={calculationColumn}
        columns={rawColumns}
        envColumns={equipmentRefs}
        onUpdateFormula={handleUpdateFormula}
        layer="top"
      />
    </>
  )
}
