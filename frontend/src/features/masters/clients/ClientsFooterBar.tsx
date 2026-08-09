import { ChevronLeft, ChevronRight, Download, FileUp, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { clientDeleteBtnClass, clientPanelClass } from './clientsFormUi'
import { limsDarkBarBtnClass, limsDarkBarFieldClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

const footerBtnClass = limsDarkBarBtnClass
const footerFieldClass = limsDarkBarFieldClass

export function ClientsTableFooterBar({
  message,
  loading,
  selectedCount,
  totalCount,
  page,
  pageCount,
  pageSize,
  onPageSizeChange,
  onImport,
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
  totalCount: number
  page: number
  pageCount: number
  pageSize: number
  onPageSizeChange: (size: number) => void
  onImport: () => void
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
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className={cn(clientPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-1.5 text-white sm:px-5 sm:py-2">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('gap-1.5', footerBtnClass)}
              onClick={onImport}
              disabled={loading}
            >
              <FileUp size={14} />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('gap-1.5', footerBtnClass)}
              onClick={onExport}
              disabled={loading}
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('gap-1.5', footerBtnClass)}
              onClick={onPrintSelected}
              disabled={loading}
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Print</span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className={clientDeleteBtnClass}
              onClick={onDeleteSelected}
              disabled={loading || selectionDisabled}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Delete</span>
            </Button>
            {selectedCount > 0 ? (
              <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
            ) : null}
            {message ? (
              <p
                className={
                  message.toLowerCase().includes('saved') || message.toLowerCase().includes('deleted')
                    ? 'w-full text-sm text-emerald-300 sm:w-auto'
                    : 'w-full text-sm text-red-300 sm:w-auto'
                }
              >
                {message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-nowrap items-center justify-start gap-1.5 overflow-x-auto overscroll-x-contain sm:justify-end sm:gap-2 [-webkit-overflow-scrolling:touch]">
            <p className="shrink-0 whitespace-nowrap text-sm text-stone-300">
              Showing <span className="font-medium text-white">{from}</span>–
              <span className="font-medium text-white">{to}</span> of{' '}
              <span className="font-medium text-white">{totalCount}</span>
            </p>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className={cn(footerFieldClass, 'w-[110px] shrink-0')} aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 / Page</SelectItem>
                <SelectItem value="10">10 / Page</SelectItem>
                <SelectItem value="20">20 / Page</SelectItem>
                <SelectItem value="50">50 / Page</SelectItem>
              </SelectContent>
            </Select>
            <Input
              aria-label="Jump to page"
              placeholder="Page"
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onJumpToGo()
              }}
              className={cn(footerFieldClass, 'w-14 shrink-0 sm:w-16')}
              inputMode="numeric"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('shrink-0', footerBtnClass)}
              onClick={onJumpToGo}
              disabled={loading}
            >
              Jump
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn('h-8 w-8 shrink-0', footerBtnClass)}
              onClick={onPrevPage}
              disabled={loading || page <= 1}
            >
              <ChevronLeft size={16} />
              <span className="sr-only">Previous page</span>
            </Button>
            <span className="min-w-[4.5rem] shrink-0 whitespace-nowrap text-center text-xs font-medium text-stone-300">
              Page {page} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn('h-8 w-8 shrink-0', footerBtnClass)}
              onClick={onNextPage}
              disabled={loading || page >= pageCount}
            >
              <ChevronRight size={16} />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
