import { useState } from 'react'
import { FileCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { TestAllocationRow } from '../types'
import { ResultsUnderReviewAssistant } from './ResultsUnderReviewAssistant'
import { ResultsReviewedSrfsDialog } from './ResultsReviewedSrfsDialog'

export function ResultsUnderReviewHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  assistantRows,
  reviewedRows,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  assistantRows: TestAllocationRow[]
  reviewedRows: TestAllocationRow[]
}) {
  const [reviewedOpen, setReviewedOpen] = useState(false)

  return (
    <>
      <div className={cn(limsPanelClass)}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

          <div className="relative flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
            <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
              Results Under Review
            </h1>

            <div className="relative order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[40%] sm:max-w-[19.5rem] sm:flex-none">
              <Input
                type="search"
                placeholder="Search section, SRF, results…"
                aria-label="Search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className={cn(limsDarkBarSearchClass, 'h-8')}
              />
            </div>

            <div className="w-[6.5rem] shrink-0">
              <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger
                  className={cn(
                    limsDarkBarFieldClass,
                    'w-full border-amber-500/40 text-amber-100 focus:border-amber-500 focus:bg-stone-900 focus:text-amber-50',
                  )}
                  aria-label="Rows per page"
                >
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

            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('gap-1.5', limsDarkBarBtnClass)}
                onClick={() => setReviewedOpen(true)}
                aria-label="Results Reviewed"
                title="View SRFs with reviewed results"
              >
                <FileCheck2 size={14} />
                <span className="hidden sm:inline">Results Reviewed</span>
                <span className="sm:hidden">Reviewed</span>
              </Button>
              <ResultsUnderReviewAssistant rows={assistantRows} search={search} />
            </div>
          </div>
        </div>
      </div>

      <ResultsReviewedSrfsDialog
        open={reviewedOpen}
        onOpenChange={setReviewedOpen}
        rows={reviewedRows}
      />
    </>
  )
}
