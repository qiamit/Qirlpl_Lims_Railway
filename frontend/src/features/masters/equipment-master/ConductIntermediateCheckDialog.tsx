import type { ReactNode } from 'react'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function ConductIntermediateCheckDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode,
  children,
  onComplete,
  completeDisabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  children: ReactNode
  onComplete?: () => boolean
  completeDisabled?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Conduct Intermediate Check
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="font-medium">{equipmentName || 'Equipment'}</p>
            {assetCode ? (
              <p className="text-xs text-muted-foreground font-mono">Asset Code: {assetCode}</p>
            ) : null}
          </div>
          {children}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={completeDisabled}
            onClick={() => {
              if (onComplete?.()) {
                onOpenChange(false)
              }
            }}
          >
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
