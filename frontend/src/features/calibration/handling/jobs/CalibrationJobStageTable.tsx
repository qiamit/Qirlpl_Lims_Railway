import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Download, FileCheck, FileSpreadsheet, Package, Printer, Search, Send, Sigma, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabaseClient'
import {
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
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
import { FILTER_COMBOBOX_DROPDOWN_ATTR } from '@/features/sample-handling/receiving/FilterCombobox'
import { fetchDesignationAndDepartmentLabels } from '@/features/settings/lab-settings/labMasterOptions'
import {
  resolveEquipmentMasterForJob,
  type CalibrationEngineerOption,
} from './calibrationJobApi'
import { RawDataSheetDialog } from './RawDataSheetDialog'
import { CertificateDraftDialog } from '../certificate-preparation/CertificateDraftDialog'
import { parseCertificateDraft } from '../certificate-preparation/certificateDraftTypes'

const GRID_TABLE =
  'table-fixed min-w-[980px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border [&_td]:whitespace-nowrap'

const DUC_GRID =
  'w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Client Master icon actions — Forward (amber) / Refer back (stone) */
const actionIconOnlyBase =
  'h-8 w-8 rounded-none border shadow-none transition-colors disabled:opacity-45'
const forwardIconBtnClass =
  `${actionIconOnlyBase} border-amber-800/60 bg-[#fff7ed] text-amber-950 hover:border-amber-900 hover:bg-amber-800 hover:text-white`
const referBackIconBtnClass =
  `${actionIconOnlyBase} border-stone-500 bg-stone-50 text-stone-700 hover:border-stone-800 hover:bg-stone-800 hover:text-amber-100`
const certPrepIconBtnClass =
  `${actionIconOnlyBase} border-amber-800/60 bg-[#fff7ed] text-amber-950 hover:border-amber-900 hover:bg-amber-800 hover:text-white`

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
        'min-w-0 rounded-none border border-stone-500 bg-stone-50 px-2.5 py-2',
        className,
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-600">{label}</p>
      <p
        className={cn(
          'mt-0.5 break-words whitespace-pre-wrap text-sm',
          isEmpty ? 'text-stone-400' : 'text-stone-900',
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
export function DucEquipmentDetailsDialog({
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
        layer="stacked"
        persistOnFocusLoss
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          'max-h-[min(92vh,820px)] max-w-3xl gap-0 overflow-hidden p-0',
          'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'md:left-[calc(268px+(100vw-268px)/2)]',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-3">
              <DialogTitle className="min-w-0 truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                {cellText(job.equipment_label)}
              </DialogTitle>
              <p className="min-w-0 truncate text-right text-xs font-medium text-stone-300">
                {cellText(job.srf_number)}
                {job.client_name ? ` · ${job.client_name}` : ''}
              </p>
            </div>
          </DialogHeader>
        </div>

        <div className="max-h-[min(70vh,640px)] space-y-3 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
          {loadingMaster || loadingPoints ? (
            <p className="text-xs text-stone-500">
              {loadingMaster ? 'Loading equipment master…' : 'Loading calibration points…'}
            </p>
          ) : null}
          {masterError ? (
            <p className="rounded-none border border-amber-600/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {masterError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DetailField label="SRF Number" value={preferValue(job.srf_number)} />
            <DetailField label="Asset Code" value={preferValue(master?.asset_code)} />
            <DetailField label="Status" value={preferValue(master?.equipment_status)} />
            <DetailField
              label="Customer ID"
              value={preferValue(fields.customerId)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DetailField
              label="Serial No."
              value={preferValue(fields.serial, master?.serial_number)}
            />
            <DetailField
              label="Model"
              value={preferValue(fields.model, master?.model_number)}
            />
            <DetailField
              label="Range"
              value={preferValue(fields.range, master?.range_capacity)}
            />
            <DetailField
              label="Least Count"
              value={preferValue(fields.leastCount, master?.resolution_least_count)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DetailField label="Quantity" value={preferValue(fields.quantity)} />
            <DetailField
              label="Manufacturer / Make"
              value={preferValue(fields.make, master?.manufacturer)}
            />
            <DetailField label="Accuracy" value={preferValue(fields.accuracy)} />
            <DetailField label="Condition of DUC" value={preferValue(fields.condition)} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DetailField label="Physical" value={preferValue(fields.physical)} />
            <DetailField
              label="Cal Method"
              value={preferValue(fields.calMethod, master?.calibration_method_label)}
            />
            <DetailField label="Frequency" value={preferValue(fields.frequency)} />
            <DetailField label="Location" value={locationLabel} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DetailField
              label="Calibration Points"
              value={calibrationPointsDisplay}
            />
            <DetailField
              label="Allocated Engineer"
              value={preferValue(job.allocated_engineer_name)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export type CalibrationSrfGroup = {
  serviceRequestId: string
  srfNumber: string
  srfDate: string | null
  expectedCompletionDate: string | null
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
      if (!existing.srfDate && job.srf_date) existing.srfDate = job.srf_date
      if (!existing.expectedCompletionDate && job.required_completion_date) {
        existing.expectedCompletionDate = job.required_completion_date
      }
      continue
    }
    map.set(key, {
      serviceRequestId: key,
      srfNumber: job.srf_number,
      srfDate: job.srf_date ?? null,
      expectedCompletionDate: job.required_completion_date ?? null,
      clientName: job.client_name,
      jobs: [job],
    })
  }
  return [...map.values()].map((g) => ({
    ...g,
    jobs: [...g.jobs].sort((a, b) => a.equipment_line_index - b.equipment_line_index),
  }))
}

function engineerLabel(eng: CalibrationEngineerOption): string {
  return eng.name
}

function isCalibrationDivision(division: string): boolean {
  return division.trim().toLowerCase().includes('calibration')
}

function PortaledSelectList({
  open,
  anchorRef,
  children,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({
        left: rect.left,
        top: rect.bottom + 4,
        width: Math.max(rect.width, 180),
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  if (!open || !pos) return null
  return createPortal(
    <div
      {...{ [FILTER_COMBOBOX_DROPDOWN_ATTR]: '' }}
      className="fixed z-[9999] rounded-none border border-stone-500 bg-white shadow-lg"
      style={{ left: pos.left, top: pos.top, width: pos.width }}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

function TypeSelect({
  value,
  options,
  placeholder,
  ariaLabel,
  onChange,
}: {
  value: string
  options: string[]
  placeholder: string
  ariaLabel: string
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    setQuery(value)
  }, [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => opt.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    setHighlight((prev) => (filtered.length === 0 ? 0 : Math.min(prev, filtered.length - 1)))
  }, [filtered.length])

  const inputRef = useRef<HTMLInputElement>(null)

  const pick = (next: string) => {
    onChange(next)
    setQuery(next)
    setOpen(false)
  }

  return (
    <div className="relative mx-auto w-full">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false)
            setQuery(value)
          }, 150)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            setOpen(false)
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setQuery(value)
            setOpen(false)
            return
          }
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            setOpen(true)
          }
          if (event.key === 'ArrowDown' && filtered.length > 0) {
            event.preventDefault()
            setHighlight((prev) => (prev + 1) % filtered.length)
          }
          if (event.key === 'ArrowUp' && filtered.length > 0) {
            event.preventDefault()
            setHighlight((prev) => (prev - 1 + filtered.length) % filtered.length)
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault()
            const hit = filtered[highlight]
            if (hit) pick(hit)
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={ariaLabel}
        className="h-9 rounded-none border-stone-500 bg-stone-50 px-2 text-center text-xs shadow-none placeholder:text-center"
      />
      <PortaledSelectList open={open} anchorRef={inputRef}>
        <ul className="max-h-48 overflow-auto text-left text-xs">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-stone-500">No option found</li>
          ) : (
            filtered.map((opt, index) => (
              <li key={opt}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    'w-full px-3 py-2 text-left',
                    index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(opt)}
                >
                  {opt}
                </button>
              </li>
            ))
          )}
        </ul>
      </PortaledSelectList>
    </div>
  )
}

function EngineerSelect({
  jobLabel,
  engineerId,
  engineerName,
  engineers,
  emptyHint = 'No engineer found',
  onChange,
}: {
  jobLabel: string
  engineerId: string | null
  engineerName: string | null
  engineers: CalibrationEngineerOption[]
  emptyHint?: string
  onChange: (id: string | null, name: string | null) => void
}) {
  const selected = engineers.find((eng) => eng.id === engineerId)
  const selectedLabel = selected ? engineerLabel(selected) : engineerName?.trim() || ''
  const [query, setQuery] = useState(selectedLabel)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return engineers
    return engineers.filter((eng) => engineerLabel(eng).toLowerCase().includes(q))
  }, [engineers, query])

  useEffect(() => {
    setHighlight((prev) => (filtered.length === 0 ? 0 : Math.min(prev, filtered.length - 1)))
  }, [filtered.length])

  const inputRef = useRef<HTMLInputElement>(null)

  const pick = (eng: CalibrationEngineerOption | null) => {
    if (!eng) {
      onChange(null, null)
      setQuery('')
    } else {
      onChange(eng.id, eng.name)
      setQuery(engineerLabel(eng))
    }
    setOpen(false)
  }

  return (
    <div className="relative mx-auto w-full">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false)
            setQuery(selectedLabel)
          }, 150)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            setOpen(false)
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setQuery(selectedLabel)
            setOpen(false)
            return
          }
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            setOpen(true)
          }
          if (event.key === 'ArrowDown' && filtered.length > 0) {
            event.preventDefault()
            setHighlight((prev) => (prev + 1) % filtered.length)
          }
          if (event.key === 'ArrowUp' && filtered.length > 0) {
            event.preventDefault()
            setHighlight((prev) => (prev - 1 + filtered.length) % filtered.length)
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault()
            const hit = filtered[highlight]
            if (hit) pick(hit)
          }
        }}
        placeholder="Select Engineer"
        autoComplete="off"
        aria-label={`Engineer for ${jobLabel}`}
        className="h-9 rounded-none border-stone-500 bg-stone-50 px-2 text-center text-xs shadow-none placeholder:text-center"
      />
      <PortaledSelectList open={open} anchorRef={inputRef}>
        <ul className="max-h-48 overflow-auto text-left text-xs">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-center text-stone-500">{emptyHint}</li>
          ) : (
            filtered.map((eng, index) => (
              <li key={eng.id}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    'w-full px-3 py-2 text-left',
                    index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(eng)}
                >
                  {engineerLabel(eng)}
                </button>
              </li>
            ))
          )}
        </ul>
      </PortaledSelectList>
    </div>
  )
}

