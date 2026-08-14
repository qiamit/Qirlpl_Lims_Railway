import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Plus,
  Sigma,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { MasterFormulaRefSource } from '@/features/calibration/masterEquipmentFormulaRefs'
import { CalibrationPointsTableSetupDialog } from './CalibrationPointsTableSetupDialog'
import { computeCalibrationPointRowValuesFromMaster } from './calibrationPointsFormula'
import {
  evaluatePointFormula,
  formatFormulaResult,
  validatePointFormula,
} from './pointFormula'
import { ScientificFormulaPad } from './ScientificFormulaPad'
import {
  emptyCalibrationPointRow,
  visibleCalibrationPointsColumns,
  type CalibrationPointsColumn,
  type CalibrationPointRow,
} from './types'

function DialogChrome({ title }: { title: string }) {
  return (
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
  )
}

function newFormulaXRowId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}

export type MasterCalibrationPointsEditorProps = {
  columns: CalibrationPointsColumn[]
  rows: CalibrationPointRow[]
  onChange: (next: {
    columns: CalibrationPointsColumn[]
    rows: CalibrationPointRow[]
  }) => void
  /** Optional master fields for formula columns (asset, temp, humidity, …). */
  formulaMaster?: MasterFormulaRefSource | null
  title?: string
  readOnly?: boolean
  className?: string
  /** Nested dialog stacking for Create Table / Generate. */
  dialogLayer?: 'nested' | 'stacked' | 'top'
  inputIdPrefix?: string
  headerExtra?: ReactNode
}

/**
 * Shared Create Table / Generate New Points / editable points grid
 * (same UX as Equipment for Calibration → Calibration Points).
 */
