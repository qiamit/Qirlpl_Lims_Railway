import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { parseCalibrationPointsTable } from './types'
import type { IntermediateCheckMasterOption } from './IntermediateCheckCalculator'

type SelectionRow = {
  key: string
  masterId: string
}

function newSelectionRow(masterId = ''): SelectionRow {
  return {
    key: `iqc-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    masterId,
  }
}

function masterLabel(master: IntermediateCheckMasterOption): string {
  return `${master.equipment_name ?? 'Unnamed'} (${master.asset_code ?? '-'})`
}

function formatUncertainty(master: IntermediateCheckMasterOption | undefined): string {
  if (!master) return '—'
  const value = (master.calibration_certificate_uncertainty ?? '').trim()
  const unit = (master.calibration_uncertainty_unit ?? '').trim()
  if (!value && !unit) return '—'
  return [value, unit].filter(Boolean).join(' ')
}

function displayOrDash(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  return text || '—'
}

function RowMasterSelect({
  masters,
  valueId,
  excludeIds,
  onSelect,
  listId,
}: {
  masters: IntermediateCheckMasterOption[]
  valueId: string
  excludeIds: string[]
  onSelect: (id: string) => void
  listId: string
}) {
  const selected = masters.find((m) => m.id === valueId)
  const selectedLabel = selected ? masterLabel(selected) : ''
  const [query, setQuery] = useState(selectedLabel)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searching = q.length > 0 && q !== selectedLabel.toLowerCase()
    return masters
      .filter((m) => m.id === valueId || !excludeIds.includes(m.id))
      .filter((m) => {
        if (!searching) return true
        const name = (m.equipment_name ?? '').toLowerCase()
        const code = (m.asset_code ?? '').toLowerCase()
        return name.includes(q) || code.includes(q)
      })
      .map((m) => ({ id: m.id, label: masterLabel(m) }))
  }, [masters, excludeIds, valueId, query, selectedLabel])

  return (
    <FilterCombobox
      value={query}
      onValueChange={(value) => {
        setQuery(value)
        setOpen(true)
        if (!value.trim() && valueId) onSelect('')
      }}
      options={options}
      onSelectOption={(option) => {
        onSelect(option.id)
        setQuery(option.label)
        setOpen(false)
      }}
      open={open}
      onOpenChange={setOpen}
      placeholder="Type to search IQC masters…"
      inputClassName="h-8 text-xs"
      listId={listId}
      onInputFocus={() => setOpen(true)}
    />
  )
}

function CalibrationPointsPreview({ master }: { master: IntermediateCheckMasterOption }) {
  const table = parseCalibrationPointsTable(
    master.calibration_points ??
      (master as { calibrationPoints?: unknown }).calibrationPoints,
  )

  if (table.columns.length === 0) {
    return <p className="text-sm text-stone-500">No calibration points on this master.</p>
  }

  return (
    <div className="overflow-x-auto rounded-none border-2 border-stone-400">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-stone-800 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
            <th className="border border-stone-700 px-2 py-2 text-center">#</th>
            {table.columns.map((col) => (
              <th key={col.id} className="border border-stone-700 px-2 py-2 text-center">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-[#f7f3eb]">
          {table.rows.map((row, index) => (
            <tr key={row.id}>
              <td className="border border-stone-300 px-2 py-1.5 text-center font-mono text-stone-500">
                {index + 1}
              </td>
              {table.columns.map((col) => (
                <td
                  key={col.id}
                  className="border border-stone-300 px-2 py-1.5 text-center text-stone-800"
                >
                  {row.values[col.id] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function IqcMasterSelectionDialog({
  open,
  onOpenChange,
  masters,
  selectedIds,
  onSelectedIdsChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  masters: IntermediateCheckMasterOption[]
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
}) {
  const [rows, setRows] = useState<SelectionRow[]>([newSelectionRow()])
  const [viewingMasterId, setViewingMasterId] = useState<string | null>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      setViewingMasterId(null)
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setRows(selectedIds.length > 0 ? selectedIds.map((id) => newSelectionRow(id)) : [newSelectionRow()])
  }, [open, selectedIds])

  const emitIds = (nextRows: SelectionRow[]) => {
    onSelectedIdsChange(nextRows.map((row) => row.masterId).filter(Boolean))
  }

  const updateRows = (nextRows: SelectionRow[]) => {
    setRows(nextRows)
    emitIds(nextRows)
  }

  const setRowMaster = (key: string, masterId: string) => {
    updateRows(rows.map((row) => (row.key === key ? { ...row, masterId } : row)))
  }

  const addRow = () => {
    updateRows([...rows, newSelectionRow()])
  }

  const removeRow = (key: string) => {
    const next = rows.filter((row) => row.key !== key)
    updateRows(next.length > 0 ? next : [newSelectionRow()])
  }

  const viewingMaster = viewingMasterId
    ? masters.find((m) => m.id === viewingMasterId)
    : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="top"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {viewingMaster
                ? `Calibration Points — ${masterLabel(viewingMaster)}`
                : 'IQC Master Selection'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
          {viewingMaster ? (
            <CalibrationPointsPreview master={viewingMaster} />
          ) : (
            <div className="overflow-x-auto rounded-none border-2 border-stone-400">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-800 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    <th className="w-[4%] border border-stone-700 px-2 py-2 text-center">#</th>
                    <th className="min-w-[220px] border border-stone-700 px-2 py-2 text-center">
                      Master for IQC
                    </th>
                    <th className="w-[16%] border border-stone-700 px-2 py-2 text-center">
                      Uncertainty
                    </th>
                    <th className="w-[16%] border border-stone-700 px-2 py-2 text-center">
                      Range
                    </th>
                    <th className="w-[14%] border border-stone-700 px-2 py-2 text-center">
                      Least Count
                    </th>
                    <th className="w-[12%] border border-stone-700 px-2 py-2 text-center">
                      View Points
                    </th>
                    <th className="w-[8%] border border-stone-700 px-2 py-2 text-center">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[#f7f3eb]">
                  {rows.map((row, index) => {
                    const isLastRow = index === rows.length - 1
                    const master = masters.find((m) => m.id === row.masterId)
                    return (
                      <tr key={row.key} className="hover:bg-amber-50/40">
                        <td className="border border-stone-300 px-2 py-1.5 text-center align-middle font-mono text-stone-500">
                          {index + 1}
                        </td>
                        <td className="border border-stone-300 px-1 py-0.5 align-middle">
                          <RowMasterSelect
                            masters={masters}
                            valueId={row.masterId}
                            excludeIds={rows.map((r) => r.masterId).filter(Boolean)}
                            onSelect={(id) => setRowMaster(row.key, id)}
                            listId={`iqc-master-row-${row.key}`}
                          />
                        </td>
                        <td className="border border-stone-300 px-2 py-1.5 text-center align-middle text-stone-800">
                          {formatUncertainty(master)}
                        </td>
                        <td className="border border-stone-300 px-2 py-1.5 text-center align-middle text-stone-800">
                          {displayOrDash(master?.range_capacity)}
                        </td>
                        <td className="border border-stone-300 px-2 py-1.5 text-center align-middle text-stone-800">
                          {displayOrDash(master?.resolution_least_count)}
                        </td>
                        <td className="border border-stone-300 px-1 py-0.5 text-center align-middle">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn('h-7 px-2 text-[11px]', limsOutlineBtnClass)}
                            disabled={!row.masterId}
                            onClick={() => setViewingMasterId(row.masterId)}
                          >
                            View Points
                          </Button>
                        </td>
                        <td className="border border-stone-300 py-0.5 text-center align-middle">
                          <div className="flex items-center justify-center gap-0.5">
                            {isLastRow ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-amber-800 hover:bg-amber-500/15"
                                aria-label="Add IQC master row"
                                onClick={addRow}
                              >
                                <Plus size={12} />
                              </Button>
                            ) : null}
                            {rows.length > 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:bg-rose-50"
                                aria-label={`Delete IQC master row ${index + 1}`}
                                onClick={() => removeRow(row.key)}
                              >
                                <Trash2 size={10} />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
          {viewingMaster ? (
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={() => setViewingMasterId(null)}
            >
              Back
            </Button>
          ) : null}
          <Button type="button" className={limsPrimaryBtnClass} onClick={() => onOpenChange(false)}>
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
