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
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import type { ManagementDocLevel, ManagementDocStatus } from './types'
import { levelPageTitle, MANAGEMENT_DOC_STATUSES, statusLabel } from './types'

export type StatusCounts = Record<ManagementDocStatus | 'all', number>

export function ManagementDocumentsHeaderBar({
  level,
  search,
  onSearchChange,
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-4">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h1>
          <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-xs md:max-w-sm lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 pl-9"
              aria-label={`Search ${title}`}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-slate-300"
                aria-label="Filter by status"
              >
                <Filter size={14} />
                <span className="hidden sm:inline">Filter</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
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
                  <span className="tabular-nums text-muted-foreground">{statusCounts.all}</span>
                </DropdownMenuRadioItem>
                {MANAGEMENT_DOC_STATUSES.map((s) => (
                  <DropdownMenuRadioItem key={s.id} value={s.id} className="justify-between gap-4">
                    <span>{s.label}</span>
                    <span className="tabular-nums text-muted-foreground">{statusCounts[s.id] ?? 0}</span>
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
          />
          <Button type="button" className="gap-2 shrink-0" size="sm" onClick={onNew} aria-label="Add Document">
            <Plus size={14} />
            <span className="hidden sm:inline">Add Document</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      <div className="relative w-full sm:hidden">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search documents…"
          className="h-9 pl-9"
          aria-label={`Search ${title}`}
        />
      </div>
    </div>
  )
}
