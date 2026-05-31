import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TestReportPreparationAssistant } from './TestReportPreparationAssistant'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'

export function TestReportPreparationHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  assistantRows,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  assistantRows: ReportPreparationListRow[]
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between app-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">
          Test Report Preparation
        </h1>
        <div className="md:w-[40%]">
          <Input
            placeholder="Search SRF, client, IS…"
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
        <TestReportPreparationAssistant rows={assistantRows} search={search} />
      </div>
    </div>
  )
}
