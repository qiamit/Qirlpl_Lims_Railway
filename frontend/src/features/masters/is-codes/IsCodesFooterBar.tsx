import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
import { ChevronLeft, ChevronRight, Download, FileUp, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function IsCodesTableFooterBar({
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
  onJumpToChange: (v: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-col gap-3 relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className={cn('gap-1.5', limsDarkBarBtnClass)} onClick={onImport} disabled={loading}>
            <FileUp size={14} />
            Import
          </Button>
          <Button type="button" variant="outline" size="sm" className={cn('gap-1.5', limsDarkBarBtnClass)} onClick={onExport} disabled={loading}>
            <Download size={14} />
            Export
          </Button>
          <Button type="button" variant="outline" size="sm" className={cn('gap-1.5', limsDarkBarBtnClass)} onClick={onPrintSelected} disabled={loading}>
            <Printer size={14} />
            Print
          </Button>
          <Button
            type="button"
            variant="destructive" size="sm" className={limsDeleteBtnClass}
            onClick={onDeleteSelected}
            disabled={loading || selectionDisabled}
          >
            <Trash2 size={14} />
            Delete
          </Button>
          {selectedCount > 0 ? (
            <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
          ) : null}
          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved') ||
                message.toLowerCase().includes('deleted') ||
                message.toLowerCase().includes('imported')
                  ? 'text-sm text-emerald-300'
                  : 'text-sm text-stone-300'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto sm:gap-3">
          <p className="shrink-0 text-sm text-stone-300">
            Showing <span className="font-medium text-white">{from}</span>–
            <span className="font-medium text-white">{to}</span> of{' '}
            <span className="font-medium text-white">{totalCount}</span>
          </p>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-[110px] shrink-0')} aria-label="Rows per page">
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
            className={cn(limsDarkBarFieldClass, 'w-14 shrink-0 sm:w-16')}
            inputMode="numeric"
          />
          <Button type="button" variant="outline" size="sm" className={cn('shrink-0', limsDarkBarBtnClass)} onClick={onJumpToGo} disabled={loading}>
            Jump
          </Button>
          <Button
            type="button"
            variant="outline" size="icon" className={cn('h-9 w-9 shrink-0', limsDarkBarBtnClass)}
            onClick={onPrevPage}
            disabled={loading || page <= 1}
          >
            <ChevronLeft size={16} />
            <span className="sr-only">Previous page</span>
          </Button>
          <span className="min-w-[5.5rem] shrink-0 text-center text-xs font-medium text-stone-300">
            Page {page} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline" size="icon" className={cn('h-9 w-9 shrink-0', limsDarkBarBtnClass)}
            onClick={onNextPage}
            disabled={loading || page >= pageCount}
          >
            <ChevronRight size={16} />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
