import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SampleRow } from '../types'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '—')

export function SampleReceivingDetailsViewDialog({
  row,
  open,
  onOpenChange,
}: {
  row: SampleRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const title = row?.srf_number?.trim()
    ? `Sample Details — ${row.srf_number.trim()}`
    : 'Sample Details'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-5 text-sm">
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sample Description
              </h4>
              <p className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-3">
                {fmt(row.sample_description ?? row.description)}
              </p>
            </section>
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sample Declaration
              </h4>
              <p className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-3">
                {fmt(row.sample_declaration)}
              </p>
            </section>
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer Specific Information
              </h4>
              <p className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-3">
                {fmt(row.any_other_information)}
              </p>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
