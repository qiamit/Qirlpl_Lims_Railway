import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
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
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved') ||
                message.toLowerCase().includes('updated') ||
                message.toLowerCase().includes('deleted')
                  ? 'text-sm text-emerald-300'
                  : 'text-sm text-red-300'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          <span className="text-xs text-stone-300 md:order-first">
            Selected: {selectedCount}
          </span>
          {selectedCount > 0 && (
            <Button
              type="button"
              variant="destructive" size="sm" className={limsDeleteBtnClass}
              disabled={deleteBusy || loading}
              onClick={onDeleteSelected}
            >
              <Trash2 size={14} />
              Delete Selected
            </Button>
          )}
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className={cn('h-8 w-8', limsDarkBarBtnClass)} disabled={page <= 1 || loading} onClick={onPrevPage} aria-label="Previous page">
                <ChevronLeft size={16} />
              </Button>
              <span className="text-xs text-stone-300 whitespace-nowrap">
                Page {page} of {pageCount}
              </span>
              <Button type="button" variant="outline" size="icon" className={cn('h-8 w-8', limsDarkBarBtnClass)} disabled={page >= pageCount || loading} onClick={onNextPage} aria-label="Next page">
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
