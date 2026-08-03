import { useEffect, useMemo, useState } from 'react'
import { Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  CALIBRATION_JOB_STAGE_LABELS,
  type CalibrationJobLocation,
  type CalibrationJobRow,
  type CalibrationJobStage,
} from '../types'
import type { CalibrationEngineerOption } from './calibrationJobApi'

const GRID_TABLE =
  'min-w-[760px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const DUC_GRID =
  'min-w-[980px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

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

/** Parse job equipment_detail line into Range / Least Count / Make fields. */
function parseJobEquipmentFields(job: CalibrationJobRow): {
  leastCount: string
  range: string
  make: string
} {
  const text = (job.equipment_detail || job.equipment_label || '').trim()
  if (!text) return { leastCount: '', range: '', make: '' }
  const parts = text.split('·').map((p) => p.trim()).filter(Boolean)
  parts.shift() // equipment name
  return {
    leastCount: takePrefixed(parts, /^lc\s+/i),
    range: takePrefixed(parts, /^range\s+/i),
    make: takePrefixed(parts, /^make\s+/i),
  }
}

export type CalibrationSrfGroup = {
  serviceRequestId: string
  srfNumber: string
  clientName: string | null
  jobs: CalibrationJobRow[]
}

export function groupCalibrationJobsBySrf(rows: CalibrationJobRow[]): CalibrationSrfGroup[] {
  const map = new Map<string, CalibrationSrfGroup>()
  for (const job of rows) {
    const key = job.service_request_id || job.srf_number
    const existing = map.get(key)
    if (existing) {
      existing.jobs.push(job)
      continue
    }
    map.set(key, {
      serviceRequestId: key,
      srfNumber: job.srf_number,
      clientName: job.client_name,
      jobs: [job],
    })
  }
  return [...map.values()].map((g) => ({
    ...g,
    jobs: [...g.jobs].sort((a, b) => a.equipment_line_index - b.equipment_line_index),
  }))
}

