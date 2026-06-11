import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function EquipmentHeaderBar({
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
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between app-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4 flex-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">Equipment Directory</h1>
        <div className="w-full md:max-w-md">
          <Input placeholder="Search Equipment..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
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
            page="equipment_master"
            pageTitle="Equipment Directory"
            contextSummary={assistantContext}
            suggestedQuestions={[
              'Add a new equipment Digital Micrometer',
              'Summarize the active status of laboratory equipment',
              'Which equipment requires calibration next?',
              'What is the custodian for the Vernier Caliper?',
            ]}
            onDataChanged={onAssistantDataChanged}
          />
          <Button type="button" className="gap-2" onClick={onNew}>
            <Plus size={16} />
            Add New Equipment
          </Button>
        </div>
      </div>
    </div>
  )
}
