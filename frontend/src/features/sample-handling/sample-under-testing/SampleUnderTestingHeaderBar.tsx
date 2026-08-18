import { useState } from 'react'
import { FileCheck } from 'lucide-react'
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
import { HiddenSrfsDiagnosticBadge } from './HiddenSrfsDiagnosticBadge'
import { SampleUnderTestingAssistant } from './SampleUnderTestingAssistant'
import { SubmittedForReviewSrfsDialog } from './SubmittedForReviewSrfsDialog'
import type { SampleUnderTestingLoadDiagnostics } from './sampleUnderTestingDiagnostics'
import type { TestAllocationRow } from '../types'

export function SampleUnderTestingHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  showDiagnostics,
  diagnostics,
  diagnosticsLoading,
  assistantRows,
  submittedForReviewRows,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  showDiagnostics: boolean
  diagnostics: SampleUnderTestingLoadDiagnostics | null
  diagnosticsLoading: boolean
  assistantRows: TestAllocationRow[]
  submittedForReviewRows: TestAllocationRow[]
}) {
  const [submittedOpen, setSubmittedOpen] = useState(false)

  return (
    <>
      <div className={cn(limsPanelClass)}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

          <div className="relative flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
            <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
              Sample Under Testing
            </h1>

            <div className="order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[40%] sm:max-w-[19.5rem] sm:flex-none">
              <Input
                type="search"
                placeholder="Search Section | SRF | Results"
                aria-label="Search Section, SRF, Results"
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

            {showDiagnostics ? (
              <HiddenSrfsDiagnosticBadge diagnostics={diagnostics} loading={diagnosticsLoading} />
            ) : null}

            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('gap-1.5', limsDarkBarBtnClass)}
                onClick={() => setSubmittedOpen(true)}
                aria-label="Submitted for Review"
                title="View all SRFs submitted for review"
              >
                <FileCheck size={14} />
                <span className="hidden sm:inline">Submitted for Review</span>
                <span className="sm:hidden">Submitted</span>
              </Button>
              <SampleUnderTestingAssistant rows={assistantRows} search={search} />
            </div>
          </div>
        </div>
      </div>

      <SubmittedForReviewSrfsDialog
        open={submittedOpen}
        onOpenChange={setSubmittedOpen}
        rows={submittedForReviewRows}
      />
    </>
  )
}
