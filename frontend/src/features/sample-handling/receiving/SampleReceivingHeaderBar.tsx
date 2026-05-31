import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function SampleReceivingHeaderBar({
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
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">Sample Receiving</h1>
        <div className="md:w-[40%]">
          <Input placeholder="Search by SRF number, customer, sample code…" value={search} onChange={(e) => onSearchChange(e.target.value)} />
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
            page="samples/receiving"
            pageTitle="Sample Receiving"
            contextSummary={assistantContext}
            enablePdfImport
            pdfAttachHint="Test Request PDF"
            welcomeMessage="Hello! I'm **QI Assistant** for **Sample Receiving**. Attach a **Test Request PDF**, then ask me to **register the sample** — I'll fill fields from the document and create the entry. SRF number is auto-generated."
            suggestedQuestions={[
              'Register this test request as a new sample',
              'Extract customer and sample details from the attached PDF',
              'Which client matches this test request?',
              'Summarize samples currently in receiving',
            ]}
            onDataChanged={onAssistantDataChanged}
          />
          <Button type="button" className="gap-2" onClick={onNew}>
            <Plus size={16} />
            Add New Sample
          </Button>
        </div>
      </div>
    </div>
  )
}
