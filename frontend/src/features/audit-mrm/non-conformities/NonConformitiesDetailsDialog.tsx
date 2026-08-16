import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  auditTypeLabel,
  formatProposedRange,
  type NonConformityRow,
} from './types'

function DetailBlock({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-stone-500 bg-[#f7f3eb] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className={cn('mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-900', tone)}>
        {value.trim() || '—'}
      </p>
    </div>
  )
}

export function NonConformitiesDetailsDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: NonConformityRow | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        portalClassName="md:pl-[268px]"
        className={cn(
          limsDialogClass,
          'flex w-[min(100%-1.5rem,42rem)] max-h-[min(90dvh,40rem)] flex-col',
          '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {row
                  ? `NC Details — ${row.auditId} · Clause ${row.clauseNo}`
                  : 'NC Details'}
              </DialogTitle>
              {row ? (
                <p className="text-sm text-stone-300">
                  {auditTypeLabel(row.auditType)} ·{' '}
                  {formatProposedRange(row.proposedFrom, row.proposedTo)}
                </p>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <div className="overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5 sm:py-5">
          {!row ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No NC selected.</p>
          ) : (
            <div className="space-y-3">
              <DetailBlock label="Clause No" value={row.clauseNo} />
              <DetailBlock label="Description" value={row.clauseMatter} />
              <DetailBlock label="Observation" value={row.observation} />
              <DetailBlock
                label="Non Conformity"
                value={row.nonConformity}
                tone="text-rose-800"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
