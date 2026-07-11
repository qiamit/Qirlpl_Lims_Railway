import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function IqcPlanFooterBar({
  loading,
  message,
  selectedCount,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
  onDeleteSelected,
  deleteBusy,
}: {
  loading: boolean
  message: string | null
  selectedCount: number
  page: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
  onDeleteSelected: () => void
  deleteBusy: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved') ||
                message.toLowerCase().includes('updated') ||
                message.toLowerCase().includes('deleted')
                  ? 'text-sm text-success'
                  : 'text-sm text-destructive'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          <span className="text-xs text-muted-foreground md:order-first">
            Selected: {selectedCount}
          </span>
          {selectedCount > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={deleteBusy || loading}
              onClick={onDeleteSelected}
            >
              <Trash2 size={14} />
              Delete Selected
            </Button>
          )}
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || loading} onClick={onPrevPage} aria-label="Previous page">
                <ChevronLeft size={16} />
              </Button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Page {page} of {pageCount}
              </span>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={page >= pageCount || loading} onClick={onNextPage} aria-label="Next page">
                <ChevronRight size={16} />
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                className="h-8 w-14 text-center text-xs"
                value={jumpTo}
                onChange={(e) => onJumpToChange(e.target.value)}
                aria-label="Jump to page"
              />
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={loading} onClick={onJumpToGo}>
                Go
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
