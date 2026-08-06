import { useState } from 'react'
import { Copy, Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  auditTypeLabel,
  formatDate,
  formatOrgTriple,
  formatProposedRange,
  formatTeamAuditee,
  formatTeamAuditor,
  formatTeamCriteria,
  type AuditPlanRow,
  type AuditTeamRow,
} from './types'

const GRID_TABLE =
  'min-w-[920px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function TeamSummaryDialog({
  open,
  onOpenChange,
  auditId,
  teamRows,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  auditId: string
  teamRows: AuditTeamRow[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Team Summary — {auditId}</DialogTitle>
        </DialogHeader>
        {teamRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No team rows.</p>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
            {teamRows.map((row, index) => {
              const auditee =
                formatTeamAuditee(row) ||
                formatOrgTriple(row.auditeeDivision, row.auditeeDepartment, row.auditeeDesignation) ||
                '—'
              const auditor =
                formatTeamAuditor(row) ||
                formatOrgTriple(row.auditorDivision, row.auditorDepartment, row.auditorDesignation) ||
                '—'
              const criteria = formatTeamCriteria(row)
              const clauses = row.criteriaClauseNos ?? []

              return (
                <div
                  key={`team-${index}-${auditee}-${auditor}`}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Row {index + 1}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Auditee
                      </p>
                      <p className="text-sm text-foreground">{auditee}</p>
                      <dl className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        <div className="flex gap-1">
                          <dt className="shrink-0 font-medium">Division:</dt>
                          <dd>{row.auditeeDivision || '—'}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="shrink-0 font-medium">Department:</dt>
                          <dd>{row.auditeeDepartment || '—'}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="shrink-0 font-medium">Designation:</dt>
                          <dd>{row.auditeeDesignation || '—'}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Auditor
                      </p>
                      <p className="text-sm text-foreground">{auditor}</p>
                      <dl className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        <div className="flex gap-1">
                          <dt className="shrink-0 font-medium">Division:</dt>
                          <dd>{row.auditorDivision || '—'}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="shrink-0 font-medium">Department:</dt>
                          <dd>{row.auditorDepartment || '—'}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="shrink-0 font-medium">Designation:</dt>
                          <dd>{row.auditorDesignation || '—'}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Audit Criteria
                    </p>
                    {clauses.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {clauses.map((no) => (
                          <Badge key={no} variant="secondary" className="font-mono text-[10px] font-normal">
                            {no}
                          </Badge>
                        ))}
                      </div>
                    ) : criteria ? (
                      <p className="text-sm text-foreground">{criteria}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No clauses selected</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ViewTeamSummaryButton({
  auditId,
  teamRows,
}: {
  auditId: string
  teamRows: AuditTeamRow[]
}) {
  const [open, setOpen] = useState(false)
  const count = teamRows.length

  if (count === 0) {
    return <p className="text-sm text-muted-foreground">—</p>
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 border-teal-600/40 px-2.5 text-xs font-medium text-teal-800 hover:bg-teal-50"
        onClick={() => setOpen(true)}
        aria-label={`View team summary for ${auditId}`}
      >
        <Eye size={14} className="mr-1" />
        View
      </Button>
      <TeamSummaryDialog
        open={open}
        onOpenChange={setOpen}
        auditId={auditId}
        teamRows={teamRows}
      />
    </>
  )
}

export function AuditPlanTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: AuditPlanRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: AuditPlanRow) => void
  onCopy: (row: AuditPlanRow) => void
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
            {searchActive ? 'No audit plans match your search.' : 'No audit plans added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Use &quot;Add New Audit Plan&quot; to create your first record.
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
              <TableHead className="min-w-[100px] text-center text-xs">Team Summary</TableHead>
              <TableHead className="min-w-[96px] text-center text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const selected = selectedIds.has(r.id)
              const teamRows = Array.isArray(r.team_rows) ? r.team_rows : []

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
                    <ViewTeamSummaryButton auditId={r.audit_id} teamRows={teamRows} />
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="inline-flex items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${r.audit_id}`}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Copy ${r.audit_id}`}
                        onClick={() => onCopy(r)}
                      >
                        <Copy size={16} />
                      </Button>
                    </div>
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
