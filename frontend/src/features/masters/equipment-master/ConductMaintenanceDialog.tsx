import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Wrench } from 'lucide-react'
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
import { ConductMaintenanceAssistant } from './ConductMaintenanceAssistant'
import { MaintenanceHistoryPanel } from './MaintenanceHistoryPanel'
import {
  checklistItemsToRows,
  defaultRepairForStatus,
  REPAIR_DEFAULT_OK,
  rowsToChecklistItems,
  type MaintenanceCheckpointRow,
  type MaintenanceCheckpointStatus,
} from './maintenanceChecklist'
import {
  newMaintenanceHistoryId,
  sortMaintenanceHistoryNewestFirst,
  type MaintenanceHistoryRecord,
} from './maintenanceHistory'
import type { Frequency, MaintenanceChecklistItem } from './types'
import { calculateNextDueDate, sanitizeDateStr } from './types'

export type { MaintenanceCheckpointRow, MaintenanceCheckpointStatus }
export { REPAIR_DEFAULT_OK, REPAIR_DEFAULT_NOT_OK, defaultRepairForStatus } from './maintenanceChecklist'

function newCheckpointRow(checkPoint = ''): MaintenanceCheckpointRow {
  return {
    key: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    selected: true,
    checkPoint,
    status: 'OK',
    repairIfAny: REPAIR_DEFAULT_OK,
  }
}

