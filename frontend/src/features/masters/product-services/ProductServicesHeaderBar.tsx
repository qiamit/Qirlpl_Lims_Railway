import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function ProductServicesHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  assistantContext,
  onAssistantDataChanged,
  pageTitle = 'NABL Scope',
  addButtonLabel = 'Add Scope Entry',
  qiPage = 'nabl-scope',
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
  pageTitle?: string
  addButtonLabel?: string
  qiPage?: string
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">
          {pageTitle}
        </h1>
        <div className="md:w-[40%]">
          <Input
            placeholder="Search discipline, material, parameter, method…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="w-28">
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger aria-label="Rows per page">
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
            page={qiPage}
            pageTitle={pageTitle}
            contextSummary={assistantContext}
            suggestedQuestions={[
              'Summarize scope entries by discipline group',
              'Add a new product / service entry for chemical testing on steel samples',
              'Which test methods are listed for mechanical testing?',
              'Update the test method for scope entry S.No 5',
            ]}
            welcomeMessage={`Ask me about **${pageTitle}** — search, summarize, add, update or delete entries. I can also explain ISO/IEC 17025 scope requirements.`}
            onDataChanged={onAssistantDataChanged}
          />
          <Button type="button" className="gap-2" onClick={onNew} aria-label={addButtonLabel}>
            <Plus size={16} />
            {addButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