function DucAllocationDialog({
  open,
  onOpenChange,
  group,
  canEdit,
  engineers,
  onLocationChange,
  onEngineerChange,
  onDesignationChange,
  onViewDetails,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: CalibrationSrfGroup | null
  canEdit: boolean
  engineers: CalibrationEngineerOption[]
  onLocationChange?: (id: string, location: CalibrationJobLocation) => void
  onEngineerChange?: (id: string, engineerId: string | null, engineerName: string | null) => void
  onDesignationChange?: (id: string, designation: string) => void
  onViewDetails?: (job: CalibrationJobRow) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [designationByJob, setDesignationByJob] = useState<Record<string, string>>({})
  const [labDesignations, setLabDesignations] = useState<string[]>([])

  const jobs = group?.jobs ?? []
  const allChecked = jobs.length > 0 && jobs.every((j) => selectedIds.has(j.id))
  const someChecked = jobs.some((j) => selectedIds.has(j.id))
  const calibrationEngineers = useMemo(
    () => engineers.filter((eng) => isCalibrationDivision(eng.division)),
    [engineers],
  )

  const designationOptions = useMemo(() => {
    const names = new Set<string>()
    for (const eng of calibrationEngineers) {
      if (eng.designation) names.add(eng.designation)
    }
    if (names.size === 0) {
      for (const name of labDesignations) {
        if (name) names.add(name)
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [calibrationEngineers, labDesignations])

  useEffect(() => {
    void fetchDesignationAndDepartmentLabels()
      .then(({ designations }) => setLabDesignations(designations))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set())
  }, [open, group?.serviceRequestId])

  useEffect(() => {
    if (!open || !group) return
    setDesignationByJob((prev) => {
      let changed = false
      const next = { ...prev }
      for (const job of group.jobs) {
        if (next[job.id]) continue
        const saved = job.allocated_engineer_designation?.trim()
        const eng = engineers.find((e) => e.id === job.allocated_engineer_id)
        const fromEng = eng?.designation?.trim()
        const value = saved || fromEng
        if (value) {
          next[job.id] = value
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [open, group, engineers])

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
        layer="nested"
        persistOnFocusLoss
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden p-0',
          'left-0 top-0',
          'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3">
              <DialogTitle className="min-w-0 truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                DUC List — {group.srfNumber}
              </DialogTitle>
              <p className="text-center text-xs font-medium text-stone-300">
                {group.jobs.length} {group.jobs.length === 1 ? 'Item' : 'Items'}
              </p>
              <p className="min-w-0 truncate text-right text-xs font-medium text-stone-200">
                {group.clientName || ''}
              </p>
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5 sm:py-5">
          <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white">
            <Table className={cn(DUC_GRID, 'table-fixed min-w-0 w-full')}>
              <TableHeader>
                <TableRow className="bg-stone-800 hover:bg-stone-800">
                  <TableHead className="w-[4%] px-1 text-center text-xs">
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
                  <TableHead className="w-[24%] text-left text-xs">Equipment (DUC)</TableHead>
                  <TableHead className="w-[14%] text-center text-xs">Range</TableHead>
                  <TableHead className="w-[16%] text-center text-xs">Inside / Outside</TableHead>
                  <TableHead className="w-[18%] text-center text-xs">Designation</TableHead>
                  <TableHead className="w-[24%] text-center text-xs">Calibration Engineer</TableHead>
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
                        {onViewDetails ? (
                          <button
                            type="button"
                            className="text-left font-medium text-amber-800 underline decoration-amber-700/40 underline-offset-2 hover:text-amber-950 hover:decoration-amber-800"
                            onClick={() => onViewDetails(job)}
                          >
                            {cellText(job.equipment_label)}
                          </button>
                        ) : (
                          <p className="font-medium text-foreground">
                            {cellText(job.equipment_label)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {cellText(fields.range)}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {canEdit && onLocationChange ? (
                          <select
                            className="h-9 w-full rounded-none border border-stone-500 bg-stone-50 px-2 text-xs"
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
                        {canEdit ? (
                          <TypeSelect
                            value={designationByJob[job.id] ?? ''}
                            options={designationOptions}
                            placeholder="Select Designation"
                            ariaLabel={`Designation for ${job.equipment_label}`}
                            onChange={(designation) => {
                              setDesignationByJob((prev) => ({ ...prev, [job.id]: designation }))
                              onDesignationChange?.(job.id, designation)
                              const current = engineers.find((e) => e.id === job.allocated_engineer_id)
                              if (
                                current &&
                                current.designation &&
                                current.designation.toLowerCase() !== designation.toLowerCase()
                              ) {
                                onEngineerChange?.(job.id, null, null)
                              }
                            }}
                          />
                        ) : (
                          cellText(
                            job.allocated_engineer_designation ||
                              designationByJob[job.id] ||
                              engineers.find((e) => e.id === job.allocated_engineer_id)?.designation,
                          )
                        )}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {canEdit && onEngineerChange ? (
                          <EngineerSelect
                            jobLabel={job.equipment_label}
                            engineerId={job.allocated_engineer_id}
                            engineerName={job.allocated_engineer_name}
                            emptyHint={
                              designationByJob[job.id]
                                ? 'No engineer found'
                                : 'Select designation first'
                            }
                            engineers={
                              designationByJob[job.id]
                                ? calibrationEngineers.filter(
                                    (eng) =>
                                      eng.designation.toLowerCase() ===
                                      designationByJob[job.id]!.toLowerCase(),
                                  )
                                : []
                            }
                            onChange={(id, name) => {
                              const picked = calibrationEngineers.find((e) => e.id === id)
                              const nextDesig =
                                picked?.designation || designationByJob[job.id] || ''
                              if (nextDesig) {
                                setDesignationByJob((prev) => ({
                                  ...prev,
                                  [job.id]: nextDesig,
                                }))
                              }
                              onEngineerChange(job.id, id, name)
                              if (nextDesig) onDesignationChange?.(job.id, nextDesig)
                            }}
                          />
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
        persistOnFocusLoss
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden p-0',
          'left-0 top-0',
          'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
        layer="nested"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Certificates — {group.srfNumber}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5 sm:py-5">
          <div className="relative mb-3 flex flex-col gap-2 overflow-hidden rounded-none border-2 border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Equipments"
                className={cn(limsDarkBarSearchClass, 'pl-9')}
                aria-label="Search Equipments"
              />
            </div>
            <div className="relative flex flex-wrap items-center gap-2">
              <span className="text-xs text-stone-300">
                {selectedJobs.length} selected
              </span>
              <Button
                type="button"
                size="sm"
                className={cn('h-8 gap-1.5', limsPrimaryBtnClass)}
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
                className={cn('h-8 gap-1.5', limsOutlineBtnClass)}
                disabled={selectedJobs.length === 0}
                onClick={() => onDownloadSelected(selectedJobs)}
                aria-label="Download selected certificates"
              >
                <Download size={14} aria-hidden />
                Selected Download
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-none border-2 border-stone-700 bg-white">
            <Table className={cn(DUC_GRID, 'table-fixed min-w-0 w-full')}>
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[22%]" />
                <col className="w-[11%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
              </colgroup>
              <TableHeader>
                <TableRow className="bg-stone-800 hover:bg-stone-800">
                  <TableHead className="text-center">
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
                  <TableHead className="text-center text-xs">Equipment Name</TableHead>
                  <TableHead className="text-center text-xs">Least Count</TableHead>
                  <TableHead className="text-center text-xs">Range</TableHead>
                  <TableHead className="text-center text-xs">Certificate No</TableHead>
                  <TableHead className="text-center text-xs">ULR Number</TableHead>
                  <TableHead className="text-center text-xs">Action</TableHead>
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
                        <TableCell className="min-w-0 text-center align-middle text-sm">
                          <button
                            type="button"
                            className="mx-auto block max-w-full truncate text-center text-sm font-medium text-amber-800 underline decoration-amber-700/40 underline-offset-2 transition-colors hover:text-amber-950 hover:decoration-amber-800"
                            onClick={() => onViewDetails(job)}
                            aria-label={`View equipment details for ${job.equipment_label}`}
                            title="View Equipment Details"
                          >
                            {cellText(job.equipment_label)}
                          </button>
                        </TableCell>
                        <TableCell className="truncate text-center align-middle text-sm">
                          {cellText(fields.leastCount)}
                        </TableCell>
                        <TableCell className="truncate text-center align-middle text-sm">
                          {cellText(fields.range)}
                        </TableCell>
                        <TableCell className="truncate align-middle text-left text-sm font-medium">
                          {cellText(draft.certificateNumber)}
                        </TableCell>
                        <TableCell className="truncate text-center align-middle font-mono text-xs">
                          {cellText(draft.ulrNumber)}
                        </TableCell>
                        <TableCell className="text-center align-middle">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className={referBackIconBtnClass}
                              onClick={() => onDownloadCertificate(job)}
                              aria-label={`Download PDF for ${job.equipment_label}`}
                              title="Download PDF"
                            >
                              <Download size={15} aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className={certPrepIconBtnClass}
                              onClick={() => onViewCertificate(job)}
                              aria-label={`View certificate for ${job.equipment_label}`}
                              title="View Cert"
                            >
                              <FileCheck size={15} aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className={forwardIconBtnClass}
                              onClick={() => onPrintCertificate(job)}
                              aria-label={`Print certificate for ${job.equipment_label}`}
                              title="Print"
                            >
                              <Printer size={15} aria-hidden />
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
  onDesignationChange,
  onForward,
  onReferback,
  actionLoading = false,
  scopedToEngineer = false,
  hideAction = false,
  referbackOnly = false,
  emptyMessage,
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
  onDesignationChange?: (id: string, designation: string) => void
  onForward: (group: CalibrationSrfGroup) => void
  onReferback: (group: CalibrationSrfGroup) => void
  actionLoading?: boolean
  scopedToEngineer?: boolean
  hideAction?: boolean
  /** Forwarded SRF list: only Referback (return to Job Allocation). */
  referbackOnly?: boolean
  emptyMessage?: string
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
  const canEditAllocation = stage === 'job_allocation' && !hideAction && !referbackOnly
  const canReferback = true
  const canForward = !referbackOnly && !hideAction && stage !== 'certificates'
  const showActionColumn = !hideAction

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
    emptyMessage ??
    (stage === 'job_allocation'
      ? 'No SRFs awaiting allocation. Accept a Service Request to create jobs here.'
      : stage === 'calibration_conduct'
        ? scopedToEngineer
          ? 'No jobs allocated to you in Calibration Conduct yet. After Job Allocation assigns you and clicks Forward, your DUCs appear here.'
          : 'No jobs in Calibration Conduct yet. From Job Allocation, assign Engineer on each DUC, then click Forward.'
        : `No SRFs in ${title} yet.`)

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
    'table-fixed min-w-0 w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'
  const certPrepGrid =
    'table-fixed min-w-0 w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

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
      <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
        <div className="w-full min-w-0 overflow-hidden">
          {isReviewData ? (
            <Table className={reviewGrid}>
              <colgroup>
                <col className="w-[5%]" />
                <col className={showActionColumn ? 'w-[16%]' : 'w-[18%]'} />
                <col className={showActionColumn ? 'w-[27%]' : 'w-[34%]'} />
                <col className={showActionColumn ? 'w-[18%]' : 'w-[22%]'} />
                <col className={showActionColumn ? 'w-[18%]' : 'w-[21%]'} />
                {showActionColumn ? <col className="w-[16%]" /> : null}
              </colgroup>
              <TableHeader>
                <TableRow className="bg-stone-800 hover:bg-stone-800">
                  {selectAllHeader}
                  <TableHead className="text-center text-xs">SRF Number</TableHead>
                  <TableHead className="text-left text-xs">Equipment (DUC)</TableHead>
                  <TableHead className="text-center text-xs">
                    Calibration Raw Data
                  </TableHead>
                  <TableHead className="text-center text-xs">
                    Uncertainty Calculation
                  </TableHead>
                  {showActionColumn ? (
                    <TableHead className="text-center text-xs">Action</TableHead>
                  ) : null}
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
                      className={
                        showActionColumn && alreadyForwarded ? 'bg-muted/30' : undefined
                      }
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
                      <TableCell className="truncate text-center align-middle text-sm font-medium">
                        {cellText(job.srf_number)}
                      </TableCell>
                      <TableCell className="min-w-0 align-middle text-sm font-medium">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left text-sm font-medium text-teal-700 underline decoration-teal-600/50 underline-offset-2 transition-colors hover:text-teal-900 hover:decoration-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-1"
                          onClick={() => setReviewDetailsJob(job)}
                          aria-label={`View equipment details for ${job.equipment_label}`}
                          title="View Equipment (DUC) details"
                        >
                          {cellText(job.equipment_label)}
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
                      {showActionColumn ? (
                      <TableCell className="text-center align-middle">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={
                              alreadyForwarded
                                ? `${actionIconOnlyBase} border-stone-300 bg-stone-100 text-stone-400`
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
                            <Send size={15} aria-hidden />
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
                            <Undo2 size={15} aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : isCertificatePrep ? (
            <Table className={certPrepGrid}>
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[16%]" />
                <col className="w-[26%]" />
                <col className="w-[25%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
              </colgroup>
              <TableHeader>
                <TableRow className="bg-stone-800 hover:bg-stone-800">
                  {selectAllHeader}
                  <TableHead className="text-center text-xs">SRF Number</TableHead>
                  <TableHead className="text-left text-xs">Equipment Details</TableHead>
                  <TableHead className="text-left text-xs">Client Name</TableHead>
                  <TableHead className="text-center text-xs">Raw Data Results</TableHead>
                  <TableHead className="text-center text-xs">Action</TableHead>
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
                      <TableCell className="truncate text-center align-middle text-sm font-medium">
                        {cellText(job.srf_number)}
                      </TableCell>
                      <TableCell className="min-w-0 align-middle text-sm font-medium">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left text-sm font-medium text-teal-700 underline decoration-teal-600/50 underline-offset-2 transition-colors hover:text-teal-900 hover:decoration-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-1"
                          onClick={() => setReviewDetailsJob(job)}
                          aria-label={`View equipment details for ${job.equipment_label}`}
                          title="View Equipment Details"
                        >
                          {cellText(job.equipment_label)}
                        </button>
                      </TableCell>
                      <TableCell className="truncate align-middle text-sm">
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
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={certPrepIconBtnClass}
                            disabled={actionLoading}
                            onClick={() => setCertificateDraftJob(job)}
                            aria-label="Certificate preparation"
                            title="Certificate preparation — open draft"
                          >
                            <FileCheck size={15} aria-hidden />
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
                            <Undo2 size={15} aria-hidden />
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
              <colgroup>
                <col className="w-[4%]" />
                <col className={showActionColumn ? 'w-[26%]' : 'w-[30%]'} />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[18%]" />
                <col className={showActionColumn ? 'w-[14%]' : 'w-[19%]'} />
                {showActionColumn ? <col className="w-[12%]" /> : null}
              </colgroup>
              <TableHeader>
                <TableRow className="bg-stone-800 hover:bg-stone-800">
                  {selectAllHeader}
                  <TableHead className="text-left text-xs leading-tight">Client</TableHead>
                  <TableHead className="text-center text-xs leading-tight">
                    SRF
                    <br />
                    Number
                  </TableHead>
                  <TableHead className="text-center text-xs leading-tight">
                    Date of
                    <br />
                    SRF
                  </TableHead>
                  <TableHead className="text-center text-xs leading-tight">
                    Expected
                    <br />
                    Completion
                  </TableHead>
                  <TableHead className="text-center text-xs leading-tight">
                    {stage === 'certificates' ? (
                      <>
                        View
                        <br />
                        Certificates
                      </>
                    ) : (
                      <>
                        Equipment
                        <br />
                        (DUC)
                      </>
                    )}
                  </TableHead>
                  {showActionColumn ? (
                    <TableHead className="text-center text-xs leading-tight">Action</TableHead>
                  ) : null}
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
                      <TableCell
                        className="max-w-0 truncate align-middle text-sm"
                        title={cellText(group.clientName)}
                      >
                        {cellText(group.clientName)}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm font-medium">
                        {cellText(group.srfNumber)}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {formatDate(group.srfDate)}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm">
                        {formatDate(group.expectedCompletionDate)}
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
                      {showActionColumn ? (
                        <TableCell className="text-center align-middle">
                          <div className="flex flex-nowrap items-center justify-center gap-1.5">
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
                                <Send size={15} aria-hidden />
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
                                referbackOnly
                                  ? 'Referback to Job Allocation'
                                  : stage === 'job_allocation'
                                    ? 'Referback to Service Request'
                                    : stage === 'certificates'
                                      ? 'Referback to Certificate Preparation'
                                      : 'Referback'
                              }
                            >
                              <Undo2 size={15} aria-hidden />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
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
        onDesignationChange={onDesignationChange}
        onViewDetails={(job) => setReviewDetailsJob(job)}
      />

      {!isCertificates && !isPerJobTable ? (
        <DucEquipmentDetailsDialog
          job={reviewDetailsJob}
          open={Boolean(reviewDetailsJob)}
          onOpenChange={(open) => {
            if (!open) setReviewDetailsJob(null)
          }}
          contextLabel="Job Allocation"
        />
      ) : null}

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