export function ConductMaintenanceDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode,
  manufacturer,
  modelNumber,
  rangeCapacity,
  initialChecklist,
  maintenanceHistory,
  lastMaintenanceDate,
  nextMaintenanceDate,
  maintenanceDoneBy,
  maintenanceDoneByName,
  maintenanceScheduleFrequency,
  onSaveChecklist,
  onCompleteMaintenance,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  manufacturer?: string
  modelNumber?: string
  rangeCapacity?: string
  initialChecklist?: MaintenanceChecklistItem[]
  maintenanceHistory: MaintenanceHistoryRecord[]
  lastMaintenanceDate?: string
  nextMaintenanceDate?: string
  maintenanceDoneBy?: string
  maintenanceDoneByName?: string
  maintenanceScheduleFrequency?: Frequency
  onSaveChecklist: (items: MaintenanceChecklistItem[]) => void
  onCompleteMaintenance: (payload: {
    checklist: MaintenanceChecklistItem[]
    maintenanceHistory: MaintenanceHistoryRecord[]
    lastMaintenanceDate: string
    nextMaintenanceDate: string
  }) => void
}) {
  const [rows, setRows] = useState<MaintenanceCheckpointRow[]>([])
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [aiError, setAiError] = useState(false)
  const snapshotRef = useRef({
    lastDate: '',
    nextDate: '',
    doneBy: '',
    doneByName: '',
    checklist: [] as MaintenanceChecklistItem[],
    history: [] as MaintenanceHistoryRecord[],
  })

  useEffect(() => {
    if (!open) return
    setSaveMessage(null)
    setAiMessage(null)
    setAiError(false)
    const saved = checklistItemsToRows(initialChecklist)
    setRows(saved)
    snapshotRef.current = {
      lastDate: lastMaintenanceDate ?? '',
      nextDate: nextMaintenanceDate ?? '',
      doneBy: maintenanceDoneBy ?? '',
      doneByName: maintenanceDoneByName ?? '',
      checklist: [...(initialChecklist ?? [])],
      history: [...maintenanceHistory],
    }
    // Load only when dialog opens so parent re-renders do not wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sortedHistory = useMemo(
    () => sortMaintenanceHistoryNewestFirst(maintenanceHistory),
    [maintenanceHistory],
  )

  const allSelected = rows.length > 0 && rows.every((row) => row.selected)
  const someSelected = rows.some((row) => row.selected)
  const selectedCount = useMemo(() => rows.filter((row) => row.selected).length, [rows])

  const updateRow = (key: string, patch: Partial<MaintenanceCheckpointRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, ...patch }
        if (patch.status !== undefined && patch.repairIfAny === undefined) {
          next.repairIfAny = defaultRepairForStatus(patch.status)
        }
        return next
      }),
    )
  }

  const toggleAll = (checked: boolean) => {
    setRows((prev) => prev.map((row) => ({ ...row, selected: checked })))
  }

  const removeSelected = () => {
    setRows((prev) => prev.filter((row) => !row.selected))
  }

  const handleSaveAndClose = () => {
    const items = rowsToChecklistItems(rows)
    if (items.length === 0) {
      setSaveMessage('Add at least one check point before completing maintenance.')
      return
    }
    if (!maintenanceDoneBy?.trim()) {
      setSaveMessage('Select Maintenance Done By in Maintenance Details before completing.')
      return
    }

    const today = sanitizeDateStr(new Date().toISOString().split('T')[0])
    const nextDue = calculateNextDueDate(today, maintenanceScheduleFrequency ?? '') || ''
    const snap = snapshotRef.current

    let nextHistory = [...snap.history]

    const shouldArchivePrevious =
      snap.lastDate.trim() &&
      snap.checklist.length > 0 &&
      snap.lastDate !== today &&
      !nextHistory.some(
        (record) =>
          record.conductedOn === snap.lastDate &&
          record.doneBy === snap.doneBy &&
          record.checklist.length === snap.checklist.length,
      )

    if (shouldArchivePrevious) {
      nextHistory = [
        ...nextHistory,
        {
          id: newMaintenanceHistoryId(),
          conductedOn: snap.lastDate,
          doneBy: snap.doneBy,
          doneByName: snap.doneByName || maintenanceDoneByName || '',
          checklist: snap.checklist,
          nextDueDate: snap.nextDate || nextDue,
        },
      ]
    }

    onCompleteMaintenance({
      checklist: items,
      maintenanceHistory: nextHistory,
      lastMaintenanceDate: today,
      nextMaintenanceDate: nextDue,
    })
    onSaveChecklist(items)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Conduct Maintenance
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="font-medium">{equipmentName || 'Equipment'}</p>
            {assetCode ? (
              <p className="text-xs text-muted-foreground font-mono">Asset Code: {assetCode}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              Maintenance Checklist ({selectedCount}/{rows.length} selected)
            </Label>
            <div className="flex items-center gap-2">
              <ConductMaintenanceAssistant
                equipment={{
                  equipmentName,
                  assetCode,
                  manufacturer,
                  modelNumber,
                  rangeCapacity,
                }}
                onApplyChecklist={setRows}
                onStatusMessage={(message, isError) => {
                  setAiMessage(message)
                  setAiError(!!isError)
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => setRows((prev) => [...prev, newCheckpointRow()])}
              >
                <Plus size={14} />
                Add Check Point
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-destructive hover:text-destructive"
                disabled={!someSelected}
                onClick={removeSelected}
              >
                <Trash2 size={14} />
                Remove Selected
              </Button>
            </div>
          </div>

          <MaintenanceHistoryPanel
            history={sortedHistory}
            currentLastDate={lastMaintenanceDate}
            currentDoneByName={maintenanceDoneByName}
            currentChecklist={initialChecklist}
          />

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-12 p-2 text-center">
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={rows.length === 0}
                        ref={(el) => {
                          if (el) el.indeterminate = !allSelected && someSelected
                        }}
                        onChange={(e) => toggleAll(e.target.checked)}
                        aria-label="Select all checkpoints"
                      />
                    </div>
                  </th>
                  <th className="p-2 text-center font-medium">Maintenance Check Point</th>
                  <th className="w-36 p-2 text-center font-medium">Status</th>
                  <th className="min-w-[180px] p-2 text-center font-medium">Repair If Any</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      No check points yet. Use <strong>Add Check Point</strong> or{' '}
                      <strong>AI Assistant</strong> to create the checklist.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="p-2 text-center">
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => updateRow(row.key, { selected: e.target.checked })}
                          aria-label={`Select checkpoint ${index + 1}`}
                        />
                      </div>
                    </td>
                    <td className="p-2">
                      <Input
                        value={row.checkPoint}
                        placeholder={`Check point ${index + 1}`}
                        onChange={(e) => updateRow(row.key, { checkPoint: e.target.value })}
                        className="h-9"
                      />
                    </td>
                    <td className="p-2">
                      <Select
                        value={row.status}
                        onValueChange={(value) =>
                          updateRow(row.key, { status: value as MaintenanceCheckpointStatus })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="Not OK">Not OK</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        value={row.repairIfAny}
                        placeholder={defaultRepairForStatus(row.status)}
                        onChange={(e) => updateRow(row.key, { repairIfAny: e.target.value })}
                        className="h-9"
                        aria-label={`Repair if any for checkpoint ${index + 1}`}
                      />
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {aiMessage ? (
            <p
              className={`text-xs rounded-md px-3 py-2 border ${
                aiError
                  ? 'text-destructive bg-destructive/5 border-destructive/30'
                  : 'text-emerald-700 bg-emerald-50 border-emerald-200'
              }`}
            >
              {aiMessage}
            </p>
          ) : null}

          {saveMessage ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              {saveMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleSaveAndClose}>
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
