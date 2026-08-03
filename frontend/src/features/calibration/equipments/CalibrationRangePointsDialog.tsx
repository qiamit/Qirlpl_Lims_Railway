import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  parseCalibrationPointsTable,
  emptyCalibrationPointRow,
  newCalibrationPointId,
  type CalibrationPointRow,
} from '@/features/calibration/equipment-for-calibration/types'
import { supabase } from '@/lib/supabaseClient'
import {
  emptyCalibrationPointsTable,
  emptyMasterPointsTab,
  masterEquipmentIdsFromTabs,
  primaryCalibrationPointsTable,
  singleColumnPointsTable,
  type CalibrationPointsStored,
  type MasterPointsTab,
} from './types'

const FULLSCREEN_DIALOG_CLASS =
  '!flex fixed inset-0 z-[60] !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100'

const FULLSCREEN_DIALOG_STYLE = {
  width: '100vw',
  height: '100dvh',
  maxWidth: 'none',
  maxHeight: '100dvh',
  top: 0,
  left: 0,
  transform: 'none',
} as const

/** Deep-clone a table with fresh row ids so imports never share references. */
function cloneTableWithFreshRowIds(table: CalibrationPointsStored): CalibrationPointsStored {
  return {
    columns: table.columns.map((c) => ({ ...c })),
    rows: table.rows.map((r) => ({
      id: newCalibrationPointId(),
      values: { ...r.values },
    })),
  }
}

/** Load one master's check-point table AS-IS from equipment_for_calibration. */
async function fetchSingleMasterTable(
  masterId: string,
): Promise<CalibrationPointsStored | null> {
  const id = masterId.trim()
  if (!id) return null

  const { data, error } = await supabase
    .from('equipment_for_calibration')
    .select('id, calibration_points')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const table = parseCalibrationPointsTable(
    (data as { calibration_points: unknown }).calibration_points,
  )
  if (table.columns.length === 0 || table.rows.length === 0) return null
  return cloneTableWithFreshRowIds(table)
}

