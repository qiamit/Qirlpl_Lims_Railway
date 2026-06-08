import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import type { TestAllocationRow } from '../types'
import { FlaskConical, Inbox, Pencil, Undo2 } from 'lucide-react'
import {
  buildTestAllocationRowAssistantContext,
  formatTestAllocationRowTitle,
} from './buildTestAllocationAssistantContext'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')

export function TestAllocationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onAddTestParameter,
  onReferback,
  onReferbackToReceiving,
  onSendForTesting,
  onAssistantDataChanged,
}: {
  rows: TestAllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleAllocationId: string) => void
  onToggleAll: (checked: boolean) => void
  onAddTestParameter: (row: TestAllocationRow) => void
  onReferback: (row: TestAllocationRow) => void
  onReferbackToReceiving: (row: TestAllocationRow) => void
  onSendForTesting: (row: TestAllocationRow) => void
  onAssistantDataChanged?: () => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.sampleAllocationId))
  const someChecked = rows.some((r) => selectedIds.has(r.sampleAllocationId))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No test allocation entries yet. Use &quot;Add Test Parameter&quot; to fill and save; entries will appear here after save.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs w-[44px] text-center">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className="text-xs text-center">Section Code</TableHead>
              <TableHead className="text-xs text-center">Test Parameters</TableHead>
              <TableHead className="text-xs text-center">Employee Name</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.sampleAllocationId}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.sectionCode}`}
                    checked={selectedIds.has(r.sampleAllocationId)}
                    onChange={() => onToggle(r.sampleAllocationId)}
                  />
                </TableCell>
                <TableCell className="text-center truncate font-medium">{fmt(r.sectionCode)}</TableCell>
                <TableCell className="text-center text-xs align-top">
                  {r.testParameterSummary ? (
                    <span
                      className="line-clamp-4 mx-auto block max-w-[320px] whitespace-normal break-words"
                      title={r.testParameterSummary}
                    >
                      {fmt(r.testParameterSummary)}
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-center truncate">{fmt(r.assignedEmployeeName)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Edit Test Parameter"
                      title="Edit test parameters"
                      onClick={() => onAddTestParameter(r)}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Send for testing"
                      title="Send for testing — moves section to Sample Under Testing"
                      onClick={() => onSendForTesting(r)}
                    >
                      <FlaskConical size={16} className="text-primary" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Refer back to Sample Allocation"
                      title="Refer back to Sample Allocation — removes test parameters; section stays in allocation"
                      onClick={() => onReferback(r)}
                    >
                      <Undo2 size={16} />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Refer back to Sample Receiving"
                      title="Refer back to Sample Receiving — removes section from allocation; unlocks receiving when no sections remain"
                      onClick={() => onReferbackToReceiving(r)}
                    >
                      <Inbox size={16} className="text-amber-700 dark:text-amber-500" />
                    </Button>
                    <QiAssistant
                      page="samples/test-allocation"
                      pageTitle={formatTestAllocationRowTitle(r)}
                      contextSummary={buildTestAllocationRowAssistantContext(r)}
                      activeRecordId={r.testAllocationId ?? r.sampleAllocationId}
                      activeRecordTable="test_allocations"
                      isCodeId={r.isCodeId ?? undefined}
                      triggerVariant="icon"
                      welcomeMessage={`I'm your **Test Allocation Assistant** for **${formatTestAllocationRowTitle(r)}**. I can explain assigned tests and **update this allocation** when you ask.`}
                      suggestedQuestions={[
                        'Summarize test parameters assigned to this section',
                        'Change the assigned employee for this section',
                        'What does referback do for this section?',
                        'Explain department and designation for this allocation',
                      ]}
                      onDataChanged={onAssistantDataChanged}
                      enablePdfImport={false}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
