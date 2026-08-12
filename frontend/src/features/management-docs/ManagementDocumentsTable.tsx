import { useState } from 'react'
import { Eye, Pencil, Printer, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { ManagementDocStatus, ManagementDocumentRow } from './types'
import { MANAGEMENT_DOC_STATUSES, statusBadgeClass } from './types'

const GRID_TABLE =
  'min-w-[880px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function formatDocDate(value: string | null | undefined): string {
  if (!value?.trim()) return 'N/A'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

function ControlDetailRow({
  label,
  number,
  dateLabel,
  date,
}: {
  label: string
  number: string
  dateLabel: string
  date: string
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">{number}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{dateLabel}</p>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-slate-700">{date}</p>
      </div>
    </div>
  )
}

export function ManagementDocumentsTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onPrint,
  onView,
  onEdit,
  onUpload,
  onStatusChange,
  statusUpdatingId,
}: {
  rows: ManagementDocumentRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onPrint: (row: ManagementDocumentRow) => void
  onView: (row: ManagementDocumentRow) => void
  onEdit: (row: ManagementDocumentRow) => void
  onUpload: (row: ManagementDocumentRow) => void
  onStatusChange: (row: ManagementDocumentRow, status: ManagementDocStatus) => void
  statusUpdatingId?: string | null
}) {
  const [controlRow, setControlRow] = useState<ManagementDocumentRow | null>(null)
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
            {searchActive ? 'No documents match your search.' : 'No documents added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">Use &quot;Add Document&quot; to create the first record.</p>
          ) : null}
        </div>
      ) : (
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className="w-12 text-center text-xs sm:w-14">
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
              <TableHead className="min-w-[180px] text-center text-xs">Title</TableHead>
              <TableHead className="min-w-[110px] text-center text-xs">Doc No</TableHead>
              <TableHead className="min-w-[120px] text-center text-xs">Rev / Issue / Amendment</TableHead>
              <TableHead className="min-w-[100px] text-center text-xs">Status</TableHead>
              <TableHead className="min-w-[180px] text-center text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const selected = selectedIds.has(r.id)
              return (
                <TableRow key={r.id} data-state={selected ? 'selected' : undefined}>
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.doc_number}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className="align-middle text-left">
                    <p className="font-medium text-foreground" title={r.title}>
                      {r.title}
                    </p>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <p className="font-medium text-foreground">{r.doc_number}</p>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border-slate-300 px-2.5 font-mono text-xs tabular-nums"
                      aria-label={`Revision details for ${r.doc_number}`}
                      onClick={() => setControlRow(r)}
                    >
                      {r.revision_no || '—'} | {r.issue_no || '—'} | {r.amendment_no || '—'}
                    </Button>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <Select
                      value={r.status}
                      disabled={statusUpdatingId === r.id}
                      onValueChange={(value) =>
                        onStatusChange(r, value as ManagementDocStatus)
                      }
                    >
                      <SelectTrigger
                        aria-label={`Status for ${r.doc_number}`}
                        className={cn(
                          'mx-auto h-8 w-[132px] border text-xs font-semibold',
                          statusBadgeClass(r.status),
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MANAGEMENT_DOC_STATUSES.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="inline-flex flex-nowrap items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 rounded-none"
                        aria-label={`Edit ${r.doc_number}`}
                        title="Edit"
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 rounded-none"
                        aria-label={`View ${r.doc_number}`}
                        title="View"
                        onClick={() => onView(r)}
                      >
                        <Eye size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 rounded-none"
                        aria-label={`Print ${r.doc_number}`}
                        title="Print"
                        onClick={() => onPrint(r)}
                      >
                        <Printer size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 rounded-none"
                        aria-label={`Upload document for ${r.doc_number}`}
                        title="Upload"
                        onClick={() => onUpload(r)}
                      >
                        <Upload size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={controlRow != null}
        onOpenChange={(open) => {
          if (!open) setControlRow(null)
        }}
      >
        <DialogContent className="w-[min(420px,94vw)] max-w-none gap-0 overflow-hidden border-0 p-0 shadow-xl">
          {controlRow ? (
            <>
              <div className="relative bg-slate-900 px-5 py-4 text-white">
                <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                <DialogHeader className="pr-8 text-left">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                    Document Control
                  </p>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                    {controlRow.doc_number}
                  </DialogTitle>
                  <p className="mt-0.5 text-sm text-slate-300">{controlRow.title}</p>
                </DialogHeader>
              </div>

              <div className="space-y-2.5 bg-[#fafbfc] px-5 py-4">
                <ControlDetailRow
                  label="Revision No"
                  number={controlRow.revision_no || '—'}
                  dateLabel="Rev Date"
                  date={formatDocDate(controlRow.revision_date)}
                />
                <ControlDetailRow
                  label="Issue No"
                  number={controlRow.issue_no || '—'}
                  dateLabel="Issue Date"
                  date={formatDocDate(controlRow.issue_date)}
                />
                <ControlDetailRow
                  label="Amendment No"
                  number={controlRow.amendment_no || '—'}
                  dateLabel="Amendment Date"
                  date={formatDocDate(controlRow.amendment_date)}
                />
              </div>

              <div className="flex justify-end border-t border-border bg-white px-5 py-3">
                <Button type="button" size="sm" variant="outline" onClick={() => setControlRow(null)}>
                  Close
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
