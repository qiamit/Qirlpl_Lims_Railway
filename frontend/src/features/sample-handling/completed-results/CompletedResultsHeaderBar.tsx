import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IssuedTestReportAssistant } from './IssuedTestReportAssistant'
import type { IssuedTestReportListRow } from './types'

export function CompletedResultsHeaderBar({
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
  assistantRows: IssuedTestReportListRow[]
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between app-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">
          Issued Test Report
        </h1>
        <div className="md:w-[40%]">
          <Input
            placeholder="Search SRF, client, IS, report no…"
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
        <IssuedTestReportAssistant rows={assistantRows} search={search} />
      </div>
    </div>
  )
}
