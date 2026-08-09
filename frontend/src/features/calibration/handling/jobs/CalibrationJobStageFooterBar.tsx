import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
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
  /** When false, hides Forward / Referback / selection summary (e.g. Review Data). */
  showBulkActions = true,
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
  showBulkActions?: boolean
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
    <div className="flex flex-col gap-2 relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-3 py-3 shadow-sm sm:px-4">
      {message ? (
        <p className="text-xs text-stone-300 sm:text-sm">{message}</p>
      ) : null}
      <div
        className={`flex flex-wrap items-center gap-2 ${showBulkActions ? 'justify-between' : 'justify-end'}`}
      >
        {showBulkActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {showBulkMove ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 rounded-none bg-amber-700 text-white hover:bg-amber-800"
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
                variant="outline" className={cn('gap-1.5 border-amber-600/40 text-amber-900 hover:bg-amber-50', limsDarkBarBtnClass)}
                disabled={!canReferbackBulk || loading}
                onClick={onReferbackBulk}
                aria-label={`Referback to ${previousStageLabel}`}
              >
                <ArrowLeft size={14} />
                Referback ({selectedCount})
              </Button>
            ) : null}
            <span className="text-xs text-stone-300">
              {selectedCount} selected · {totalCount} total
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number.parseInt(v, 10))}
          >
            <SelectTrigger className={cn(limsDarkBarFieldClass, 'h-8 w-[72px]')} aria-label="Page size">
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
          <span className="text-xs tabular-nums text-stone-300">
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
