import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass } from '@/lib/limsThemeUi'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SampleHandlingDeleteButton } from '@/features/sample-handling/shared/SampleHandlingDeleteButton'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function TestAllocationFooterBar({
  page,
  pageCount,
  jumpTo,
  onJumpToChange,
  onJump,
  onPrev,
  onNext,
  selectedCount,
  saveMessage,
  loading,
  showDelete,
  onDeleteSelected,
}: {
  page: number
  pageCount: number
  jumpTo: string
  onJumpToChange: (v: string) => void
  onJump: () => void
  onPrev: () => void
  onNext: () => void
  selectedCount: number
  saveMessage: string | null
  loading: boolean
  showDelete?: boolean
  onDeleteSelected?: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <LaboratoryDirectorOnly>
            <Button type="button" variant="outline" className={limsDarkBarBtnClass} disabled>
              <Printer size={16} /> Print
            </Button>
            {showDelete && onDeleteSelected ? (
              <SampleHandlingDeleteButton
                disabled={loading || selectedCount === 0}
                onClick={onDeleteSelected}
              />
            ) : null}
          </LaboratoryDirectorOnly>
        </div>
        <div className="flex items-center gap-2">
          {saveMessage && <p className="text-sm text-emerald-300">{saveMessage}</p>}
          <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
          <Input
            className={cn(limsDarkBarFieldClass, 'w-14 sm:w-16')}
            placeholder="Page"
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <Button type="button" variant="outline" size="sm" className={limsDarkBarBtnClass} onClick={onJump}>
            Jump
          </Button>
          <Button type="button" variant="outline" size="icon" className={cn('h-8 w-8', limsDarkBarBtnClass)} onClick={onPrev} disabled={page <= 1}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-xs font-medium text-stone-300">
            Page {page} / {pageCount}
          </span>
          <Button type="button" variant="outline" size="icon" className={cn('h-8 w-8', limsDarkBarBtnClass)} onClick={onNext} disabled={loading || page >= pageCount}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
