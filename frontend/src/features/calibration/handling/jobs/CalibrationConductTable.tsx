import { useMemo, useState } from 'react'
import { FileSpreadsheet, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CalibrationJobRow } from '../types'
import { RawDataSheetDialog } from './RawDataSheetDialog'

const GRID_TABLE =
  'min-w-[900px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function cellText(value: string | null | undefined): string {
  const t = (value ?? '').trim()
  return t.length > 0 ? t : '—'
}

function takePrefixed(parts: string[], prefix: RegExp): string {
  const idx = parts.findIndex((p) => prefix.test(p))
  if (idx < 0) return ''
  const raw = parts[idx]!
  parts.splice(idx, 1)
  return raw.replace(prefix, '').trim()
}

export function parseConductEquipmentFields(job: CalibrationJobRow): {
  leastCount: string
  range: string
  make: string
  model: string
  serial: string
  quantity: string
} {
  const text = (job.equipment_detail || job.equipment_label || '').trim()
  if (!text) {
    return { leastCount: '', range: '', make: '', model: '', serial: '', quantity: '' }
  }
  const parts = text.split('·').map((p) => p.trim()).filter(Boolean)
  parts.shift()
  return {
    leastCount: takePrefixed(parts, /^lc\s+/i),
    range: takePrefixed(parts, /^range\s+/i),
    make: takePrefixed(parts, /^make\s+/i),
    model: takePrefixed(parts, /^model\s+/i),
    serial: takePrefixed(parts, /^s\/n\s+/i),
    quantity: takePrefixed(parts, /^qty\s+/i),
  }
}

function JobDetailsDialog({
  job,
  open,
  onOpenChange,
}: {
  job: CalibrationJobRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const fields = useMemo(
    () => (job ? parseConductEquipmentFields(job) : null),
    [job],
  )
  if (!job || !fields) return null

  const rows: Array<{ label: string; value: string }> = [
    { label: 'SRF Number', value: job.srf_number },
    { label: 'Client', value: job.client_name ?? '' },
    { label: 'Equipment', value: job.equipment_label },
    { label: 'Range', value: fields.range },
    { label: 'Least Count', value: fields.leastCount },
    { label: 'Make', value: fields.make },
    { label: 'Model', value: fields.model },
    { label: 'Serial Number', value: fields.serial },
    { label: 'Quantity', value: fields.quantity },
    {
      label: 'Inside / Outside',
      value: job.calibration_location === 'On Site' ? 'Outside (On Site)' : 'Inside (In Lab)',
    },
    { label: 'Engineer', value: job.allocated_engineer_name ?? '' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
        layer="nested"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
          <DialogHeader className="relative pr-12 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              Calibration Conduct · Details
            </p>
            <DialogTitle className="text-lg font-semibold tracking-tight text-white">
              {cellText(job.equipment_label)}
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="space-y-2 bg-[#fafbfc] px-4 py-4 sm:px-6">
          {rows.map((r) => (
            <div
              key={r.label}
              className="grid grid-cols-[140px_1fr] gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="text-xs font-medium text-muted-foreground">{r.label}</span>
              <span className="text-foreground">{cellText(r.value)}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CalibrationConductTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onForward,
  onReferback,
  actionLoading = false,
  scopedToEngineer = false,
  locationFilterLabel,
}: {
  rows: CalibrationJobRow[]
  loading: boolean
  error: string | null
  searchActive: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onForward: (job: CalibrationJobRow) => void
  onReferback: (job: CalibrationJobRow) => void
  actionLoading?: boolean
  scopedToEngineer?: boolean
  locationFilterLabel?: string
}) {
  const [detailsJob, setDetailsJob] = useState<CalibrationJobRow | null>(null)
  const [workSheetJob, setWorkSheetJob] = useState<CalibrationJobRow | null>(null)

  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  if (loading) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    )
  }

  if (error) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
        {error}
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          {searchActive
            ? 'No allocated equipment matches your search.'
            : scopedToEngineer
              ? `No ${locationFilterLabel ?? ''} equipment allocated to you in Calibration Conduct yet.`
                  .replace(/\s+/g, ' ')
                  .trim()
              : `No ${locationFilterLabel ?? ''} equipment in Calibration Conduct yet. Forward jobs from Job Allocation after assigning engineers.`
                  .replace(/\s+/g, ' ')
                  .trim()}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
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
                <TableHead className="min-w-[160px] text-left text-xs">Equipment Name</TableHead>
                <TableHead className="min-w-[120px] text-center text-xs">Range</TableHead>
                <TableHead className="min-w-[100px] text-center text-xs">Details</TableHead>
                <TableHead className="min-w-[140px] text-center text-xs">Raw Data Sheet</TableHead>
                <TableHead className="min-w-[120px] text-center text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((job) => {
                const fields = parseConductEquipmentFields(job)
                const selected = selectedIds.has(job.id)
                return (
                  <TableRow key={job.id} data-state={selected ? 'selected' : undefined}>
                    <TableCell className="text-center align-middle">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${job.equipment_label}`}
                        checked={selected}
                        onChange={() => onToggle(job.id)}
                      />
                    </TableCell>
                    <TableCell className="align-middle text-sm font-medium">
                      {cellText(job.equipment_label)}
                    </TableCell>
                    <TableCell className="text-center align-middle text-sm">
                      {cellText(fields.range)}
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 border-slate-300 px-2 text-xs"
                        onClick={() => setDetailsJob(job)}
                        aria-label={`Details for ${job.equipment_label}`}
                      >
                        <Settings2 size={14} aria-hidden />
                        Details
                      </Button>
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 border-teal-600/40 px-2 text-xs text-teal-800 hover:bg-teal-50"
                        onClick={() => setWorkSheetJob(job)}
                        aria-label={`Open raw data sheet for ${job.equipment_label}`}
                      >
                        <FileSpreadsheet size={14} aria-hidden />
                        Open Sheet
                      </Button>
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-lg leading-none hover:bg-teal-50 disabled:opacity-40"
                          disabled={actionLoading}
                          onClick={() => onForward(job)}
                          aria-label={`Forward ${job.equipment_label}`}
                          title="Forward to Review Data"
                        >
                          <span aria-hidden>➡️</span>
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-lg leading-none hover:bg-amber-50 disabled:opacity-40"
                          disabled={actionLoading}
                          onClick={() => onReferback(job)}
                          aria-label={`Referback ${job.equipment_label}`}
                          title="Referback to Job Allocation"
                        >
                          <span aria-hidden>↩️</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <JobDetailsDialog
        job={detailsJob}
        open={Boolean(detailsJob)}
        onOpenChange={(open) => {
          if (!open) setDetailsJob(null)
        }}
      />
      <RawDataSheetDialog
        job={workSheetJob}
        open={Boolean(workSheetJob)}
        onOpenChange={(open) => {
          if (!open) setWorkSheetJob(null)
        }}
      />
    </>
  )
}
