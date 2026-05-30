import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function TestAllocationFooterBar({
  page,
  pageCount,
  jumpTo,
  onJumpToChange,
  onJump,
  onPrev,
  onNext,
  selectedCount,
  saveMessage,
  loading,
}: {
  page: number
  pageCount: number
  jumpTo: string
  onJumpToChange: (v: string) => void
  onJump: () => void
  onPrev: () => void
  onNext: () => void
  selectedCount: number
  saveMessage: string | null
  loading: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled>
            <Printer size={16} /> Print
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {saveMessage && <p className="text-sm text-success">{saveMessage}</p>}
          <span className="text-xs text-muted-foreground">Selected: {selectedCount}</span>
          <Input
            className="h-9 w-20"
            placeholder="Page"
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <Button type="button" variant="outline" size="sm" onClick={onJump}>
            Jump
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={onPrev} disabled={page <= 1}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-xs font-medium text-muted-foreground">
            Page {page} / {pageCount}
          </span>
          <Button type="button" variant="outline" size="icon" onClick={onNext} disabled={loading || page >= pageCount}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
