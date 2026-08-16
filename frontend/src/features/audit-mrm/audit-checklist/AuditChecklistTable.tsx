import { useState } from 'react'
import { ClipboardList, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  formatOrgTriple,
  formatTeamAuditee,
  formatTeamAuditor,
  formatTeamCriteria,
  type AuditTeamRow,
} from '@/features/audit-mrm/audit-plan/types'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
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
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          'flex max-h-[85vh] max-w-3xl flex-col overflow-hidden',
          'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:!-translate-x-1/2 md:!-translate-y-1/2',
        )}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Team Summary — {auditId}
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
          {teamRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">No team rows.</p>
          ) : (
            teamRows.map((row, index) => {
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
                  className="border border-stone-500 bg-[#f7f3eb] p-3"
                >
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                    Row {index + 1}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-stone-500">
                        Auditee
                      </p>
                      <p className="text-sm text-stone-900">{auditee}</p>
                      <dl className="mt-1 space-y-0.5 text-xs text-stone-600">
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
                      <p className="text-[10px] font-medium uppercase tracking-wide text-stone-500">
                        Auditor
                      </p>
                      <p className="text-sm text-stone-900">{auditor}</p>
                      <dl className="mt-1 space-y-0.5 text-xs text-stone-600">
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
                    <p className="text-[10px] font-medium uppercase tracking-wide text-stone-500">
                      Audit Criteria
                    </p>
                    {clauses.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {clauses.map((no) => (
                          <Badge
                            key={no}
                            variant="secondary"
                            className="rounded-none border border-stone-400 bg-stone-50 font-mono text-[10px] font-normal text-stone-800"
                          >
                            {no}
                          </Badge>
                        ))}
                      </div>
                    ) : criteria ? (
                      <p className="text-sm text-stone-900">{criteria}</p>
                    ) : (
                      <p className="text-sm text-stone-500">No clauses selected</p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
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
    <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
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
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className="sticky left-0 z-10 w-12 bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:w-14">
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
              <TableHead className="sticky left-12 z-10 min-w-[120px] bg-stone-800 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:left-14">
                Audit ID
              </TableHead>
              <TableHead className="min-w-[90px] text-center text-xs">Type</TableHead>
              <TableHead className="min-w-[180px] text-center text-xs">Proposed From–To</TableHead>
              <TableHead className="min-w-[120px] text-center text-xs">Next Audit Date</TableHead>
              <TableHead className="min-w-[100px] text-center text-xs">Team Summary</TableHead>
              <TableHead className="min-w-[110px] text-center text-xs">Progress</TableHead>
              <TableHead className="min-w-[140px] text-center text-xs">Audit Checklist</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const selected = selectedIds.has(r.id)
              const teamRows = Array.isArray(r.team_rows) ? r.team_rows : []
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
                    <ViewTeamSummaryButton auditId={r.audit_id} teamRows={teamRows} />
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
