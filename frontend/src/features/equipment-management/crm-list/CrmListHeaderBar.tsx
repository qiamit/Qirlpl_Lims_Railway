import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import {
  limsAiTriggerClass,
  limsDarkBarFieldClass,
  limsDarkBarSearchClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function CrmListHeaderBar({
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
          List of CRMs
        </h1>
        <div className="md:w-[40%]">
          <Input
            placeholder="Search ID, type, make, traceability…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search CRM list"
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
          page="equipment-crm-list"
          pageTitle="List of CRMs"
          contextSummary={assistantContext}
          suggestedQuestions={[
            'Summarize CRMs by type',
            'Which CRMs are expiring soon?',
            'Add a new CRM entry',
            'List CRM IDs and their uncertainty',
          ]}
          welcomeMessage="Ask me about **List of CRMs** — search, summarize, add, update or delete Certified Reference Material records."
          onDataChanged={onAssistantDataChanged}
          triggerVariant="icon"
          triggerClassName={limsAiTriggerClass}
        />
        <Button
          type="button"
          className={cn('gap-2', limsPrimaryBtnClass)}
          onClick={onNew}
          aria-label="Add CRM"
        >
          <Plus size={16} />
          Add CRM
        </Button>
      </div>
    </div>
  )
}
