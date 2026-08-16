import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { limsDarkBarFieldClass, limsDarkBarSearchClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { CalibrationSource, DueBucket } from './types'

export function CalibrationScheduleHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  sourceFilter,
  onSourceFilterChange,
  dueFilter,
  onDueFilterChange,
  counts,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  sourceFilter: 'all' | CalibrationSource
  onSourceFilterChange: (value: 'all' | CalibrationSource) => void
  dueFilter: 'all' | DueBucket
  onDueFilterChange: (value: 'all' | DueBucket) => void
  counts: { total: number; overdue: number; dueSoon: number }
}) {
  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
            <div className="shrink-0">
              <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Calibration Schedule
              </h1>
            </div>

            <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-none sm:ml-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-[16rem] sm:flex-none">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search asset, name, location…"
                  className={cn(limsDarkBarSearchClass, 'pl-9')}
                  aria-label="Search calibration schedule"
                />
              </div>

              <Select
                value={sourceFilter}
                onValueChange={(v) => onSourceFilterChange(v as 'all' | CalibrationSource)}
              >
                <SelectTrigger
                  className={cn(limsDarkBarFieldClass, 'h-9 w-[11rem]')}
                  aria-label="Filter by source"
                >
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="testing_master">Testing Master</SelectItem>
                  <SelectItem value="calibration_master">Calibration Master</SelectItem>
                  <SelectItem value="testing_iqc">Testing IQC</SelectItem>
                  <SelectItem value="calibration_iqc">Calibration IQC</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={dueFilter}
                onValueChange={(v) => onDueFilterChange(v as 'all' | DueBucket)}
              >
                <SelectTrigger
                  className={cn(limsDarkBarFieldClass, 'h-9 w-[10rem]')}
                  aria-label="Filter by due status"
                >
                  <SelectValue placeholder="Due status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Due Status</SelectItem>
                  <SelectItem value="overdue">Overdue ({counts.overdue})</SelectItem>
                  <SelectItem value="due_soon">Due Soon ({counts.dueSoon})</SelectItem>
                  <SelectItem value="ok">On Schedule</SelectItem>
                  <SelectItem value="unknown">No Due Date</SelectItem>
                </SelectContent>
              </Select>

              <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger
                  className={cn(limsDarkBarFieldClass, 'h-9 w-[7.5rem]')}
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / Page</SelectItem>
                  <SelectItem value="20">20 / Page</SelectItem>
                  <SelectItem value="50">50 / Page</SelectItem>
                  <SelectItem value="100">100 / Page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
