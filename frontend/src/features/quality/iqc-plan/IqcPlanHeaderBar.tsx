import { cn } from '@/lib/utils'
import { limsPrimaryBtnClass, limsDarkBarSearchClass, limsDarkBarFieldClass, limsDarkBarBtnClass, limsAiTriggerClass } from '@/lib/limsThemeUi'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IQC_PLAN_STATUS_LABELS } from './iqcPlanStatus'
import type { IqcPlanFilter } from './types'

export function IqcPlanHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  filter,
  onFilterChange,
  onNewItem,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  filter: IqcPlanFilter
  onFilterChange: (value: IqcPlanFilter) => void
  onNewItem: () => void
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
            Validating the Results
          </p>
          <h1 className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">
            IQC Plan
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            ISO 17025 Clause 7.7 — Internal quality control plan and schedule
          </p>
        </div>
        <div className="md:w-[28%]">
          <Input
            placeholder="Search check name, frequency, criteria…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)} className={limsDarkBarSearchClass}
          />
        </div>
        <div className="w-36">
          <Select value={filter} onValueChange={(v) => onFilterChange(v as IqcPlanFilter)}>
            <SelectTrigger aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {Object.entries(IQC_PLAN_STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
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
      <Button type="button" className={cn('gap-1.5 shrink-0', limsPrimaryBtnClass)} onClick={onNewItem}>
        <Plus size={16} />
        Add Plan Item
      </Button>
    </div>
  )
}
