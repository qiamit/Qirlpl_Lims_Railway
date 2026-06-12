import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

type EmployeeOption = { id: string; name: string }

export function TestAllocationHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  employeeOptions,
  selectedEmployeeId,
  onEmployeeFilterChange,
  assistantContextSummary,
  onAssistantDataChanged,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  employeeOptions?: EmployeeOption[]
  selectedEmployeeId?: string
  onEmployeeFilterChange?: (value: string) => void
  assistantContextSummary?: string
  onAssistantDataChanged?: () => void
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">Test Allocation</h1>
        <div className="md:w-[40%]">
          <Input placeholder="Search by section code, SRF..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
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
      <div className="flex items-center justify-end gap-2 flex-wrap">
        {employeeOptions && employeeOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap text-muted-foreground">Select Employee</Label>
            <Select
              value={selectedEmployeeId ?? 'all'}
              onValueChange={(v) => onEmployeeFilterChange?.(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employeeOptions.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {assistantContextSummary ? (
          <QiAssistant
            page="samples/test-allocation"
            pageTitle="Test Allocation"
            contextSummary={assistantContextSummary}
            triggerVariant="default"
            welcomeMessage="I'm your **Test Allocation Assistant**. I can summarize allotted sections, explain pending vs sent status, and help update allocations when you ask."
            suggestedQuestions={[
              'Summarize pending vs sent for testing sections',
              'Which sections still need an employee assigned?',
              'What happens when I refer back to Sample Allocation?',
              'Explain how to allot tests for a section code',
            ]}
            onDataChanged={onAssistantDataChanged}
            enablePdfImport={false}
          />
        ) : null}
      </div>
    </div>
  )
}
