import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import type { AllocationRow } from '../types'
import { Inbox, Pencil, SendHorizontal } from 'lucide-react'
import {
  buildSampleAllocationRowAssistantContext,
  formatSampleAllocationRowTitle,
} from './buildSampleAllocationAssistantContext'
import {
  getSectionCodesInTestAllocation,
  isSampleAllocationEditLocked,
  sampleAllocationEditLockedTitle,
} from './sampleAllocationEditLock'

type AllocationRecordLite = {
  id: string
  sectionCode: string
  department: string | null
  designation: string | null
  sampleQuantity: string | null
}

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')
const fmtDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '-')
const joinList = (arr: string[]) => arr.filter(Boolean).join(', ') || '-'

export function SampleAllocationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onReferbackToReceiving,
  onSendToTestAllocation,
  sampleAllocationIdsWithTestAllocation,
  allocationRecords,
  onAssistantDataChanged,
}: {
  rows: AllocationRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (sampleId: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: AllocationRow) => void
  onReferbackToReceiving: (row: AllocationRow) => void
  onSendToTestAllocation: (row: AllocationRow) => void
  sampleAllocationIdsWithTestAllocation?: Set<string>
  allocationRecords: AllocationRecordLite[]
  onAssistantDataChanged?: () => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.sampleId))
  const someChecked = rows.some((r) => selectedIds.has(r.sampleId))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No sample allocations yet.</p>
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
              <TableHead className="text-xs text-center">SRF Number &amp; Date</TableHead>
              <TableHead className="text-xs text-center">IS Code</TableHead>
              <TableHead className="text-xs text-center">Section Code</TableHead>
              <TableHead className="text-xs text-center">Department</TableHead>
              <TableHead className="text-xs text-center">Sample Quantity</TableHead>
              <TableHead className="text-xs text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.sampleId}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.sample.srf_number ?? r.sample.sample_code ?? r.sampleId}`}
                    checked={selectedIds.has(r.sampleId)}
                    onChange={() => onToggle(r.sampleId)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <div className="font-medium truncate">{fmt(r.sample.srf_number)}</div>
                  <div className="text-xs text-muted-foreground truncate">{fmtDate(r.sample.date_of_sample_receiving ?? r.sample.collection_date)}</div>
                </TableCell>
                <TableCell className="text-center truncate">{fmt(r.sample.test_report_is_code_label)}</TableCell>
                <TableCell className="text-center truncate">{joinList(r.sectionCodes)}</TableCell>
                <TableCell className="text-center text-xs truncate">{joinList(r.departments)}</TableCell>
                <TableCell className="text-center truncate">{joinList(r.quantities)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    {(() => {
                      const testAllocIds = sampleAllocationIdsWithTestAllocation ?? new Set<string>()
                      const editLocked = isSampleAllocationEditLocked(r, testAllocIds)
                      const lockedSections = getSectionCodesInTestAllocation(r, testAllocIds)
                      const rowTitle = formatSampleAllocationRowTitle(r)
                      return (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Edit allocation"
                            title={editLocked ? sampleAllocationEditLockedTitle(lockedSections) : 'Edit section codes and departments'}
                            disabled={editLocked}
                            onClick={() => onEdit(r)}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Refer back to Sample Receiving"
                            title="Refer back to Sample Receiving — removes from Sample Allocation and unlocks edit in Sample Receiving"
                            onClick={() => onReferbackToReceiving(r)}
                          >
                            <Inbox size={16} className="text-amber-700 dark:text-amber-500" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Send for Test Allocation"
                            title="Send for Test Allocation — SRF appears in Test Allocation; removed from this list"
                            onClick={() => onSendToTestAllocation(r)}
                          >
                            <SendHorizontal size={16} className="text-primary" />
                          </Button>
                          <QiAssistant
                            page="samples/allocation"
                            pageTitle={rowTitle}
                            contextSummary={buildSampleAllocationRowAssistantContext(r, allocationRecords)}
                            activeRecordId={r.sampleId}
                            activeRecordTable="sample_allocations"
                            isCodeId={r.sample.test_report_is_code_id ?? undefined}
                            triggerVariant="icon"
                            welcomeMessage={`I'm your **Sample Allocation Assistant** for **${rowTitle}**. I can explain this SRF's section codes and **update allocations** when you ask.`}
                            suggestedQuestions={[
                              'Summarize section codes and departments for this SRF',
                              'What happens when I send this SRF to Test Allocation?',
                              'What happens when I refer back to Sample Receiving?',
                              'Add another section code to this SRF',
                            ]}
                            onDataChanged={onAssistantDataChanged}
                            enablePdfImport={false}
                          />
                        </>
                      )
                    })()}
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
