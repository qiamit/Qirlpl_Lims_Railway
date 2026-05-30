import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, FileUp, Printer, Trash2 } from 'lucide-react'

export function IsCodesTableFooterBar({
  message,
  loading,
  selectedCount,
  onImport,
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
  onImport: () => void
  onExport: () => void
  onPrintSelected: () => void
  onDeleteSelected: () => void
  page: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (v: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onImport} disabled={loading}>
            <FileUp size={16} />
            Import
          </Button>
          <Button type="button" variant="outline" onClick={onExport} disabled={loading}>
            <Download size={16} />
            Export
          </Button>
          <Button type="button" variant="outline" onClick={onPrintSelected} disabled={loading}>
            <Printer size={16} />
            Print
          </Button>
          <Button type="button" variant="destructive" onClick={onDeleteSelected} disabled={loading || selectionDisabled}>
            <Trash2 size={16} />
            Delete
          </Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onPrevPage} disabled={loading || page <= 1}>
              Prev
            </Button>
            <div className="text-sm font-medium text-muted-foreground">
              Page {page} / {pageCount}
            </div>
            <Button type="button" variant="outline" onClick={onNextPage} disabled={loading || page >= pageCount}>
              Next
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              className="w-24"
              placeholder="Go to"
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value)}
              inputMode="numeric"
            />
            <Button type="button" variant="outline" onClick={onJumpToGo} disabled={loading}>
              Go
            </Button>
          </div>
        </div>
      </div>

      {message && <div className="mt-2 text-sm text-muted-foreground">{message}</div>}
    </div>
  )
}
