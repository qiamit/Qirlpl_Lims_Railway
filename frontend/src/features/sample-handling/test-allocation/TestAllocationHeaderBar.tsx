import { useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import {
  limsAiTriggerClass,
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { TestAllocationRow } from '../types'
import { SrfsInTestingDialog } from './SrfsInTestingDialog'

type EmployeeOption = { id: string; name: string }

export function TestAllocationHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  employeeOptions,
  selectedEmployeeId,
  onEmployeeFilterChange,
  assistantContextSummary,
  onAssistantDataChanged,
  sentForTestingRows,
  onViewSentParameters,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  employeeOptions?: EmployeeOption[]
  selectedEmployeeId?: string
  onEmployeeFilterChange?: (value: string) => void
  assistantContextSummary?: string
  onAssistantDataChanged?: () => void
  sentForTestingRows?: TestAllocationRow[]
  onViewSentParameters?: (row: TestAllocationRow) => void
}) {
  const [srfsInTestingOpen, setSrfsInTestingOpen] = useState(false)

  return (
    <>
      <div className={cn(limsPanelClass)}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

          <div className="relative flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
            <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
              Test Allocation
            </h1>

            <div className="order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[40%] sm:max-w-[19.5rem] sm:flex-none">
              <Input
                type="search"
                placeholder="Search"
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
              {employeeOptions && employeeOptions.length > 0 ? (
                  <Select
                    value={selectedEmployeeId ?? 'all'}
                    onValueChange={(v) => onEmployeeFilterChange?.(v === 'all' ? '' : v)}
                  >
                    <SelectTrigger
                      className={cn(
                        limsDarkBarFieldClass,
                        'h-8 w-[160px] border-amber-500/40 text-amber-100 focus:border-amber-500 focus:bg-stone-900 focus:text-amber-50',
                      )}
                      aria-label="Filter by employee"
                    >
                      <SelectValue placeholder="All Employees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employeeOptions.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('gap-1.5', limsDarkBarBtnClass)}
                onClick={() => setSrfsInTestingOpen(true)}
                aria-label="SRF Sent for Testing"
              >
                <FlaskConical size={14} />
                <span className="hidden sm:inline">SRF Sent for Testing</span>
                <span className="sm:hidden">Sent</span>
              </Button>

              {assistantContextSummary ? (
                <QiAssistant
                  page="samples/test-allocation"
                  pageTitle="Test Allocation"
                  contextSummary={assistantContextSummary}
                  triggerVariant="icon"
                  triggerClassName={limsAiTriggerClass}
                  welcomeMessage="I'm your **Test Allocation Assistant**. I can summarize allotted sections, explain pending vs sent status, and help update allocations when you ask."
                  suggestedQuestions={[
                    'Summarize pending vs sent for testing sections',
                    'Which sections still need an employee assigned?',
                    'What happens when I refer back to Sample Allocation?',
                    'Explain how to allot tests for a section code',
                  ]}
                  onDataChanged={onAssistantDataChanged}
                  enablePdfImport={false}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <SrfsInTestingDialog
        open={srfsInTestingOpen}
        onOpenChange={setSrfsInTestingOpen}
        rows={sentForTestingRows ?? []}
        onViewParameters={(row) => {
          setSrfsInTestingOpen(false)
          // Let the parent dialog unmount before opening the parameters dialog.
          window.setTimeout(() => onViewSentParameters?.(row), 0)
        }}
      />
    </>
  )
}