function buildInitialTabs(
  masterPointsTabs: MasterPointsTab[] | undefined,
  masterEquipmentIds: string[],
  pointsTable: CalibrationPointsStored,
): MasterPointsTab[] {
  if (masterPointsTabs && masterPointsTabs.length > 0) {
    return masterPointsTabs.map((tab, index) => ({
      id: tab.id || `tab-${index}-${Date.now()}`,
      masterEquipmentId: tab.masterEquipmentId,
      calibrationPointsTable:
        tab.calibrationPointsTable.columns.length > 0
          ? cloneTableWithFreshRowIds(tab.calibrationPointsTable)
          : emptyCalibrationPointsTable(),
    }))
  }

  if (masterEquipmentIds.length > 0) {
    return masterEquipmentIds.map((id, index) => ({
      id: `tab-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      masterEquipmentId: id,
      calibrationPointsTable:
        index === 0 && pointsTable.columns.length > 0
          ? cloneTableWithFreshRowIds(pointsTable)
          : emptyCalibrationPointsTable(),
    }))
  }

  if (pointsTable.columns.length > 0) {
    return [
      {
        id: `tab-0-${Date.now()}`,
        masterEquipmentId: '',
        calibrationPointsTable: cloneTableWithFreshRowIds(pointsTable),
      },
    ]
  }

  return [emptyMasterPointsTab()]
}

export function CalibrationRangePointsDialog({
  open,
  onOpenChange,
  rangeLabel,
  unit,
  pointsTable,
  masterEquipmentIds = [],
  masterPointsTabs,
  masterEquipmentOptions = [],
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rangeLabel: string
  unit: string
  pointsTable: CalibrationPointsStored
  masterEquipmentIds?: string[]
  masterPointsTabs?: MasterPointsTab[]
  masterEquipmentOptions?: FilterComboboxOption[]
  onChange: (next: {
    calibrationPointsTable: CalibrationPointsStored
    masterEquipmentIds: string[]
    masterPointsTabs: MasterPointsTab[]
  }) => void
}) {
  const [tabs, setTabs] = useState<MasterPointsTab[]>(() => [emptyMasterPointsTab()])
  const [activeTabId, setActiveTabId] = useState('')
  const [loadingMasterPoints, setLoadingMasterPoints] = useState(false)
  const [masterPointsHint, setMasterPointsHint] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null
  const draft = activeTab?.calibrationPointsTable ?? emptyCalibrationPointsTable()
  const activeMasterId = activeTab?.masterEquipmentId ?? ''

  const loadPointsForActiveMaster = useCallback(async (masterId: string, tabId: string) => {
    if (!masterId.trim()) {
      setMasterPointsHint('Select a master on this tab first.')
      return
    }
    setLoadingMasterPoints(true)
    setMasterPointsHint(null)
    try {
      const table = await fetchSingleMasterTable(masterId)
      if (table) {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === tabId ? { ...tab, calibrationPointsTable: table } : tab,
          ),
        )
        setMasterPointsHint(
          `Loaded ${table.rows.length} check point(s) for this master (as-is).`,
        )
        return
      }
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, calibrationPointsTable: singleColumnPointsTable() }
            : tab,
        ),
      )
      setMasterPointsHint(
        'Selected master has no calibration points yet. Add them under Equipment for Calibration.',
      )
    } catch {
      setMasterPointsHint('Could not load check points from master equipment.')
    } finally {
      setLoadingMasterPoints(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setMasterPointsHint(null)
    const initial = buildInitialTabs(masterPointsTabs, masterEquipmentIds, pointsTable)
    setTabs(initial)
    setActiveTabId(initial[0]?.id ?? '')
  }, [open, pointsTable, masterEquipmentIds, masterPointsTabs])

  const selectedMasterLabel = useMemo(() => {
    if (!activeMasterId) return ''
    return (
      (masterEquipmentOptions ?? []).find((o) => o.id === activeMasterId)?.label ??
      activeMasterId
    )
  }, [activeMasterId, masterEquipmentOptions])

  const usedMasterIds = useMemo(
    () =>
      new Set(
        tabs
          .filter((t) => t.id !== activeTab?.id)
          .map((t) => t.masterEquipmentId.trim())
          .filter(Boolean),
      ),
    [tabs, activeTab?.id],
  )

  const ensureColumns = (table: CalibrationPointsStored): CalibrationPointsStored =>
    table.columns.length > 0 ? table : singleColumnPointsTable()

  const updateActiveTable = (nextTable: CalibrationPointsStored) => {
    if (!activeTab) return
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTab.id ? { ...tab, calibrationPointsTable: nextTable } : tab,
      ),
    )
  }

  const updateCell = (rowId: string, colId: string, value: string) => {
    updateActiveTable({
      ...draft,
      rows: draft.rows.map((r) =>
        r.id === rowId ? { ...r, values: { ...r.values, [colId]: value } } : r,
      ),
    })
  }

  const addRow = () => {
    const table = ensureColumns(draft)
    updateActiveTable({
      ...table,
      rows: [...table.rows, emptyCalibrationPointRow(table.columns)],
    })
  }

  const removeRow = (rowId: string) => {
    const nextRows = draft.rows.filter((r) => r.id !== rowId)
    updateActiveTable({
      ...draft,
      rows:
        nextRows.length > 0 ? nextRows : [emptyCalibrationPointRow(draft.columns)],
    })
  }

  const setActiveMaster = (masterId: string) => {
    if (!activeTab) return
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTab.id ? { ...tab, masterEquipmentId: masterId } : tab,
      ),
    )
    setMasterPointsHint(null)
  }

  const addMasterTab = () => {
    const tab = emptyMasterPointsTab()
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setMasterPointsHint('Select one master for this tab, then Load from Master.')
  }

  const removeMasterTab = (tabId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) {
        const only = emptyMasterPointsTab()
        setActiveTabId(only.id)
        return [only]
      }
      const next = prev.filter((t) => t.id !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(next[0]?.id ?? '')
      }
      return next
    })
    setMasterPointsHint(null)
  }

  const handleDone = () => {
    const cleanedTabs = tabs.map((tab) => {
      const table = tab.calibrationPointsTable
      const nextRows = table.rows.filter((r) =>
        Object.values(r.values).some((v) => String(v ?? '').trim().length > 0),
      )
      const cleaned: CalibrationPointsStored =
        table.columns.length === 0
          ? emptyCalibrationPointsTable()
          : { columns: table.columns.map((c) => ({ ...c })), rows: nextRows }
      return {
        ...tab,
        masterEquipmentId: tab.masterEquipmentId.trim(),
        calibrationPointsTable: cleaned,
      }
    })
    onChange({
      calibrationPointsTable: primaryCalibrationPointsTable(cleanedTabs),
      masterEquipmentIds: masterEquipmentIdsFromTabs(cleanedTabs),
      masterPointsTabs: cleanedTabs,
    })
    onOpenChange(false)
  }

  const unitSuffix = unit.trim() ? ` ${unit.trim()}` : ''
  const displayColumns =
    draft.columns.length > 0 ? draft.columns : singleColumnPointsTable().columns
  const displayRows =
    draft.columns.length > 0
      ? draft.rows.length > 0
        ? draft.rows
        : [emptyCalibrationPointRow(displayColumns)]
      : singleColumnPointsTable().rows

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        className={FULLSCREEN_DIALOG_CLASS}
        style={FULLSCREEN_DIALOG_STYLE}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              Measurement Range
            </p>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                  Calibration Points
                </DialogTitle>
                <p className="mt-1 text-xs text-slate-300">
                  {rangeLabel || '—'}
                  {unitSuffix}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-white/25 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                onClick={addMasterTab}
                aria-label="Add master tab"
              >
                <Plus size={14} className="mr-1.5" aria-hidden />
                Add Master
              </Button>
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
          <div className="mx-auto w-full max-w-5xl space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
              {tabs.map((tab, index) => {
                const label =
                  (masterEquipmentOptions ?? []).find((o) => o.id === tab.masterEquipmentId)
                    ?.label ??
                  (tab.masterEquipmentId ? tab.masterEquipmentId : `Master ${index + 1}`)
                const active = tab.id === activeTab?.id
                const pointCount = tab.calibrationPointsTable.rows.filter((r) =>
                  Object.values(r.values).some((v) => String(v ?? '').trim()),
                ).length
                return (
                  <div key={tab.id} className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-8 max-w-[220px]',
                        active
                          ? 'border-teal-600/50 bg-teal-50 text-teal-900 hover:bg-teal-50 hover:text-teal-900'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                      )}
                      onClick={() => {
                        setActiveTabId(tab.id)
                        setMasterPointsHint(null)
                      }}
                      aria-pressed={active}
                      title={label}
                    >
                      <span className="truncate">{label}</span>
                      {pointCount > 0 ? (
                        <span className="ml-1.5 rounded-full bg-teal-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                          {pointCount}
                        </span>
                      ) : null}
                    </Button>
                    {tabs.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                        onClick={() => removeMasterTab(tab.id)}
                        aria-label={`Remove ${label} tab`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="space-y-2">
              <Label>Master Equipment (this tab only)</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full max-w-xl justify-between rounded-none border-0 border-b border-slate-300 bg-transparent px-2.5 text-left font-normal shadow-none hover:bg-transparent focus-visible:border-teal-600 focus-visible:ring-0"
                  >
                    <span className="truncate text-sm text-slate-800">
                      {selectedMasterLabel || 'Select one master / reference equipment'}
                    </span>
                    <ChevronDown size={16} className="ml-2 shrink-0 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="z-[80] max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
                    One master per tab — data stays separate
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(masterEquipmentOptions ?? []).length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">
                      No equipment for calibration found.
                    </p>
                  ) : (
                    <DropdownMenuRadioGroup
                      value={activeMasterId || undefined}
                      onValueChange={setActiveMaster}
                    >
                      {(masterEquipmentOptions ?? []).map((opt) => {
                        const taken = usedMasterIds.has(opt.id)
                        return (
                          <DropdownMenuRadioItem
                            key={opt.id}
                            value={opt.id}
                            disabled={taken}
                            className={taken ? 'opacity-50' : undefined}
                          >
                            {opt.label}
                            {taken ? ' (used on another tab)' : ''}
                          </DropdownMenuRadioItem>
                        )
                      })}
                    </DropdownMenuRadioGroup>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {loadingMasterPoints
                  ? 'Loading check points from master…'
                  : (masterPointsHint ?? '')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                disabled={!activeMasterId || loadingMasterPoints}
                onClick={() => {
                  if (!activeTab) return
                  void loadPointsForActiveMaster(activeMasterId, activeTab.id)
                }}
                aria-label="Load check points from master equipment"
              >
                <RefreshCw size={14} />
                Load from Master
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 px-3 py-2 text-center">#</th>
                      {displayColumns.map((col) => (
                        <th key={col.id} className="min-w-[140px] px-3 py-2">
                          {col.header}
                        </th>
                      ))}
                      <th className="w-14 px-2 py-2 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row: CalibrationPointRow, index) => {
                      const isLast = index === displayRows.length - 1
                      return (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 align-middle text-center text-slate-500">
                            {index + 1}
                          </td>
                          {displayColumns.map((col) => (
                            <td key={col.id} className="px-3 py-2 align-middle">
                              <Label htmlFor={`cal-pt-${row.id}-${col.id}`} className="sr-only">
                                {col.header} row {index + 1}
                              </Label>
                              <Input
                                id={`cal-pt-${row.id}-${col.id}`}
                                value={row.values[col.id] ?? ''}
                                onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                                placeholder={col.header}
                                className="h-9"
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2 align-middle text-right">
                            {isLast ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 w-9 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                                onClick={addRow}
                                aria-label="Add check point"
                              >
                                <Plus size={16} />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 px-0 text-destructive hover:bg-destructive/10"
                                onClick={() => removeRow(row.id)}
                                aria-label={`Remove point ${index + 1}`}
                              >
                                <Trash2 size={16} />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-teal-600/40 text-teal-800 hover:bg-teal-50"
              onClick={addRow}
            >
              <Plus size={14} />
              Add Point Manually
            </Button>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-teal-600 text-white hover:bg-teal-500"
            onClick={handleDone}
            disabled={loadingMasterPoints}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
