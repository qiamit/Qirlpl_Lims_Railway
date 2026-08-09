import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ConsentLetterFooterBar({
  loading,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  loading: boolean
  page: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (v: string) => void
  onJumpToGo: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={onPrevPage} disabled={loading || page <= 1}>
              Prev
            </Button>
            <div className="text-sm font-medium text-stone-300">
              Page {page} / {pageCount}
            </div>
            <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={onNextPage} disabled={loading || page >= pageCount}>
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
            <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={onJumpToGo} disabled={loading}>
              Go
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
