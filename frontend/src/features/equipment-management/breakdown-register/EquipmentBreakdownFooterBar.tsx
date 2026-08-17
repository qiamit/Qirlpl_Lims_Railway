import { ChevronLeft, ChevronRight, Download, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function EquipmentBreakdownFooterBar({
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
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  page: number
  pageCount: number
  onExport: () => void
  onPrintSelected: () => void
  onDeleteSelected: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
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
