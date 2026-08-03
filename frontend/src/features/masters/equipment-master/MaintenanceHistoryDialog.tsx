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
import { MaintenanceHistoryPanel } from './MaintenanceHistoryPanel'
import { sortMaintenanceHistoryNewestFirst, type MaintenanceHistoryRecord } from './maintenanceHistory'
import type { MaintenanceChecklistItem } from './types'

export function MaintenanceHistoryDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode,
  history,
  currentLastDate,
  currentDoneByName,
  currentChecklist,
  layer = 'default',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  history: MaintenanceHistoryRecord[]
  currentLastDate?: string
  currentDoneByName?: string
  currentChecklist?: MaintenanceChecklistItem[]
  layer?: 'default' | 'nested' | 'stacked'
}) {
  const sortedHistory = useMemo(
    () => sortMaintenanceHistoryNewestFirst(history),
    [history],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer={layer} className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Maintenance Checklist History
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="font-medium">{equipmentName || 'Equipment'}</p>
            {assetCode ? (
              <p className="text-xs text-muted-foreground font-mono">Asset Code: {assetCode}</p>
            ) : null}
          </div>

          <MaintenanceHistoryPanel
            history={sortedHistory}
            currentLastDate={currentLastDate}
            currentDoneByName={currentDoneByName}
            currentChecklist={currentChecklist}
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
