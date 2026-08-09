import { cn } from '@/lib/utils'
import { limsPrimaryBtnClass, limsDarkBarSearchClass, limsDarkBarFieldClass, limsDarkBarBtnClass, limsAiTriggerClass } from '@/lib/limsThemeUi'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RetainDisposedFilter } from './types'

export function RetainDisposedHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  filter,
  onFilterChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  filter: RetainDisposedFilter
  onFilterChange: (value: RetainDisposedFilter) => void
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">
            Retain &amp; Disposed Sample
          </h1>
        </div>
        <div className="md:w-[32%]">
          <Input
            placeholder="Search SRF, IS code…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)} className={limsDarkBarSearchClass}
          />
        </div>
        <div className="w-36">
          <Select value={filter} onValueChange={(v) => onFilterChange(v as RetainDisposedFilter)}>
            <SelectTrigger aria-label="Filter retention status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All records</SelectItem>
              <SelectItem value="retained">Retained</SelectItem>
              <SelectItem value="due">Due for disposal</SelectItem>
              <SelectItem value="closed">Disposed / Returned</SelectItem>
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
    </div>
  )
}