function DucAllocationDialog({
  open,
  onOpenChange,
  group,
  canEdit,
  engineers,
  onLocationChange,
  onEngineerChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: CalibrationSrfGroup | null
  canEdit: boolean
  engineers: CalibrationEngineerOption[]
  onLocationChange?: (id: string, location: CalibrationJobLocation) => void
  onEngineerChange?: (id: string, engineerId: string | null, engineerName: string | null) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const jobs = group?.jobs ?? []
  const allChecked = jobs.length > 0 && jobs.every((j) => selectedIds.has(j.id))
  const someChecked = jobs.some((j) => selectedIds.has(j.id))

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set())
  }, [open, group?.serviceRequestId])

  if (!group) return null

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(jobs.map((j) => j.id)) : new Set())
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
        layer="nested"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
          <DialogHeader className="relative pr-12 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              Job Allocation · Equipment
            </p>
            <DialogTitle className="text-xl font-semibold tracking-tight text-white">
              DUC List — {group.srfNumber}
            </DialogTitle>
            <p className="mt-1 text-xs text-slate-300">
              {group.jobs.length} item(s)
              {group.clientName ? ` · ${group.clientName}` : ''}
              {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
            </p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <Table className={DUC_GRID}>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 text-center text-xs sm:w-14">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label="Select all DUCs"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = !allChecked && someChecked
                      }}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </TableHead>
                  <TableHead className="min-w-[160px] text-left text-xs">Equipment (DUC)</TableHead>
                  <TableHead className="min-w-[120px] text-center text-xs">Range</TableHead>
                  <TableHead className="min-w-[110px] text-center text-xs">Least Count</TableHead>
                  <TableHead className="min-w-[110px] text-center text-xs">Make</TableHead>
                  <TableHead className="min-w-[150px] text-center text-xs">Inside / Outside</TableHead>
                  <TableHead className="min-w-[200px] text-center text-xs">Engineer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.jobs.map((job) => {
                  const fields = parseJobEquipmentFields(job)
                  const selected = selectedIds.has(job.id)
                  return (
                    <TableRow key={job.id} data-state={selected ? 'selected' : undefined}>
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${job.equipment_label}`}
                          checked={selected}
                          onChange={() => toggleOne(job.id)}
                        />
                      </TableCell>
                      <TableCell className="align-middle text-sm">
                        <p className="font-medium text-foreground">
                          {cellText(job.equipment_label)}
                        </p>
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {cellText(fields.range)}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {cellText(fields.leastCount)}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {cellText(fields.make)}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {canEdit && onLocationChange ? (
                          <select
                            className="h-9 w-full max-w-[180px] rounded-md border border-input bg-background px-2 text-xs"
                            aria-label={`Inside or Outside for ${job.equipment_label}`}
                            value={job.calibration_location}
                            onChange={(e) =>
                              onLocationChange(job.id, e.target.value as CalibrationJobLocation)
                            }
                          >
                            <option value="In Lab">Inside (In Lab)</option>
                            <option value="On Site">Outside (On Site)</option>
                          </select>
                        ) : job.calibration_location === 'On Site' ? (
                          'Outside'
                        ) : (
                          'Inside'
                        )}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {canEdit && onEngineerChange ? (
                          <select
                            className="mx-auto h-9 w-full max-w-[240px] rounded-md border border-input bg-background px-2 text-xs"
                            aria-label={`Engineer for ${job.equipment_label}`}
                            value={job.allocated_engineer_id ?? ''}
                            onChange={(e) => {
                              const id = e.target.value || null
                              const found = engineers.find((eng) => eng.id === id)
                              onEngineerChange(job.id, id, found?.name ?? null)
                            }}
                          >
                            <option value="">Select engineer</option>
                            {engineers.map((eng) => (
                              <option key={eng.id} value={eng.id}>
                                {eng.designation ? `${eng.name} (${eng.designation})` : eng.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          cellText(job.allocated_engineer_name)
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CalibrationJobStageTable({
  stage,
  groups,
  loading,
  error,
  searchActive,
  selectedSrfIds,
  onToggleSrf,
  onToggleAll,
  engineers = [],
  onLocationChange,
  onEngineerChange,
  onForward,
  onReferback,
  actionLoading = false,
  scopedToEngineer = false,
}: {
  stage: CalibrationJobStage
  groups: CalibrationSrfGroup[]
  loading: boolean
  error: string | null
  searchActive: boolean
  selectedSrfIds: Set<string>
  onToggleSrf: (serviceRequestId: string) => void
  onToggleAll: (checked: boolean) => void
  engineers?: CalibrationEngineerOption[]
  onLocationChange?: (id: string, location: CalibrationJobLocation) => void
  onEngineerChange?: (id: string, engineerId: string | null, engineerName: string | null) => void
  onForward: (group: CalibrationSrfGroup) => void
  onReferback: (group: CalibrationSrfGroup) => void
  actionLoading?: boolean
  scopedToEngineer?: boolean
}) {
  const [ducGroup, setDucGroup] = useState<CalibrationSrfGroup | null>(null)
  const title = CALIBRATION_JOB_STAGE_LABELS[stage]
  const canEditAllocation = stage === 'job_allocation'
  const canReferback = true
  const canForward = stage !== 'certificates'

  const liveDucGroup = useMemo(() => {
    if (!ducGroup) return null
    return groups.find((g) => g.serviceRequestId === ducGroup.serviceRequestId) ?? ducGroup
  }, [ducGroup, groups])

  const allChecked =
    groups.length > 0 && groups.every((g) => selectedSrfIds.has(g.serviceRequestId))
  const someChecked = groups.some((g) => selectedSrfIds.has(g.serviceRequestId))

  const emptyHint =
    stage === 'job_allocation'
      ? 'No SRFs awaiting allocation. Accept a Service Request to create jobs here.'
      : stage === 'calibration_conduct'
        ? scopedToEngineer
          ? 'No jobs allocated to you in Calibration Conduct yet. After Job Allocation assigns you and clicks Forward, your DUCs appear here.'
          : 'No jobs in Calibration Conduct yet. From Job Allocation, assign Engineer on each DUC, then click Forward (➡️).'
        : `No SRFs in ${title} yet.`

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

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          {searchActive ? `No jobs match your search in ${title}.` : emptyHint}
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
                <TableHead className="min-w-[120px] text-center text-xs">SRF Number</TableHead>
                <TableHead className="min-w-[200px] text-left text-xs">Client</TableHead>
                <TableHead className="min-w-[140px] text-center text-xs">Equipment (DUC)</TableHead>
                <TableHead className="min-w-[200px] text-center text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const selected = selectedSrfIds.has(group.serviceRequestId)
                return (
                  <TableRow
                    key={group.serviceRequestId}
                    data-state={selected ? 'selected' : undefined}
                  >
                    <TableCell className="text-center align-middle">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${group.srfNumber}`}
                        checked={selected}
                        onChange={() => onToggleSrf(group.serviceRequestId)}
                      />
                    </TableCell>
                    <TableCell className="text-center align-middle text-sm font-medium">
                      {cellText(group.srfNumber)}
                    </TableCell>
                    <TableCell className="align-middle text-sm">
                      {cellText(group.clientName)}
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 border-teal-600/40 px-2.5 text-xs font-medium text-teal-800 hover:bg-teal-50"
                        onClick={() => setDucGroup(group)}
                        aria-label={`View DUC list for ${group.srfNumber}`}
                      >
                        <Package size={14} aria-hidden />
                        View ({group.jobs.length})
                      </Button>
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-lg leading-none hover:bg-teal-50 disabled:opacity-40"
                          disabled={!canForward || actionLoading}
                          onClick={() => onForward(group)}
                          aria-label={`Forward ${group.srfNumber}`}
                          title="Forward"
                        >
                          <span aria-hidden>➡️</span>
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-lg leading-none hover:bg-amber-50 disabled:opacity-40"
                          disabled={!canReferback || actionLoading}
                          onClick={() => onReferback(group)}
                          aria-label={`Referback ${group.srfNumber}`}
                          title={
                            stage === 'job_allocation'
                              ? 'Referback to Service Request'
                              : 'Referback'
                          }
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

      <DucAllocationDialog
        open={Boolean(liveDucGroup)}
        onOpenChange={(open) => {
          if (!open) setDucGroup(null)
        }}
        group={liveDucGroup}
        canEdit={canEditAllocation}
        engineers={engineers}
        onLocationChange={onLocationChange}
        onEngineerChange={onEngineerChange}
      />
    </>
  )
}
