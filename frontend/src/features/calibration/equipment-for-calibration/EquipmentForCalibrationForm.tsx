import {
  Plus,
  Trash2,
  ClipboardCheck,
  ListChecks,
  Wrench,
  History,
  Sigma,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Activity,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { ConductMaintenanceDialog } from '@/features/masters/equipment-master/ConductMaintenanceDialog'
import { MaintenanceHistoryDialog } from '@/features/masters/equipment-master/MaintenanceHistoryDialog'
import { ConductIntermediateCheckDialog } from '@/features/masters/equipment-master/ConductIntermediateCheckDialog'
import { IntermediateCheckHistoryDialog } from '@/features/masters/equipment-master/IntermediateCheckHistoryDialog'
import {
  buildIntermediateCheckMasterSnapshots,
  createIntermediateCheckHistoryRecord,
  filterIntermediateCheckHistoryLastYears,
  isDateWithinLastYears,
  parseIntermediateCheckResultPayload,
} from '@/features/masters/equipment-master/intermediateCheckHistory'
import type { Frequency as EqMasterFrequency } from '@/features/masters/equipment-master/types'
import {
  IntermediateCheckCalculator,
  type IntermediateCheckMasterOption,
} from './IntermediateCheckCalculator'
import {
  decodeIntermediateCheckResult,
  encodeIntermediateCheckResult,
  hasValidIntermediateReading,
  type IntermediateCheckDraft,
} from './intermediateCheck'
import {
  EQUIPMENT_STATUSES,
  FREQUENCIES,
  buildCalibrationColumnsFromHeaders,
  calculateNextDueDate,
  emptyCalibrationPointRow,
  formatManualDaysFrequency,
  frequencySelectValue,
  hasAutoNextDue,
  isPresetFrequency,
  parseManualIntervalDays,
  type EquipmentForCalibrationForm,
  type EquipmentScheduleSection,
  type EquipmentStatus,
  type Frequency,
} from './types'
import {
  evaluatePointFormula,
  formatFormulaResult,
  validatePointFormula,
} from './pointFormula'
import { ScientificFormulaPad } from './ScientificFormulaPad'

const NESTED_FULLSCREEN_DIALOG_CLASS =
  '!flex fixed inset-0 z-[60] !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100'

const MAX_SETUP_COLUMNS = 12

const NESTED_FULLSCREEN_DIALOG_STYLE = {
  width: '100vw',
  height: '100dvh',
  maxWidth: 'none',
  maxHeight: '100dvh',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  transform: 'none',
  borderRadius: 0,
} as const

function SectionTitle({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={`border-b border-slate-200 pb-2 text-[12px] font-medium text-slate-600 ${className ?? ''}`}
    >
      {children}
    </p>
  )
}

/** Schedule field tile — Frequency / Last / Next Due in one row */
function ScheduleFieldTile({
  children,
  span = 4,
}: {
  children: ReactNode
  span?: 2 | 3 | 4 | 6 | 12 | 'auto'
}) {
  if (span === 'auto') {
    return (
      <div className="space-y-2 rounded-md border border-slate-200/80 bg-white/70 px-3 py-3">
        {children}
      </div>
    )
  }
  const spanClass =
    span === 2
      ? 'md:col-span-2'
      : span === 3
        ? 'md:col-span-3'
        : span === 6
          ? 'md:col-span-6'
          : span === 12
            ? 'md:col-span-12'
            : 'md:col-span-4'
  return (
    <div
      className={`col-span-12 space-y-2 rounded-md border border-slate-200/80 bg-white/70 px-3 py-3 ${spanClass}`}
    >
      {children}
    </div>
  )
}

/**
 * Uncontrolled `type="date"` field. A controlled value fights the browser's own
 * segment buffer: every partial edit reports '' and React writes it back, wiping
 * what the user just typed. Here the DOM owns editing and we only push external
 * value changes while the field is not focused.
 */
function ScheduleDateInput({
  id,
  value,
  disabled,
  className,
  onCommit,
}: {
  id: string
  value: string
  disabled?: boolean
  className?: string
  onCommit: (next: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el || el === document.activeElement) return
    if (el.value !== value) el.value = value
  }, [value])

  return (
    <Input
      ref={inputRef}
      id={id}
      type="date"
      defaultValue={value}
      disabled={disabled}
      className={className}
      onChange={(e) => onCommit(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
    />
  )
}

type ManualDaysTarget = 'calibration' | 'intermediate' | 'maintenance'

/** Popup when Frequency = Manual — interval days drive Next Due (auto). */
function ManualDaysDialog({
  open,
  onOpenChange,
  initialDays,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDays: number | null
  onConfirm: (days: number) => void
}) {
  const [daysText, setDaysText] = useState(initialDays ? String(initialDays) : '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDaysText(initialDays ? String(initialDays) : '')
    setError(null)
  }, [open, initialDays])

  const apply = () => {
    const n = Number.parseInt(daysText.trim(), 10)
    if (!Number.isFinite(n) || n < 1) {
      setError('Enter a whole number of days (1 or more).')
      return
    }
    onConfirm(n)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer="stacked" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Manual Frequency — Days</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Enter how many days after the last date the next due should fall. Next Due stays
            auto-calculated.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="efc-manual-days">Interval (days)</Label>
            <Input
              id="efc-manual-days"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="e.g. 90"
              value={daysText}
              onChange={(e) => {
                setDaysText(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  apply()
                }
              }}
              autoFocus
            />
            {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={apply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EquipmentForCalibrationForm({
  form,
  onChange,
  clientOptions,
  employeeOptions = [],
  masterEquipmentOptions = [],
  canSave,
  saveLoading,
  onSave,
  assetCodeLocked = false,
  initialSection = null,
}: {
  form: EquipmentForCalibrationForm
  onChange: (next: EquipmentForCalibrationForm) => void
  clientOptions: FilterComboboxOption[]
  /** Calibration division staff suggested for "Maintenance Done By". */
  employeeOptions?: FilterComboboxOption[]
  /** Peer calibration standards selectable as reference during an intermediate check. */
  masterEquipmentOptions?: IntermediateCheckMasterOption[]
  canSave: boolean
  saveLoading: boolean
  onSave: (latest?: EquipmentForCalibrationForm) => void
  assetCodeLocked?: boolean
  /** Auto-open one schedule dialog when the form is opened from a table status badge. */
  initialSection?: EquipmentScheduleSection | null
}) {
  const [mfrQuery, setMfrQuery] = useState(form.manufacturer)
  const [mfrOpen, setMfrOpen] = useState(false)
  const [agencyQuery, setAgencyQuery] = useState(form.externalCalibrationAgencyName)
  const [agencyOpen, setAgencyOpen] = useState(false)
  const [doneByOpen, setDoneByOpen] = useState(false)
  const [performedByOpen, setPerformedByOpen] = useState(false)
  const [conductIntermediateCheckOpen, setConductIntermediateCheckOpen] = useState(false)
  const [intermediateHistoryViewOpen, setIntermediateHistoryViewOpen] = useState(false)
  const [intermediateCompleteMessage, setIntermediateCompleteMessage] = useState<string | null>(
    null,
  )
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false)
  const handleCalibrationDialogOpenChange = useFormDialogOpenChange(setCalibrationDialogOpen)
  const [intermediateCheckDialogOpen, setIntermediateCheckDialogOpen] = useState(false)
  const handleIntermediateCheckDialogOpenChange = useFormDialogOpenChange(
    setIntermediateCheckDialogOpen,
  )
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
  const handleMaintenanceDialogOpenChange = useFormDialogOpenChange(setMaintenanceDialogOpen)
  const [conductMaintenanceOpen, setConductMaintenanceOpen] = useState(false)
  const [maintenanceHistoryViewOpen, setMaintenanceHistoryViewOpen] = useState(false)
  const [manualDaysTarget, setManualDaysTarget] = useState<ManualDaysTarget | null>(null)
  const [manualDaysOpen, setManualDaysOpen] = useState(false)
  const [pointsSetupOpen, setPointsSetupOpen] = useState(false)
  const handlePointsSetupOpenChange = useFormDialogOpenChange(setPointsSetupOpen)
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false)
  const handleFormulaDialogOpenChange = useFormDialogOpenChange(setFormulaDialogOpen)
  const [formulaSourceColId, setFormulaSourceColId] = useState('')
  const [formulaTargetColId, setFormulaTargetColId] = useState('')
  const [formulaExpr, setFormulaExpr] = useState('')
  const [formulaXInputs, setFormulaXInputs] = useState<Array<{ id: string; x: string }>>([
    { id: 'x-1', x: '' },
  ])
  const [formulaHint, setFormulaHint] = useState<string | null>(null)
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(() => new Set())
  const [pointsSortColId, setPointsSortColId] = useState<string | null>(null)
  const [pointsSortDir, setPointsSortDir] = useState<'asc' | 'desc'>('asc')
  const [setupHeaders, setSetupHeaders] = useState<string[]>([
    'Nominal',
    'Actual',
    'Correction',
    'Uncertainty',
  ])
  const [draftColumnHeader, setDraftColumnHeader] = useState('')
  const formRef = useRef(form)
  const emittedRef = useRef<EquipmentForCalibrationForm | null>(null)

  // Adopt parent-driven resets, but ignore echoes of our own patches — a blind
  // sync races with patchForm and wipes freshly typed Manual dates.
  useEffect(() => {
    if (form !== emittedRef.current) formRef.current = form
  }, [form])

  useEffect(() => {
    setMfrQuery(form.manufacturer)
  }, [form.manufacturer])

  useEffect(() => {
    setAgencyQuery(form.externalCalibrationAgencyName)
  }, [form.externalCalibrationAgencyName])

  useEffect(() => {
    if (!initialSection) return
    // Open after mount so nested dialog stacks above the edit form reliably.
    const timer = window.setTimeout(() => {
      if (initialSection === 'calibration') setCalibrationDialogOpen(true)
      else if (initialSection === 'intermediate') setIntermediateCheckDialogOpen(true)
      else if (initialSection === 'maintenance') setMaintenanceDialogOpen(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [initialSection])

  const patchForm = (patch: Partial<EquipmentForCalibrationForm>) => {
    // Keep ref in sync immediately so Save (esp. nested dialog) never uses a stale snapshot.
    const next = { ...formRef.current, ...patch }
    formRef.current = next
    emittedRef.current = next
    onChange(next)
  }

  const latestFormSnapshot = (): EquipmentForCalibrationForm => formRef.current

  const set = <K extends keyof EquipmentForCalibrationForm>(
    key: K,
    value: EquipmentForCalibrationForm[K],
  ) => {
    patchForm({ [key]: value } as Partial<EquipmentForCalibrationForm>)
  }

  const calNextDueEditable = !hasAutoNextDue(form.calibrationFrequency)
  const icNextDueEditable = !hasAutoNextDue(form.intermediateCheckFrequency)
  const maintNextDueEditable = !hasAutoNextDue(form.maintenanceScheduleFrequency)

  const calManualDays = parseManualIntervalDays(form.calibrationFrequency)
  const icManualDays = parseManualIntervalDays(form.intermediateCheckFrequency)
  const maintManualDays = parseManualIntervalDays(form.maintenanceScheduleFrequency)

  const openManualDaysDialog = (target: ManualDaysTarget) => {
    setManualDaysTarget(target)
    setManualDaysOpen(true)
  }

  const applyManualDays = (days: number) => {
    if (!manualDaysTarget) return
    const freq = formatManualDaysFrequency(days)
    if (manualDaysTarget === 'calibration') {
      const next = calculateNextDueDate(formRef.current.lastCalibrationDate, freq)
      patchForm({
        calibrationFrequency: freq,
        nextCalibrationDue: next || formRef.current.nextCalibrationDue,
      })
    } else if (manualDaysTarget === 'intermediate') {
      const next = calculateNextDueDate(formRef.current.lastIntermediateCheckDate, freq)
      patchForm({
        intermediateCheckFrequency: freq,
        nextIntermediateCheckDate: next || formRef.current.nextIntermediateCheckDate,
      })
    } else {
      const next = calculateNextDueDate(formRef.current.lastMaintenanceDate, freq)
      patchForm({
        maintenanceScheduleFrequency: freq,
        nextMaintenanceDate: next || formRef.current.nextMaintenanceDate,
      })
    }
  }

  const manualDaysInitial = (() => {
    if (manualDaysTarget === 'calibration') return calManualDays
    if (manualDaysTarget === 'intermediate') return icManualDays
    if (manualDaysTarget === 'maintenance') return maintManualDays
    return null
  })()

  const hasMaintenanceChecklistHistory = useMemo(
    () =>
      form.maintenanceHistory.length > 0 ||
      (form.maintenanceChecklist.length > 0 && !!form.lastMaintenanceDate.trim()),
    [form.maintenanceHistory.length, form.maintenanceChecklist.length, form.lastMaintenanceDate],
  )

  const formulaReady =
    formulaExpr.trim().length > 0 && validatePointFormula(formulaExpr) == null

  const newFormulaXRowId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return `x-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }

  const maintFreqForConduct: EqMasterFrequency =
    isPresetFrequency(form.maintenanceScheduleFrequency)
      ? form.maintenanceScheduleFrequency
      : ''

  const saveAndCloseNested = (close: () => void) => {
    // Clone snapshot so async save cannot see a later wiped ref.
    onSave({ ...latestFormSnapshot() })
    close()
  }

  const selectedManufacturerLabel = useMemo(() => {
    const match = clientOptions.find(
      (o) =>
        o.label.trim().toLowerCase() === form.manufacturer.trim().toLowerCase() ||
        o.id === form.manufacturer,
    )
    return match?.label ?? form.manufacturer
  }, [clientOptions, form.manufacturer])

  const selectedAgencyLabel = useMemo(() => {
    const match = clientOptions.find(
      (o) =>
        o.label.trim().toLowerCase() ===
          form.externalCalibrationAgencyName.trim().toLowerCase() ||
        o.id === form.externalCalibrationAgencyName,
    )
    return match?.label ?? form.externalCalibrationAgencyName
  }, [clientOptions, form.externalCalibrationAgencyName])

  const filteredClients = useMemo(() => {
    const q = mfrQuery.trim().toLowerCase()
    if (!q || !mfrOpen) return clientOptions
    return clientOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [clientOptions, mfrQuery, mfrOpen])

  const filteredEmployees = useMemo(() => {
    const q = form.maintenanceDoneBy.trim().toLowerCase()
    if (!q) return employeeOptions
    // Once a full name is picked, show the whole list again so it stays re-pickable.
    if (employeeOptions.some((o) => o.label.trim().toLowerCase() === q)) return employeeOptions
    return employeeOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [employeeOptions, form.maintenanceDoneBy])

  const filteredPerformers = useMemo(() => {
    const q = form.intermediateCheckPerformedBy.trim().toLowerCase()
    if (!q) return employeeOptions
    if (employeeOptions.some((o) => o.label.trim().toLowerCase() === q)) return employeeOptions
    return employeeOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [employeeOptions, form.intermediateCheckPerformedBy])

  const filteredAgencyClients = useMemo(() => {
    const q = agencyQuery.trim().toLowerCase()
    if (!q || !agencyOpen) return clientOptions
    return clientOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [clientOptions, agencyQuery, agencyOpen])

  const setCalFreq = (frequency: Frequency) => {
    if (frequency === 'Manual') {
      openManualDaysDialog('calibration')
      return
    }
    const next = calculateNextDueDate(formRef.current.lastCalibrationDate, frequency)
    patchForm({
      calibrationFrequency: frequency,
      nextCalibrationDue: next || formRef.current.nextCalibrationDue,
    })
  }

  const setLastCal = (lastCalibrationDate: string) => {
    if (!hasAutoNextDue(formRef.current.calibrationFrequency)) {
      patchForm({ lastCalibrationDate })
      return
    }
    const next = calculateNextDueDate(lastCalibrationDate, formRef.current.calibrationFrequency)
    patchForm({
      lastCalibrationDate,
      nextCalibrationDue: next || formRef.current.nextCalibrationDue,
    })
  }

  const setIcFreq = (frequency: Frequency) => {
    if (frequency === 'Manual') {
      openManualDaysDialog('intermediate')
      return
    }
    const next = calculateNextDueDate(formRef.current.lastIntermediateCheckDate, frequency)
    patchForm({
      intermediateCheckFrequency: frequency,
      nextIntermediateCheckDate: next || formRef.current.nextIntermediateCheckDate,
    })
  }

  const setLastIc = (lastIntermediateCheckDate: string) => {
    if (!hasAutoNextDue(formRef.current.intermediateCheckFrequency)) {
      patchForm({ lastIntermediateCheckDate })
      return
    }
    const next = calculateNextDueDate(
      lastIntermediateCheckDate,
      formRef.current.intermediateCheckFrequency,
    )
    patchForm({
      lastIntermediateCheckDate,
      nextIntermediateCheckDate: next || formRef.current.nextIntermediateCheckDate,
    })
  }

  const intermediateDraft = useMemo(
    () =>
      decodeIntermediateCheckResult(
        form.intermediateCheckResult,
        form.intermediateCheckPerformedBy,
      ),
    [form.intermediateCheckResult, form.intermediateCheckPerformedBy],
  )

  const setIntermediateDraft = (next: IntermediateCheckDraft) => {
    patchForm({
      intermediateCheckResult: encodeIntermediateCheckResult(
        next,
        formRef.current.accuracyAcceptanceCriteria,
      ),
    })
  }

  const currentIntermediatePayload = useMemo(
    () => parseIntermediateCheckResultPayload(form.intermediateCheckResult),
    [form.intermediateCheckResult],
  )

  const currentIntermediateMasters = useMemo(
    () =>
      buildIntermediateCheckMasterSnapshots(
        currentIntermediatePayload.masterIds,
        masterEquipmentOptions as Array<Record<string, unknown>>,
      ),
    [currentIntermediatePayload.masterIds, masterEquipmentOptions],
  )

  const visibleIntermediateHistoryCount = useMemo(
    () =>
      filterIntermediateCheckHistoryLastYears(form.intermediateCheckHistory).length +
      (form.lastIntermediateCheckDate.trim() &&
      currentIntermediatePayload.readings.length > 0 &&
      isDateWithinLastYears(form.lastIntermediateCheckDate)
        ? 1
        : 0),
    [
      form.intermediateCheckHistory,
      form.lastIntermediateCheckDate,
      currentIntermediatePayload.readings.length,
    ],
  )

  const completeIntermediateCheck = (): boolean => {
    const latest = formRef.current
    const performedBy = latest.intermediateCheckPerformedBy.trim()
    if (!performedBy) {
      setIntermediateCompleteMessage('Select Performed By before completing intermediate check.')
      return false
    }

    const draft = decodeIntermediateCheckResult(latest.intermediateCheckResult, performedBy)
    if (!hasValidIntermediateReading(draft.readings)) {
      setIntermediateCompleteMessage('Add at least one valid Std/Obs reading before completing.')
      return false
    }

    const today = new Date().toISOString().slice(0, 10)
    const nextDue = hasAutoNextDue(latest.intermediateCheckFrequency)
      ? calculateNextDueDate(today, latest.intermediateCheckFrequency) ||
        latest.nextIntermediateCheckDate
      : latest.nextIntermediateCheckDate

    // Archive the previous check before today's reading overwrites the live result.
    let nextHistory = [...latest.intermediateCheckHistory]
    const shouldArchivePrevious =
      latest.lastIntermediateCheckDate.trim() &&
      latest.lastIntermediateCheckDate !== today &&
      !nextHistory.some((r) => r.conductedOn === latest.lastIntermediateCheckDate)

    if (shouldArchivePrevious) {
      const archived = createIntermediateCheckHistoryRecord({
        conductedOn: latest.lastIntermediateCheckDate,
        doneBy: performedBy,
        doneByName: performedBy,
        intermediateCheckResult: latest.intermediateCheckResult,
        nextDueDate: latest.nextIntermediateCheckDate,
        iqcMasters: masterEquipmentOptions as Array<Record<string, unknown>>,
      })
      if (archived) nextHistory = [...nextHistory, archived]
    }

    patchForm({
      intermediateCheckResult: encodeIntermediateCheckResult(
        { ...draft, doneBy: performedBy },
        latest.accuracyAcceptanceCriteria,
      ),
      intermediateCheckHistory: nextHistory,
      lastIntermediateCheckDate: today,
      nextIntermediateCheckDate: nextDue,
    })
    setIntermediateCompleteMessage(null)
    return true
  }

  const setMaintFreq = (frequency: Frequency) => {
    if (frequency === 'Manual') {
      openManualDaysDialog('maintenance')
      return
    }
    const next = calculateNextDueDate(formRef.current.lastMaintenanceDate, frequency)
    patchForm({
      maintenanceScheduleFrequency: frequency,
      nextMaintenanceDate: next || formRef.current.nextMaintenanceDate,
    })
  }

  const setLastMaint = (lastMaintenanceDate: string) => {
    if (!hasAutoNextDue(formRef.current.maintenanceScheduleFrequency)) {
      patchForm({ lastMaintenanceDate })
      return
    }
    const next = calculateNextDueDate(
      lastMaintenanceDate,
      formRef.current.maintenanceScheduleFrequency,
    )
    patchForm({
      lastMaintenanceDate,
      nextMaintenanceDate: next || formRef.current.nextMaintenanceDate,
    })
  }

  const openPointsSetup = () => {
    if (form.calibrationPointsColumns.length > 0) {
      setSetupHeaders(form.calibrationPointsColumns.map((c) => c.header))
    } else {
      setSetupHeaders(['Nominal', 'Actual', 'Correction', 'Uncertainty'])
    }
    setDraftColumnHeader('')
    setPointsSetupOpen(true)
  }

  const updateSetupHeader = (index: number, value: string) => {
    setSetupHeaders((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const addSetupColumn = () => {
    const name = draftColumnHeader.trim()
    if (!name) return
    setSetupHeaders((prev) => {
      if (prev.length >= MAX_SETUP_COLUMNS) return prev
      if (prev.some((h) => h.trim().toLowerCase() === name.toLowerCase())) return prev
      return [...prev, name]
    })
    setDraftColumnHeader('')
  }

  const removeSetupColumn = (index: number) => {
    setSetupHeaders((prev) => prev.filter((_, i) => i !== index))
  }

  const applyPointsSetup = () => {
    const headers = setupHeaders.map((h, i) => h.trim() || `Column ${i + 1}`)
    if (headers.length === 0) return
    const columns = buildCalibrationColumnsFromHeaders(headers)
    onChange({
      ...form,
      calibrationPointsColumns: columns,
      calibrationPoints: [emptyCalibrationPointRow(columns)],
    })
    setSelectedPointIds(new Set())
    setPointsSortColId(null)
    setPointsSetupOpen(false)
  }

  const updatePointValue = (rowId: string, columnId: string, value: string) => {
    set(
      'calibrationPoints',
      formRef.current.calibrationPoints.map((row) =>
        row.id === rowId
          ? { ...row, values: { ...row.values, [columnId]: value } }
          : row,
      ),
    )
  }

  const addPoint = () => {
    const columns = formRef.current.calibrationPointsColumns
    const row = emptyCalibrationPointRow(columns)
    set('calibrationPoints', [...formRef.current.calibrationPoints, row])
    const firstColId = columns[0]?.id
    if (!firstColId) return
    // Wait for React to commit the new row, then move focus into its first field.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(
          `efc-pt-${row.id}-${firstColId}`,
        ) as HTMLInputElement | null
        if (!el) return
        el.focus()
        el.select()
      })
    })
  }

  const removePoint = (id: string) => {
    const points = formRef.current.calibrationPoints
    if (points.length <= 1) return
    set(
      'calibrationPoints',
      points.filter((r) => r.id !== id),
    )
    setSelectedPointIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const removeSelectedPoints = () => {
    const points = formRef.current.calibrationPoints
    if (selectedPointIds.size === 0) return
    const remaining = points.filter((r) => !selectedPointIds.has(r.id))
    set(
      'calibrationPoints',
      remaining.length > 0
        ? remaining
        : [emptyCalibrationPointRow(formRef.current.calibrationPointsColumns)],
    )
    setSelectedPointIds(new Set())
  }

  const movePoint = (id: string, direction: -1 | 1) => {
    const points = [...formRef.current.calibrationPoints]
    const index = points.findIndex((r) => r.id === id)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= points.length) return
    const tmp = points[index]!
    points[index] = points[target]!
    points[target] = tmp
    set('calibrationPoints', points)
    setPointsSortColId(null)
  }

  const togglePointSelected = (id: string) => {
    setSelectedPointIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllPointsSelected = (checked: boolean) => {
    if (!checked) {
      setSelectedPointIds(new Set())
      return
    }
    setSelectedPointIds(new Set(formRef.current.calibrationPoints.map((r) => r.id)))
  }

  const sortPointsByColumn = (columnId: string) => {
    const nextDir: 'asc' | 'desc' =
      pointsSortColId === columnId && pointsSortDir === 'asc' ? 'desc' : 'asc'
    const points = [...formRef.current.calibrationPoints]
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    points.sort((a, b) => {
      const av = String(a.values[columnId] ?? '').trim()
      const bv = String(b.values[columnId] ?? '').trim()
      const an = Number(av)
      const bn = Number(bv)
      let cmp = 0
      if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn)) {
        cmp = an - bn
      } else {
        cmp = collator.compare(av, bv)
      }
      return nextDir === 'asc' ? cmp : -cmp
    })
    setPointsSortColId(columnId)
    setPointsSortDir(nextDir)
    set('calibrationPoints', points)
  }

  const pointsGridTemplate = `2rem repeat(${Math.max(form.calibrationPointsColumns.length, 1)}, minmax(120px, 1fr)) 4.5rem 5.5rem`

  const openFormulaDialog = () => {
    const cols = form.calibrationPointsColumns
    if (cols.length === 0) return
    setFormulaSourceColId(cols[0]!.id)
    setFormulaTargetColId(cols.length > 1 ? cols[1]!.id : '')
    setFormulaExpr('')
    setFormulaXInputs([{ id: newFormulaXRowId(), x: '' }])
    setFormulaHint(null)
    setFormulaDialogOpen(true)
  }

  const applyFormulaGenerate = () => {
    const cols = form.calibrationPointsColumns
    if (cols.length === 0) return

    if (!formulaSourceColId) {
      setFormulaHint('Select the column for x values.')
      return
    }
    if (!formulaTargetColId || formulaTargetColId === formulaSourceColId) {
      setFormulaHint('Select a result column different from the x column.')
      return
    }
    if (!formulaExpr.trim()) {
      setFormulaHint('Enter a formula first.')
      return
    }
    const formulaError = validatePointFormula(formulaExpr)
    if (formulaError) {
      setFormulaHint(formulaError)
      return
    }

    const parsed = formulaXInputs
      .map((row) => {
        const raw = row.x.trim()
        if (!raw) return null
        const x = Number(raw)
        if (!Number.isFinite(x)) return null
        const result = evaluatePointFormula(formulaExpr, x)
        if (result == null) return null
        return { x, result }
      })
      .filter((v): v is { x: number; result: number } => v != null)

    if (parsed.length === 0) {
      setFormulaHint('Enter at least one valid x value in the rows below the formula.')
      return
    }

    const newRows = parsed.map(({ x, result }) => {
      const row = emptyCalibrationPointRow(cols)
      row.values[formulaSourceColId] = formatFormulaResult(x)
      row.values[formulaTargetColId] = formatFormulaResult(result)
      return row
    })

    const existingHasValues = form.calibrationPoints.some((r) =>
      Object.values(r.values).some((v) => String(v ?? '').trim().length > 0),
    )
    set(
      'calibrationPoints',
      existingHasValues ? [...form.calibrationPoints, ...newRows] : newRows,
    )
    setSelectedPointIds(new Set())
    setPointsSortColId(null)
    setFormulaDialogOpen(false)
  }

  return (
    <div className={labRegistryFormClass}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-asset">Asset Code *</Label>
            <Input
              id="efc-asset"
              value={form.assetCode}
              onChange={(e) => set('assetCode', e.target.value.toUpperCase())}
              readOnly={assetCodeLocked}
              className={assetCodeLocked ? 'bg-slate-50 text-slate-700' : undefined}
              placeholder="QE-EQ-0001"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-name">Equipment Name *</Label>
            <Input
              id="efc-name"
              value={form.equipmentName}
              onChange={(e) => set('equipmentName', e.target.value)}
              placeholder="Reference Multimeter"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-status">Status</Label>
            <Select
              value={form.equipmentStatus}
              onValueChange={(v) => set('equipmentStatus', v as EquipmentStatus)}
            >
              <SelectTrigger id="efc-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Manufacturer</Label>
            <FilterCombobox
              value={mfrOpen ? mfrQuery : selectedManufacturerLabel}
              onValueChange={(v) => {
                setMfrQuery(v)
                if (!mfrOpen) setMfrOpen(true)
                if (!v.trim()) {
                  patchForm({ manufacturer: '' })
                }
              }}
              options={filteredClients}
              onSelectOption={(opt) => {
                patchForm({ manufacturer: opt.label })
                setMfrQuery(opt.label)
                setMfrOpen(false)
              }}
              open={mfrOpen}
              onOpenChange={(open) => {
                setMfrOpen(open)
                if (open) setMfrQuery(selectedManufacturerLabel)
              }}
              placeholder="Select from Client Master"
              listId="efc-manufacturer-list"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-model">Model Number</Label>
            <Input id="efc-model" value={form.modelNumber} onChange={(e) => set('modelNumber', e.target.value)} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-serial">Serial Number</Label>
            <Input id="efc-serial" value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-loc">Location</Label>
            <Input id="efc-loc" value={form.currentLocation} onChange={(e) => set('currentLocation', e.target.value)} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-range">Range / Capacity</Label>
            <Input id="efc-range" value={form.rangeCapacity} onChange={(e) => set('rangeCapacity', e.target.value)} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-lc">Least Count / Resolution</Label>
            <Input
              id="efc-lc"
              value={form.resolutionLeastCount}
              onChange={(e) => set('resolutionLeastCount', e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="efc-acc">Accuracy / Acceptance Criteria</Label>
            <Input
              id="efc-acc"
              value={form.accuracyAcceptanceCriteria}
              onChange={(e) => set('accuracyAcceptanceCriteria', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 flex flex-col space-y-2 md:col-span-4">
            <SectionTitle className="text-center">Calibration</SectionTitle>
            <div className="flex h-full flex-col gap-3 rounded-md border border-slate-200/80 bg-white/70 px-3 py-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full shrink-0 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                onClick={() => setCalibrationDialogOpen(true)}
              >
                <ClipboardCheck size={16} className="mr-2" />
                Open Form
              </Button>
            </div>
          </div>

          <div className="col-span-12 flex flex-col space-y-2 md:col-span-4">
            <SectionTitle className="text-center">Intermediate Check</SectionTitle>
            <div className="flex h-full flex-col gap-3 rounded-md border border-slate-200/80 bg-white/70 px-3 py-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full shrink-0 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                onClick={() => setIntermediateCheckDialogOpen(true)}
              >
                <ListChecks size={16} className="mr-2" />
                Open Form
              </Button>
            </div>
          </div>

          <div className="col-span-12 flex flex-col space-y-2 md:col-span-4">
            <SectionTitle className="text-center">Maintenance</SectionTitle>
            <div className="flex h-full flex-col gap-3 rounded-md border border-slate-200/80 bg-white/70 px-3 py-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full shrink-0 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                onClick={() => setMaintenanceDialogOpen(true)}
              >
                <Wrench size={16} className="mr-2" />
                Open Form
              </Button>
            </div>
          </div>
        </div>

        <Dialog open={calibrationDialogOpen} onOpenChange={handleCalibrationDialogOpenChange}>
          <DialogContent
            persistOnFocusLoss
            layer="nested"
            className={NESTED_FULLSCREEN_DIALOG_CLASS}
            style={NESTED_FULLSCREEN_DIALOG_STYLE}
            aria-describedby={undefined}
          >
            <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
              <DialogHeader className="relative pr-10 text-left">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                  Equipment For Calibration
                </p>
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                  Calibration Form
                </DialogTitle>
              </DialogHeader>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5 ${labRegistryFormClass}`}
            >
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <ScheduleFieldTile span="auto">
                    <Label htmlFor="efc-mode-cal">Mode of Calibration</Label>
                    <Input
                      id="efc-mode-cal"
                      value={form.modeOfCalibration}
                      onChange={(e) => set('modeOfCalibration', e.target.value)}
                      placeholder="e.g. Internal / External"
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span="auto">
                    <Label htmlFor="efc-class-inst">Class of Instrument</Label>
                    <Input
                      id="efc-class-inst"
                      value={form.classOfInstrument}
                      onChange={(e) => set('classOfInstrument', e.target.value)}
                      placeholder="e.g. Class 1 / 0.5"
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span="auto">
                    <Label>Frequency</Label>
                    <Select
                      value={frequencySelectValue(form.calibrationFrequency)}
                      onValueChange={(v) => setCalFreq(v as Frequency)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {frequencySelectValue(form.calibrationFrequency) === 'Manual' ? (
                      <button
                        type="button"
                        className="mt-1 text-left text-[11px] font-medium text-teal-700 hover:underline"
                        onClick={() => openManualDaysDialog('calibration')}
                      >
                        {calManualDays !== null
                          ? `Interval: ${calManualDays} days — change`
                          : 'Set interval days…'}
                      </button>
                    ) : null}
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span="auto">
                    <Label htmlFor="efc-last-cal">Last Calibration</Label>
                    <ScheduleDateInput
                      id="efc-last-cal"
                      value={form.lastCalibrationDate}
                      onCommit={setLastCal}
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span="auto">
                    <Label htmlFor="efc-next-cal">
                      {calNextDueEditable
                        ? 'Next Due'
                        : calManualDays !== null
                          ? `Next Due (Auto · ${calManualDays}d)`
                          : 'Next Due (Auto)'}
                    </Label>
                    <ScheduleDateInput
                      id="efc-next-cal"
                      value={form.nextCalibrationDue}
                      disabled={!calNextDueEditable}
                      className={
                        calNextDueEditable ? undefined : 'bg-slate-50 font-mono text-slate-600'
                      }
                      onCommit={(next) => set('nextCalibrationDue', next)}
                    />
                  </ScheduleFieldTile>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <ScheduleFieldTile span="auto">
                    <Label htmlFor="efc-cert">Certificate Number</Label>
                    <Input
                      id="efc-cert"
                      value={form.calibrationCertificateNumber}
                      onChange={(e) => set('calibrationCertificateNumber', e.target.value)}
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span="auto">
                    <Label htmlFor="efc-unc">Uncertainty</Label>
                    <Input
                      id="efc-unc"
                      value={form.calibrationCertificateUncertainty}
                      onChange={(e) => set('calibrationCertificateUncertainty', e.target.value)}
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span="auto">
                    <Label htmlFor="efc-unc-unit">Unit</Label>
                    <Input
                      id="efc-unc-unit"
                      value={form.calibrationUncertaintyUnit}
                      onChange={(e) => set('calibrationUncertaintyUnit', e.target.value)}
                      placeholder="±"
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span="auto">
                    <Label htmlFor="efc-k">Coverage Factor (k)</Label>
                    <Input
                      id="efc-k"
                      value={form.calibrationCoverageFactor}
                      onChange={(e) => set('calibrationCoverageFactor', e.target.value)}
                      placeholder="2"
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span="auto">
                    <Label>External Calibration Agency</Label>
                    <FilterCombobox
                      value={agencyOpen ? agencyQuery : selectedAgencyLabel}
                      onValueChange={(v) => {
                        setAgencyQuery(v)
                        if (!agencyOpen) setAgencyOpen(true)
                        if (!v.trim()) {
                          patchForm({ externalCalibrationAgencyName: '' })
                        }
                      }}
                      options={filteredAgencyClients}
                      onSelectOption={(opt) => {
                        patchForm({ externalCalibrationAgencyName: opt.label })
                        setAgencyQuery(opt.label)
                        setAgencyOpen(false)
                      }}
                      open={agencyOpen}
                      onOpenChange={(open) => {
                        setAgencyOpen(open)
                        if (open) setAgencyQuery(selectedAgencyLabel)
                      }}
                      placeholder="Select from Client Master"
                      listId="efc-agency-list"
                    />
                  </ScheduleFieldTile>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 pb-2">
                    <p className="min-w-0 flex-1 text-[12px] font-medium text-slate-600">
                      Calibration Points
                    </p>
                    {selectedPointIds.size > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={removeSelectedPoints}
                        aria-label="Delete selected points"
                      >
                        <Trash2 size={14} />
                        Delete selected ({selectedPointIds.size})
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                      disabled={form.calibrationPointsColumns.length === 0}
                      onClick={openFormulaDialog}
                      aria-label="Generate calibration points by formula"
                    >
                      <Sigma size={14} />
                      Generate by Formula
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                      onClick={openPointsSetup}
                    >
                      {form.calibrationPointsColumns.length > 0
                        ? 'Edit Table Columns'
                        : 'Create Table'}
                    </Button>
                  </div>

                  {form.calibrationPointsColumns.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-200 bg-white/50 px-3 py-6 text-center text-sm text-slate-500">
                      No table yet. Click <span className="font-medium">Create Table</span> to set
                      column count and headers.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-slate-200/80 bg-white/70">
                      <div
                        className="grid min-w-[560px] items-center gap-x-3 border-b border-slate-200 bg-slate-50/80 px-3 py-2"
                        style={{ gridTemplateColumns: pointsGridTemplate }}
                      >
                        <label className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-teal-600"
                            checked={
                              form.calibrationPoints.length > 0 &&
                              selectedPointIds.size === form.calibrationPoints.length
                            }
                            onChange={(e) => toggleAllPointsSelected(e.target.checked)}
                            aria-label="Select all calibration points"
                          />
                        </label>
                        {form.calibrationPointsColumns.map((col) => {
                          const active = pointsSortColId === col.id
                          return (
                            <button
                              key={col.id}
                              type="button"
                              className="flex min-w-0 items-center gap-1 truncate text-left text-[12px] font-medium text-slate-600 hover:text-teal-800"
                              title={`Sort by ${col.header}`}
                              onClick={() => sortPointsByColumn(col.id)}
                            >
                              <span className="truncate">{col.header}</span>
                              {active && pointsSortDir === 'asc' ? (
                                <ArrowUp size={12} className="shrink-0 text-teal-700" />
                              ) : active && pointsSortDir === 'desc' ? (
                                <ArrowDown size={12} className="shrink-0 text-teal-700" />
                              ) : (
                                <ArrowUpDown size={12} className="shrink-0 text-slate-400" />
                              )}
                            </button>
                          )
                        })}
                        <span className="text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Move
                        </span>
                        <span className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Actions
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {form.calibrationPoints.map((pt, index) => {
                          const isLast = index === form.calibrationPoints.length - 1
                          const isFirst = index === 0
                          return (
                            <div
                              key={pt.id}
                              className="grid min-w-[560px] items-center gap-x-3 px-3 py-2"
                              style={{ gridTemplateColumns: pointsGridTemplate }}
                            >
                              <label className="flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-teal-600"
                                  checked={selectedPointIds.has(pt.id)}
                                  onChange={() => togglePointSelected(pt.id)}
                                  aria-label={`Select point ${index + 1}`}
                                />
                              </label>
                              {form.calibrationPointsColumns.map((col) => (
                                <Input
                                  key={col.id}
                                  id={`efc-pt-${pt.id}-${col.id}`}
                                  value={pt.values[col.id] ?? ''}
                                  onChange={(e) =>
                                    updatePointValue(pt.id, col.id, e.target.value)
                                  }
                                  placeholder="—"
                                  aria-label={`${col.header} row ${index + 1}`}
                                />
                              ))}
                              <div className="flex items-center justify-center gap-0.5">
                                {isLast ? (
                                  <span className="inline-block h-9 w-[4.5rem]" aria-hidden />
                                ) : (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 w-9 px-0 text-slate-600 hover:bg-slate-100"
                                      disabled={isFirst}
                                      onClick={() => movePoint(pt.id, -1)}
                                      aria-label={`Move point ${index + 1} up`}
                                    >
                                      <ChevronUp size={16} />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 w-9 px-0 text-slate-600 hover:bg-slate-100"
                                      onClick={() => movePoint(pt.id, 1)}
                                      aria-label={`Move point ${index + 1} down`}
                                    >
                                      <ChevronDown size={16} />
                                    </Button>
                                  </>
                                )}
                              </div>
                              <div className="flex justify-end gap-1">
                                {isLast ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-10 w-10 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                                    onClick={addPoint}
                                    aria-label="Add calibration point"
                                  >
                                    <Plus size={16} />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-10 w-10 px-0 text-destructive hover:bg-destructive/10"
                                    onClick={() => removePoint(pt.id)}
                                    aria-label={`Remove point ${index + 1}`}
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCalibrationDialogOpen(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                className="bg-teal-600 text-white hover:bg-teal-500"
                disabled={!canSave || saveLoading}
                onClick={() => saveAndCloseNested(() => setCalibrationDialogOpen(false))}
              >
                {saveLoading ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={pointsSetupOpen} onOpenChange={handlePointsSetupOpenChange}>
          <DialogContent
            persistOnFocusLoss
            layer="stacked"
            className="flex max-h-[min(90dvh,40rem)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden border-0 bg-white p-0 shadow-xl sm:rounded-lg [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
            aria-describedby={undefined}
          >
            <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
              <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
              <DialogHeader className="relative pr-10 text-left">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                  Calibration Points
                </p>
                <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                  Create Table
                </DialogTitle>
              </DialogHeader>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-5 ${labRegistryFormClass}`}
            >
              <div className="w-full space-y-4">
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="efc-points-draft-hdr">Column Head Name</Label>
                    <Input
                      id="efc-points-draft-hdr"
                      value={draftColumnHeader}
                      onChange={(e) => setDraftColumnHeader(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addSetupColumn()
                        }
                      }}
                      placeholder="Custom column header"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                    disabled={
                      !draftColumnHeader.trim() || setupHeaders.length >= MAX_SETUP_COLUMNS
                    }
                    onClick={addSetupColumn}
                    aria-label="Add new column"
                  >
                    <Plus size={16} className="mr-1.5" />
                    Add New Column
                  </Button>
                </div>

                {setupHeaders.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[12px] font-medium text-slate-600">Selected columns</p>
                    {setupHeaders.map((header, index) => (
                      <div
                        key={`hdr-row-${index}`}
                        className="flex items-end gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-2">
                          <Label htmlFor={`efc-points-hdr-${index}`}>
                            Column {index + 1}
                          </Label>
                          <Input
                            id={`efc-points-hdr-${index}`}
                            value={header}
                            onChange={(e) => updateSetupHeader(index, e.target.value)}
                            placeholder="Column header"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-10 w-10 shrink-0 px-0 text-destructive hover:bg-destructive/10"
                          onClick={() => removeSetupColumn(index)}
                          aria-label={`Remove column ${index + 1}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-slate-200 bg-white/50 px-3 py-4 text-center text-sm text-slate-500">
                    Select presets or add a custom column head name.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPointsSetupOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={applyPointsSetup}
                disabled={setupHeaders.length === 0}
              >
                Generate Table
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={formulaDialogOpen} onOpenChange={handleFormulaDialogOpenChange}>
          <DialogContent
            persistOnFocusLoss
            layer="stacked"
            className="flex max-h-[min(90dvh,44rem)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden border-0 bg-white p-0 shadow-xl sm:rounded-lg [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
            aria-describedby={undefined}
          >
            <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-5">
              <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
              <DialogHeader className="relative pr-10 text-left">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                  Calibration Points
                </p>
                <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                  Generate by Formula
                </DialogTitle>
                <p className="mt-1 text-xs text-slate-300">
                  Set the formula, then enter each <span className="font-mono text-teal-200">x</span>{' '}
                  value in a row. New points are appended — existing readings stay unchanged.
                </p>
              </DialogHeader>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-5">
              <div className="w-full space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Column for x</Label>
                    <Select
                      value={formulaSourceColId || undefined}
                      onValueChange={setFormulaSourceColId}
                    >
                      <SelectTrigger aria-label="Column for x">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent className="z-[80]">
                        {form.calibrationPointsColumns.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            {col.header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Result column (formula output)</Label>
                    <Select
                      value={formulaTargetColId || undefined}
                      onValueChange={setFormulaTargetColId}
                    >
                      <SelectTrigger aria-label="Result column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent className="z-[80]">
                        {form.calibrationPointsColumns
                          .filter((c) => c.id !== formulaSourceColId)
                          .map((col) => (
                            <SelectItem key={col.id} value={col.id}>
                              {col.header}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formulaTargetColId && formulaTargetColId !== formulaSourceColId ? (
                  <ScientificFormulaPad
                    id="efc-series-formula"
                    label="Formula (uses x)"
                    value={formulaExpr}
                    onChange={(next) => {
                      setFormulaExpr(next)
                      setFormulaHint(null)
                    }}
                    hint="After the formula is set, enter x values in the rows below."
                  />
                ) : (
                  <p className="rounded-md border border-dashed border-slate-200 bg-white/50 px-3 py-4 text-center text-sm text-slate-500">
                    Select x and result columns to enter a formula.
                  </p>
                )}

                {formulaReady && formulaTargetColId && formulaTargetColId !== formulaSourceColId ? (
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-2">
                      <p className="text-[12px] font-medium text-slate-600">X input values</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                        onClick={() =>
                          setFormulaXInputs((prev) => [
                            ...prev,
                            { id: newFormulaXRowId(), x: '' },
                          ])
                        }
                      >
                        <Plus size={14} />
                        Add x row
                      </Button>
                    </div>
                    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <span className="text-center">#</span>
                        <span>x value</span>
                        <span>Result</span>
                        <span className="sr-only">Actions</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {formulaXInputs.map((row, index) => {
                          const xNum = Number(row.x.trim())
                          const xOk = row.x.trim() !== '' && Number.isFinite(xNum)
                          const result =
                            xOk ? evaluatePointFormula(formulaExpr, xNum) : null
                          const isLast = index === formulaXInputs.length - 1
                          return (
                            <div
                              key={row.id}
                              className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-2 px-3 py-2"
                            >
                              <span className="text-center text-sm text-slate-500">
                                {index + 1}
                              </span>
                              <Input
                                value={row.x}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setFormulaXInputs((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id ? { ...r, x: value } : r,
                                    ),
                                  )
                                }}
                                placeholder="e.g. 100"
                                inputMode="decimal"
                                aria-label={`x value row ${index + 1}`}
                              />
                              <Input
                                value={
                                  !row.x.trim()
                                    ? ''
                                    : result == null
                                      ? '—'
                                      : formatFormulaResult(result)
                                }
                                readOnly
                                className="bg-slate-50 font-mono"
                                aria-label={`Result row ${index + 1}`}
                              />
                              <div className="flex justify-end">
                                {isLast ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-10 w-10 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                                    onClick={() =>
                                      setFormulaXInputs((prev) => [
                                        ...prev,
                                        { id: newFormulaXRowId(), x: '' },
                                      ])
                                    }
                                    aria-label="Add x row"
                                  >
                                    <Plus size={16} />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-10 w-10 px-0 text-destructive hover:bg-destructive/10"
                                    onClick={() =>
                                      setFormulaXInputs((prev) =>
                                        prev.filter((r) => r.id !== row.id),
                                      )
                                    }
                                    aria-label={`Remove x row ${index + 1}`}
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {formulaHint ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {formulaHint}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <Button type="button" variant="outline" onClick={() => setFormulaDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-600 text-white hover:bg-teal-500"
                onClick={applyFormulaGenerate}
              >
                Generate New Points
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={intermediateCheckDialogOpen}
          onOpenChange={handleIntermediateCheckDialogOpenChange}
        >
          <DialogContent
            persistOnFocusLoss
            layer="nested"
            className={NESTED_FULLSCREEN_DIALOG_CLASS}
            style={NESTED_FULLSCREEN_DIALOG_STYLE}
            aria-describedby={undefined}
          >
            <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
              <DialogHeader className="relative pr-10 text-left">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                  Equipment For Calibration
                </p>
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                  Intermediate Check Form
                </DialogTitle>
              </DialogHeader>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5 ${labRegistryFormClass}`}
            >
              <div className="space-y-6">
                <SectionTitle>Intermediate Check Schedule</SectionTitle>
                <div className="grid grid-cols-12 gap-3">
                  <ScheduleFieldTile span={6}>
                    <Label>Frequency</Label>
                    <Select
                      value={frequencySelectValue(form.intermediateCheckFrequency)}
                      onValueChange={(v) => setIcFreq(v as Frequency)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {frequencySelectValue(form.intermediateCheckFrequency) === 'Manual' ? (
                      <button
                        type="button"
                        className="mt-1 text-left text-[11px] font-medium text-teal-700 hover:underline"
                        onClick={() => openManualDaysDialog('intermediate')}
                      >
                        {icManualDays !== null
                          ? `Interval: ${icManualDays} days — change`
                          : 'Set interval days…'}
                      </button>
                    ) : null}
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span={6}>
                    <Label htmlFor="efc-ic-performed-by">Performed By</Label>
                    <FilterCombobox
                      inputId="efc-ic-performed-by"
                      listId="efc-ic-performed-by-list"
                      value={form.intermediateCheckPerformedBy}
                      onValueChange={(v) => set('intermediateCheckPerformedBy', v)}
                      options={filteredPerformers}
                      onSelectOption={(opt) => {
                        set('intermediateCheckPerformedBy', opt.label)
                        setPerformedByOpen(false)
                      }}
                      open={performedByOpen}
                      onOpenChange={setPerformedByOpen}
                      placeholder="Name / employee"
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span={12}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="efc-last-ic">Last Check</Label>
                        <ScheduleDateInput
                          id="efc-last-ic"
                          value={form.lastIntermediateCheckDate}
                          onCommit={setLastIc}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="efc-next-ic">
                          {icNextDueEditable
                            ? 'Next Due'
                            : icManualDays !== null
                              ? `Next Due (Auto · ${icManualDays}d)`
                              : 'Next Due (Auto)'}
                        </Label>
                        <ScheduleDateInput
                          id="efc-next-ic"
                          value={form.nextIntermediateCheckDate}
                          disabled={!icNextDueEditable}
                          className={
                            icNextDueEditable ? undefined : 'bg-slate-50 font-mono text-slate-600'
                          }
                          onCommit={(next) => set('nextIntermediateCheckDate', next)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Conduct Check</Label>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-full gap-1.5 text-xs"
                          onClick={() => setConductIntermediateCheckOpen(true)}
                        >
                          <Activity size={14} />
                          Conduct
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Previous Results</Label>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 w-full gap-1.5 text-xs"
                          disabled={visibleIntermediateHistoryCount === 0}
                          onClick={() => setIntermediateHistoryViewOpen(true)}
                        >
                          <History size={14} />
                          View
                          {visibleIntermediateHistoryCount > 0
                            ? ` (${visibleIntermediateHistoryCount})`
                            : ''}
                        </Button>
                      </div>
                    </div>
                  </ScheduleFieldTile>
                </div>
                {currentIntermediatePayload.readings.length > 0 ? (
                  <p className="text-[11px] text-slate-500">
                    Latest result: {currentIntermediatePayload.summaryLine || 'Recorded'}
                    {form.lastIntermediateCheckDate
                      ? ` · conducted ${form.lastIntermediateCheckDate}`
                      : ''}
                    . Use Conduct to record a new check.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Open Conduct Check to record temperature, humidity, master standards and
                    Std/Obs readings. Performed By is required before completing.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIntermediateCheckDialogOpen(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                className="bg-teal-600 text-white hover:bg-teal-500"
                disabled={!canSave || saveLoading}
                onClick={() =>
                  saveAndCloseNested(() => setIntermediateCheckDialogOpen(false))
                }
              >
                {saveLoading ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={maintenanceDialogOpen} onOpenChange={handleMaintenanceDialogOpenChange}>
          <DialogContent
            persistOnFocusLoss
            layer="nested"
            className={NESTED_FULLSCREEN_DIALOG_CLASS}
            style={NESTED_FULLSCREEN_DIALOG_STYLE}
            aria-describedby={undefined}
          >
            <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
              <DialogHeader className="relative pr-10 text-left">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                  Equipment For Calibration
                </p>
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                  Maintenance Form
                </DialogTitle>
              </DialogHeader>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5 ${labRegistryFormClass}`}
            >
              <div className="space-y-6">
                <SectionTitle>Maintenance Schedule</SectionTitle>
                <div className="grid grid-cols-12 gap-3">
                  <ScheduleFieldTile>
                    <Label>Schedule Frequency</Label>
                    <Select
                      value={frequencySelectValue(form.maintenanceScheduleFrequency)}
                      onValueChange={(v) => setMaintFreq(v as Frequency)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {frequencySelectValue(form.maintenanceScheduleFrequency) === 'Manual' ? (
                      <button
                        type="button"
                        className="mt-1 text-left text-[11px] font-medium text-teal-700 hover:underline"
                        onClick={() => openManualDaysDialog('maintenance')}
                      >
                        {maintManualDays !== null
                          ? `Interval: ${maintManualDays} days — change`
                          : 'Set interval days…'}
                      </button>
                    ) : null}
                  </ScheduleFieldTile>
                  <ScheduleFieldTile>
                    <Label htmlFor="efc-done-by">Maintenance Done By</Label>
                    <FilterCombobox
                      inputId="efc-done-by"
                      listId="efc-done-by-list"
                      value={form.maintenanceDoneBy}
                      onValueChange={(v) => set('maintenanceDoneBy', v)}
                      options={filteredEmployees}
                      onSelectOption={(opt) => {
                        set('maintenanceDoneBy', opt.label)
                        setDoneByOpen(false)
                      }}
                      open={doneByOpen}
                      onOpenChange={setDoneByOpen}
                      placeholder="Name / employee"
                    />
                  </ScheduleFieldTile>
                  <ScheduleFieldTile span={12}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="efc-last-m">Last Date</Label>
                        <ScheduleDateInput
                          id="efc-last-m"
                          value={form.lastMaintenanceDate}
                          onCommit={setLastMaint}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="efc-next-m">
                          {maintNextDueEditable
                            ? 'Next Due'
                            : maintManualDays !== null
                              ? `Next Due (Auto · ${maintManualDays}d)`
                              : 'Next Due (Auto)'}
                        </Label>
                        <ScheduleDateInput
                          id="efc-next-m"
                          value={form.nextMaintenanceDate}
                          disabled={!maintNextDueEditable}
                          className={
                            maintNextDueEditable
                              ? undefined
                              : 'bg-slate-50 font-mono text-slate-600'
                          }
                          onCommit={(next) => set('nextMaintenanceDate', next)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Conduct Maintenance</Label>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-full gap-1.5 text-xs"
                          onClick={() => setConductMaintenanceOpen(true)}
                        >
                          <Wrench size={14} />
                          Conduct
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>View Old Checklist</Label>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 w-full gap-1.5 text-xs"
                          disabled={!hasMaintenanceChecklistHistory}
                          onClick={() => setMaintenanceHistoryViewOpen(true)}
                        >
                          <History size={14} />
                          View
                          {form.maintenanceHistory.length > 0
                            ? ` (${form.maintenanceHistory.length})`
                            : ''}
                        </Button>
                      </div>
                    </div>
                  </ScheduleFieldTile>
                </div>
                {form.maintenanceChecklist.length > 0 ? (
                  <p className="text-[11px] text-slate-500">
                    Current checklist: {form.maintenanceChecklist.length} check point
                    {form.maintenanceChecklist.length === 1 ? '' : 's'}
                    {form.lastMaintenanceDate
                      ? ` · last conducted ${form.lastMaintenanceDate}`
                      : ''}
                    . Use Conduct for AI-assisted checklist and to complete maintenance.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Open Conduct Maintenance to build a checklist (manual or AI) and log
                    completion. Done By is required before completing.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMaintenanceDialogOpen(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                className="bg-teal-600 text-white hover:bg-teal-500"
                disabled={!canSave || saveLoading}
                onClick={() => saveAndCloseNested(() => setMaintenanceDialogOpen(false))}
              >
                {saveLoading ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ManualDaysDialog
          open={manualDaysOpen}
          onOpenChange={(open) => {
            setManualDaysOpen(open)
            if (!open) setManualDaysTarget(null)
          }}
          initialDays={manualDaysInitial}
          onConfirm={applyManualDays}
        />

        <ConductMaintenanceDialog
          open={conductMaintenanceOpen}
          onOpenChange={setConductMaintenanceOpen}
          layer="stacked"
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          manufacturer={form.manufacturer}
          modelNumber={form.modelNumber}
          rangeCapacity={form.rangeCapacity}
          initialChecklist={form.maintenanceChecklist}
          maintenanceHistory={form.maintenanceHistory}
          lastMaintenanceDate={form.lastMaintenanceDate}
          nextMaintenanceDate={form.nextMaintenanceDate}
          maintenanceDoneBy={form.maintenanceDoneBy}
          maintenanceDoneByName={form.maintenanceDoneBy}
          maintenanceScheduleFrequency={maintFreqForConduct}
          onSaveChecklist={(items) => patchForm({ maintenanceChecklist: items })}
          onCompleteMaintenance={(payload) => {
            const freq = formRef.current.maintenanceScheduleFrequency
            const autoNext = hasAutoNextDue(freq)
              ? calculateNextDueDate(payload.lastMaintenanceDate, freq)
              : ''
            patchForm({
              maintenanceChecklist: payload.checklist,
              maintenanceHistory: payload.maintenanceHistory,
              lastMaintenanceDate: payload.lastMaintenanceDate,
              nextMaintenanceDate:
                autoNext ||
                formRef.current.nextMaintenanceDate ||
                payload.nextMaintenanceDate,
            })
          }}
        />

        <MaintenanceHistoryDialog
          open={maintenanceHistoryViewOpen}
          onOpenChange={setMaintenanceHistoryViewOpen}
          layer="stacked"
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          history={form.maintenanceHistory}
          currentLastDate={form.lastMaintenanceDate}
          currentDoneByName={form.maintenanceDoneBy}
          currentChecklist={form.maintenanceChecklist}
        />

        <ConductIntermediateCheckDialog
          open={conductIntermediateCheckOpen}
          onOpenChange={(open) => {
            setConductIntermediateCheckOpen(open)
            if (!open) setIntermediateCompleteMessage(null)
          }}
          layer="stacked"
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          onComplete={completeIntermediateCheck}
        >
          <IntermediateCheckCalculator
            draft={intermediateDraft}
            onDraftChange={setIntermediateDraft}
            acceptanceCriteria={form.accuracyAcceptanceCriteria}
            masterEquipment={masterEquipmentOptions}
            message={intermediateCompleteMessage}
          />
        </ConductIntermediateCheckDialog>

        <IntermediateCheckHistoryDialog
          open={intermediateHistoryViewOpen}
          onOpenChange={setIntermediateHistoryViewOpen}
          layer="stacked"
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          history={form.intermediateCheckHistory}
          currentLastDate={form.lastIntermediateCheckDate}
          currentDoneByName={form.intermediateCheckPerformedBy}
          currentStatus={currentIntermediatePayload.status}
          currentSummary={currentIntermediatePayload.summaryLine}
          currentReadings={currentIntermediatePayload.readings}
          currentTemperature={currentIntermediatePayload.temperature}
          currentHumidity={currentIntermediatePayload.humidity}
          currentMasters={currentIntermediateMasters}
          currentNextDueDate={form.nextIntermediateCheckDate}
          acceptanceCriteria={form.accuracyAcceptanceCriteria}
        />

        <div className="space-y-2">
          <Label htmlFor="efc-remarks">Remarks</Label>
          <Textarea
            id="efc-remarks"
            rows={2}
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <Button
          type="button"
          className="bg-teal-600 text-white hover:bg-teal-500"
          onClick={() => onSave({ ...latestFormSnapshot() })}
          disabled={!canSave || saveLoading}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
