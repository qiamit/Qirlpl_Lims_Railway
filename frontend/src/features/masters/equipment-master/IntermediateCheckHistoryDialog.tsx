import { useMemo } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IntermediateCheckHistoryPanel } from './IntermediateCheckHistoryPanel'
import {
  filterIntermediateCheckHistoryLastYears,
  INTERMEDIATE_CHECK_HISTORY_YEARS,
  type IntermediateCheckHistoryRecord,
  type IntermediateCheckMasterSnapshot,
  type IntermediateCheckReadingItem,
} from './intermediateCheckHistory'
import {
  useIntermediateCheckHistoryWithRegister,
  type EquipmentHistorySource,
} from './equipmentHistoryRegister'

export function IntermediateCheckHistoryDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode,
  history,
  currentLastDate,
  currentDoneByName,
  currentStatus,
  currentSummary,
  currentReadings,
  currentTemperature,
  currentHumidity,
  currentMasters,
  currentNextDueDate,
  acceptanceCriteria,
  layer = 'default',
  historySource,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  history: IntermediateCheckHistoryRecord[]
  currentLastDate?: string
  currentDoneByName?: string
  currentStatus?: IntermediateCheckHistoryRecord['status']
  currentSummary?: string
  currentReadings?: IntermediateCheckReadingItem[]
  currentTemperature?: string
  currentHumidity?: string
  currentMasters?: IntermediateCheckMasterSnapshot[]
  currentNextDueDate?: string
  acceptanceCriteria?: string
  layer?: 'default' | 'nested' | 'stacked'
  /** Equipment the history belongs to: also read from the append-only register (6.4.10, 6.4.13). */
  historySource?: EquipmentHistorySource
}) {
  const {
    records: shownHistory,
    readOnlyIds,
    registerActive,
  } = useIntermediateCheckHistoryWithRegister(history, historySource, open)
  const visibleCount = useMemo(() => {
    const historyCount = filterIntermediateCheckHistoryLastYears(
      shownHistory,
      INTERMEDIATE_CHECK_HISTORY_YEARS,
    ).length
    const hasCurrent = !!currentLastDate?.trim() && (currentReadings?.length ?? 0) > 0
    return historyCount + (hasCurrent ? 1 : 0)
  }, [shownHistory, currentLastDate, currentReadings])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer={layer} className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Previous Intermediate Check Results
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="font-medium">{equipmentName || 'Equipment'}</p>
            {assetCode ? (
              <p className="text-xs text-muted-foreground font-mono">Asset Code: {assetCode}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Showing {visibleCount} record(s) from the last {INTERMEDIATE_CHECK_HISTORY_YEARS} years.
              {registerActive ? ' Past checks are kept in an append-only register (ISO 17025 6.4.10, 6.4.13).' : ''}
            </p>
          </div>

          <IntermediateCheckHistoryPanel
            history={shownHistory}
            registerOnlyIds={readOnlyIds}
            currentLastDate={currentLastDate}
            currentDoneByName={currentDoneByName}
            currentStatus={currentStatus}
            currentSummary={currentSummary}
            currentReadings={currentReadings}
            currentTemperature={currentTemperature}
            currentHumidity={currentHumidity}
            currentMasters={currentMasters}
            currentNextDueDate={currentNextDueDate}
            acceptanceCriteria={acceptanceCriteria}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
