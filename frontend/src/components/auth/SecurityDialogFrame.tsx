import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/** Dialog chrome shared by the account-security dialogs (same look as the e-signature dialog). */
export function SecurityDialogFrame({
  open,
  onOpenChange,
  title,
  description,
  dismissable = true,
  layer = 'top',
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** false = no close button, Escape and outside clicks do nothing. */
  dismissable?: boolean
  layer?: 'default' | 'nested' | 'stacked' | 'top'
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissable) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        layer={layer}
        showCloseButton={dismissable}
        persistOnFocusLoss
        className={cn(limsDialogClass, 'max-w-md p-0')}
        {...(description ? {} : { 'aria-describedby': undefined })}
        onEscapeKeyDown={(e) => {
          if (!dismissable) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (!dismissable) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (!dismissable) e.preventDefault()
        }}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-xs text-stone-300">{description}</DialogDescription>
            ) : null}
          </DialogHeader>
        </div>

        <div className="space-y-4 bg-[#f7f3eb] px-4 py-4">{children}</div>

        {footer ? (
          <DialogFooter className="gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
