import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Download, FileCheck, FileSpreadsheet, Package, Printer, Reply, Search, Sigma } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  calibrationPointsTableForViewFactor,
  parseMeasurementRanges,
  rangePointsFromTable,
  type EquipmentRangeEntry,
} from '@/features/calibration/equipments/types'
import {
  parseCalibrationPointsTable,
  type CalibrationPointsStored,
} from '@/features/calibration/equipment-for-calibration/types'
import {
  CALIBRATION_JOB_STAGE_LABELS,
  extractEquipmentMasterIdFromDetail,
  type CalibrationJobLocation,
  type CalibrationJobRow,
  type CalibrationJobStage,
} from '../types'
import {
  resolveEquipmentMasterForJob,
  type CalibrationEngineerOption,
} from './calibrationJobApi'
import { RawDataSheetDialog } from './RawDataSheetDialog'
import { CertificateDraftDialog } from '../certificate-preparation/CertificateDraftDialog'
import { parseCertificateDraft } from '../certificate-preparation/certificateDraftTypes'

const GRID_TABLE =
  'min-w-[760px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const DUC_GRID =
  'min-w-[900px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Solid icon actions — Forward (teal) / Refer back (blue); pair with variant="ghost" to avoid primary bg */
const forwardIconBtnClass =
  'h-9 w-9 rounded-md bg-teal-600 text-white shadow-sm hover:bg-teal-700 hover:text-white disabled:bg-teal-600/40 disabled:text-white/90 disabled:opacity-100'
const referBackIconBtnClass =
  'h-9 w-9 rounded-md bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:text-white disabled:bg-blue-600/40 disabled:text-white/90 disabled:opacity-100'

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

type ParsedJobEquipmentFields = {
  leastCount: string
  range: string
  make: string
  model: string
  serial: string
  quantity: string
  accuracy: string
  condition: string
  physical: string
  calMethod: string
  methodNotes: string
  customerId: string
  points: string
  frequency: string
}

/** Parse job equipment_detail line into Range / Least Count / Make + customer DUC fields. */
function parseJobEquipmentFields(job: CalibrationJobRow): ParsedJobEquipmentFields {
  const empty: ParsedJobEquipmentFields = {
    leastCount: '',
    range: '',
    make: '',
    model: '',
    serial: '',
    quantity: '',
    accuracy: '',
    condition: '',
    physical: '',
    calMethod: '',
    methodNotes: '',
    customerId: '',
    points: '',
    frequency: '',
  }
  const text = (job.equipment_detail || job.equipment_label || '').trim()
  if (!text) return empty
  const parts = text.split('·').map((p) => p.trim()).filter(Boolean)
  parts.shift() // equipment name
  // Drop EQID token (resolved separately via equipment_master_id)
  const eqidIdx = parts.findIndex((p) => /^eqid\s+/i.test(p))
  if (eqidIdx >= 0) parts.splice(eqidIdx, 1)
  return {
    leastCount: takePrefixed(parts, /^lc\s+/i),
    range: takePrefixed(parts, /^range\s+/i),
    make: takePrefixed(parts, /^make\s+/i),
    model: takePrefixed(parts, /^model\s+/i),
    serial: takePrefixed(parts, /^s\/n\s+/i),
    accuracy: takePrefixed(parts, /^accuracy\s+/i),
    condition: takePrefixed(parts, /^condition\s+/i),
    physical: takePrefixed(parts, /^physical\s+/i),
    calMethod: takePrefixed(parts, /^cal\s*method\s+/i),
    methodNotes: takePrefixed(parts, /^method\s*notes\s+/i),
    customerId: takePrefixed(parts, /^cust(?:omer)?\s*id\s+/i),
    points: takePrefixed(parts, /^points\s+/i),
    frequency: takePrefixed(parts, /^freq\s+/i),
    quantity: takePrefixed(parts, /^qty\s+/i),
  }
}

type EquipmentMasterSnapshot = {
  id: string
  asset_code: string | null
  equipment_name: string | null
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  range_capacity: string | null
  resolution_least_count: string | null
  equipment_status: string | null
  calibration_method_label: string | null
}

function preferValue(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = (v ?? '').trim()
    if (t) return t
  }
  return ''
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  const display = cellText(value)
  const isEmpty = display === '—'
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border border-slate-200/90 bg-white px-2.5 py-2',
        className,
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 break-words whitespace-pre-wrap text-sm',
          isEmpty ? 'text-slate-400' : 'text-slate-900',
        )}
      >
        {display}
      </p>
    </div>
  )
}

