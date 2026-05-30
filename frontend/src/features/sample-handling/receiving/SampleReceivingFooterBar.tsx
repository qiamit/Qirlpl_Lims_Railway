import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SampleReceivingTableFooterBar({
  message,
  loading,
  selectedCount,
  onPrintSelected,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  onPrintSelected: () => void
  page: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onPrintSelected} disabled={loading}>
            <Printer size={16} />
            Print
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Shows all SRFs (any stage). Search by SRF number (e.g. 260305) or go to next page.
          </span>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          <div>
            {message && (
              <p className={message.toLowerCase().includes('saved') || message.toLowerCase().includes('deleted') || message.toLowerCase().includes('exported') ? 'text-sm text-success' : 'text-sm text-destructive'}>
                {message}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">Selected: {selectedCount}</span>
            <Input aria-label="Jump to page" placeholder="Page" value={jumpTo} onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))} className="h-9 w-20" />
            <Button type="button" variant="outline" onClick={onJumpToGo} disabled={loading}>Jump</Button>
            <Button type="button" variant="outline" size="icon" onClick={onPrevPage} disabled={loading || page <= 1}><ChevronLeft size={16} /></Button>
            <span className="text-xs font-medium text-muted-foreground">Page {page} / {pageCount}</span>
            <Button type="button" variant="outline" size="icon" onClick={onNextPage} disabled={loading || page >= pageCount}><ChevronRight size={16} /></Button>
          </div>
        </div>
      </div>
    </div>
  )
}
