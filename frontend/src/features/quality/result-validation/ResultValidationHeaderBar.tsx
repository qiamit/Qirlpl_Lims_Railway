import { cn } from '@/lib/utils'
import { limsPrimaryBtnClass, limsDarkBarSearchClass, limsDarkBarFieldClass, limsDarkBarBtnClass, limsAiTriggerClass } from '@/lib/limsThemeUi'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RESULT_VALIDITY_STATUS_LABELS } from './checkTypes'
import type { ResultValidationModuleDef } from './resultValidationModules'
import type { ResultValidityFilter } from './types'

export function ResultValidationHeaderBar({
  module,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  filter,
  onFilterChange,
  recordCount,
  onNewCheck,
}: {
  module: ResultValidationModuleDef
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  filter: ResultValidityFilter
  onFilterChange: (value: ResultValidityFilter) => void
  recordCount: number
  onNewCheck: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-amber-200/80">
              Validating the Results
            </p>
            <h1 className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">
              {module.label}
            </h1>
            <p className="mt-0.5 text-xs text-stone-300">
              ISO 17025 Clause {module.clause} — {module.description}
            </p>
          </div>
          <div className="md:w-[28%]">
            <Input
              placeholder="Search ref, title, SRF…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)} className={limsDarkBarSearchClass}
            />
          </div>
          <div className="w-36">
            <Select value={filter} onValueChange={(v) => onFilterChange(v as ResultValidityFilter)}>
              <SelectTrigger aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {Object.entries(RESULT_VALIDITY_STATUS_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-full')} aria-label="Rows per page">
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
        </div>
        <Button type="button" className={cn('gap-1.5 shrink-0', limsPrimaryBtnClass)} onClick={onNewCheck}>
          <Plus size={16} />
          New Check
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-4 py-3">
        <p className="text-xs text-amber-200/80">{module.clause}</p>
        <p className="mt-0.5 text-sm font-medium text-white">{recordCount} record(s) in this module</p>
      </div>
    </div>
  )
}
