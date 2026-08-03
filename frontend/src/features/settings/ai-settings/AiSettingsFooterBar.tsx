import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type AiSettingsFooterBarProps = {
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

export function AiSettingsFooterBar({
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
}: AiSettingsFooterBarProps) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{from}</span>–
          <span className="font-medium text-foreground">{to}</span> of{' '}
          <span className="font-medium text-foreground">{totalCount}</span>
        </p>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-9 w-[118px]" aria-label="Rows per page">
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
          className="h-9 w-20"
        />
        <Button type="button" variant="outline" size="sm" onClick={onJumpToGo}>
          Jump
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={onPrevPage} disabled={page <= 1}>
          <ChevronLeft size={16} />
          <span className="sr-only">Previous page</span>
        </Button>
        <span className="min-w-[5.5rem] text-center text-xs font-medium text-muted-foreground">
          Page {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
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