export function MasterCalibrationPointsEditor({
  columns,
  rows,
  onChange,
  formulaMaster = null,
  title = 'Master Calibration Points',
  readOnly = false,
  className,
  dialogLayer = 'stacked',
  inputIdPrefix = 'mcp',
  headerExtra,
}: MasterCalibrationPointsEditorProps) {
  const [pointsSetupOpen, setPointsSetupOpen] = useState(false)
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(() => new Set())
  const [pointsSortColId, setPointsSortColId] = useState<string | null>(null)
  const [pointsSortDir, setPointsSortDir] = useState<'asc' | 'desc'>('asc')

  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false)
  const [formulaSourceColId, setFormulaSourceColId] = useState('')
  const [formulaTargetColId, setFormulaTargetColId] = useState('')
  const [formulaExpr, setFormulaExpr] = useState('')
  const [formulaDecimals, setFormulaDecimals] = useState(2)
  const [formulaHint, setFormulaHint] = useState<string | null>(null)
  const [formulaXInputs, setFormulaXInputs] = useState<{ id: string; x: string }[]>([
    { id: newFormulaXRowId(), x: '' },
  ])

  const handlePointsSetupOpenChange = useFormDialogOpenChange(setPointsSetupOpen)
  const handleFormulaDialogOpenChange = useFormDialogOpenChange(setFormulaDialogOpen)

  const tableColumns = useMemo(
    () => visibleCalibrationPointsColumns(columns),
    [columns],
  )
  const pointsGridTemplate = `2rem repeat(${Math.max(tableColumns.length, 1)}, minmax(120px, 1fr)) 4.5rem 5.5rem`

  const formulaReady =
    formulaExpr.trim().length > 0 && validatePointFormula(formulaExpr) == null

  const applyPointsSetup = (
    nextColumns: CalibrationPointsColumn[],
    nextRows: CalibrationPointRow[],
  ) => {
    onChange({ columns: nextColumns, rows: nextRows })
    setSelectedPointIds(new Set())
    setPointsSortColId(null)
  }

  const updatePointValue = (rowId: string, columnId: string, value: string) => {
    onChange({
      columns,
      rows: rows.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [columnId]: value } } : row,
      ),
    })
  }

  const addPoint = () => {
    const row = emptyCalibrationPointRow(columns)
    onChange({ columns, rows: [...rows, row] })
    const firstColId = columns[0]?.id
    if (!firstColId) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(
          `${inputIdPrefix}-pt-${row.id}-${firstColId}`,
        ) as HTMLInputElement | null
        if (!el) return
        el.focus()
        el.select()
      })
    })
  }

  const removePoint = (id: string) => {
    if (rows.length <= 1) return
    onChange({ columns, rows: rows.filter((r) => r.id !== id) })
    setSelectedPointIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const removeSelectedPoints = () => {
    if (selectedPointIds.size === 0) return
    const remaining = rows.filter((r) => !selectedPointIds.has(r.id))
    onChange({
      columns,
      rows:
        remaining.length > 0 ? remaining : [emptyCalibrationPointRow(columns)],
    })
    setSelectedPointIds(new Set())
  }

  const movePoint = (id: string, direction: -1 | 1) => {
    const points = [...rows]
    const index = points.findIndex((r) => r.id === id)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= points.length) return
    const tmp = points[index]!
    points[index] = points[target]!
    points[target] = tmp
    onChange({ columns, rows: points })
    setPointsSortColId(null)
  }

  const togglePointSelected = (id: string) => {
    setSelectedPointIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllPointsSelected = (checked: boolean) => {
    if (!checked) {
      setSelectedPointIds(new Set())
      return
    }
    setSelectedPointIds(new Set(rows.map((r) => r.id)))
  }

  const sortPointsByColumn = (columnId: string) => {
    const nextDir: 'asc' | 'desc' =
      pointsSortColId === columnId && pointsSortDir === 'asc' ? 'desc' : 'asc'
    const points = [...rows]
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    points.sort((a, b) => {
      const av = String(a.values[columnId] ?? '').trim()
      const bv = String(b.values[columnId] ?? '').trim()
      const an = Number(av)
      const bn = Number(bv)
      let cmp = 0
      if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn)) {
        cmp = an - bn
      } else {
        cmp = collator.compare(av, bv)
      }
      return nextDir === 'asc' ? cmp : -cmp
    })
    setPointsSortColId(columnId)
    setPointsSortDir(nextDir)
    onChange({ columns, rows: points })
  }

  const openFormulaDialog = () => {
    if (tableColumns.length === 0) return
    setFormulaSourceColId(tableColumns[0]!.id)
    setFormulaTargetColId(tableColumns.length > 1 ? tableColumns[1]!.id : '')
    setFormulaExpr('')
    setFormulaDecimals(2)
    setFormulaHint(null)
    setFormulaXInputs([{ id: newFormulaXRowId(), x: '' }])
    setFormulaDialogOpen(true)
  }

  const applyFormulaGenerate = () => {
    if (columns.length === 0) return

    if (!formulaSourceColId) {
      setFormulaHint('Select the column for x values.')
      return
    }
    if (!formulaTargetColId || formulaTargetColId === formulaSourceColId) {
      setFormulaHint('Select a result column different from the x column.')
      return
    }
    if (!formulaExpr.trim()) {
      setFormulaHint('Enter a formula first.')
      return
    }
    const formulaError = validatePointFormula(formulaExpr)
    if (formulaError) {
      setFormulaHint(formulaError)
      return
    }

    const parsed = formulaXInputs
      .map((row) => {
        const raw = row.x.trim()
        if (!raw) return null
        const x = Number(raw)
        if (!Number.isFinite(x)) return null
        const result = evaluatePointFormula(formulaExpr, x)
        if (result == null) return null
        return { x, result }
      })
      .filter((v): v is { x: number; result: number } => v != null)

    if (parsed.length === 0) {
      setFormulaHint('Enter at least one valid x value in the rows below the formula.')
      return
    }

    const newRows = parsed.map(({ x, result }) => {
      const row = emptyCalibrationPointRow(columns)
      row.values[formulaSourceColId] = formatFormulaResult(x, formulaDecimals)
      row.values[formulaTargetColId] = formatFormulaResult(result, formulaDecimals)
      return row
    })

    const existingHasValues = rows.some((r) =>
      Object.values(r.values).some((v) => String(v ?? '').trim().length > 0),
    )
    onChange({
      columns,
      rows: existingHasValues ? [...rows, ...newRows] : newRows,
    })
    setSelectedPointIds(new Set())
    setPointsSortColId(null)
    setFormulaDialogOpen(false)
  }

  return (
    <section className={cn(className)}>
      <div className="mb-3 flex flex-wrap items-end gap-3 border-b border-amber-700/25 pb-2">
        <h3 className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
          {title}
        </h3>
        {headerExtra}
        {!readOnly && selectedPointIds.size > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={removeSelectedPoints}
            aria-label="Delete selected points"
          >
            <Trash2 size={14} />
            Delete selected ({selectedPointIds.size})
          </Button>
        ) : null}
        {!readOnly ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('h-8 gap-1.5', limsOutlineBtnClass)}
              disabled={tableColumns.length === 0}
              onClick={openFormulaDialog}
              aria-label="Generate calibration points by formula"
            >
              <Sigma size={14} />
              Generate New Points
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('h-8', limsOutlineBtnClass)}
              onClick={() => setPointsSetupOpen(true)}
            >
              {columns.length > 0 ? 'Edit Table Columns' : 'Create Table'}
            </Button>
          </>
        ) : null}
      </div>

      {columns.length === 0 ? (
        <p className="rounded-none border border-dashed border-stone-400 bg-[#f7f3eb]/80 px-3 py-6 text-center text-sm text-stone-600">
          No table yet. Click <span className="font-medium">Create Table</span> to set column count
          and headers.
        </p>
      ) : tableColumns.length === 0 ? (
        <p className="rounded-none border border-dashed border-stone-400 bg-[#f7f3eb]/80 px-3 py-6 text-center text-sm text-stone-600">
          No columns visible. In <span className="font-medium">Edit Table Columns</span>, tick{' '}
          <span className="font-medium">Required</span> to show a column here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[560px] items-center gap-x-2 border-b border-stone-700 bg-stone-800 px-2 py-2"
              style={{ gridTemplateColumns: pointsGridTemplate }}
            >
              <label className="flex items-center justify-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-none border-stone-500 accent-amber-600"
                  disabled={readOnly}
                  checked={rows.length > 0 && selectedPointIds.size === rows.length}
                  onChange={(e) => toggleAllPointsSelected(e.target.checked)}
                  aria-label="Select all calibration points"
                />
              </label>
              {tableColumns.map((col) => {
                const active = pointsSortColId === col.id
                const isFormula = col.type === 'formula'
                return (
                  <button
                    key={col.id}
                    type="button"
                    className="flex min-w-0 items-center justify-center gap-1 truncate text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 hover:text-amber-100"
                    title={isFormula ? `${col.header} (Calculated)` : `Sort by ${col.header}`}
                    onClick={() => sortPointsByColumn(col.id)}
                  >
                    <span className="truncate">{col.header}</span>
                    {isFormula ? (
                      <span className="shrink-0 rounded-none border border-amber-500/40 bg-amber-500/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-100">
                        Calc
                      </span>
                    ) : null}
                    {active && pointsSortDir === 'asc' ? (
                      <ArrowUp size={12} className="shrink-0 text-amber-300" />
                    ) : active && pointsSortDir === 'desc' ? (
                      <ArrowDown size={12} className="shrink-0 text-amber-300" />
                    ) : (
                      <ArrowUpDown size={12} className="shrink-0 text-amber-200/50" />
                    )}
                  </button>
                )
              })}
              <span className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Move
              </span>
              <span className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Actions
              </span>
            </div>

            <div className="divide-y divide-[#e7e0d4]">
              {rows.map((pt, index) => {
                const isLast = index === rows.length - 1
                const isFirst = index === 0
                const displayValues = computeCalibrationPointRowValuesFromMaster(
                  columns,
                  pt.values,
                  formulaMaster,
                )
                const rowSelected = selectedPointIds.has(pt.id)
                return (
                  <div
                    key={pt.id}
                    className={cn(
                      'grid min-w-[560px] items-center gap-x-2 px-2 py-1.5 transition-colors',
                      rowSelected
                        ? 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'
                        : index % 2 === 0
                          ? 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
                          : 'bg-[#fffcf7] hover:bg-[#f3e9d8]',
                    )}
                    style={{ gridTemplateColumns: pointsGridTemplate }}
                  >
                    <label className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-none border-stone-500 accent-amber-600"
                        disabled={readOnly}
                        checked={rowSelected}
                        onChange={() => togglePointSelected(pt.id)}
                        aria-label={`Select point ${index + 1}`}
                      />
                    </label>
                    {tableColumns.map((col) => {
                      const isFormula = col.type === 'formula'
                      return isFormula ? (
                        <Input
                          key={col.id}
                          id={`${inputIdPrefix}-pt-${pt.id}-${col.id}`}
                          value={displayValues[col.id] ?? ''}
                          readOnly
                          tabIndex={-1}
                          placeholder="Auto"
                          className="border-stone-500 bg-stone-100 text-center text-stone-700"
                          aria-label={`${col.header} row ${index + 1} (calculated)`}
                          title={col.formula?.expression?.trim() || 'Calculated column'}
                        />
                      ) : (
                        <Input
                          key={col.id}
                          id={`${inputIdPrefix}-pt-${pt.id}-${col.id}`}
                          value={pt.values[col.id] ?? ''}
                          onChange={(e) => updatePointValue(pt.id, col.id, e.target.value)}
                          placeholder="—"
                          inputMode={col.type === 'number' ? 'decimal' : undefined}
                          className="text-center"
                          readOnly={readOnly}
                          aria-label={`${col.header} row ${index + 1}`}
                        />
                      )
                    })}
                    <div className="flex items-center justify-center gap-0.5">
                      {isLast || readOnly ? (
                        <span className="inline-block h-8 w-[4.5rem]" aria-hidden />
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 px-0 text-stone-700 hover:bg-amber-500/15 hover:text-amber-950"
                            disabled={isFirst}
                            onClick={() => movePoint(pt.id, -1)}
                            aria-label={`Move point ${index + 1} up`}
                          >
                            <ChevronUp size={16} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 px-0 text-stone-700 hover:bg-amber-500/15 hover:text-amber-950"
                            onClick={() => movePoint(pt.id, 1)}
                            aria-label={`Move point ${index + 1} down`}
                          >
                            <ChevronDown size={16} />
                          </Button>
                        </>
                      )}
                    </div>
                    <div className="flex justify-center gap-1">
                      {readOnly ? (
                        <span className="inline-block h-8 w-8" aria-hidden />
                      ) : isLast ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn('h-8 w-8 px-0', limsOutlineBtnClass)}
                          onClick={addPoint}
                          aria-label="Add calibration point"
                        >
                          <Plus size={16} />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                          onClick={() => removePoint(pt.id)}
                          aria-label={`Remove point ${index + 1}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {!readOnly ? (
        <>
          <CalibrationPointsTableSetupDialog
            open={pointsSetupOpen}
            onOpenChange={handlePointsSetupOpenChange}
            columns={columns}
            rows={rows}
            onApply={applyPointsSetup}
            layer={dialogLayer}
          />

          <Dialog open={formulaDialogOpen} onOpenChange={handleFormulaDialogOpenChange}>
            <DialogContent
              persistOnFocusLoss
              layer={dialogLayer}
              overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
              className={cn(
                limsDialogClass,
                'flex max-h-[min(90dvh,44rem)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col',
                'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2',
                'md:w-[min(42rem,calc(100vw-268px-2rem))] md:max-w-[min(42rem,calc(100vw-268px-2rem))]',
                'md:!-translate-x-1/2 md:!-translate-y-1/2',
              )}
              aria-describedby={undefined}
            >
              <DialogChrome title="Generate by Formula" />

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
                <div className="w-full space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Column for X</Label>
                      <Select
                        value={formulaSourceColId || undefined}
                        onValueChange={setFormulaSourceColId}
                      >
                        <SelectTrigger aria-label="Column for X">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent className="z-[80]">
                          {tableColumns.map((col) => (
                            <SelectItem key={col.id} value={col.id}>
                              {col.header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Result Column</Label>
                      <Select
                        value={formulaTargetColId || undefined}
                        onValueChange={setFormulaTargetColId}
                      >
                        <SelectTrigger aria-label="Result Column">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent className="z-[80]">
                          {tableColumns
                            .filter((c) => c.id !== formulaSourceColId)
                            .map((col) => (
                              <SelectItem key={col.id} value={col.id}>
                                {col.header}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {formulaTargetColId && formulaTargetColId !== formulaSourceColId ? (
                    <ScientificFormulaPad
                      id={`${inputIdPrefix}-series-formula`}
                      value={formulaExpr}
                      onChange={(next) => {
                        setFormulaExpr(next)
                        setFormulaHint(null)
                      }}
                      decimals={formulaDecimals}
                      onDecimalsChange={setFormulaDecimals}
                    />
                  ) : (
                    <p className="rounded-none border border-dashed border-stone-400 bg-white/50 px-3 py-4 text-center text-sm text-stone-500">
                      Select x and result columns to enter a formula.
                    </p>
                  )}

                  {formulaReady &&
                  formulaTargetColId &&
                  formulaTargetColId !== formulaSourceColId ? (
                    <div className="space-y-3">
                      <div className="flex items-end justify-between gap-3 border-b border-stone-300 pb-2">
                        <p className="text-[12px] font-medium text-stone-600">X input values</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn('h-8 gap-1.5', limsOutlineBtnClass)}
                          onClick={() =>
                            setFormulaXInputs((prev) => [
                              ...prev,
                              { id: newFormulaXRowId(), x: '' },
                            ])
                          }
                        >
                          <Plus size={14} />
                          Add x row
                        </Button>
                      </div>
                      <div className="overflow-hidden rounded-none border-2 border-stone-400 bg-white">
                        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 border-b border-stone-700 bg-stone-800 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                          <span className="text-center">#</span>
                          <span>x value</span>
                          <span>Result</span>
                          <span className="sr-only">Actions</span>
                        </div>
                        <div className="divide-y divide-stone-200">
                          {formulaXInputs.map((row, index) => {
                            const xNum = Number(row.x.trim())
                            const xOk = row.x.trim() !== '' && Number.isFinite(xNum)
                            const result = xOk
                              ? evaluatePointFormula(formulaExpr, xNum)
                              : null
                            const isLast = index === formulaXInputs.length - 1
                            return (
                              <div
                                key={row.id}
                                className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-2 px-3 py-2"
                              >
                                <span className="text-center text-sm text-slate-500">
                                  {index + 1}
                                </span>
                                <Input
                                  value={row.x}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    setFormulaXInputs((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id ? { ...r, x: value } : r,
                                      ),
                                    )
                                  }}
                                  placeholder="e.g. 100"
                                  inputMode="decimal"
                                  aria-label={`x value row ${index + 1}`}
                                />
                                <Input
                                  value={
                                    !row.x.trim()
                                      ? ''
                                      : result == null
                                        ? '—'
                                        : formatFormulaResult(result, formulaDecimals)
                                  }
                                  readOnly
                                  className="bg-slate-50 font-mono"
                                  aria-label={`Result row ${index + 1}`}
                                />
                                <div className="flex justify-end">
                                  {isLast ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={cn('h-10 w-10 px-0', limsOutlineBtnClass)}
                                      onClick={() =>
                                        setFormulaXInputs((prev) => [
                                          ...prev,
                                          { id: newFormulaXRowId(), x: '' },
                                        ])
                                      }
                                      aria-label="Add x row"
                                    >
                                      <Plus size={16} />
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-10 w-10 px-0 text-destructive hover:bg-destructive/10"
                                      onClick={() =>
                                        setFormulaXInputs((prev) =>
                                          prev.filter((r) => r.id !== row.id),
                                        )
                                      }
                                      aria-label={`Remove x row ${index + 1}`}
                                    >
                                      <Trash2 size={16} />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {formulaHint ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {formulaHint}
                    </p>
                  ) : null}
                </div>
              </div>

              <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
                <Button
                  type="button"
                  className={limsPrimaryBtnClass}
                  onClick={applyFormulaGenerate}
                >
                  Save & Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </section>
  )
}