function pointsTableHasValues(table: CalibrationPointsStored | null | undefined): boolean {
  if (!table) return false
  return table.rows.some((row) =>
    Object.values(row.values).some((v) => String(v ?? '').trim().length > 0),
  )
}

function withUnitLabel(value: string, unit: string): string {
  const v = value.trim()
  const u = unit.trim()
  if (!v) return ''
  return u ? `${v} ${u}` : v
}

/** Match job LC / Range labels to a Calibration Equipment measurement range. */
function matchRangeForJobFields(
  ranges: EquipmentRangeEntry[],
  leastCount: string,
  range: string,
): EquipmentRangeEntry | undefined {
  if (ranges.length === 0) return undefined
  if (ranges.length === 1) return ranges[0]

  const lc = leastCount.trim().toLowerCase()
  const rg = range.trim().toLowerCase()
  const labeled = ranges.map((r) => ({
    range: r,
    leastCount: withUnitLabel(r.resolutionLeastCount, r.unit).toLowerCase() || '—',
    rangeLabel: withUnitLabel(r.rangeCapacity, r.unit).toLowerCase() || '—',
  }))

  return (
    labeled.find((o) => o.leastCount === lc && o.rangeLabel === rg)?.range ??
    labeled.find((o) => o.leastCount === lc)?.range ??
    labeled.find((o) => o.rangeLabel === rg)?.range ??
    ranges[0]
  )
}

async function fetchEfcPointsTable(masterId: string): Promise<CalibrationPointsStored | null> {
  const id = masterId.trim()
  if (!id) return null
  const { data, error } = await supabase
    .from('equipment_for_calibration')
    .select('id, calibration_points')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const table = parseCalibrationPointsTable(
    (data as { calibration_points: unknown }).calibration_points,
  )
  return pointsTableHasValues(table) ? table : null
}

/**
 * Full nominal calibration points for the job's matched range —
 * same richest-table source as Conduct / Generate Report / View Factor.
 * Empty master tabs are filled from Equipment for Calibration when needed.
 */
async function resolveFullCalibrationPointsText(job: CalibrationJobRow): Promise<string> {
  const eq = await resolveEquipmentMasterForJob(job)
  if (!eq) return ''

  const ranges = parseMeasurementRanges(
    eq.measurement_ranges,
    eq.range_capacity,
    eq.resolution_least_count,
    eq.master_equipment_id,
  )
  if (ranges.length === 0) return ''

  const fields = parseJobEquipmentFields(job)
  const matched = matchRangeForJobFields(ranges, fields.leastCount, fields.range) ?? ranges[0]!

  const tabs = [...(matched.masterPointsTabs ?? [])]
  await Promise.all(
    tabs.map(async (tab, index) => {
      if (pointsTableHasValues(tab.calibrationPointsTable)) return
      const loaded = await fetchEfcPointsTable(tab.masterEquipmentId)
      if (loaded) tabs[index] = { ...tab, calibrationPointsTable: loaded }
    }),
  )

  // Also try linked master ids when tabs were empty / missing.
  if (tabs.every((t) => !pointsTableHasValues(t.calibrationPointsTable))) {
    for (const rawId of matched.masterEquipmentIds ?? []) {
      const loaded = await fetchEfcPointsTable(rawId)
      if (loaded) {
        tabs.push({
          id: `efc-${rawId}`,
          masterEquipmentId: rawId,
          calibrationPointsTable: loaded,
        })
        break
      }
    }
  }

  const enriched: EquipmentRangeEntry = {
    ...matched,
    masterPointsTabs: tabs,
  }
  const table = calibrationPointsTableForViewFactor(enriched)
  return rangePointsFromTable(table)
    .map((p) => p.pointValue)
    .filter(Boolean)
    .join(', ')
}

