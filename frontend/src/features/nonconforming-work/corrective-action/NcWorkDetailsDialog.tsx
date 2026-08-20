import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatDateTimeDisplay } from '../shared'
import { acceptabilityLabel, type NcWorkRecordRow } from '../records/types'

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

export function NcWorkDetailsDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: NcWorkRecordRow | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:pl-[268px]"
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
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {row ? `NCW Details — ${row.nc_id}` : 'NCW Details'}
            </DialogTitle>
            {row ? (
              <p className="mt-0.5 text-sm text-stone-300">
                {row.source_area} · {formatDateTimeDisplay(row.detected_at)} · {row.status}
              </p>
            ) : null}
          </DialogHeader>
        </div>

        <div className="overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5 sm:py-5">
          {!row ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No NCW selected.</p>
          ) : (
            <div className="space-y-3">
              <DetailBlock label="NC ID" value={row.nc_id} />
              <DetailBlock label="Reported By" value={row.reported_by_name ?? ''} />
              <DetailBlock label="Equipment / Activity" value={row.equipment_or_activity ?? ''} />
              <DetailBlock
                label="Non Conformity / Description"
                value={row.description}
                tone="text-rose-800"
              />
              <DetailBlock label="Risk Level" value={row.risk_level} />
              <DetailBlock label="Actions Taken" value={row.actions_taken ?? ''} />
              <DetailBlock label="Significance Evaluation" value={row.significance_evaluation ?? ''} />
              <DetailBlock
                label="Acceptability Decision"
                value={acceptabilityLabel(row.acceptability_decision)}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
