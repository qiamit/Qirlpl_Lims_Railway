import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { preventFormDialogFocusOutside } from '@/lib/formDialogOpenChange'
import { isFilterComboboxDropdownTarget } from '@/features/sample-handling/receiving/FilterCombobox'

function isRadixSelectPortalTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest('[data-radix-select-content]') ||
      target.closest('[data-radix-popper-content-wrapper]'),
  )
}

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogClose = DialogPrimitive.Close

type DialogLayer = 'default' | 'nested' | 'stacked'

const dialogLayerZClass = (layer: DialogLayer) => {
  if (layer === 'nested') return 'z-[60]'
  if (layer === 'stacked') return 'z-[70]'
  return 'z-50'
}

const DialogPortal = ({
  children,
  layer = 'default',
  ...props
}: DialogPrimitive.DialogPortalProps & { layer?: DialogLayer }) => (
  <DialogPrimitive.Portal {...props}>
    <div
      className={cn(
        'fixed inset-0 flex items-start justify-center sm:items-center',
        dialogLayerZClass(layer),
      )}
    >
      {children}
    </div>
  </DialogPrimitive.Portal>
)
DialogPortal.displayName = DialogPrimitive.Portal.displayName

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & { layer?: DialogLayer }
>(({ className, layer = 'default', ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      dialogLayerZClass(layer),
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

function preventOutsideIfComboboxDropdown(
  e: {
    preventDefault: () => void
    target: EventTarget | null
    detail?: { originalEvent?: Event }
  },
) {
  const target = e.detail?.originalEvent?.target ?? e.target
  if (isFilterComboboxDropdownTarget(target) || isRadixSelectPortalTarget(target)) {
    e.preventDefault()
  }
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Keep form dialogs open when focus leaves due to tab switch */
    persistOnFocusLoss?: boolean
    /** Render the top-right close control (default true) */
    showCloseButton?: boolean
    /** Raise nested dialogs above an already-open parent dialog; use stacked for a third layer */
    layer?: DialogLayer
  }
>(
  (
    {
      className,
      children,
      persistOnFocusLoss,
      showCloseButton = true,
      layer = 'default',
      onFocusOutside,
      onPointerDownOutside,
      onInteractOutside,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref,
  ) => (
    <DialogPortal layer={layer}>
      <DialogOverlay layer={layer} />
      <DialogPrimitive.Content
        ref={ref}
        aria-describedby={ariaDescribedBy ?? undefined}
        onFocusOutside={(e) => {
          if (persistOnFocusLoss) preventFormDialogFocusOutside(e)
          preventOutsideIfComboboxDropdown(e)
          onFocusOutside?.(e)
        }}
        onPointerDownOutside={(e) => {
          preventOutsideIfComboboxDropdown(e)
          onPointerDownOutside?.(e)
        }}
        onInteractOutside={(e) => {
          preventOutsideIfComboboxDropdown(e)
          onInteractOutside?.(e)
        }}
        className={cn(
          'fixed grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-bottom-5 data-[state=open]:slide-in-from-bottom-5 sm:rounded-lg',
          dialogLayerZClass(layer),
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-md border border-border/70 bg-background/95 text-foreground shadow-sm ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            aria-label="Close"
          >
            <X className="h-6 w-6" strokeWidth={2.75} aria-hidden />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
