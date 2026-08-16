import { ExternalLink, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  auditTypeLabel,
  CAPA_STATUS_LABEL,
  formatProposedRange,
  type CapaStatus,
  type NonConformityRow,
} from './types'

const GRID_TABLE =
  'min-w-[1080px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

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

const CAPA_STATUS_CLASS: Record<CapaStatus, string> = {
  not_started: 'border-stone-400 bg-stone-100 text-stone-700',
  open: 'border-amber-600 bg-amber-50 text-amber-900',
  in_progress: 'border-sky-600 bg-sky-50 text-sky-900',
  closed: 'border-emerald-700 bg-emerald-50 text-emerald-900',
}

export function NonConformitiesTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onOpenDetails,
  onOpenCapa,
}: {
  rows: NonConformityRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onOpenDetails: (row: NonConformityRow) => void
  onOpenCapa: (row: NonConformityRow) => void
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
            {searchActive
              ? 'No non-conformities match your search.'
              : 'No non-conformities yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              When Conformity is marked &quot;No&quot; in Audit Checklist, an NC row appears here
              automatically. CAPA is completed under Non Conforming Work → Corrective Action.
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
              <TableHead className={cn('min-w-[150px]', TH)}>Audit Date</TableHead>
              <TableHead className={cn('min-w-[88px]', TH)}>Clause</TableHead>
              <TableHead className={cn('min-w-[120px]', TH)}>Details</TableHead>
              <TableHead className={cn('min-w-[120px]', TH)}>CAPA Status</TableHead>
              <TableHead className={cn('min-w-[120px]', TH)}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
              const even = index % 2 === 0
              const stickyBg = selected
                ? stickySelected
                : cn(even ? stickyEven : stickyOdd, stickyHover)
              const status = r.capaStatus ?? 'not_started'

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
                      aria-label={`Select NC ${r.clauseNo} for ${r.auditId}`}
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
                    <p className="font-mono text-sm font-medium text-foreground" title={r.auditId}>
                      {r.auditId}
                    </p>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm text-foreground">{auditTypeLabel(r.auditType)}</span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="text-sm tabular-nums text-foreground">
                      {formatProposedRange(r.proposedFrom, r.proposedTo)}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span className="font-mono text-sm font-medium text-foreground">{r.clauseNo}</span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 rounded-none border-stone-500 bg-stone-50 px-2.5 text-xs font-medium text-stone-800 hover:bg-stone-100"
                      aria-label={`View details for clause ${r.clauseNo}`}
                      title="View Clause No, Description, Observation, Non Conformity"
                      onClick={() => onOpenDetails(r)}
                    >
                      <FileText size={14} />
                      Details
                    </Button>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <span
                      className={cn(
                        'inline-flex rounded-none border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                        CAPA_STATUS_CLASS[status],
                      )}
                    >
                      {CAPA_STATUS_LABEL[status]}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 rounded-none bg-amber-700 px-2.5 text-xs font-medium text-white hover:bg-amber-800"
                      aria-label={`Open CAPA in Corrective Action for ${r.clauseNo}`}
                      title="Open related CAPA in Non Conforming Work → Corrective Action"
                      onClick={() => onOpenCapa(r)}
                    >
                      <ExternalLink size={14} />
                      CAPA
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
