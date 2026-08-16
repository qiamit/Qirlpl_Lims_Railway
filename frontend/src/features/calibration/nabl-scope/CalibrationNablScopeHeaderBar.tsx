import { cn } from '@/lib/utils'
import {
  limsPrimaryBtnClass,
  limsDarkBarSearchClass,
  limsDarkBarFieldClass,
  limsAiTriggerClass,
} from '@/lib/limsThemeUi'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function CalibrationNablScopeHeaderBar({
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
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-4 text-white shadow-sm ring-1 ring-amber-700/20 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="whitespace-nowrap text-lg font-semibold tracking-tight text-white">
          NABL Scope
        </h1>
        <div className="md:w-[40%]">
          <Input
            placeholder="Search measurand, method, CMC…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search calibration NABL scope"
            className={limsDarkBarSearchClass}
          />
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <QiAssistant
          page="calibration-nabl-scope"
          pageTitle="Calibration NABL Scope"
          contextSummary={assistantContext}
          suggestedQuestions={[
            'Summarize CMC entries by facility type',
            'List all Permanent facility scope lines',
            'Add a new DC voltage calibration scope entry',
            'Which methods use Site or Mobile facility?',
          ]}
          welcomeMessage="Ask me about **Calibration NABL Scope** — search, summarize, add, update or delete accreditation scope entries (measurand, method, range, CMC, facility)."
          onDataChanged={onAssistantDataChanged}
          triggerVariant="icon"
          triggerClassName={limsAiTriggerClass}
        />
        <Button
          type="button"
          className={cn('gap-2', limsPrimaryBtnClass)}
          onClick={onNew}
          aria-label="Add Scope Entry"
        >
          <Plus size={16} />
          Add Scope Entry
        </Button>
      </div>
    </div>
  )
}
