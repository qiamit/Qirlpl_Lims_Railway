import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ConsentLetterFooterBar({
  loading,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  loading: boolean
  page: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (v: string) => void
  onJumpToGo: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onPrevPage} disabled={loading || page <= 1}>
              Prev
            </Button>
            <div className="text-sm font-medium text-muted-foreground">
              Page {page} / {pageCount}
            </div>
            <Button type="button" variant="outline" onClick={onNextPage} disabled={loading || page >= pageCount}>
              Next
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              className="w-24"
              placeholder="Go to"
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value)}
              inputMode="numeric"
            />
            <Button type="button" variant="outline" onClick={onJumpToGo} disabled={loading}>
              Go
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
