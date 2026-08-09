import { cn } from '@/lib/utils'
import { limsPrimaryBtnClass, limsDarkBarSearchClass, limsDarkBarFieldClass, limsDarkBarBtnClass, limsAiTriggerClass } from '@/lib/limsThemeUi'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function IqcHeaderBar({
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
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4 flex-1">
        <h1 className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">IQC Masters Directory</h1>
        <div className="w-full md:max-w-md">
          <Input placeholder="Search IQC Masters..." value={search} onChange={(e) => onSearchChange(e.target.value)} className={limsDarkBarSearchClass} />
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
      <div className="flex items-center justify-end">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <QiAssistant
            page="iqc_masters"
            pageTitle="IQC Masters Directory"
            contextSummary={assistantContext}
            suggestedQuestions={[
              'Add a new IQC Master Calibrator',
              'Show the calibration points for the Master standard',
              'Which IQC standard is expiring soon?',
            ]}
            onDataChanged={onAssistantDataChanged}
            triggerVariant="icon"
            triggerClassName={limsAiTriggerClass}
          />
          <Button type="button" className={cn('gap-2', limsPrimaryBtnClass)} onClick={onNew}>
            <Plus size={16} />
            Add New IQC Master
          </Button>
        </div>
      </div>
    </div>
  )
}
