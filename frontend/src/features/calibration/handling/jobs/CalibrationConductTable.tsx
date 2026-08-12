import { useState } from 'react'
import { ClipboardList, FileSpreadsheet, Send, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CalibrationJobRow } from '../types'
import { DucEquipmentDetailsDialog } from './CalibrationJobStageTable'
import { ConductOutsideChecklistDialog } from './ConductOutsideChecklistDialog'
import {
  isChecklistCompleted,
  parseConductOutsideChecklist,
  type ConductOutsideChecklistKind,
  type ConductOutsideChecklistPayload,
} from './conductOutsideChecklist'
import { RawDataSheetDialog } from './RawDataSheetDialog'

const GRID_TABLE =
  'table-fixed min-w-[980px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border [&_td]:whitespace-nowrap'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const actionIconOnlyBase =
  'h-8 w-8 rounded-none border shadow-none transition-colors disabled:opacity-45'
const forwardIconBtnClass =
  `${actionIconOnlyBase} border-amber-800/60 bg-[#fff7ed] text-amber-950 hover:border-amber-900 hover:bg-amber-800 hover:text-white`
const referBackIconBtnClass =
  `${actionIconOnlyBase} border-stone-500 bg-stone-50 text-stone-700 hover:border-stone-800 hover:bg-stone-800 hover:text-amber-100`

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

