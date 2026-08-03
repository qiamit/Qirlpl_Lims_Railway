import { ChevronLeft, ChevronRight, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function CalibrationJobStageFooterBar({
  message,
  loading,
  selectedCount,
  totalCount,
  page,
  pageCount,
  pageSize,
  onPageSizeChange,
  canMoveNext,
  nextStageLabel,
  onMoveNext,
  showBulkMove = true,
  canReferbackBulk = false,
  previousStageLabel = null,
  onReferbackBulk,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  totalCount: number
  page: number
  pageCount: number
  pageSize: number
  onPageSizeChange: (size: number) => void
  canMoveNext: boolean
  nextStageLabel: string | null
  onMoveNext: () => void
  showBulkMove?: boolean
  canReferbackBulk?: boolean
  previousStageLabel?: string | null
  onReferbackBulk?: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (v: string) => void
  onJumpToGo: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-4">
      {message ? (
        <p className="text-xs text-muted-foreground sm:text-sm">{message}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {showBulkMove ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-teal-600 text-white hover:bg-teal-500"
              disabled={!canMoveNext || loading || !nextStageLabel}
              onClick={onMoveNext}
              aria-label={nextStageLabel ? `Forward to ${nextStageLabel}` : 'Forward'}
            >
              <ArrowRight size={14} />
              {nextStageLabel ? `Forward (${selectedCount})` : 'Forward'}
            </Button>
          ) : null}
          {onReferbackBulk && previousStageLabel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-600/40 text-amber-900 hover:bg-amber-50"
              disabled={!canReferbackBulk || loading}
              onClick={onReferbackBulk}
              aria-label={`Referback to ${previousStageLabel}`}
            >
              <ArrowLeft size={14} />
              Referback ({selectedCount})
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {selectedCount} selected · {totalCount} total
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number.parseInt(v, 10))}
          >
            <SelectTrigger className="h-8 w-[72px]" aria-label="Page size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 px-0"
            disabled={page <= 1 || loading}
            onClick={onPrevPage}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {page} / {Math.max(pageCount, 1)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 px-0"
            disabled={page >= pageCount || loading}
            onClick={onNextPage}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </Button>
          <Input
            className="h-8 w-14"
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value)}
            aria-label="Jump to page"
          />
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={onJumpToGo}>
            Go
          </Button>
        </div>
      </div>
    </div>
  )
}
