import { ChevronLeft, ChevronRight, Download, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDeleteBtnClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function ComplaintsFooterBar({
  message,
  loading,
  selectedCount,
  page,
  pageCount,
  onExport,
  onPrintSelected,
  onDeleteSelected,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
  hideDelete,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  page: number
  pageCount: number
  onExport: () => void
  onPrintSelected: () => void
  onDeleteSelected?: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
  hideDelete?: boolean
}) {
  const selectionDisabled = selectedCount === 0

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
        <div className="relative flex min-w-0 flex-nowrap items-center justify-between gap-1.5 sm:gap-2 md:gap-3">
          <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5">
            <LaboratoryDirectorOnly>
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
              onClick={onPrintSelected}
              disabled={loading}
            >
              <Printer size={16} />
              Print
            </Button>
            {!hideDelete && onDeleteSelected ? (
              <Button
                type="button"
                variant="destructive"
                className={limsDeleteBtnClass}
                onClick={onDeleteSelected}
                disabled={loading || selectionDisabled}
              >
                <Trash2 size={16} />
                Delete
              </Button>
            ) : null}
            </LaboratoryDirectorOnly>
          </div>
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2">
            {message ? (
              <p
                className={cn(
                  'hidden max-w-[14rem] truncate text-xs sm:block',
                  message.toLowerCase().includes('saved') ||
                    message.toLowerCase().includes('deleted')
                    ? 'text-emerald-300'
                    : 'text-red-300',
                )}
              >
                {message}
              </p>
            ) : null}
            <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
            <Input
              aria-label="Jump to page"
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value)}
              className={cn(limsDarkBarFieldClass, 'h-8 w-12 px-1 text-center')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onJumpToGo()
              }}
            />
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'h-8 px-2')}
              onClick={onJumpToGo}
            >
              Go
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'h-8 px-2')}
              disabled={page <= 1}
              onClick={onPrevPage}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="whitespace-nowrap text-xs text-stone-300">
              {page} / {Math.max(pageCount, 1)}
            </span>
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'h-8 px-2')}
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
  )
}
