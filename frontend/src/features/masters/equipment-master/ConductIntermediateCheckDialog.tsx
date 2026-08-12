import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

const FULLSCREEN_OVERLAY = 'md:inset-y-0 md:left-[268px] md:right-0 md:w-auto'

const FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
)

export function ConductIntermediateCheckDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode,
  acceptanceCriteria,
  children,
  onComplete,
  completeDisabled,
  layer = 'default',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  acceptanceCriteria?: string
  children: ReactNode
  onComplete?: () => boolean
  completeDisabled?: boolean
  layer?: 'default' | 'nested' | 'stacked'
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer={layer === 'default' ? 'nested' : layer}
        overlayClassName={FULLSCREEN_OVERLAY}
        className={FULLSCREEN_DIALOG_CLASS}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Conduct Intermediate Check
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            labRegistryFormClass,
          )}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-none border-2 border-stone-400 bg-stone-50 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-stone-800">
                  {equipmentName || 'Equipment'}
                </p>
                {assetCode ? (
                  <p className="font-mono text-xs text-stone-500">Asset Code: {assetCode}</p>
                ) : null}
              </div>
              <p className="text-[11px] text-stone-500">
                Criteria:{' '}
                <strong className="text-stone-800">{acceptanceCriteria?.trim() || 'None'}</strong>
              </p>
            </div>
            {children}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
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
