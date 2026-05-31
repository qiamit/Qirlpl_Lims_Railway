import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant, type QiAssistantIsCodeOption } from '@/components/qi-assistant/QiAssistant'

export function TestParameterHeaderBar({
  title = 'Test Parameter',
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  assistantContext,
  onAssistantDataChanged,
  isCodeOptions = [],
}: {
  title?: string
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (value: number) => void
  onNew: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
  isCodeOptions?: QiAssistantIsCodeOption[]
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">{title}</h1>
        <div className="md:w-[40%]">
          <Input placeholder="Search..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <div className="w-28">
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / Page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-end">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <QiAssistant
            page="test-parameter"
            pageTitle="Test Parameter Master"
            contextSummary={assistantContext}
            isCodeOptions={isCodeOptions}
            suggestedQuestions={[
              'Import all chemical test parameters from the selected IS PDF',
              'Add test parameters for Carbon, Sulphur and Phosphorus from this IS',
              'Summarize test parameters already in the list for this IS',
              'Which clauses in the PDF define mechanical tests?',
            ]}
            welcomeMessage="Select an **IS Code** below (PDFs from IS Code Master are read automatically). Tap **!** to activate a **Skill**, then ask me to **extract and add test parameters** (item name, clause, unit, requirement, test method) into Test Parameter Master."
            onDataChanged={onAssistantDataChanged}
            enablePdfImport={false}
          />
          <Button type="button" className="gap-2" onClick={onNew}>
            <Plus size={16} />
            Add New Test Parameter
          </Button>
        </div>
      </div>
    </div>
  )
}