function ChecklistColumnCell({
  completed,
  onOpen,
  ariaLabel,
  viewOnly = false,
}: {
  completed: boolean
  onOpen: () => void
  ariaLabel: string
  viewOnly?: boolean
}) {
  const statusClass = completed
    ? 'border-teal-600/45 bg-teal-50 text-teal-800 hover:bg-teal-100 hover:text-teal-900'
    : 'border-amber-500/55 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900'

  return (
    <div className="flex items-center justify-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`h-8 gap-1 px-2 text-xs ${statusClass}`}
        onClick={onOpen}
        aria-label={ariaLabel}
      >
        <ClipboardList size={14} aria-hidden />
        {viewOnly || completed ? 'View' : 'Fill Checklist'}
      </Button>
    </div>
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
  onChecklistSaved,
  onLocationOfCalibrationSaved,
  actionLoading = false,
  scopedToEngineer = false,
  locationFilterLabel,
  showOutsideChecklists = false,
  viewOnly = false,
  emptyMessage,
}: {
  rows: CalibrationJobRow[]
  loading: boolean
  error: string | null
  searchActive: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onForward?: (job: CalibrationJobRow) => void
  onReferback?: (job: CalibrationJobRow) => void
  onChecklistSaved?: (
    jobId: string,
    kind: ConductOutsideChecklistKind,
    payload: ConductOutsideChecklistPayload,
  ) => void
  onLocationOfCalibrationSaved?: (jobId: string, locationOfCalibration: string) => void
  actionLoading?: boolean
  scopedToEngineer?: boolean
  locationFilterLabel?: string
  /** Outside Conduct only — Outgoing / Inward checklist columns + gating. */
  showOutsideChecklists?: boolean
  /** Forwarded list: no Action, no selection, checklists/RDS view-only. */
  viewOnly?: boolean
  emptyMessage?: string
}) {
  const [detailsJob, setDetailsJob] = useState<CalibrationJobRow | null>(null)
  const [workSheetJob, setWorkSheetJob] = useState<CalibrationJobRow | null>(null)
  const [checklistJob, setChecklistJob] = useState<CalibrationJobRow | null>(null)
  const [checklistKind, setChecklistKind] = useState<ConductOutsideChecklistKind>('outgoing')
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  if (loading) {
    return (
      <p className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20 px-4 py-8 text-center text-sm text-muted-foreground">
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
          {emptyMessage
            ? emptyMessage
            : searchActive
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

  const openChecklist = (job: CalibrationJobRow, kind: ConductOutsideChecklistKind) => {
    setChecklistKind(kind)
    setChecklistJob(job)
  }

  const handleOpenSheet = (job: CalibrationJobRow) => {
    setWorkSheetJob(job)
  }

  return (
    <>
      <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <colgroup>
              {viewOnly ? null : <col className="w-[4%]" />}
              <col
                className={
                  showOutsideChecklists
                    ? viewOnly
                      ? 'w-[34%]'
                      : 'w-[26%]'
                    : viewOnly
                      ? 'w-[52%]'
                      : 'w-[44%]'
                }
              />
              <col className={showOutsideChecklists ? 'w-[16%]' : 'w-[22%]'} />
              {showOutsideChecklists ? <col className="w-[14%]" /> : null}
              <col className={showOutsideChecklists ? 'w-[14%]' : 'w-[18%]'} />
              {showOutsideChecklists ? <col className="w-[14%]" /> : null}
              {viewOnly ? null : <col className="w-[12%]" />}
            </colgroup>
            <TableHeader>
              <TableRow className="bg-stone-800 hover:bg-stone-800">
                {viewOnly ? null : (
                  <TableHead className="text-center text-xs leading-tight">
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
                )}
                <TableHead className="text-left text-xs leading-tight">
                  Equipment
                  <br />
                  Name
                </TableHead>
                <TableHead className="text-center text-xs leading-tight">Range</TableHead>
                {showOutsideChecklists ? (
                  <TableHead className="text-center text-xs leading-tight">
                    Outgoing
                    <br />
                    Checklist
                  </TableHead>
                ) : null}
                <TableHead className="text-center text-xs leading-tight">
                  Raw Data
                  <br />
                  Sheet
                </TableHead>
                {showOutsideChecklists ? (
                  <TableHead className="text-center text-xs leading-tight">
                    Inward
                    <br />
                    Checklist
                  </TableHead>
                ) : null}
                {viewOnly ? null : (
                  <TableHead className="text-center text-xs leading-tight">Action</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((job) => {
                const fields = parseConductEquipmentFields(job)
                const selected = selectedIds.has(job.id)
                const outgoingDone = showOutsideChecklists
                  ? isChecklistCompleted(
                      parseConductOutsideChecklist(job.outgoing_checklist, 'outgoing'),
                    )
                  : true
                const inwardDone = showOutsideChecklists
                  ? isChecklistCompleted(
                      parseConductOutsideChecklist(job.inward_checklist, 'inward'),
                    )
                  : true
                const sheetDisabled = !viewOnly && showOutsideChecklists && !outgoingDone
                const sheetBlockedTitle = viewOnly
                  ? 'View Raw Data Sheet'
                  : sheetDisabled
                    ? 'Complete Outgoing Checklist before opening Raw Data Sheet'
                    : 'Open Raw Data Sheet'
                const forwardBlockedTitle = showOutsideChecklists && !inwardDone
                  ? 'Complete Inward Checklist before Forward'
                  : 'Forward to Review Data'

                return (
                  <TableRow key={job.id} data-state={selected ? 'selected' : undefined}>
                    {viewOnly ? null : (
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${job.equipment_label}`}
                          checked={selected}
                          onChange={() => onToggle(job.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell
                      className="max-w-0 truncate align-middle text-sm font-medium"
                      title={cellText(job.equipment_label)}
                    >
                      <button
                        type="button"
                        className="block w-full truncate text-left font-medium text-amber-800 underline decoration-amber-700/40 underline-offset-2 hover:text-amber-950 hover:decoration-amber-800"
                        onClick={() => setDetailsJob(job)}
                      >
                        {cellText(job.equipment_label)}
                      </button>
                    </TableCell>
                    <TableCell className="text-center align-middle text-sm">
                      {cellText(fields.range)}
                    </TableCell>
                    {showOutsideChecklists ? (
                      <TableCell className="text-center align-middle">
                        <ChecklistColumnCell
                          completed={outgoingDone}
                          viewOnly={viewOnly}
                          onOpen={() => openChecklist(job, 'outgoing')}
                          ariaLabel={`Outgoing checklist for ${job.equipment_label}`}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="text-center align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 border-teal-600/40 px-2 text-xs text-teal-800 hover:bg-teal-50 disabled:opacity-40"
                        disabled={sheetDisabled}
                        title={sheetBlockedTitle}
                        onClick={() => handleOpenSheet(job)}
                        aria-label={`Open raw data sheet for ${job.equipment_label}`}
                      >
                        <FileSpreadsheet size={14} aria-hidden />
                        {viewOnly ? 'View Sheet' : 'Open Sheet'}
                      </Button>
                    </TableCell>
                    {showOutsideChecklists ? (
                      <TableCell className="text-center align-middle">
                        <ChecklistColumnCell
                          completed={inwardDone}
                          viewOnly={viewOnly}
                          onOpen={() => openChecklist(job, 'inward')}
                          ariaLabel={`Inward checklist for ${job.equipment_label}`}
                        />
                      </TableCell>
                    ) : null}
                    {viewOnly ? null : (
                      <TableCell className="text-center align-middle">
                        <div className="flex flex-nowrap items-center justify-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={forwardIconBtnClass}
                            disabled={actionLoading || (showOutsideChecklists && !inwardDone)}
                            onClick={() => onForward?.(job)}
                            aria-label={`Forward ${job.equipment_label}`}
                            title={forwardBlockedTitle}
                          >
                            <Send size={15} aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={referBackIconBtnClass}
                            disabled={actionLoading}
                            onClick={() => onReferback?.(job)}
                            aria-label={`Referback ${job.equipment_label}`}
                            title="Referback to Job Allocation"
                          >
                            <Undo2 size={15} aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <DucEquipmentDetailsDialog
        job={detailsJob}
        open={Boolean(detailsJob)}
        onOpenChange={(open) => {
          if (!open) setDetailsJob(null)
        }}
        contextLabel="Calibration Conduct"
      />
      <RawDataSheetDialog
        job={workSheetJob}
        open={Boolean(workSheetJob)}
        onOpenChange={(open) => {
          if (!open) setWorkSheetJob(null)
        }}
        forceReadOnly={viewOnly}
        onLocationOfCalibrationSaved={
          viewOnly
            ? undefined
            : (jobId, locationOfCalibration) => {
                setWorkSheetJob((prev) =>
                  prev && prev.id === jobId
                    ? { ...prev, location_of_calibration: locationOfCalibration }
                    : prev,
                )
                onLocationOfCalibrationSaved?.(jobId, locationOfCalibration)
              }
        }
      />
      {showOutsideChecklists ? (
        <ConductOutsideChecklistDialog
          job={checklistJob}
          kind={checklistKind}
          open={Boolean(checklistJob)}
          onOpenChange={(open) => {
            if (!open) setChecklistJob(null)
          }}
          readOnly={viewOnly}
          onSaved={(jobId, kind, payload) => {
            onChecklistSaved?.(jobId, kind, payload)
          }}
        />
      ) : null}
    </>
  )
}
