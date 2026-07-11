import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function RetainDisposedFooterBar({
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
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved') || message.toLowerCase().includes('updated')
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
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Jump to page"
                placeholder="Page"
                value={jumpTo}
                onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
                className="h-9 w-20"
              />
              <Button type="button" variant="outline" onClick={onJumpToGo} disabled={loading}>
                Jump
              </Button>
            </div>

            <Button type="button" variant="outline" size="icon" onClick={onPrevPage} disabled={loading || page <= 1}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              Page {page} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onNextPage}
              disabled={loading || page >= pageCount}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