/** Full DUC / customer equipment details (job line + equipment_master). */
function DucEquipmentDetailsDialog({
  job,
  open,
  onOpenChange,
  contextLabel = 'Review Data',
}: {
  job: CalibrationJobRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Stage eyebrow above the equipment title (e.g. Review Data / Certificate Preparation). */
  contextLabel?: string
}) {
  const [master, setMaster] = useState<EquipmentMasterSnapshot | null>(null)
  const [loadingMaster, setLoadingMaster] = useState(false)
  const [masterError, setMasterError] = useState<string | null>(null)
  const [fullPoints, setFullPoints] = useState('')
  const [loadingPoints, setLoadingPoints] = useState(false)

  const fields = useMemo(() => (job ? parseJobEquipmentFields(job) : null), [job])

  const masterId = useMemo(() => {
    if (!job) return null
    return (
      job.equipment_master_id?.trim() ||
      extractEquipmentMasterIdFromDetail(job.equipment_detail || '') ||
      null
    )
  }, [job])

  useEffect(() => {
    if (!open || !masterId) {
      setMaster(null)
      setMasterError(null)
      setLoadingMaster(false)
      return
    }
    let cancelled = false
    setLoadingMaster(true)
    setMasterError(null)
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('equipment_master')
          .select(
            'id, asset_code, equipment_name, manufacturer, model_number, serial_number, range_capacity, resolution_least_count, equipment_status, calibration_method_label',
          )
          .eq('id', masterId)
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        setMaster((data as EquipmentMasterSnapshot | null) ?? null)
      } catch (err) {
        if (cancelled) return
        setMaster(null)
        setMasterError(err instanceof Error ? err.message : 'Failed to load equipment master')
      } finally {
        if (!cancelled) setLoadingMaster(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, masterId])

  // Load full calibration points from equipment range / EFC (not just SRF detail snapshot).
  useEffect(() => {
    if (!open || !job) {
      setFullPoints('')
      setLoadingPoints(false)
      return
    }
    let cancelled = false
    setLoadingPoints(true)
    void (async () => {
      try {
        const text = await resolveFullCalibrationPointsText(job)
        if (!cancelled) setFullPoints(text)
      } catch {
        if (!cancelled) setFullPoints('')
      } finally {
        if (!cancelled) setLoadingPoints(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, job])

  if (!job || !fields) return null

  const locationLabel =
    job.calibration_location === 'On Site' ? 'Outside (On Site)' : 'Inside (In Lab)'

  const calibrationPointsDisplay = preferValue(fullPoints, fields.points)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
        layer="nested"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              {contextLabel} · Equipment (DUC)
            </p>
            <DialogTitle className="text-lg font-semibold tracking-tight text-white">
              {cellText(job.equipment_label)}
            </DialogTitle>
            <p className="mt-1 text-xs text-slate-300">
              {cellText(job.srf_number)}
              {job.client_name ? ` · ${job.client_name}` : ''}
            </p>
          </DialogHeader>
        </div>

        <div className="max-h-[min(70vh,640px)] space-y-3 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
          {loadingMaster || loadingPoints ? (
            <p className="text-xs text-muted-foreground">
              {loadingMaster ? 'Loading equipment master…' : 'Loading calibration points…'}
            </p>
          ) : null}
          {masterError ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {masterError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <DetailField
              label="Equipment"
              value={preferValue(job.equipment_label, master?.equipment_name)}
              className="col-span-2 sm:col-span-3"
            />
            <DetailField label="Asset Code" value={preferValue(master?.asset_code)} />
            <DetailField label="Status" value={preferValue(master?.equipment_status)} />
            <DetailField
              label="Customer ID"
              value={preferValue(fields.customerId)}
            />
            <DetailField
              label="Manufacturer / Make"
              value={preferValue(fields.make, master?.manufacturer)}
            />
            <DetailField
              label="Model"
              value={preferValue(fields.model, master?.model_number)}
            />
            <DetailField
              label="Serial No."
              value={preferValue(fields.serial, master?.serial_number)}
            />
            <DetailField
              label="Range"
              value={preferValue(fields.range, master?.range_capacity)}
            />
            <DetailField
              label="Least Count"
              value={preferValue(fields.leastCount, master?.resolution_least_count)}
            />
            <DetailField label="Quantity" value={preferValue(fields.quantity)} />
            <DetailField label="Accuracy" value={preferValue(fields.accuracy)} />
            <DetailField label="Condition of DUC" value={preferValue(fields.condition)} />
            <DetailField label="Physical" value={preferValue(fields.physical)} />
            <DetailField
              label="Cal Method"
              value={preferValue(fields.calMethod, master?.calibration_method_label)}
            />
            <DetailField label="Frequency" value={preferValue(fields.frequency)} />
            <DetailField
              label="Calibration Points"
              value={calibrationPointsDisplay}
              className="col-span-2 sm:col-span-3"
            />
            <DetailField
              label="Method Notes"
              value={preferValue(fields.methodNotes)}
              className="col-span-2 sm:col-span-3"
            />
            <DetailField label="Location" value={locationLabel} />
            <DetailField
              label="Allocated Engineer"
              value={preferValue(job.allocated_engineer_name)}
            />
            <DetailField label="SRF Number" value={preferValue(job.srf_number)} />
            <DetailField label="Client" value={preferValue(job.client_name)} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
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

function SrfCertificatesListDialog({
  open,
  onOpenChange,
  group,
  onViewDetails,
  onViewCertificate,
  onPrintCertificate,
  onDownloadCertificate,
  onPrintSelected,
  onDownloadSelected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: CalibrationSrfGroup | null
  onViewDetails: (job: CalibrationJobRow) => void
  onViewCertificate: (job: CalibrationJobRow) => void
  onPrintCertificate: (job: CalibrationJobRow) => void
  onDownloadCertificate: (job: CalibrationJobRow) => void
  onPrintSelected: (jobs: CalibrationJobRow[]) => void
  onDownloadSelected: (jobs: CalibrationJobRow[]) => void
}) {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!open) {
      setSearch('')
      setSelectedIds(new Set())
    }
  }, [open])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [group?.serviceRequestId])

  const jobs = group?.jobs ?? []

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter((job) => {
      const fields = parseJobEquipmentFields(job)
      const draft = parseCertificateDraft(job.certificate_draft)
      const hay = [
        job.equipment_label,
        fields.range,
        fields.leastCount,
        fields.make,
        fields.serial,
        fields.customerId,
        draft.certificateNumber,
        draft.ulrNumber,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [jobs, search])

  const allFilteredChecked =
    filteredJobs.length > 0 && filteredJobs.every((j) => selectedIds.has(j.id))
  const someFilteredChecked = filteredJobs.some((j) => selectedIds.has(j.id))

  const selectedJobs = useMemo(
    () => jobs.filter((j) => selectedIds.has(j.id)),
    [jobs, selectedIds],
  )

  if (!group) return null

  const toggleAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const j of filteredJobs) {
        if (checked) next.add(j.id)
        else next.delete(j.id)
      }
      return next
    })
  }

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
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
              Certificates · Equipment
            </p>
            <DialogTitle className="text-xl font-semibold tracking-tight text-white">
              Certificates — {group.srfNumber}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search equipment, certificate no, ULR…"
                className="h-9 pl-9"
                aria-label="Search certificates list"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selectedJobs.length} selected
              </span>
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
                disabled={selectedJobs.length === 0}
                onClick={() => onPrintSelected(selectedJobs)}
                aria-label="Print selected certificates"
              >
                <Printer size={14} aria-hidden />
                Selected Print
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 border-blue-600/40 text-blue-800 hover:bg-blue-50"
                disabled={selectedJobs.length === 0}
                onClick={() => onDownloadSelected(selectedJobs)}
                aria-label="Download selected certificates"
              >
                <Download size={14} aria-hidden />
                Selected Download
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <Table className={DUC_GRID}>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={allFilteredChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someFilteredChecked && !allFilteredChecked
                      }}
                      onChange={(e) => toggleAllFiltered(e.target.checked)}
                      aria-label="Select all visible certificates"
                    />
                  </TableHead>
                  <TableHead className="min-w-[130px] text-center text-xs">Certificate No</TableHead>
                  <TableHead className="min-w-[150px] text-center text-xs">ULR Number</TableHead>
                  <TableHead className="min-w-[180px] text-center text-xs">Equipment Name</TableHead>
                  <TableHead className="min-w-[100px] text-center text-xs">Least Count</TableHead>
                  <TableHead className="min-w-[110px] text-center text-xs">Range</TableHead>
                  <TableHead className="min-w-[160px] text-center text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      {search.trim()
                        ? 'No equipment match your search.'
                        : 'No equipment found for this SRF.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map((job) => {
                    const fields = parseJobEquipmentFields(job)
                    const draft = parseCertificateDraft(job.certificate_draft)
                    const checked = selectedIds.has(job.id)
                    return (
                      <TableRow key={job.id} data-state={checked ? 'selected' : undefined}>
                        <TableCell className="text-center align-middle">
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            checked={checked}
                            onChange={(e) => toggleOne(job.id, e.target.checked)}
                            aria-label={`Select ${job.equipment_label}`}
                          />
                        </TableCell>
                        <TableCell className="align-middle text-left text-sm font-medium">
                          {cellText(draft.certificateNumber)}
                        </TableCell>
                        <TableCell className="text-center align-middle font-mono text-xs">
                          {cellText(draft.ulrNumber)}
                        </TableCell>
                        <TableCell className="text-center align-middle text-sm">
                          <button
                            type="button"
                            className="mx-auto max-w-full text-center text-sm font-medium text-teal-700 underline decoration-teal-600/50 underline-offset-2 transition-colors hover:text-teal-900 hover:decoration-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                            onClick={() => onViewDetails(job)}
                            aria-label={`View equipment details for ${job.equipment_label}`}
                            title="View Equipment Details"
                          >
                            {cellText(job.equipment_label)}
                          </button>
                        </TableCell>
                        <TableCell className="text-center align-middle text-sm">
                          {cellText(fields.leastCount)}
                        </TableCell>
                        <TableCell className="text-center align-middle text-sm">
                          {cellText(fields.range)}
                        </TableCell>
                        <TableCell className="text-center align-middle">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 border-slate-300 px-0 text-base leading-none"
                              onClick={() => onViewDetails(job)}
                              aria-label={`Equipment details for ${job.equipment_label}`}
                              title="Details"
                            >
                              <span aria-hidden>👁️</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 border-teal-600/40 px-0 text-base leading-none hover:bg-teal-50"
                              onClick={() => onViewCertificate(job)}
                              aria-label={`View certificate for ${job.equipment_label}`}
                              title="View Cert"
                            >
                              <span aria-hidden>📜</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 w-8 bg-blue-600 px-0 text-base leading-none text-white hover:bg-blue-700"
                              onClick={() => onPrintCertificate(job)}
                              aria-label={`Print certificate for ${job.equipment_label}`}
                              title="Print"
                            >
                              <span aria-hidden>🖨️</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 border-blue-600/40 px-0 text-base leading-none text-blue-800 hover:bg-blue-50"
                              onClick={() => onDownloadCertificate(job)}
                              aria-label={`Download certificate for ${job.equipment_label}`}
                              title="Download"
                            >
                              <span aria-hidden>⬇️</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
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
  const [certListGroup, setCertListGroup] = useState<CalibrationSrfGroup | null>(null)
  const [reviewSheetJob, setReviewSheetJob] = useState<CalibrationJobRow | null>(null)
  const [reviewOpenUncertainty, setReviewOpenUncertainty] = useState(false)
  const [reviewDetailsJob, setReviewDetailsJob] = useState<CalibrationJobRow | null>(null)
  const [certificateDraftJob, setCertificateDraftJob] = useState<CalibrationJobRow | null>(null)
  const [certificateAutoPrint, setCertificateAutoPrint] = useState(false)
  const [certificateAutoDownload, setCertificateAutoDownload] = useState(false)
  const [certificateQueue, setCertificateQueue] = useState<{
    jobs: CalibrationJobRow[]
    mode: 'print' | 'download'
    index: number
  } | null>(null)
  const certificateQueueRef = useRef(certificateQueue)
  certificateQueueRef.current = certificateQueue

  const openCertificateJob = (
    job: CalibrationJobRow,
    mode: 'view' | 'print' | 'download',
    queue?: { jobs: CalibrationJobRow[]; mode: 'print' | 'download'; index: number } | null,
  ) => {
    setCertificateQueue(queue ?? null)
    setCertificateAutoPrint(mode === 'print')
    setCertificateAutoDownload(mode === 'download')
    setCertificateDraftJob(job)
  }

  const startCertificateQueue = (jobs: CalibrationJobRow[], mode: 'print' | 'download') => {
    if (jobs.length === 0) return
    openCertificateJob(jobs[0]!, mode, { jobs, mode, index: 0 })
  }
  const title = CALIBRATION_JOB_STAGE_LABELS[stage]
  const isReviewData = stage === 'review_data'
  const isCertificatePrep = stage === 'certificate_preparation'
  const isCertificates = stage === 'certificates'
  const isPerJobTable = isReviewData || isCertificatePrep
  const canEditAllocation = stage === 'job_allocation'
  const canReferback = true
  const canForward = stage !== 'certificates'

  const liveDucGroup = useMemo(() => {
    if (!ducGroup) return null
    return groups.find((g) => g.serviceRequestId === ducGroup.serviceRequestId) ?? ducGroup
  }, [ducGroup, groups])

  const perJobRows = useMemo(
    () => (isPerJobTable ? groups.flatMap((g) => g.jobs) : []),
    [isPerJobTable, groups],
  )

  const groupByJobId = useMemo(() => {
    const map = new Map<string, CalibrationSrfGroup>()
    for (const g of groups) {
      for (const job of g.jobs) map.set(job.id, g)
    }
    return map
  }, [groups])

  const allChecked =
    groups.length > 0 && groups.every((g) => selectedSrfIds.has(g.serviceRequestId))
  const someChecked = groups.some((g) => selectedSrfIds.has(g.serviceRequestId))

  const openReviewRawData = (job: CalibrationJobRow) => {
    setReviewOpenUncertainty(false)
    setReviewSheetJob(job)
  }

  const openReviewUncertainty = (job: CalibrationJobRow) => {
    setReviewOpenUncertainty(true)
    setReviewSheetJob(job)
  }

  const emptyHint =
    stage === 'job_allocation'
      ? 'No SRFs awaiting allocation. Accept a Service Request to create jobs here.'
      : stage === 'calibration_conduct'
        ? scopedToEngineer
          ? 'No jobs allocated to you in Calibration Conduct yet. After Job Allocation assigns you and clicks Forward, your DUCs appear here.'
          : 'No jobs in Calibration Conduct yet. From Job Allocation, assign Engineer on each DUC, then click Forward.'
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

  const reviewGrid =
    'min-w-[920px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'
  const certPrepGrid =
    'min-w-[1080px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

  const selectAllHeader = (
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
  )

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          {isReviewData ? (
            <Table className={reviewGrid}>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {selectAllHeader}
                  <TableHead className="min-w-[120px] text-center text-xs">SRF Number</TableHead>
                  <TableHead className="min-w-[160px] text-left text-xs">Equipment (DUC)</TableHead>
                  <TableHead className="min-w-[150px] text-center text-xs">
                    Calibration Raw Data
                  </TableHead>
                  <TableHead className="min-w-[150px] text-center text-xs">
                    Uncertainty Calculation
                  </TableHead>
                  <TableHead className="min-w-[140px] text-center text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perJobRows.map((job) => {
                  const group = groupByJobId.get(job.id)
                  const srfKey = job.service_request_id || job.srf_number
                  const selected = selectedSrfIds.has(srfKey)
                  const alreadyForwarded = job.stage === 'certificate_preparation'
                  const jobCanForward = canForward && !alreadyForwarded
                  return (
                    <TableRow
                      key={job.id}
                      data-state={selected ? 'selected' : undefined}
                      className={alreadyForwarded ? 'bg-muted/30' : undefined}
                    >
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${job.srf_number} · ${job.equipment_label}`}
                          checked={selected}
                          onChange={() => onToggleSrf(srfKey)}
                        />
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm font-medium">
                        {cellText(job.srf_number)}
                      </TableCell>
                      <TableCell className="align-middle text-sm font-medium">
                        <button
                          type="button"
                          className="max-w-full text-left text-sm font-medium text-teal-700 underline decoration-teal-600/50 underline-offset-2 transition-colors hover:text-teal-900 hover:decoration-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-1"
                          onClick={() => setReviewDetailsJob(job)}
                          aria-label={`View equipment details for ${job.equipment_label}`}
                          title="View Equipment (DUC) details"
                        >
                          {cellText(job.equipment_label)}
                          {alreadyForwarded ? (
                            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground no-underline">
                              (Forwarded)
                            </span>
                          ) : null}
                        </button>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 border-teal-600/40 px-2 text-xs text-teal-800 hover:bg-teal-50"
                          onClick={() => openReviewRawData(job)}
                          aria-label={`View raw data for ${job.equipment_label}`}
                          title="View Calibration Raw Data (read-only)"
                        >
                          <FileSpreadsheet size={14} aria-hidden />
                          View Raw Data
                        </Button>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 border-indigo-600/40 px-2 text-xs text-indigo-800 hover:bg-indigo-50"
                          onClick={() => openReviewUncertainty(job)}
                          aria-label={`View uncertainty for ${job.equipment_label}`}
                          title="View Uncertainty Calculation (read-only)"
                        >
                          <Sigma size={14} aria-hidden />
                          View Uncertainty
                        </Button>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={
                              alreadyForwarded
                                ? 'h-9 w-9 rounded-md bg-muted text-muted-foreground shadow-none'
                                : forwardIconBtnClass
                            }
                            disabled={!jobCanForward || actionLoading || !group}
                            onClick={() => {
                              if (!group || alreadyForwarded) return
                              onForward({ ...group, jobs: [job] })
                            }}
                            aria-label={
                              alreadyForwarded
                                ? `${job.equipment_label} already forwarded`
                                : `Forward ${job.equipment_label}`
                            }
                            title={
                              alreadyForwarded
                                ? 'Already forwarded to Certificate Preparation'
                                : 'Forward to Certificate Preparation'
                            }
                          >
                            <ArrowRight size={16} aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={referBackIconBtnClass}
                            disabled={!canReferback || actionLoading || !group}
                            onClick={() => {
                              if (!group) return
                              onReferback({ ...group, jobs: [job] })
                            }}
                            aria-label={`Referback ${job.equipment_label}`}
                            title={
                              alreadyForwarded
                                ? 'Referback (undo forward → Review Data)'
                                : 'Referback to Calibration Conduct'
                            }
                          >
                            <Reply size={16} aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : isCertificatePrep ? (
            <Table className={certPrepGrid}>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {selectAllHeader}
                  <TableHead className="min-w-[120px] text-center text-xs">SRF Number</TableHead>
                  <TableHead className="min-w-[160px] text-left text-xs">Equipment Details</TableHead>
                  <TableHead className="min-w-[180px] text-left text-xs">Client Name</TableHead>
                  <TableHead className="min-w-[140px] text-center text-xs">Raw Data Results</TableHead>
                  <TableHead className="min-w-[130px] text-center text-xs">Uncertainty</TableHead>
                  <TableHead className="min-w-[140px] text-center text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perJobRows.map((job) => {
                  const group = groupByJobId.get(job.id)
                  const srfKey = job.service_request_id || job.srf_number
                  const selected = selectedSrfIds.has(srfKey)
                  return (
                    <TableRow
                      key={job.id}
                      data-state={selected ? 'selected' : undefined}
                    >
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${job.srf_number} · ${job.equipment_label}`}
                          checked={selected}
                          onChange={() => onToggleSrf(srfKey)}
                        />
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm font-medium">
                        {cellText(job.srf_number)}
                      </TableCell>
                      <TableCell className="align-middle text-sm font-medium">
                        <button
                          type="button"
                          className="max-w-full text-left text-sm font-medium text-teal-700 underline decoration-teal-600/50 underline-offset-2 transition-colors hover:text-teal-900 hover:decoration-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-1"
                          onClick={() => setReviewDetailsJob(job)}
                          aria-label={`View equipment details for ${job.equipment_label}`}
                          title="View Equipment Details"
                        >
                          {cellText(job.equipment_label)}
                        </button>
                      </TableCell>
                      <TableCell className="align-middle text-sm">
                        {cellText(job.client_name)}
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 border-teal-600/40 px-2 text-xs text-teal-800 hover:bg-teal-50"
                          onClick={() => openReviewRawData(job)}
                          aria-label={`View raw data results for ${job.equipment_label}`}
                          title="View Raw Data Results (read-only)"
                        >
                          <FileSpreadsheet size={14} aria-hidden />
                          View Raw Data
                        </Button>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 border-indigo-600/40 px-2 text-xs text-indigo-800 hover:bg-indigo-50"
                          onClick={() => openReviewUncertainty(job)}
                          aria-label={`View uncertainty for ${job.equipment_label}`}
                          title="View Uncertainty Step-by-Step (read-only)"
                        >
                          <Sigma size={14} aria-hidden />
                          View Uncertainty
                        </Button>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={forwardIconBtnClass}
                            disabled={actionLoading}
                            onClick={() => setCertificateDraftJob(job)}
                            aria-label="Certificate preparation"
                            title="Certificate preparation — open draft"
                          >
                            <FileCheck size={16} aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={referBackIconBtnClass}
                            disabled={!canReferback || actionLoading || !group}
                            onClick={() => {
                              if (!group) return
                              onReferback({ ...group, jobs: [job] })
                            }}
                            aria-label={`Refer back ${job.equipment_label}`}
                            title="Refer back"
                          >
                            <Reply size={16} aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <Table className={GRID_TABLE}>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {selectAllHeader}
                  <TableHead className="min-w-[120px] text-center text-xs">SRF Number</TableHead>
                  <TableHead className="min-w-[200px] text-left text-xs">Client</TableHead>
                  <TableHead className="min-w-[140px] text-center text-xs">
                    {stage === 'certificates' ? 'View Certificates' : 'Equipment (DUC)'}
                  </TableHead>
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
                          onClick={() =>
                            isCertificates ? setCertListGroup(group) : setDucGroup(group)
                          }
                          aria-label={
                            isCertificates
                              ? `View certificates for ${group.srfNumber}`
                              : `View DUC list for ${group.srfNumber}`
                          }
                        >
                          <Package size={14} aria-hidden />
                          View ({group.jobs.length})
                        </Button>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          {canForward ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className={forwardIconBtnClass}
                              disabled={actionLoading}
                              onClick={() => onForward(group)}
                              aria-label={`Forward ${group.srfNumber}`}
                              title="Forward"
                            >
                              <ArrowRight size={16} aria-hidden />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={referBackIconBtnClass}
                            disabled={!canReferback || actionLoading}
                            onClick={() => onReferback(group)}
                            aria-label={`Referback ${group.srfNumber}`}
                            title={
                              stage === 'job_allocation'
                                ? 'Referback to Service Request'
                                : stage === 'certificates'
                                  ? 'Referback to Certificate Preparation'
                                  : 'Referback'
                            }
                          >
                            <Reply size={16} aria-hidden />
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
      </div>

      <DucAllocationDialog
        open={Boolean(liveDucGroup) && !isCertificates}
        onOpenChange={(open) => {
          if (!open) setDucGroup(null)
        }}
        group={liveDucGroup}
        canEdit={canEditAllocation}
        engineers={engineers}
        onLocationChange={onLocationChange}
        onEngineerChange={onEngineerChange}
      />

      {isCertificates ? (
        <>
          <SrfCertificatesListDialog
            open={Boolean(certListGroup)}
            onOpenChange={(open) => {
              if (!open) setCertListGroup(null)
            }}
            group={certListGroup}
            onViewDetails={(job) => setReviewDetailsJob(job)}
            onViewCertificate={(job) => openCertificateJob(job, 'view')}
            onPrintCertificate={(job) => openCertificateJob(job, 'print')}
            onDownloadCertificate={(job) => openCertificateJob(job, 'download')}
            onPrintSelected={(jobs) => startCertificateQueue(jobs, 'print')}
            onDownloadSelected={(jobs) => startCertificateQueue(jobs, 'download')}
          />
          <DucEquipmentDetailsDialog
            job={reviewDetailsJob}
            open={Boolean(reviewDetailsJob)}
            onOpenChange={(open) => {
              if (!open) setReviewDetailsJob(null)
            }}
            contextLabel="Certificates"
          />
          <CertificateDraftDialog
            job={certificateDraftJob}
            open={Boolean(certificateDraftJob)}
            autoPrint={certificateAutoPrint}
            autoDownload={certificateAutoDownload}
            onOpenChange={(open) => {
              if (open) return
              setCertificateDraftJob(null)
              setCertificateAutoPrint(false)
              setCertificateAutoDownload(false)
              const q = certificateQueueRef.current
              if (!q) return
              const nextIndex = q.index + 1
              if (nextIndex >= q.jobs.length) {
                setCertificateQueue(null)
                return
              }
              const nextJob = q.jobs[nextIndex]!
              window.setTimeout(() => {
                openCertificateJob(nextJob, q.mode, { ...q, index: nextIndex })
              }, 350)
            }}
          />
        </>
      ) : null}

      {isPerJobTable ? (
        <>
          <DucEquipmentDetailsDialog
            job={reviewDetailsJob}
            open={Boolean(reviewDetailsJob)}
            onOpenChange={(open) => {
              if (!open) setReviewDetailsJob(null)
            }}
            contextLabel={
              isCertificatePrep ? 'Certificate Preparation' : 'Review Data'
            }
          />
          <RawDataSheetDialog
            job={reviewSheetJob}
            open={Boolean(reviewSheetJob)}
            onOpenChange={(open) => {
              if (!open) {
                setReviewSheetJob(null)
                setReviewOpenUncertainty(false)
              }
            }}
            forceReadOnly
            initialOpenUncertainty={reviewOpenUncertainty}
          />
          {isCertificatePrep ? (
            <CertificateDraftDialog
              job={certificateDraftJob}
              open={Boolean(certificateDraftJob)}
              onOpenChange={(open) => {
                if (!open) setCertificateDraftJob(null)
              }}
              onIssueAndForward={async (job) => {
                const group = groupByJobId.get(job.id)
                if (!group) return
                onForward({ ...group, jobs: [job] })
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  )
}
