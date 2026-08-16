import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  auditTypeLabel,
  formatProposedRange,
  summaryStatus,
  summaryStatusLabel,
  type AuditPlanRow,
  type AuditSummaryStats,
  type SummaryFindingsTab,
} from './types'

const GRID_TABLE =
  'min-w-[1180px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const TH =
  'text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'
const stickyEven = 'bg-[#f7f3eb]'
const stickyOdd = 'bg-[#fffcf7]'
const stickySelected = 'bg-[#fde68a]/80'
const stickyHover = 'group-hover:bg-[#f3e9d8]'

const countLinkClass =
  'text-sm tabular-nums font-semibold text-amber-800 underline decoration-amber-700/50 underline-offset-2 hover:text-amber-950 hover:decoration-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40'

function statusClass(status: ReturnType<typeof summaryStatus>) {
  if (status === 'completed') return 'text-emerald-800'
  if (status === 'in_progress') return 'text-amber-800'
  return 'text-stone-500'
}

export function AuditSummaryTable({
  rows,
  statsByPlanId,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onOpenSummary,
}: {
  rows: AuditPlanRow[]
  statsByPlanId: Record<string, AuditSummaryStats>
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onOpenSummary: (row: AuditPlanRow, tab?: SummaryFindingsTab) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error ? <p className="px-3 pt-3 text-sm text-destructive sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No audits match your search.' : 'No audit plans yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Create an audit in Audit Plan and fill the Checklist to see summary outcomes here.
            </p>
          ) : null}
        </div>
      ) : (
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className={cn('sticky left-0 z-10 w-12 bg-stone-800 sm:w-14', TH)}>
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
              <TableHead
                className={cn(
                  'sticky left-12 z-10 min-w-[110px] bg-stone-800 text-left sm:left-14',
                  TH,
                )}
              >
                Audit ID
              </TableHead>
              <TableHead className={cn('min-w-[80px]', TH)}>Type</TableHead>
              <TableHead className={cn('min-w-[160px]', TH)}>Proposed From–To</TableHead>
              <TableHead className={cn('min-w-[110px]', TH)}>Progress</TableHead>
              <TableHead className={cn('min-w-[100px]', TH)}>Yes Clause</TableHead>
              <TableHead className={cn('min-w-[80px]', TH)}>NC</TableHead>
              <TableHead className={cn('min-w-[90px]', TH)}>NA Clause</TableHead>
              <TableHead className={cn('min-w-[110px]', TH)}>Status</TableHead>
              <TableHead className={cn('min-w-[120px]', TH)}>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
              const stats = statsByPlanId[r.id]
              const status = stats ? summaryStatus(stats) : 'not_started'
              const progressLabel = stats
                ? `${stats.answered}/${stats.total}`
                : '—'
              const even = index % 2 === 0
              const stickyBg = selected
                ? stickySelected
                : cn(even ? stickyEven : stickyOdd, stickyHover)

              return (
                <TableRow
                  key={r.id}
                  data-state={selected ? 'selected' : undefined}
                  className={cn(
                    'group',
                    selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass,
                  )}
                >
                  <TableCell className={cn('sticky left-0 z-10 text-center align-middle', stickyBg)}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.audit_id}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'sticky left-12 z-10 align-middle text-left sm:left-14',
                      stickyBg,
                    )}
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
                    <span className="text-sm tabular-nums text-foreground">{progressLabel}</span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    {(stats?.yes ?? 0) > 0 ? (
                      <button
                        type="button"
                        className={cn(countLinkClass, 'text-emerald-800 decoration-emerald-700/50 hover:text-emerald-950')}
                        aria-label={`View ${stats!.yes} yes clause(s) for ${r.audit_id}`}
                        title="View Yes Clause"
                        onClick={() => onOpenSummary(r, 'yes')}
                      >
                        {stats!.yes}
                      </button>
                    ) : (
                      <span className="text-sm tabular-nums text-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    {(stats?.nonConformities ?? stats?.no ?? 0) > 0 ? (
                      <button
                        type="button"
                        className={cn(
                          countLinkClass,
                          'text-rose-700 decoration-rose-600/50 hover:text-rose-900',
                        )}
                        aria-label={`View ${stats!.nonConformities || stats!.no} non conformity(s) for ${r.audit_id}`}
                        title="View Non Conformities (No Clause)"
                        onClick={() => onOpenSummary(r, 'nc')}
                      >
                        {stats!.nonConformities || stats!.no}
                      </button>
                    ) : (
                      <span className="text-sm tabular-nums font-medium text-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    {(stats?.na ?? 0) > 0 ? (
                      <button
                        type="button"
                        className={countLinkClass}
                        aria-label={`View ${stats!.na} not applicable clause(s) for ${r.audit_id}`}
                        title="View Not Applicable Clause"
                        onClick={() => onOpenSummary(r, 'na')}
                      >
                        {stats!.na}
                      </button>
                    ) : (
                      <span className="text-sm tabular-nums text-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className={cn('text-sm font-medium', statusClass(status))}>
                      {summaryStatusLabel(status)}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-teal-600/40 px-2.5 text-xs font-medium text-teal-800 hover:bg-teal-50"
                      aria-label={`View audit summary for ${r.audit_id}`}
                      onClick={() => onOpenSummary(r)}
                    >
                      <Eye size={14} />
                      View
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
