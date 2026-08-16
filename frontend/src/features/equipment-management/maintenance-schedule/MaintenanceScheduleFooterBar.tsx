import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function MaintenanceScheduleFooterBar({
  message,
  selectedCount,
  loading,
  page,
  pageCount,
  onExport,
  onPrint,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  selectedCount: number
  loading: boolean
  page: number
  pageCount: number
  onExport: () => void
  onPrint: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-1.5 text-white sm:px-5 sm:py-2">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex min-w-0 flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={onExport}
              disabled={loading}
            >
              <Download size={16} />
              Export
            </Button>
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={onPrint}
              disabled={loading}
            >
              <Printer size={16} />
              Print
            </Button>
            {selectedCount > 0 ? (
              <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            {message ? <p className="hidden text-xs text-stone-300 sm:block">{message}</p> : null}
            <Input
              aria-label="Jump to page"
              placeholder="Page"
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
              className={cn(limsDarkBarFieldClass, 'h-8 w-12 sm:w-14')}
            />
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={onJumpToGo}
              disabled={loading}
            >
              Go
            </Button>
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={onPrevPage}
              disabled={loading || page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs text-stone-300">
              {page}/{pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={onNextPage}
              disabled={loading || page >= pageCount}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
