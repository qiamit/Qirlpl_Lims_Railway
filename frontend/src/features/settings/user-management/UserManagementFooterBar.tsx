import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type UserManagementFooterBarProps = {
  totalCount: number
  page: number
  pageCount: number
  pageSize: number
  jumpTo: string
  onPageSizeChange: (size: number) => void
  onPrevPage: () => void
  onNextPage: () => void
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}

export function UserManagementFooterBar({
  totalCount,
  page,
  pageCount,
  pageSize,
  jumpTo,
  onPageSizeChange,
  onPrevPage,
  onNextPage,
  onJumpToChange,
  onJumpToGo,
}: UserManagementFooterBarProps) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-col gap-3 relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-stone-300">
          Showing <span className="font-medium text-white">{from}</span>–
          <span className="font-medium text-white">{to}</span> of{' '}
          <span className="font-medium text-white">{totalCount}</span>
        </p>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className={cn(limsDarkBarFieldClass, 'h-9 w-[118px]')} aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 / Page</SelectItem>
            <SelectItem value="10">10 / Page</SelectItem>
            <SelectItem value="20">20 / Page</SelectItem>
            <SelectItem value="50">50 / Page</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          aria-label="Jump to page"
          placeholder="Page"
          value={jumpTo}
          onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onJumpToGo()
          }}
          className={cn(limsDarkBarFieldClass, 'w-14 sm:w-16')}
        />
        <Button type="button" variant="outline" size="sm" onClick={onJumpToGo}>
          Jump
        </Button>
        <Button type="button" variant="outline" size="icon" className={cn('h-9 w-9', limsDarkBarBtnClass)} onClick={onPrevPage} disabled={page <= 1}>
          <ChevronLeft size={16} />
          <span className="sr-only">Previous page</span>
        </Button>
        <span className="min-w-[5.5rem] text-center text-xs font-medium text-stone-300">
          Page {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline" size="icon" className={cn('h-9 w-9', limsDarkBarBtnClass)}
          onClick={onNextPage}
          disabled={page >= pageCount}
        >
          <ChevronRight size={16} />
          <span className="sr-only">Next page</span>
        </Button>
      </div>
    </div>
  )
}
