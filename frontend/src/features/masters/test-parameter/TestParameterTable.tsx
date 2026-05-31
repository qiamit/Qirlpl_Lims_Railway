import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  buildTestParameterAssistantContext,
  formatTestParameterLabel,
} from './buildTestParameterAssistantContext'
import type { AccreditationBodyRow, TestParameterRow } from './types'

function formatAccreditation(
  r: TestParameterRow,
  accreditationBodies: AccreditationBodyRow[],
): string {
  if (!r.under_accreditation_ids?.length || !accreditationBodies.length) return '—'
  return (
    r.under_accreditation_ids
      .map((id) => accreditationBodies.find((b) => b.id === id)?.name)
      .filter(Boolean)
      .join(', ') || '—'
  )
}

export function TestParameterTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  accreditationBodies = [],
  onAssistantDataChanged,
}: {
  rows: TestParameterRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: TestParameterRow) => void
  accreditationBodies?: AccreditationBodyRow[]
  onAssistantDataChanged?: () => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  const thClass = 'text-xs font-semibold py-2 text-center align-middle whitespace-nowrap'
  const tdClass = 'text-center align-middle whitespace-nowrap'

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No test parameters added yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="table-auto w-max min-w-full">
            <TableHeader>
              <TableRow className="bg-muted/50 border-t border-border/50">
                <TableHead className={`${thClass} w-10`}>
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
                <TableHead className={thClass}>IS Code</TableHead>
                <TableHead className={thClass}>Test Parameter</TableHead>
                <TableHead className={thClass}>Test Method</TableHead>
                <TableHead className={thClass}>Requirements</TableHead>
                <TableHead className={thClass}>UOM</TableHead>
                <TableHead className={thClass}>Accreditation</TableHead>
                <TableHead className={`${thClass} w-[1%]`}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className={tdClass}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.item_name}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className={tdClass}>
                    <div className="text-sm font-medium">{r.is_code_label || '-'}</div>
                  </TableCell>
                  <TableCell className={tdClass}>
                    <div className="text-sm font-medium text-foreground/90">{r.item_name || '-'}</div>
                  </TableCell>
                  <TableCell className={tdClass}>
                    <div className="flex flex-col items-center justify-center gap-0.5">
                      <div className="text-sm">{r.test_method || '-'}</div>
                      {r.clause_no || r.unit_value ? (
                        <div className="inline-flex items-center justify-center gap-1 flex-wrap">
                          {r.clause_no && (
                            <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              Cl: {r.clause_no}
                            </span>
                          )}
                          {r.unit_value && (
                            <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                              Unit: {r.unit_value}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={`${tdClass} whitespace-normal`}>
                    <div className="text-sm whitespace-pre-wrap max-w-md mx-auto">
                      {r.specific_requirement || '—'}
                    </div>
                  </TableCell>
                  <TableCell className={tdClass}>
                    {r.uncertainty_mu ? (
                      <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        {r.uncertainty_mu}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className={tdClass}>
                    <div className="text-xs">{formatAccreditation(r, accreditationBodies)}</div>
                  </TableCell>
                  <TableCell className={tdClass}>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(r)}
                        aria-label="Edit"
                      >
                        <Pencil size={14} />
                      </Button>
                      <QiAssistant
                        page="test-parameter"
                        pageTitle={formatTestParameterLabel(r)}
                        contextSummary={buildTestParameterAssistantContext(r)}
                        activeRecordId={r.id}
                        activeRecordTable="test_parameters"
                        isCodeId={r.is_code_id ?? undefined}
                        triggerVariant="icon"
                        welcomeMessage={`I'm your **Test Parameter Assistant** for **${formatTestParameterLabel(r)}** (id: \`${r.id}\`). I can explain requirements${r.is_code_id ? ' using linked IS PDFs' : ''} and **update this test parameter** when you ask.`}
                        suggestedQuestions={[
                          'Explain this test parameter and its requirement',
                          'What clause in the IS standard applies here?',
                          'Update the specific requirement for this parameter',
                          'Change the test method for this row',
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
        </div>
      )}
    </div>
  )
}
