import { ChevronLeft, ChevronRight, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { limsDarkBarFieldClass, limsPanelClass } from '@/lib/limsThemeUi'

export function EquipmentForCalibrationFooterBar({
  message,
  loading,
  selectedCount,
  page,
  pageCount,
  onPrintSelected,
  onDeleteSelected,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  page: number
  pageCount: number
  onPrintSelected: () => void
  onDeleteSelected: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 rounded-none border-amber-500/50 bg-transparent px-2 text-[11px] text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
              disabled={selectedCount === 0 || loading}
              onClick={onPrintSelected}
            >
              <Printer size={12} />
              Print
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-7 gap-1 rounded-none px-2 text-[11px]"
              disabled={selectedCount === 0 || loading}
              onClick={onDeleteSelected}
            >
              <Trash2 size={12} />
              Delete
            </Button>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center px-2">
            {message ? (
              <p className="truncate text-center text-[11px] text-amber-100/90">{message}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Input
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onJumpToGo()
              }}
              placeholder="Page"
              className={cn(limsDarkBarFieldClass, 'h-8 w-16 text-center text-xs')}
              aria-label="Jump to page"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-amber-500/50 bg-transparent px-2 text-[11px] text-amber-200 hover:bg-amber-500/10"
              onClick={onJumpToGo}
            >
              Jump
            </Button>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/10"
                disabled={page <= 1}
                onClick={onPrevPage}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="min-w-[4.5rem] text-center text-[11px] text-stone-300">
                Page {page} / {pageCount}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/10"
                disabled={page >= pageCount}
                onClick={onNextPage}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
