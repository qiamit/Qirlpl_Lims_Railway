import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { TestAllocationRow } from '../types'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '—')

export function SectionSampleDescViewDialog({
  row,
  open,
  onOpenChange,
}: {
  row: TestAllocationRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const title = row
    ? [
        'Sample Details',
        row.sectionCode?.trim() ? `Section ${row.sectionCode.trim()}` : null,
        row.department?.trim() ? `Dept. ${row.department.trim()}` : null,
        row.srfNumber?.trim() ? row.srfNumber.trim() : null,
      ]
        .filter(Boolean)
        .join(' — ')
    : 'Sample Details'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-5 text-sm">
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sample Description
              </h4>
              <p className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-3">
                {fmt(row.sampleDescription)}
              </p>
            </section>
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Declared Value
              </h4>
              <p className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-3">
                {fmt(row.declaredValue)}
              </p>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
