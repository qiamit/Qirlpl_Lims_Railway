import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import {
  limsAiTriggerClass,
  limsDarkBarFieldClass,
  limsDarkBarSearchClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function EquipmentBreakdownHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  assistantContext,
  onAssistantDataChanged,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
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
        <div className="relative flex flex-wrap items-center gap-2 lg:flex-nowrap sm:gap-3">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
            Equipment Breakdown Register
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
                placeholder="Search register, asset, nature…"
                className={cn(limsDarkBarSearchClass, 'pl-9')}
                aria-label="Search breakdown register"
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
            <QiAssistant
              page="equipment-breakdown-register"
              pageTitle="Equipment Breakdown Register"
              contextSummary={assistantContext}
              suggestedQuestions={[
                'List open breakdowns',
                'Which equipment is Under Repair?',
                'Summarize downtime this month',
                'Add a breakdown for an asset code',
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
              aria-label="Add Breakdown"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add Breakdown</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
