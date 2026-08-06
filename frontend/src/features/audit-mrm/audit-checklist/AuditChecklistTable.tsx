import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  auditTypeLabel,
  formatDate,
  formatProposedRange,
  type AuditPlanRow,
  type ChecklistProgress,
} from './types'

const GRID_TABLE =
  'min-w-[960px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function AuditChecklistTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  progressByPlanId,
  onOpenChecklist,
}: {
  rows: AuditPlanRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  progressByPlanId: Record<string, ChecklistProgress>
  onOpenChecklist: (row: AuditPlanRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {error ? <p className="px-3 pt-3 text-sm text-destructive sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No planned audits match your search.' : 'No planned audits yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Create an audit in Audit Plan — it will appear here automatically.
            </p>
          ) : null}
        </div>
      ) : (
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="sticky left-0 z-10 w-12 bg-muted/50 text-center text-xs sm:w-14">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className="sticky left-12 z-10 min-w-[120px] bg-muted/50 text-left text-xs sm:left-14">
                Audit ID
              </TableHead>
              <TableHead className="min-w-[90px] text-center text-xs">Type</TableHead>
              <TableHead className="min-w-[180px] text-center text-xs">Proposed From–To</TableHead>
              <TableHead className="min-w-[120px] text-center text-xs">Next Audit Date</TableHead>
              <TableHead className="min-w-[140px] text-center text-xs">Team Summary</TableHead>
              <TableHead className="min-w-[110px] text-center text-xs">Progress</TableHead>
              <TableHead className="min-w-[140px] text-center text-xs">Audit Checklist</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const selected = selectedIds.has(r.id)
              const teamCount = Array.isArray(r.team_rows) ? r.team_rows.length : 0
              const firstAuditee = r.team_rows?.[0]?.auditee?.trim() || ''
              const summary =
                teamCount === 0
                  ? '—'
                  : firstAuditee
                    ? `${firstAuditee}${teamCount > 1 ? ` (+${teamCount - 1})` : ''}`
                    : `${teamCount} row${teamCount === 1 ? '' : 's'}`
              const progress = progressByPlanId[r.id]
              const progressLabel =
                !progress || progress.total === 0
                  ? 'Not started'
                  : `${progress.answered}/${progress.total}`

              return (
                <TableRow key={r.id} data-state={selected ? 'selected' : undefined}>
                  <TableCell
                    className={`sticky left-0 z-10 text-center align-middle ${
                      selected ? 'bg-muted' : 'bg-card'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.audit_id}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell
                    className={`sticky left-12 z-10 align-middle text-left sm:left-14 ${
                      selected ? 'bg-muted' : 'bg-card'
                    }`}
                  >
                    <p className="font-mono text-sm font-medium text-foreground" title={r.audit_id}>
                      {r.audit_id}
                    </p>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm text-foreground">{auditTypeLabel(r.audit_type)}</span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm tabular-nums text-foreground">
                      {formatProposedRange(r.proposed_from, r.proposed_to)}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm tabular-nums text-foreground">
                      {formatDate(r.next_audit_date)}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="mx-auto max-w-[180px] space-y-0.5">
                      <p className="truncate text-sm text-foreground" title={summary}>
                        {summary}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {teamCount} auditee{teamCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm tabular-nums text-foreground">{progressLabel}</span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      aria-label={`Open audit checklist for ${r.audit_id}`}
                      onClick={() => onOpenChecklist(r)}
                    >
                      <ClipboardList size={14} />
                      Checklist
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
