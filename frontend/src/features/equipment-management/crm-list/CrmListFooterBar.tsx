import { ChevronLeft, ChevronRight, Download, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function CrmListFooterBar({
  message,
  loading,
  selectedCount,
  onExport,
  onPrintSelected,
  onDeleteSelected,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  onExport: () => void
  onPrintSelected: () => void
  onDeleteSelected: () => void
  page: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0

  return (
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-3 text-white shadow-sm ring-1 ring-amber-700/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
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

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          <div>
            {message ? (
              <p
                className={
                  message.toLowerCase().includes('saved') ||
                  message.toLowerCase().includes('deleted')
                    ? 'text-sm text-emerald-300'
                    : 'text-sm text-red-300'
                }
              >
                {message}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
            <Input
              aria-label="Jump to page"
              placeholder="Page"
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
              className={cn(limsDarkBarFieldClass, 'w-14 sm:w-16')}
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
            <span className="min-w-[4.5rem] text-center text-xs text-stone-300">
              {page} / {pageCount}
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
