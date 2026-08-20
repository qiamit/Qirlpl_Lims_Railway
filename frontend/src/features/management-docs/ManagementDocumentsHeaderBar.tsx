import { cn } from '@/lib/utils'
import {
  limsAiTriggerClass,
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarSearchClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { Filter, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import type { ManagementDocLevel, ManagementDocStatus } from './types'
import { levelPageTitle, MANAGEMENT_DOC_STATUSES, statusLabel } from './types'

export type StatusCounts = Record<ManagementDocStatus | 'all', number>

export function ManagementDocumentsHeaderBar({
  level,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  assistantContext,
  onAssistantDataChanged,
}: {
  level: ManagementDocLevel
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
  statusFilter: ManagementDocStatus | 'all'
  onStatusFilterChange: (value: ManagementDocStatus | 'all') => void
  statusCounts: StatusCounts
  assistantContext: string
  onAssistantDataChanged?: () => void
}) {
  const title = levelPageTitle(level)
  const filterLabel =
    statusFilter === 'all' ? 'All' : statusLabel(statusFilter)
  const filterCount = statusCounts[statusFilter] ?? 0

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

        <div className="relative flex flex-wrap items-center gap-2 lg:flex-nowrap sm:gap-3">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
            {title}
          </h1>

          <div className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-none sm:mx-1 sm:w-auto sm:max-w-none sm:flex-none">
            <div className="relative min-w-0 flex-1 sm:w-[70%] sm:max-w-[19.5rem] sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search documents…"
                className={cn(limsDarkBarSearchClass, 'pl-9')}
                aria-label={`Search ${title}`}
              />
            </div>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger
                className={cn(limsDarkBarFieldClass, 'h-9 w-[7.5rem] shrink-0')}
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

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn('h-8 gap-1.5', limsDarkBarBtnClass)}
                  aria-label="Filter by status"
                >
                  <Filter size={14} />
                  <span className="hidden sm:inline">Filter</span>
                  <span className="rounded bg-stone-900/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-100/90">
                    {filterLabel} {filterCount}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(v) => onStatusFilterChange(v as ManagementDocStatus | 'all')}
                >
                  <DropdownMenuRadioItem value="all" className="justify-between gap-4">
                    <span>All</span>
                    <span className="tabular-nums text-stone-400">{statusCounts.all}</span>
                  </DropdownMenuRadioItem>
                  {MANAGEMENT_DOC_STATUSES.map((s) => (
                    <DropdownMenuRadioItem key={s.id} value={s.id} className="justify-between gap-4">
                      <span>{s.label}</span>
                      <span className="tabular-nums text-stone-400">{statusCounts[s.id] ?? 0}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <QiAssistant
              page={`management-docs/level-${level}`}
              pageTitle={title}
              contextSummary={assistantContext}
              suggestedQuestions={[
                `List active Level ${level} documents`,
                `Add a new Level ${level} document draft`,
                'What is the difference between Active and Obsolete status?',
              ]}
              onDataChanged={onAssistantDataChanged}
              triggerVariant="icon"
              triggerClassName={limsAiTriggerClass}
            />
            <Button
              type="button"
              className={cn('gap-2 shrink-0', limsPrimaryBtnClass)}
              size="sm"
              onClick={onNew}
              aria-label="Add Document"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add Document</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
