import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function SampleAllocationHeaderBar({
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
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">Sample Allocation</h1>
        <div className="md:w-[40%]">
          <Input placeholder="Search..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
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
            page="samples/allocation"
            pageTitle="Sample Allocation"
            contextSummary={assistantContext}
            suggestedQuestions={[
              'Which SRFs are allocated to the Mechanical department?',
              'Add a new section code for an SRF',
              'Update department or quantity for a section code',
              'Explain the difference between Sample Allocation and Test Allocation',
            ]}
            onDataChanged={onAssistantDataChanged}
          />
          <Button type="button" className="gap-2" onClick={onNew}>
            <Plus size={16} />
            Add a Section Code
          </Button>
        </div>
      </div>
    </div>
  )
}

